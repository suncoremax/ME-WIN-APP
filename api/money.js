// Money pages of a company.
//   type=ledger    paid out to the company / product received / opening code balance  (finance)
//   type=expenses  খরচ হিসাব                                                           (finance)
//   type=clients   বাকি ক্লায়েন্ট and their due/paid entries
// "shared" company (company_id=shared) is the owner's own list not tied to any company.
const D = require('./_lib/db');
const calc = require('./_lib/calc');
const { supabase } = D;

function scope(u, raw) {
  if (raw === 'shared') { D.ownerOnly(u); return null; }
  return D.needCompany(u, raw);
}
const apply = (q, cid) => (cid === null ? q.is('company_id', null) : q.eq('company_id', cid));

module.exports = D.route(async (req) => {
  const u = await D.requireUser(req);
  const q = req.method === 'GET' ? req.query : req.body;
  const type = q.type;

  // ───────────── ledger ─────────────
  if (type === 'ledger') {
    D.needFinance(u);
    const cid = D.needCompany(u, q.company_id);
    if (req.method === 'GET') {
      const { from, to } = D.rangeOf(q);
      const rows = await D.fetchAll(() => supabase.from('ledger').select('id,entry_date,kind,amount,note,created_by')
        .eq('company_id', cid).gte('entry_date', from).lte('entry_date', to).order('entry_date', { ascending: false }).order('id', { ascending: false }));
      const all = await D.fetchAll(() => supabase.from('ledger').select('kind,amount').eq('company_id', cid));
      return { rows, totals: calc.ledgerTotals(all) };
    }
    D.method(req, 'POST');
    if (q.action === 'add') {
      if (!D.isDate(q.date)) throw D.bad('তারিখ ঠিক নয়');
      D.assertEditable(u, q.date);
      if (!['payout', 'received', 'opening'].includes(q.kind)) throw D.bad('ধরন ঠিক নয়');
      if (q.kind === 'opening') D.ownerOnly(u);
      const amount = D.numOr(q.amount, 0, { min: 0, max: 1e10 });
      if (amount <= 0) throw D.bad('টাকার পরিমাণ দিন');
      const { error } = await supabase.from('ledger').insert({ company_id: cid, entry_date: q.date, kind: q.kind, amount, note: String(q.note || '').slice(0, 200), created_by: u.name });
      if (error) throw error;
      await D.audit(u, 'ledger-' + q.kind, cid, { amount, date: q.date });
      return {};
    }
    if (q.action === 'delete') {
      const { data: r } = await supabase.from('ledger').select('id,entry_date,kind,amount').eq('id', Number(q.id)).eq('company_id', cid).maybeSingle();
      if (!r) throw D.bad('এন্ট্রি পাওয়া যায়নি');
      D.assertEditable(u, r.entry_date);
      const { error } = await supabase.from('ledger').delete().eq('id', r.id);
      if (error) throw error;
      await D.audit(u, 'ledger-delete', cid, r);
      return {};
    }
  }

  // ───────────── expenses ─────────────
  if (type === 'expenses') {
    D.needFinance(u);
    const cid = scope(u, q.company_id);
    if (req.method === 'GET') {
      const { from, to } = D.rangeOf(q);
      const rows = await D.fetchAll(() => apply(supabase.from('expenses').select('id,entry_date,name,amount,created_by'), cid)
        .gte('entry_date', from).lte('entry_date', to).order('entry_date', { ascending: false }).order('id', { ascending: false }));
      return { rows, total: D.r2(rows.reduce((s, r) => s + Number(r.amount), 0)) };
    }
    D.method(req, 'POST');
    if (q.action === 'add') {
      if (!D.isDate(q.date)) throw D.bad('তারিখ ঠিক নয়');
      D.assertEditable(u, q.date);
      const name = String(q.name || '').trim();
      const amount = D.numOr(q.amount, 0, { min: 0, max: 1e10 });
      if (!name || amount <= 0) throw D.bad('খরচের নাম ও টাকা দিন');
      const { error } = await supabase.from('expenses').insert({ company_id: cid, entry_date: q.date, name: name.slice(0, 120), amount, created_by: u.name });
      if (error) throw error;
      await D.audit(u, 'expense-add', cid, { name, amount });
      return {};
    }
    if (q.action === 'delete') {
      const { data: r } = await apply(supabase.from('expenses').select('id,entry_date,name,amount'), cid).eq('id', Number(q.id)).maybeSingle();
      if (!r) throw D.bad('এন্ট্রি পাওয়া যায়নি');
      D.assertEditable(u, r.entry_date);
      const { error } = await supabase.from('expenses').delete().eq('id', r.id);
      if (error) throw error;
      await D.audit(u, 'expense-delete', cid, r);
      return {};
    }
  }

  // ───────────── due clients ─────────────
  if (type === 'clients') {
    const cid = scope(u, q.company_id);
    if (req.method === 'GET') {
      const clients = await D.fetchAll(() => apply(supabase.from('clients').select('id,name,phone,note,active'), cid).order('id'));
      const ids = clients.map((c) => c.id);
      let tx = [];
      if (ids.length) tx = await D.fetchAll(() => supabase.from('client_txns').select('id,client_id,entry_date,kind,amount,note').in('client_id', ids).order('entry_date', { ascending: false }).order('id', { ascending: false }));
      const bal = {}, last = {};
      tx.forEach((t) => { bal[t.client_id] = (bal[t.client_id] || 0) + (t.kind === 'due' ? 1 : -1) * Number(t.amount); if (!last[t.client_id]) last[t.client_id] = t.entry_date; });
      return {
        clients: clients.map((c) => Object.assign({}, c, { balance: D.r2(bal[c.id] || 0), last: last[c.id] || null })),
        txns: req.query.client_id ? tx.filter((t) => t.client_id === Number(req.query.client_id)) : []
      };
    }
    D.method(req, 'POST');
    if (q.action === 'save') {
      const name = String(q.name || '').trim();
      if (!name) throw D.bad('ক্লায়েন্টের নাম দিন');
      const row = { name: name.slice(0, 120), phone: String(q.phone || '').trim().slice(0, 30), note: String(q.note || '').slice(0, 200) };
      if (q.active !== undefined) row.active = !!q.active;
      if (q.id) {
        const { error } = await apply(supabase.from('clients').update(row), cid).eq('id', Number(q.id));
        if (error) throw error;
      } else {
        row.company_id = cid;
        const { error } = await supabase.from('clients').insert(row);
        if (error) throw error;
      }
      await D.audit(u, 'client-save', cid, { name });
      return {};
    }
    if (q.action === 'txn') {
      const { data: c } = await apply(supabase.from('clients').select('id'), cid).eq('id', Number(q.client_id)).maybeSingle();
      if (!c) throw D.bad('ক্লায়েন্ট পাওয়া যায়নি');
      if (!D.isDate(q.date)) throw D.bad('তারিখ ঠিক নয়');
      D.assertEditable(u, q.date);
      if (!['due', 'paid'].includes(q.kind)) throw D.bad('ধরন ঠিক নয়');
      const amount = D.numOr(q.amount, 0, { min: 0, max: 1e10 });
      if (amount <= 0) throw D.bad('টাকার পরিমাণ দিন');
      const { error } = await supabase.from('client_txns').insert({ client_id: c.id, entry_date: q.date, kind: q.kind, amount, note: String(q.note || '').slice(0, 200), created_by: u.name });
      if (error) throw error;
      await D.audit(u, 'client-' + q.kind, cid, { client: c.id, amount });
      return {};
    }
    if (q.action === 'txn-delete') {
      D.ownerOnly(u);
      const { data: t } = await supabase.from('client_txns').select('id,client_id').eq('id', Number(q.id)).maybeSingle();
      if (!t) throw D.bad('এন্ট্রি পাওয়া যায়নি');
      const { data: c } = await apply(supabase.from('clients').select('id'), cid).eq('id', t.client_id).maybeSingle();
      if (!c) throw D.deny();
      const { error } = await supabase.from('client_txns').delete().eq('id', t.id);
      if (error) throw error;
      return {};
    }
  }

  throw D.bad('অজানা অনুরোধ');
});
