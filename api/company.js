// Companies (the brands) and who may open them.
//   GET                      → companies I may see
//   POST action=save         → owner: create / rename / recolor / archive
//   GET  action=users        → owner: the SOs of one company
//   POST action=user-save    → owner: create SO / set PIN / permissions / switch off
//   POST action=user-delete  → owner
//   GET  action=suggest-pin  → owner: a random PIN nobody uses
const crypto = require('crypto');
const D = require('./_lib/db');
const { supabase } = D;

const COLORS = ['#10B981', '#06B6D4', '#7C3AED', '#F59E0B', '#EF4444', '#EC4899', '#3B82F6', '#84CC16'];

module.exports = D.route(async (req) => {
  const u = await D.requireUser(req);
  const action = req.query.action || (req.method === 'GET' ? 'list' : (req.body.action || ''));

  if (action === 'list') {
    D.method(req, 'GET');
    let q = supabase.from('companies').select('id,name,color,commission_pct,sort,active').order('sort').order('id');
    if (!D.isOwner(u)) q = q.eq('id', u.company_id);
    else if (req.query.all !== '1') q = q.eq('active', true);
    const { data, error } = await q;
    if (error) throw error;
    // commission is the owner's own earning: hide it from SOs without the finance switch
    const showPct = D.isOwner(u) || u.can_finance;
    return { companies: data.map((c) => showPct ? c : Object.assign({}, c, { commission_pct: null })) };
  }

  D.ownerOnly(u);

  if (action === 'save') {
    D.method(req, 'POST');
    const b = req.body;
    const name = String(b.name || '').trim();
    if (!name || name.length > 60) throw D.bad('কোম্পানির নাম দিন (সর্বোচ্চ ৬০ অক্ষর)');
    const row = { name };
    if (b.color) { if (!/^#[0-9a-fA-F]{6}$/.test(b.color)) throw D.bad('রঙ ঠিক নয়'); row.color = b.color; }
    if (b.commission_pct !== undefined) row.commission_pct = D.numOr(b.commission_pct, 6, { min: 0, max: 100 });
    if (b.active !== undefined) row.active = !!b.active;
    if (b.id) {
      const { data, error } = await supabase.from('companies').update(row).eq('id', Number(b.id)).select().single();
      if (error) throw error;
      await D.audit(u, 'company-update', data.id, row);
      return { company: data };
    }
    const { count } = await supabase.from('companies').select('*', { count: 'exact', head: true });
    if (!row.color) row.color = COLORS[(count || 0) % COLORS.length];
    row.sort = (count || 0) + 1;
    const { data, error } = await supabase.from('companies').insert(row).select().single();
    if (error) throw error;
    await D.audit(u, 'company-create', data.id, { name });
    return { company: data };
  }

  if (action === 'users') {
    D.method(req, 'GET');
    const cid = D.needCompany(u, req.query.company_id);
    const { data, error } = await supabase.from('app_users')
      .select('id,name,active,can_finance,last_login,created_at').eq('company_id', cid).eq('role', 'so').order('id');
    if (error) throw error;
    return { users: data };
  }

  if (action === 'suggest-pin') {
    D.method(req, 'GET');
    for (let i = 0; i < 40; i++) {
      const pin = String(crypto.randomInt(10000, 100000));
      const { data } = await supabase.from('app_users').select('id').eq('pin_hash', D.hashPin(pin)).maybeSingle();
      if (!data) return { pin };
    }
    throw new D.HttpError(500, 'নতুন PIN তৈরি করা গেল না');
  }

  if (action === 'user-save') {
    D.method(req, 'POST');
    const b = req.body;
    const cid = D.needCompany(u, b.company_id);
    const name = String(b.name || '').trim();
    if (!name || name.length > 60) throw D.bad('নাম দিন');
    const row = { name };
    if (b.can_finance !== undefined) row.can_finance = !!b.can_finance;
    if (b.active !== undefined) row.active = !!b.active;
    const hasPin = b.pin !== undefined && b.pin !== '';
    if (hasPin) {
      if (!D.validPin(String(b.pin))) throw D.bad('PIN অবশ্যই ৫ সংখ্যার হতে হবে');
      row.pin_hash = D.hashPin(b.pin);
      row.must_change_pw = false;
    }
    try {
      if (b.id) {
        const { data: ex } = await supabase.from('app_users').select('id,role,company_id,token_ver').eq('id', Number(b.id)).maybeSingle();
        if (!ex || ex.role !== 'so' || Number(ex.company_id) !== cid) throw D.bad('ব্যবহারকারী পাওয়া যায়নি');
        // new PIN or switched off → signs him out of every device right away
        if (hasPin || b.active === false) row.token_ver = (ex.token_ver || 0) + 1;
        const { error } = await supabase.from('app_users').update(row).eq('id', ex.id);
        if (error) throw error;
        await D.audit(u, hasPin ? 'so-pin-set' : 'so-update', cid, { user: ex.id });
        return {};
      }
      if (!hasPin) throw D.bad('নতুন ব্যবহারকারীর জন্য PIN দিন');
      Object.assign(row, { role: 'so', company_id: cid });
      const { data, error } = await supabase.from('app_users').insert(row).select('id').single();
      if (error) throw error;
      await D.audit(u, 'so-create', cid, { user: data.id, name });
      return { id: data.id };
    } catch (e) {
      if (e && e.code === '23505') throw D.bad('এই PIN অন্য কারও আছে। আলাদা একটি PIN দিন');
      throw e;
    }
  }

  if (action === 'user-delete') {
    D.method(req, 'POST');
    const cid = D.needCompany(u, req.body.company_id);
    const { error } = await supabase.from('app_users').delete().eq('id', Number(req.body.id)).eq('company_id', cid).eq('role', 'so');
    if (error) throw error;
    await D.audit(u, 'so-delete', cid, { user: req.body.id });
    return {};
  }

  throw D.bad('অজানা অনুরোধ');
});
