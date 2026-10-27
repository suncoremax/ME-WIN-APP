// Product list of one company (Excel: Master Product).
const D = require('./_lib/db');
const { supabase } = D;

module.exports = D.route(async (req) => {
  const u = await D.requireUser(req);

  if (req.method === 'GET') {
    const cid = D.needCompany(u, req.query.company_id);
    const rows = await D.fetchAll(() => supabase.from('products')
      .select('id,code,name,price,opening_qty,active,sort').eq('company_id', cid).order('sort').order('id'));
    return { products: rows };
  }

  D.method(req, 'POST');
  const b = req.body, cid = D.needCompany(u, b.company_id);

  if (b.action === 'save') {
    const code = String(b.code || '').trim(), name = String(b.name || '').trim();
    if (!code || code.length > 60) throw D.bad('প্রোডাক্ট কোড দিন');
    if (!name || name.length > 120) throw D.bad('প্রোডাক্টের নাম দিন');
    const row = { code, name, price: D.numOr(b.price, 0, { min: 0, max: 1e7 }) };
    if (b.active !== undefined) row.active = !!b.active;
    if (D.isOwner(u) && b.opening_qty !== undefined) row.opening_qty = D.numOr(b.opening_qty, 0, { min: -1e7, max: 1e7 });
    if (b.id) {
      const { data, error } = await supabase.from('products').update(row).eq('id', Number(b.id)).eq('company_id', cid).select().single();
      if (error) throw error;
      await D.audit(u, 'product-update', cid, { id: data.id, code, price: row.price });
      return { product: data };
    }
    const { count } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('company_id', cid);
    row.company_id = cid; row.sort = (count || 0) + 1;
    const { data, error } = await supabase.from('products').insert(row).select().single();
    if (error) {
      if (error.code === '23505') throw D.bad('এই কোডের প্রোডাক্ট আগে থেকেই আছে');
      throw error;
    }
    await D.audit(u, 'product-create', cid, { code, price: row.price });
    return { product: data };
  }

  if (b.action === 'delete') {
    D.ownerOnly(u);
    const id = Number(b.id);
    const { count } = await supabase.from('day_lines').select('*', { count: 'exact', head: true }).eq('product_id', id);
    if (count > 0) throw D.bad('এই প্রোডাক্টের লেনদেন আছে, মুছতে পারবেন না। বদলে "বন্ধ" করে দিন');
    const { error } = await supabase.from('products').delete().eq('id', id).eq('company_id', cid);
    if (error) throw error;
    await D.audit(u, 'product-delete', cid, { id });
    return {};
  }

  throw D.bad('অজানা অনুরোধ');
});
