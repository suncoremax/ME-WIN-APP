// Seed a fresh test DB through the real API: owner (PIN 54321), the Excel data, one SO per company.
const XLSX = require('xlsx'); const Ax = require('../src/lib/excel-import.js');
const BASE = process.argv[3] || 'http://localhost:3100';
const call = async (p, { method = 'GET', body, token } = {}) => (await fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined })).json();
(async () => {
  const parsed = Ax.parseWorkbook(XLSX, XLSX.readFile(process.argv[2]), { filename: 'October_v.1.0.xlsx' });
  let r = await call('/api/auth', { method: 'POST', body: { pin: '12345' } });
  r = await call('/api/auth?action=change', { method: 'POST', token: r.token, body: { oldPin: '12345', newPin: '54321' } });
  const t = r.token;
  const ens = await call('/api/import', { method: 'POST', token: t, body: { action: 'ensure', names: parsed.companies.map((c) => c.name) } });
  const pins = ['11111', '22222', '33333', '44444'];
  for (let i = 0; i < parsed.companies.length; i++) {
    const c = parsed.companies[i], id = ens.companies[i].id;
    await call('/api/import', { method: 'POST', token: t, body: { action: 'month', company_id: id, from: '2026-10-01', to: '2026-10-31', replace: true, set_opening: true, payload: c } });
    await call('/api/company?action=user-save', { method: 'POST', token: t, body: { company_id: id, name: 'SO ' + c.name, pin: pins[i] } });
  }
  await call('/api/import', { method: 'POST', token: t, body: { action: 'extras', clients: parsed.clients, expenses: [] } });
  console.log('seeded', ens.companies.map((c) => c.name + '#' + c.id).join(', '));
})();
