// Login with a 5-digit PIN. The PIN itself tells the server who you are:
//   owner → everything     so → only his own company
const crypto = require('crypto');
const D = require('./_lib/db');
const { supabase } = D;

const WINDOW_MIN = 15, MAX_FAILS = 8;

function clientIp(req) {
  const f = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return f || (req.socket && req.socket.remoteAddress) || 'unknown';
}

async function shape(u) {
  let companyName = null;
  if (u.company_id) {
    const { data } = await supabase.from('companies').select('name,color').eq('id', u.company_id).maybeSingle();
    if (data) companyName = data.name;
  }
  return {
    id: u.id, name: u.name, role: u.role, companyId: u.company_id || null, companyName,
    mustChange: !!u.must_change_pw, canFinance: u.role === 'owner' ? true : !!u.can_finance,
    editDays: D.SO_EDIT_DAYS
  };
}

module.exports = D.route(async (req) => {
  const action = req.query.action || (req.method === 'POST' ? 'login' : 'me');

  // ── who am I (refreshes permissions after the owner changes them)
  if (action === 'me') {
    D.method(req, 'GET');
    const u = await D.requireUser(req);
    return { user: await shape(u) };
  }

  // ── login
  if (action === 'login') {
    D.method(req, 'POST');
    const ip = clientIp(req);
    const since = new Date(Date.now() - WINDOW_MIN * 60e3).toISOString();
    const pin = String((req.body || {}).pin || '').trim();
    // the throttle check and the user lookup are independent → run them together (fewer round trips)
    const [{ count }, found] = await Promise.all([
      supabase.from('login_attempts').select('*', { count: 'exact', head: true }).eq('ip', ip).eq('ok', false).gte('at', since),
      D.validPin(pin)
        ? supabase.from('app_users').select('id,name,role,company_id,active,token_ver,must_change_pw,can_finance').eq('pin_hash', D.hashPin(pin)).maybeSingle()
        : Promise.resolve({ data: null, error: null })
    ]);
    if ((count || 0) >= MAX_FAILS) throw new D.HttpError(429, 'অনেকবার ভুল PIN দেওয়া হয়েছে। ' + WINDOW_MIN + ' মিনিট পরে আবার চেষ্টা করুন');

    const fail = async () => {
      await supabase.from('login_attempts').insert({ ip, ok: false });
      throw new D.HttpError(401, 'ভুল PIN');
    };
    if (!D.validPin(pin)) return fail();

    let { data: u, error } = found;
    if (error) throw error;

    // First ever start: nobody exists yet → the bootstrap PIN creates the owner.
    if (!u) {
      const { count: n } = await supabase.from('app_users').select('*', { count: 'exact', head: true });
      const boot = String(process.env.OWNER_BOOTSTRAP_PIN || '12345');
      if (n === 0 && pin === boot) {
        const ins = await supabase.from('app_users')
          .insert({ name: 'মালিক', role: 'owner', pin_hash: D.hashPin(pin), must_change_pw: true })
          .select('id,name,role,company_id,active,token_ver,must_change_pw,can_finance').single();
        if (ins.error) throw ins.error;
        u = ins.data;
      }
    }
    if (!u || !u.active) return fail();

    const [, , , user] = await Promise.all([
      supabase.from('login_attempts').insert({ ip, ok: true }),
      supabase.from('app_users').update({ last_login: new Date().toISOString() }).eq('id', u.id),
      D.audit(u, 'login', u.company_id, null),
      shape(u)
    ]);
    return { token: D.signToken(u), user };
  }

  // ── change my own PIN (needs the old one)
  if (action === 'change') {
    D.method(req, 'POST');
    const u = await D.requireUser(req);
    const { oldPin, newPin } = req.body;
    if (!D.validPin(String(newPin || ''))) throw D.bad('নতুন PIN অবশ্যই ৫ সংখ্যার হতে হবে');
    const { data: me } = await supabase.from('app_users').select('pin_hash').eq('id', u.id).single();
    const ok = me && D.validPin(String(oldPin || '')) &&
      crypto.timingSafeEqual(Buffer.from(me.pin_hash), Buffer.from(D.hashPin(oldPin)));
    if (!ok) throw D.bad('পুরোনো PIN ঠিক নয়');
    if (String(newPin).trim() === String(oldPin).trim()) throw D.bad('নতুন PIN আলাদা হতে হবে');
    const { data: nv, error } = await supabase.from('app_users')
      .update({ pin_hash: D.hashPin(newPin), must_change_pw: false, token_ver: (u.token_ver || 0) + 1 })
      .eq('id', u.id).select('id,token_ver').single();
    if (error) {
      if (error.code === '23505') throw D.bad('এই PIN ব্যবহার করা যাবে না, অন্য একটি দিন');
      throw error;
    }
    await D.audit(u, 'pin-change', u.company_id, null);
    return { token: D.signToken({ id: nv.id, token_ver: nv.token_ver }) };
  }

  throw D.bad('অজানা অনুরোধ');
});
