// One company, one day: sales, returns, damage + memo money. (Excel: Day1…Day30 + Over Sales)
//   GET  ?company_id&date           → the day
//   GET  ?company_id&from&to&list=1 → day totals for a range
//   POST action=save                → save the whole day in one go
//   POST action=close               → close / reopen the day
const D = require('./_lib/db');
const calc = require('./_lib/calc');
const { supabase } = D;

const SECTIONS = ['sale', 'over', 'return', 'adjust', 'damage'];
const MAX_LINES = 400;

module.exports = D.route(async (req) => {
  const u = await D.requireUser(req);

  if (req.method === 'GET') {
    const cid = D.needCompany(u, req.query.company_id);
    if (req.query.list === '1') {
      const { from, to } = D.rangeOf(req.query);
      const data = await D.fetchAll(() => supabase.rpc('daily_summary', { p_company: cid, p_from: from, p_to: to }));
      return { days: data.map(calc.dayNumbers) };
    }
    const date = req.query.date;
    if (!D.isDate(date)) throw D.bad('তারিখ ঠিক নয়');
    const [e, l] = await Promise.all([
      supabase.from('day_entries').select('memo_amount,note,closed,closed_by,dmg_deduct,updated_by,updated_at').eq('company_id', cid).eq('entry_date', date).maybeSingle(),
      supabase.from('day_lines').select('id,section,product_id,code,name,price,qty,amount,sort').eq('company_id', cid).eq('entry_date', date).order('sort').order('id')
    ]);
    if (e.error) throw e.error;
    if (l.error) throw l.error;
    return { entry: e.data || { memo_amount: 0, note: '', closed: false, dmg_deduct: false }, lines: l.data };
  }

  D.method(req, 'POST');
  const b = req.body, cid = D.needCompany(u, b.company_id);
  if (!D.isDate(b.date)) throw D.bad('তারিখ ঠিক নয়');
  D.assertEditable(u, b.date);

  if (b.action === 'save') {
    const src = Array.isArray(b.lines) ? b.lines : [];
    if (src.length > MAX_LINES) throw D.bad('একদিনে সর্বোচ্চ ' + MAX_LINES + ' লাইন');

    // prices & names come from the product list; the price on a line may differ (special rate)
    const { data: prods, error: pe } = await supabase.from('products').select('id,code,name,price').eq('company_id', cid);
    if (pe) throw pe;
    const byId = new Map(prods.map((p) => [p.id, p]));

    const lines = src.map((x, i) => {
      const section = x.section;
      if (!SECTIONS.includes(section)) throw D.bad('লাইন ' + (i + 1) + ': ধরন ঠিক নয়');
      if (section === 'adjust') {
        const amount = D.numOr(x.amount, 0, { min: 0, max: 1e9 });
        const name = String(x.name || '').trim();
        if (!name || amount <= 0) throw D.bad('লাইন ' + (i + 1) + ': কারণ ও টাকা দিন');
        return { section, product_id: null, code: '', name: name.slice(0, 120), price: 0, qty: 0, amount: D.r2(amount) };
      }
      const qty = D.numOr(x.qty, 0, { min: 0, max: 1e7 });
      if (qty <= 0) throw D.bad('লাইন ' + (i + 1) + ': পরিমাণ দিন');
      let p = null;
      if (x.product_id) {
        p = byId.get(Number(x.product_id));
        if (!p) throw D.bad('লাইন ' + (i + 1) + ': প্রোডাক্ট এই কোম্পানির নয়');
      } else if (!String(x.code || '').trim()) {
        throw D.bad('লাইন ' + (i + 1) + ': প্রোডাক্ট বাছুন');
      }
      const price = x.price === '' || x.price == null ? (p ? Number(p.price) : 0) : D.numOr(x.price, 0, { min: 0, max: 1e7 });
      return {
        section, product_id: p ? p.id : null,
        code: p ? p.code : String(x.code).trim().slice(0, 60), name: p ? p.name : String(x.name || x.code).trim().slice(0, 120),
        price, qty, amount: D.r2(price * qty)
      };
    });

    const { data, error } = await supabase.rpc('save_day', {
      p_company: cid, p_date: b.date, p_memo: D.numOr(b.memo, 0, { min: 0, max: 1e9 }),
      p_note: String(b.note || '').slice(0, 500), p_lines: JSON.stringify(lines), p_user: u.name,
      p_override: D.isOwner(u), p_dmg_deduct: !!b.dmg_deduct
    });
    if (error) throw error;
    await D.audit(u, 'day-save', cid, { date: b.date, lines: lines.length, memo: b.memo });
    return { saved: data };
  }

  if (b.action === 'close') {
    const want = !!b.closed;
    if (!want && !D.isOwner(u)) throw D.deny('বন্ধ করা দিন খোলার অনুমতি শুধু মালিকের');
    const row = { company_id: cid, entry_date: b.date, closed: want, closed_by: want ? u.name : null, closed_at: want ? new Date().toISOString() : null };
    const { error } = await supabase.from('day_entries').upsert(row, { onConflict: 'company_id,entry_date' });
    if (error) throw error;
    await D.audit(u, want ? 'day-close' : 'day-reopen', cid, { date: b.date });
    return {};
  }

  throw D.bad('অজানা অনুরোধ');
});
