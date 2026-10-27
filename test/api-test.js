// End-to-end API test against the dev server (real Postgres, real schema.sql).
//   node test/api-test.js <workbook.xlsx> [baseUrl]
const XLSX = require('xlsx');
const Ax = require('../src/lib/excel-import.js');
const BASE = process.argv[3] || 'http://localhost:3100';
let fails = 0, passes = 0;
const ok = (c, m, extra) => { if (c) passes++; else { fails++; console.log('  ✗ FAIL:', m, extra !== undefined ? JSON.stringify(extra) : ''); } };

async function call(path, { method = 'GET', body, token } = {}) {
  const r = await fetch(BASE + path, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  return Object.assign({ status: r.status }, j);
}

(async () => {
  const wb = XLSX.readFile(process.argv[2]);
  const parsed = Ax.parseWorkbook(XLSX, wb, { filename: 'October_v.1.0.xlsx' });
  const from = '2026-10-01', to = '2026-10-31';

  // ── bootstrap + owner login
  let r = await call('/api/auth', { method: 'POST', body: { pin: '00000' } });
  ok(r.status === 401, 'wrong pin rejected', r.status);
  r = await call('/api/auth', { method: 'POST', body: { pin: '12345' } });
  ok(r.ok && r.user.role === 'owner' && r.user.mustChange, 'bootstrap owner login', r);
  let owner = r.token;
  r = await call('/api/auth?action=change', { method: 'POST', token: owner, body: { oldPin: '12345', newPin: '54321' } });
  ok(r.ok && r.token, 'owner changes pin', r); owner = r.token;
  r = await call('/api/auth', { method: 'POST', body: { pin: '12345' } });
  ok(r.status === 401, 'old owner pin no longer works');

  // ── import the workbook
  r = await call('/api/import', { method: 'POST', token: owner, body: { action: 'ensure', names: parsed.companies.map((c) => c.name) } });
  ok(r.ok && r.companies.length === parsed.companies.length, 'ensure companies', r);
  const ids = Object.fromEntries(r.companies.map((c) => [c.name, c.id]));
  for (const c of parsed.companies) {
    const rr = await call('/api/import', { method: 'POST', token: owner, body: { action: 'month', company_id: ids[c.name], from, to, replace: true, set_opening: true, payload: c } });
    ok(rr.ok, 'import ' + c.name, rr);
  }
  r = await call('/api/import', { method: 'POST', token: owner, body: { action: 'extras', clients: parsed.clients, expenses: parsed.expenses } });
  ok(r.ok && r.clients === 15, 'extras import', r);
  // re-import is idempotent
  const c0 = parsed.companies[0];
  r = await call('/api/import', { method: 'POST', token: owner, body: { action: 'month', company_id: ids[c0.name], from, to, replace: true, set_opening: true, payload: c0 } });
  ok(r.ok, 're-import ok');

  // ── numbers must equal the Excel's own
  const dash = await call(`/api/report?action=dashboard&from=${from}&to=${to}`, { token: owner });
  ok(dash.ok, 'dashboard', dash);
  for (const c of parsed.companies) {
    const d = dash.companies.find((x) => x.name === c.name);
    ok(Math.abs(d.totals.net - c.excel.net) < 0.01, c.name + ' net == Excel', [d.totals.net, c.excel.net]);
    ok(Math.abs(d.totals.sales - c.excel.total) < 0.01, c.name + ' sales == Excel', [d.totals.sales, c.excel.total]);
    ok(Math.abs(d.totals.memo - c.excel.memo) < 0.01, c.name + ' memo == Excel', [d.totals.memo, c.excel.memo]);
    ok(Math.abs(d.totals.returns - c.excel.ret) < 0.01, c.name + ' returns == Excel', [d.totals.returns, c.excel.ret]);
    ok(Math.abs(d.totals.underOver - c.excel.uo) < 0.01, c.name + ' under/over == Excel', [d.totals.underOver, c.excel.uo]);
  }
  console.log('  dashboard overall:', JSON.stringify(dash.overall));
  console.log('  per company:', dash.companies.map((c) => `${c.name}: net ${c.totals.net}, comm ${c.commission}, due ${c.dueToPay}, code ${c.codeBalance}, stock ${c.stock.value}, neg ${c.stock.negative}, checks ${c.checks}`).join('\n    '));

  // stock parity with the Excel's "Available Stock"
  let cmp = 0, bad = 0;
  for (const c of parsed.companies) {
    const st = await call(`/api/stock?company_id=${ids[c.name]}`, { token: owner });
    for (const it of st.items) {
      const key = c.name + '|' + it.code.trim().toLowerCase();
      if (key in parsed.excelAvailable) { cmp++; if (Math.abs(parsed.excelAvailable[key] - it.available) > 0.01) { bad++; if (bad < 8) console.log('    stock diff', c.name, it.code, 'mine', it.available, 'excel', parsed.excelAvailable[key]); } }
    }
  }
  console.log(`  stock parity: ${cmp - bad}/${cmp} products equal the Excel's Available Stock`);
  ok(bad <= 2, "stock parity (2 known Excel lookup quirks allowed)", bad);

  // ── SOs
  const names = parsed.companies.map((c) => c.name);
  const pins = ['11111', '22222', '33333', '44444'];
  for (let i = 0; i < names.length; i++) {
    r = await call('/api/company?action=user-save', { method: 'POST', token: owner, body: { company_id: ids[names[i]], name: 'SO ' + names[i], pin: pins[i] } });
    ok(r.ok, 'create SO ' + names[i], r);
  }
  r = await call('/api/company?action=user-save', { method: 'POST', token: owner, body: { company_id: ids[names[1]], name: 'dup', pin: '11111' } });
  ok(r.status === 400, 'duplicate PIN refused', r);
  r = await call('/api/company?action=suggest-pin', { token: owner });
  ok(r.ok && /^\d{5}$/.test(r.pin), 'suggest pin', r);

  const so1 = (await call('/api/auth', { method: 'POST', body: { pin: '11111' } }));
  ok(so1.ok && so1.user.role === 'so' && so1.user.companyName === names[0], 'so login', so1);
  const so2 = (await call('/api/auth', { method: 'POST', body: { pin: '22222' } }));
  const t1 = so1.token;

  // ── isolation: SO1 must never see company 2's data
  r = await call('/api/company', { token: t1 });
  ok(r.ok && r.companies.length === 1 && r.companies[0].id === ids[names[0]], 'so sees only own company', r.companies);
  ok(r.companies[0].commission_pct === null, 'so does not see commission %');
  const other = ids[names[1]];
  for (const p of [`/api/report?action=company&company_id=${other}`, `/api/stock?company_id=${other}`, `/api/products?company_id=${other}`,
    `/api/day?company_id=${other}&date=2026-10-05`, `/api/day?company_id=${other}&from=${from}&to=${to}&list=1`,
    `/api/money?type=clients&company_id=${other}`, `/api/report?action=checks&company_id=${other}`, `/api/report?action=lines&company_id=${other}`]) {
    r = await call(p, { token: t1 });
    ok(r.status === 403, 'so blocked from other company: ' + p.split('?')[0] + '?' + p.split('?')[1].slice(0, 30), r.status);
  }
  for (const p of ['/api/report?action=dashboard', '/api/report?action=audit', '/api/company?action=users&company_id=' + ids[names[0]], '/api/company?action=suggest-pin']) {
    r = await call(p, { token: t1 });
    ok(r.status === 403, 'so blocked from owner-only: ' + p, r.status);
  }
  r = await call('/api/import', { method: 'POST', token: t1, body: { action: 'ensure', names: ['x'] } });
  ok(r.status === 403, 'so cannot import');
  r = await call('/api/company?action=save', { method: 'POST', token: t1, body: { name: 'Hack' } });
  ok(r.status === 403, 'so cannot create company');
  r = await call('/api/day', { method: 'POST', token: t1, body: { action: 'save', company_id: other, date: '2026-10-26', memo: 1, lines: [] } });
  ok(r.status === 403, 'so cannot write to other company');
  r = await call(`/api/money?type=ledger&company_id=${ids[names[0]]}`, { token: t1 });
  ok(r.status === 403, 'so without finance blocked from ledger');
  r = await call(`/api/report?action=company&company_id=${ids[names[0]]}&from=${from}&to=${to}`, { token: t1 });
  ok(r.ok && r.commission === undefined && r.ledger === undefined && r.profit === undefined, 'so company report has no commission/profit/ledger', Object.keys(r));
  r = await call('/api/auth?action=me', { token: 'garbage.token' });
  ok(r.status === 401, 'bad token rejected');
  // forged token with own signature must fail
  const forged = Buffer.from(JSON.stringify({ uid: 1, v: 0, exp: Date.now() + 1e9 })).toString('base64url') + '.AAAA';
  r = await call('/api/auth?action=me', { token: forged });
  ok(r.status === 401, 'forged token rejected');

  // ── SO day entry
  const cid1 = ids[names[0]];
  const prods = (await call(`/api/products?company_id=${cid1}`, { token: t1 })).products;
  ok(prods.length > 10, 'so reads own products', prods.length);
  const today = new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10);
  const p1 = prods[1], p2 = prods[2];
  r = await call('/api/day', { method: 'POST', token: t1, body: { action: 'save', company_id: cid1, date: today, memo: 1000, dmg_deduct: true, lines: [
    { section: 'sale', product_id: p1.id, qty: 10 }, { section: 'sale', product_id: p2.id, qty: 2, price: 50 },
    { section: 'return', product_id: p1.id, qty: 1 }, { section: 'adjust', name: 'কম', amount: 20 }, { section: 'damage', product_id: p1.id, qty: 1 }] } });
  ok(r.ok, 'so saves today', r);
  r = await call(`/api/day?company_id=${cid1}&date=${today}`, { token: t1 });
  ok(r.ok && r.lines.length === 5 && r.entry.memo_amount === 1000, 'day round-trip', r);
  const sale1 = r.lines.find((l) => l.section === 'sale' && l.product_id === p1.id);
  ok(sale1.amount === Math.round(p1.price * 10 * 100) / 100, 'amount computed on server', sale1);
  r = await call(`/api/day?company_id=${cid1}&from=${today}&to=${today}&list=1`, { token: t1 });
  const row = r.days[0];
  const expectNet = Math.round((p1.price * 10 + 100 - p1.price - 20 - p1.price) * 100) / 100;
  ok(row && Math.abs(row.net - expectNet) < 0.01, 'net = sales − returns − adjust − damage(deducted)', [row, expectNet]);
  r = await call('/api/day', { method: 'POST', token: t1, body: { action: 'save', company_id: cid1, date: today, memo: 1, lines: [{ section: 'sale', product_id: prods[0].id, qty: -3 }] } });
  ok(r.status === 400, 'negative qty refused', r);
  r = await call('/api/day', { method: 'POST', token: t1, body: { action: 'save', company_id: cid1, date: '2026-10-05', memo: 1, lines: [] } });
  ok(r.status === 403, 'so cannot edit old days (>7d)', r);
  r = await call('/api/day', { method: 'POST', token: t1, body: { action: 'save', company_id: cid1, date: '2099-01-01', memo: 1, lines: [] } });
  ok(r.status === 403, 'so cannot write future days', r);
  // product from another company
  const otherProd = (await call(`/api/products?company_id=${other}`, { token: owner })).products[0];
  r = await call('/api/day', { method: 'POST', token: t1, body: { action: 'save', company_id: cid1, date: today, memo: 1, lines: [{ section: 'sale', product_id: otherProd.id, qty: 1 }] } });
  ok(r.status === 400, 'foreign product refused', r);
  // close / reopen
  r = await call('/api/day', { method: 'POST', token: t1, body: { action: 'close', company_id: cid1, date: today, closed: true } });
  ok(r.ok, 'so closes day');
  r = await call('/api/day', { method: 'POST', token: t1, body: { action: 'save', company_id: cid1, date: today, memo: 5, lines: [] } });
  ok(r.status === 409, 'closed day cannot be edited by so', r);
  r = await call('/api/day', { method: 'POST', token: t1, body: { action: 'close', company_id: cid1, date: today, closed: false } });
  ok(r.status === 403, 'so cannot reopen');
  r = await call('/api/day', { method: 'POST', token: owner, body: { action: 'save', company_id: cid1, date: today, memo: 7, lines: [{ section: 'sale', product_id: p1.id, qty: 1 }] } });
  ok(r.ok, 'owner can edit a closed day', r);
  r = await call('/api/day', { method: 'POST', token: owner, body: { action: 'close', company_id: cid1, date: today, closed: false } });
  ok(r.ok, 'owner reopens');

  // ── permissions: owner grants finance, SO pin reset signs him out
  r = await call('/api/company?action=users&company_id=' + cid1, { token: owner });
  const soId = r.users[0].id;
  r = await call('/api/company?action=user-save', { method: 'POST', token: owner, body: { id: soId, company_id: cid1, name: 'SO A', can_finance: true } });
  ok(r.ok, 'grant finance');
  r = await call(`/api/report?action=company&company_id=${cid1}&from=${from}&to=${to}`, { token: t1 });
  ok(r.ok && r.commission !== undefined && r.ledger, 'so with finance sees commission/ledger');
  r = await call('/api/company?action=user-save', { method: 'POST', token: owner, body: { id: soId, company_id: cid1, name: 'SO A', pin: '67890' } });
  ok(r.ok, 'owner resets so pin');
  r = await call('/api/auth?action=me', { token: t1 });
  ok(r.status === 401, 'old session dies after pin reset');
  r = await call('/api/auth', { method: 'POST', body: { pin: '11111' } });
  ok(r.status === 401, 'old pin dead');
  r = await call('/api/auth', { method: 'POST', body: { pin: '67890' } });
  ok(r.ok, 'new pin works');
  r = await call('/api/company?action=user-save', { method: 'POST', token: owner, body: { id: soId, company_id: cid1, name: 'SO A', active: false } });
  r = await call('/api/auth', { method: 'POST', body: { pin: '67890' } });
  ok(r.status === 401, 'deactivated so cannot login');

  // ── data checks & money
  r = await call(`/api/report?action=checks&company_id=${ids['Mr.Noddles']}&from=${from}&to=${to}`, { token: owner });
  const kinds = {}; r.checks.forEach((c) => { kinds[c.kind] = (kinds[c.kind] || 0) + 1; });
  console.log('  checks Mr.Noddles:', JSON.stringify(kinds));
  ok(r.ok && r.checks.length > 0, 'data checks run');
  r = await call('/api/money', { method: 'POST', token: owner, body: { type: 'expenses', action: 'add', company_id: 'shared', date: today, name: 'ভাড়া', amount: 5000 } });
  ok(r.ok, 'shared expense');
  r = await call('/api/money', { method: 'POST', token: owner, body: { type: 'ledger', action: 'add', company_id: ids['Jhotphot'], date: today, kind: 'payout', amount: 1000 } });
  ok(r.ok, 'payout');
  r = await call(`/api/money?type=ledger&company_id=${ids['Jhotphot']}`, { token: owner });
  ok(r.ok && r.totals.payout === 1000, 'ledger totals', r.totals);
  r = await call('/api/money?type=clients&company_id=shared', { token: owner });
  ok(r.ok && r.clients.length === 15, 'clients list', r.clients && r.clients.length);

  // ── brute-force throttle (last, it locks the IP)
  let last;
  for (let i = 0; i < 10; i++) last = await call('/api/auth', { method: 'POST', body: { pin: String(10000 + i) } });
  ok(last.status === 429, 'login throttled after repeated failures', last);

  console.log(`\n${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
