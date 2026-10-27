// Shared server helpers: Supabase client, signed session tokens, PIN hashing,
// permission checks, paging, audit log and a uniform error handler.
// (Folders starting with "_" are not counted as Vercel functions.)
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const URL_ = process.env.SUPABASE_URL;
const KEY_ = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(URL_ || 'http://localhost', KEY_ || 'missing', { auth: { persistSession: false, autoRefreshToken: false } });

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (m) => new HttpError(400, m);
const deny = (m) => new HttpError(403, m || 'এই কাজের অনুমতি নেই');

// ── secrets ─────────────────────────────────────────────────────────
function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new HttpError(500, 'সার্ভারে AUTH_SECRET সেট করা নেই (কমপক্ষে ১৬ অক্ষর)');
  return s;
}
const hmac = (data) => crypto.createHmac('sha256', secret()).update(data).digest('base64url');

// 5-digit PIN. Never stored: only an HMAC of it (needs AUTH_SECRET to even try guessing).
const PIN_RE = /^\d{5}$/;
const validPin = (p) => typeof p === 'string' && PIN_RE.test(p.trim());
const hashPin = (pin) => crypto.createHmac('sha256', secret()).update('axiion-pin:' + String(pin).trim()).digest('hex');

// ── session token: base64url(payload).signature ─────────────────────
const TOKEN_HOURS = Number(process.env.TOKEN_HOURS || 24 * 14);
function signToken(u) {
  const p = Buffer.from(JSON.stringify({ uid: u.id, v: u.token_ver || 0, exp: Date.now() + TOKEN_HOURS * 3600e3 })).toString('base64url');
  return p + '.' + hmac(p);
}
function readToken(tok) {
  if (!tok || typeof tok !== 'string' || tok.indexOf('.') < 0) return null;
  const [p, sig] = tok.split('.');
  const want = hmac(p);
  const a = Buffer.from(sig || ''), b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const o = JSON.parse(Buffer.from(p, 'base64url').toString());
    return o && o.exp > Date.now() ? o : null;
  } catch (e) { return null; }
}

// Every request: valid token AND the user still exists, is active, same token version.
async function requireUser(req) {
  const h = String(req.headers['authorization'] || '');
  const t = readToken(h.startsWith('Bearer ') ? h.slice(7) : '');
  if (!t) throw new HttpError(401, 'আবার লগইন করুন');
  const { data, error } = await supabase.from('app_users')
    .select('id,name,role,company_id,active,token_ver,must_change_pw,can_finance').eq('id', t.uid).maybeSingle();
  if (error) throw error;
  if (!data || !data.active || (data.token_ver || 0) !== (t.v || 0)) throw new HttpError(401, 'আবার লগইন করুন');
  return data;
}
const isOwner = (u) => u.role === 'owner';
function ownerOnly(u) { if (!isOwner(u)) throw deny('শুধু মালিক এটি করতে পারবেন'); }
// SO may only touch his own company; owner anything.
function needCompany(u, companyId) {
  const id = Number(companyId);
  if (!Number.isInteger(id) || id <= 0) throw bad('কোম্পানি নির্বাচন করুন');
  if (!isOwner(u) && Number(u.company_id) !== id) throw deny('এই কোম্পানির তথ্য আপনি দেখতে পারবেন না');
  return id;
}
function needFinance(u) { if (!isOwner(u) && !u.can_finance) throw deny('হিসাব/লেজার দেখার অনুমতি মালিক দেননি'); }

// ── dates (Bangladesh calendar day) ─────────────────────────────────
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'))
  && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
function todayDhaka() { return new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10); }
function addDays(s, n) { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
const SO_EDIT_DAYS = Number(process.env.SO_EDIT_DAYS || 7);
// An SO can add/change entries for today and the last SO_EDIT_DAYS days only.
function assertEditable(u, dateStr) {
  if (isOwner(u)) return;
  const t = todayDhaka();
  if (dateStr > t) throw deny('ভবিষ্যতের তারিখে এন্ট্রি করা যাবে না');
  if (dateStr < addDays(t, -SO_EDIT_DAYS)) throw deny('এই তারিখের এন্ট্রি বদলানোর অনুমতি শুধু মালিকের (' + SO_EDIT_DAYS + ' দিনের পুরোনো)');
}
function rangeOf(q) {
  const from = isDate(q.from) ? q.from : '1900-01-01';
  const to = isDate(q.to) ? q.to : '2999-12-31';
  return { from, to };
}

// ── numbers ─────────────────────────────────────────────────────────
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
function numOr(v, def, { min = -1e12, max = 1e12 } = {}) {
  if (v === '' || v == null) return def;
  const n = Number(v);
  if (!isFinite(n) || n < min || n > max) throw bad('সংখ্যাটি ঠিক নয়');
  return n;
}

// Supabase returns max 1000 rows per request; page through to get everything.
async function fetchAll(build, page = 1000) {
  const out = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await build().range(from, from + page - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < page) break;
  }
  return out;
}

async function audit(u, action, companyId, detail) {
  try {
    await supabase.from('audit_log').insert({
      user_id: u ? u.id : null, user_name: u ? u.name : null, role: u ? u.role : null,
      company_id: companyId || null, action, detail: detail || null
    });
  } catch (e) { /* never block the real work */ }
}

// Wrap a route: JSON in/out, uniform errors, no stack traces to the browser.
function route(fn) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      req.query = req.query || {};
      req.body = req.body && typeof req.body === 'object' ? req.body : {};
      const out = await fn(req, res);
      if (out !== undefined && !res.writableEnded) res.status(200).json(Object.assign({ ok: true }, out));
    } catch (e) {
      if (e instanceof HttpError) return res.status(e.status).json({ ok: false, error: e.message });
      if (e && e.code === '23505') return res.status(409).json({ ok: false, error: 'এটি আগে থেকেই আছে (ডুপ্লিকেট)' });
      if (e && /DAY_CLOSED/.test(String(e.message))) return res.status(409).json({ ok: false, error: 'এই দিনের হিসাব বন্ধ করা আছে। মালিক খুললে বদলানো যাবে' });
      console.error('[api]', req.url, e && (e.message || e));
      res.status(500).json({ ok: false, error: 'সার্ভারে সমস্যা হয়েছে। একটু পরে আবার চেষ্টা করুন' });
    }
  };
}
function method(req, ...allowed) {
  if (!allowed.includes(req.method)) throw new HttpError(405, 'Method not allowed');
}

module.exports = {
  supabase, HttpError, bad, deny, route, method,
  validPin, hashPin, signToken, requireUser, isOwner, ownerOnly, needCompany, needFinance,
  isDate, todayDhaka, addDays, assertEditable, rangeOf, SO_EDIT_DAYS,
  r2, numOr, fetchAll, audit
};
