// Stock of one company. (Excel: Stock View + Opening Stock + inout)
//   GET  ?company_id                  → live stock per product
//   GET  ?company_id&action=moves     → stock in/out history
//   POST action=move / move-delete    → stock in / out entries
//   POST action=opening               → owner: opening quantities
const D = require('./_lib/db');
const { supabase } = D;

module.exports = D.route(async (req) => {
  const u = await D.requireUser(req);

  if (req.method === 'GET') {
    const cid = D.needCompany(u, req.query.company_id);
    if (req.query.action === 'moves') {
      const { from, to } = D.rangeOf(req.query);
      const rows = await D.fetchAll(() => supabase.from('stock_moves')
        .select('id,entry_date,kind,product_id,code,name,qty,note,created_by').eq('company_id', cid)
        .gte('entry_date', from).lte('entry_date', to).order('entry_date', { ascending: false }).order('id', { ascending: false }));
      return { moves: rows };
    }
    const asof = D.isDate(req.query.asof) ? req.query.asof : null;
    const { data, error } = await supabase.rpc('stock_view', { p_company: cid, p_asof: asof });
    if (error) throw error;
    const ref = asof || D.todayDhaka();
    const items = data.map((r) => {
      const perDay = Number(r.sold_14d) / 14;
      return Object.assign({}, r, {
        value: Math.round(Number(r.available) * Number(r.price) * 100) / 100,
        perDay: Math.round(perDay * 100) / 100,
        daysLeft: perDay > 0 && r.available > 0 ? Math.floor(Number(r.available) / perDay) : null
      });
    });
    return { items, asof: ref };
  }

  D.method(req, 'POST');
  const b = req.body, cid = D.needCompany(u, b.company_id);

  if (b.action === 'move') {
    if (!D.isDate(b.date)) throw D.bad('তারিখ ঠিক নয়');
    D.assertEditable(u, b.date);
    if (!['in', 'out'].includes(b.kind)) throw D.bad('ধরন ঠিক নয়');
    const qty = D.numOr(b.qty, 0, { min: 0, max: 1e7 });
    if (qty <= 0) throw D.bad('পরিমাণ দিন');
    const { data: p } = await supabase.from('products').select('id,code,name').eq('id', Number(b.product_id)).eq('company_id', cid).maybeSingle();
    if (!p) throw D.bad('প্রোডাক্ট বাছুন');
    const { data, error } = await supabase.from('stock_moves').insert({
      company_id: cid, entry_date: b.date, kind: b.kind, product_id: p.id, code: p.code, name: p.name,
      qty, note: String(b.note || '').slice(0, 200), created_by: u.name
    }).select().single();
    if (error) throw error;
    await D.audit(u, 'stock-' + b.kind, cid, { code: p.code, qty, date: b.date });
    return { move: data };
  }

  if (b.action === 'move-delete') {
    const { data: m } = await supabase.from('stock_moves').select('id,entry_date,code,qty,kind').eq('id', Number(b.id)).eq('company_id', cid).maybeSingle();
    if (!m) throw D.bad('এন্ট্রি পাওয়া যায়নি');
    D.assertEditable(u, m.entry_date);
    const { error } = await supabase.from('stock_moves').delete().eq('id', m.id);
    if (error) throw error;
    await D.audit(u, 'stock-delete', cid, m);
    return {};
  }

  if (b.action === 'opening') {
    D.ownerOnly(u);
    const items = Array.isArray(b.items) ? b.items : [];
    for (const it of items) {
      const q = D.numOr(it.qty, 0, { min: -1e7, max: 1e7 });
      const { error } = await supabase.from('products').update({ opening_qty: q }).eq('id', Number(it.product_id)).eq('company_id', cid);
      if (error) throw error;
    }
    await D.audit(u, 'opening-stock', cid, { items: items.length });
    return {};
  }

  throw D.bad('অজানা অনুরোধ');
});
