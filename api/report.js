// Numbers for the screens.
//   action=dashboard  owner: every company side by side + overall
//   action=company    one company's period summary (SO: his own)
//   action=checks     things that look wrong in the data
//   action=lines      every line in a range (for Excel export)
//   action=audit      owner: who did what
const D = require('./_lib/db');
const calc = require('./_lib/calc');
const { supabase } = D;

const finKeys = (u) => D.isOwner(u) || u.can_finance;

function totalsFromRow(t) {
  if (!t) return calc.total([]);
  const sales = Number(t.sales), ret = D.r2(Number(t.returns) + Number(t.adjust)), cut = Number(t.damage_cut);
  const memo = Number(t.memo);
  return {
    sales: D.r2(sales), returns: ret, damage: D.r2(Number(t.damage)), damageCut: D.r2(cut),
    memo: D.r2(memo), underOver: D.r2(memo - sales), net: D.r2(sales - ret - cut), activeDays: t.active_days
  };
}

async function stockSummary(cid, ref) {
  const { data, error } = await supabase.rpc('stock_view', { p_company: cid, p_asof: null });
  if (error) throw error;
  let value = 0, negative = 0, low = 0, items = 0;
  data.forEach((r) => {
    if (!r.active) return;
    items++;
    const av = Number(r.available);
    if (av > 0) value += av * Number(r.price);
    if (av < 0) negative++;
    const per = Number(r.sold_14d) / 14;
    if (av > 0 && per > 0 && av / per <= 3) low++;
  });
  return { value: D.r2(value), negative, low, items };
}

module.exports = D.route(async (req) => {
  const u = await D.requireUser(req);
  D.method(req, 'GET');
  const action = req.query.action || 'dashboard';
  const { from, to } = D.rangeOf(req.query);

  // ───────────── owner dashboard ─────────────
  if (action === 'dashboard') {
    D.ownerOnly(u);
    const { data: companies, error: ce } = await supabase.from('companies').select('id,name,color,commission_pct,sort,active').eq('active', true).order('sort').order('id');
    if (ce) throw ce;

    const [period, life, ledger, expenses] = await Promise.all([
      supabase.rpc('company_totals', { p_from: from, p_to: to }),
      supabase.rpc('company_totals', { p_from: '1900-01-01', p_to: '2999-12-31' }),
      D.fetchAll(() => supabase.from('ledger').select('company_id,kind,amount,entry_date').order('id')),
      D.fetchAll(() => supabase.from('expenses').select('company_id,amount,entry_date').gte('entry_date', from).lte('entry_date', to).order('id'))
    ]);
    if (period.error) throw period.error;
    if (life.error) throw life.error;
    const pBy = new Map(period.data.map((r) => [r.company_id, r]));
    const lBy = new Map(life.data.map((r) => [r.company_id, r]));

    const today = D.todayDhaka();
    const trendFrom = D.addDays(to < today ? to : today, -29) > from ? D.addDays(to < today ? to : today, -29) : from;
    const trendRows = await D.fetchAll(() => supabase.rpc('daily_summary', { p_company: null, p_from: trendFrom, p_to: to }));

    const extra = await Promise.all(companies.map(async (c) => {
      const [st, ck] = await Promise.all([
        stockSummary(c.id),
        supabase.rpc('data_checks', { p_company: c.id, p_from: from, p_to: to }).limit(1000)
      ]);
      if (ck.error) throw ck.error;
      return { st, checks: ck.data.length };
    }));

    let shared = 0;
    const expBy = {};
    expenses.forEach((x) => { const k = x.company_id || 0; expBy[k] = (expBy[k] || 0) + Number(x.amount); });

    const out = companies.map((c, i) => {
      const t = totalsFromRow(pBy.get(c.id));
      const lt = totalsFromRow(lBy.get(c.id));
      const lg = calc.ledgerTotals(ledger.filter((x) => x.company_id === c.id));
      const lgPeriod = ledger.filter((x) => x.company_id === c.id && x.kind === 'payout' && x.entry_date >= from && x.entry_date <= to).reduce((s, x) => s + Number(x.amount), 0);
      const commission = D.r2(t.net * Number(c.commission_pct) / 100);
      return {
        id: c.id, name: c.name, color: c.color, commissionPct: Number(c.commission_pct),
        totals: t, commission, expenses: D.r2(expBy[c.id] || 0),
        payoutPeriod: D.r2(lgPeriod), codeBalance: lg.codeBalance,
        // what is still to be paid to the company: all net sales − all paid out
        dueToPay: D.r2(lt.net - lg.payout),
        lifetimeNet: lt.net, stock: extra[i].st, checks: extra[i].checks,
        lastDay: (pBy.get(c.id) || {}).last_day || null
      };
    });
    shared = D.r2(expBy[0] || 0);
    const sum = (k, f) => D.r2(out.reduce((s, c) => s + (f ? f(c) : c[k]), 0));
    const overall = {
      sales: sum(0, (c) => c.totals.sales), returns: sum(0, (c) => c.totals.returns), damage: sum(0, (c) => c.totals.damage),
      memo: sum(0, (c) => c.totals.memo), underOver: sum(0, (c) => c.totals.underOver), net: sum(0, (c) => c.totals.net),
      commission: sum('commission'), expenses: D.r2(sum('expenses') + shared), sharedExpenses: shared,
      payout: sum('payoutPeriod'), dueToPay: sum('dueToPay'), stockValue: sum(0, (c) => c.stock.value),
      checks: sum('checks')
    };
    overall.profit = D.r2(overall.commission - overall.expenses);

    // trend: net per day per company
    const trend = {};
    const cm = new Map(companies.map((c) => [c.id, c]));
    trendRows.forEach((r) => {
      if (!cm.has(r.company_id)) return;
      const n = calc.dayNumbers(r);
      (trend[r.d] = trend[r.d] || { date: r.d, byCompany: {}, net: 0 });
      trend[r.d].byCompany[r.company_id] = n.net;
      trend[r.d].net = D.r2(trend[r.d].net + n.net);
    });
    return { range: { from, to }, today, companies: out, overall, trend: Object.values(trend).sort((a, b) => (a.date < b.date ? -1 : 1)) };
  }

  // ───────────── one company ─────────────
  if (action === 'company') {
    const cid = D.needCompany(u, req.query.company_id);
    const fin = finKeys(u);
    const { data: co, error: ce } = await supabase.from('companies').select('id,name,color,commission_pct').eq('id', cid).single();
    if (ce) throw ce;

    const [dailyRaw, prod, st, ck, life] = await Promise.all([
      D.fetchAll(() => supabase.rpc('daily_summary', { p_company: cid, p_from: from, p_to: to })),
      supabase.rpc('product_totals', { p_company: cid, p_from: from, p_to: to }),
      stockSummary(cid),
      supabase.rpc('data_checks', { p_company: cid, p_from: from, p_to: to }).limit(1000),
      supabase.rpc('company_totals', { p_from: '1900-01-01', p_to: '2999-12-31' })
    ]);
    if (prod.error) throw prod.error;
    if (ck.error) throw ck.error;
    const days = dailyRaw.map(calc.dayNumbers);
    const t = calc.total(days);
    const today = D.todayDhaka();
    const res = {
      company: { id: co.id, name: co.name, color: co.color }, range: { from, to }, today,
      totals: t, days, stock: st, checks: ck.data.length,
      products: prod.data.slice(0, 200),
      todayRow: days.find((d) => d.date === today) || null
    };
    if (fin) {
      res.company.commissionPct = Number(co.commission_pct);
      res.commission = D.r2(t.net * Number(co.commission_pct) / 100);
      const [ex, lg] = await Promise.all([
        D.fetchAll(() => supabase.from('expenses').select('amount').eq('company_id', cid).gte('entry_date', from).lte('entry_date', to).order('id')),
        D.fetchAll(() => supabase.from('ledger').select('kind,amount,entry_date').eq('company_id', cid).order('id'))
      ]);
      res.expenses = D.r2(ex.reduce((s, x) => s + Number(x.amount), 0));
      res.profit = D.r2(res.commission - res.expenses);
      const lt = totalsFromRow((life.data || []).find((r) => r.company_id === cid));
      const lgt = calc.ledgerTotals(lg);
      res.ledger = Object.assign({}, lgt, {
        payoutPeriod: D.r2(lg.filter((x) => x.kind === 'payout' && x.entry_date >= from && x.entry_date <= to).reduce((s, x) => s + Number(x.amount), 0)),
        dueToPay: D.r2(lt.net - lgt.payout), lifetimeNet: lt.net
      });
    }
    return res;
  }

  if (action === 'checks') {
    const cid = D.needCompany(u, req.query.company_id);
    const { data, error } = await supabase.rpc('data_checks', { p_company: cid, p_from: from, p_to: to }).limit(500);
    if (error) throw error;
    return { checks: data };
  }

  if (action === 'lines') {
    const cid = D.needCompany(u, req.query.company_id);
    const lines = await D.fetchAll(() => supabase.from('day_lines')
      .select('entry_date,section,code,name,price,qty,amount').eq('company_id', cid)
      .gte('entry_date', from).lte('entry_date', to).order('entry_date').order('id'));
    return { lines };
  }

  if (action === 'audit') {
    D.ownerOnly(u);
    let q = supabase.from('audit_log').select('id,at,user_name,role,company_id,action,detail').order('id', { ascending: false }).limit(200);
    if (req.query.company_id) q = q.eq('company_id', Number(req.query.company_id));
    const { data, error } = await q;
    if (error) throw error;
    return { log: data };
  }

  throw D.bad('অজানা অনুরোধ');
});
