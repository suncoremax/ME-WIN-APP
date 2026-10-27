// Owner only: load the client's monthly Excel workbook (already read in the browser).
//   action=ensure  → make sure every company exists, return their ids
//   action=month   → one company's month, replaced in ONE database transaction
//   action=extras  → due-client list + shared expenses from the workbook
const D = require('./_lib/db');
const { supabase } = D;

const SECTIONS = ['sale', 'over', 'return', 'adjust', 'damage'];
const COLORS = ['#10B981', '#06B6D4', '#7C3AED', '#F59E0B', '#EF4444', '#EC4899', '#3B82F6', '#84CC16'];
const n = (v, d = 0) => { const x = Number(v); return isFinite(x) ? x : d; };
const s = (v, len) => String(v == null ? '' : v).trim().slice(0, len);

module.exports = D.route(async (req) => {
  const u = await D.requireUser(req);
  D.ownerOnly(u);
  D.method(req, 'POST');
  const b = req.body;

  if (b.action === 'ensure') {
    const names = (Array.isArray(b.names) ? b.names : []).map((x) => s(x, 60)).filter(Boolean).slice(0, 20);
    const { data: have, error } = await supabase.from('companies').select('id,name');
    if (error) throw error;
    const out = [];
    let count = have.length;
    for (const name of names) {
      let c = have.find((h) => h.name.trim().toLowerCase() === name.toLowerCase());
      if (!c) {
        count++;
        const ins = await supabase.from('companies').insert({ name, sort: count, color: COLORS[(count - 1) % COLORS.length] }).select('id,name').single();
        if (ins.error) throw ins.error;
        c = ins.data;
        await D.audit(u, 'company-create', c.id, { name, via: 'import' });
      }
      out.push({ name, id: c.id });
    }
    return { companies: out };
  }

  if (b.action === 'month') {
    const cid = D.needCompany(u, b.company_id);
    if (!D.isDate(b.from) || !D.isDate(b.to) || b.from > b.to) throw D.bad('তারিখের সীমা ঠিক নয়');
    const p = b.payload || {};
    const inRange = (d) => D.isDate(d) && d >= b.from && d <= b.to;

    const products = (Array.isArray(p.products) ? p.products : []).slice(0, 2000).map((x) => ({
      code: s(x.code, 60), name: s(x.name, 120), price: n(x.price), opening: n(x.opening)
    })).filter((x) => x.code);
    (Array.isArray(p.extraProducts) ? p.extraProducts : []).forEach((x) => products.push({ code: s(x.code, 60), name: s(x.name, 120), price: n(x.price), opening: 0 }));

    const days = (Array.isArray(p.days) ? p.days : []).slice(0, 62).filter((d) => inRange(d.date)).map((d) => ({
      date: d.date, memo: n(d.memo),
      lines: (Array.isArray(d.lines) ? d.lines : []).slice(0, 1000).filter((l) => SECTIONS.includes(l.section)).map((l) => ({
        section: l.section, code: s(l.code, 60), name: s(l.name, 120), price: n(l.price), qty: n(l.qty), amount: D.r2(n(l.amount))
      }))
    }));
    const moves = (Array.isArray(p.moves) ? p.moves : []).slice(0, 5000).filter((m) => inRange(m.date) && ['in', 'out'].includes(m.kind) && n(m.qty) > 0)
      .map((m) => ({ date: m.date, kind: m.kind, code: s(m.code, 60), name: s(m.name, 120), qty: n(m.qty) }));
    const ledger = (Array.isArray(p.ledger) ? p.ledger : []).slice(0, 2000).filter((l) => inRange(l.date) && ['payout', 'received', 'opening'].includes(l.kind) && n(l.amount) > 0)
      .map((l) => ({ date: l.date, kind: l.kind, amount: n(l.amount), note: s(l.note, 200) }));

    const { data, error } = await supabase.rpc('import_month', {
      p_company: cid, p_from: b.from, p_to: b.to,
      p: JSON.stringify({ products, days, moves, ledger }),
      p_replace: b.replace !== false, p_set_opening: !!b.set_opening, p_user: u.name
    });
    if (error) throw error;
    await D.audit(u, 'import-month', cid, Object.assign({ from: b.from, to: b.to }, data));
    return { result: data };
  }

  if (b.action === 'extras') {
    let clients = 0, expenses = 0;
    const { data: have } = await supabase.from('clients').select('name').is('company_id', null);
    const names = new Set((have || []).map((c) => c.name.trim().toLowerCase()));
    for (const c of (Array.isArray(b.clients) ? b.clients : []).slice(0, 500)) {
      const name = s(c.name, 120);
      if (!name || names.has(name.toLowerCase())) continue;
      const { error } = await supabase.from('clients').insert({ company_id: null, name, phone: s(c.phone, 30) });
      if (error) throw error;
      names.add(name.toLowerCase()); clients++;
    }
    for (const e of (Array.isArray(b.expenses) ? b.expenses : []).slice(0, 500)) {
      if (!D.isDate(e.date) || !s(e.name, 120) || n(e.amount) <= 0) continue;
      const { error } = await supabase.from('expenses').insert({ company_id: null, entry_date: e.date, name: s(e.name, 120), amount: n(e.amount), created_by: u.name });
      if (error) throw error;
      expenses++;
    }
    await D.audit(u, 'import-extras', null, { clients, expenses });
    return { clients, expenses };
  }

  throw D.bad('অজানা অনুরোধ');
});
