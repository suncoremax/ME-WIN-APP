// Turns the monthly Excel into SQL for the Supabase SQL Editor (same sanitising as api/import.js).
// usage: node scripts/make-seed.js workbook.xlsx outDir
const XLSX = require('xlsx'), Ax = require('../src/lib/excel-import.js'), fs = require('fs'), path = require('path');
const [, , file, out] = process.argv; fs.mkdirSync(out, { recursive: true });
const COLORS = ['#10B981', '#06B6D4', '#7C3AED', '#F59E0B', '#EF4444', '#EC4899', '#3B82F6', '#84CC16'];
const n = (v) => { const x = Number(v); return isFinite(x) ? x : 0; };
const s = (v, l) => String(v == null ? '' : v).trim().slice(0, l);
const q = (v) => "'" + String(v).replace(/'/g, "''") + "'";
const SEC = ['sale', 'over', 'return', 'adjust', 'damage'];
const parsed = Ax.parseWorkbook(XLSX, XLSX.readFile(file), { filename: path.basename(file) });
const from = '2026-10-01', to = '2026-10-31', inR = (d) => d >= from && d <= to;
let head = '-- SHAKIB TRADERS: companies + due clients (run FIRST, after schema.sql)\n';
parsed.companies.forEach((c, i) => { head += `insert into companies(name,sort,color) values (${q(s(c.name, 60))},${i + 1},${q(COLORS[i % COLORS.length])}) on conflict (name) do nothing;\n`; });
const cl = [...new Set((parsed.clients || []).map((c) => s(c.name, 120)).filter(Boolean))];
cl.forEach((nm) => { head += `insert into clients(company_id,name) select null,${q(nm)} where not exists (select 1 from clients where company_id is null and lower(btrim(name))=lower(${q(nm)}));\n`; });
fs.writeFileSync(path.join(out, '1-companies.sql'), head);
parsed.companies.forEach((c, i) => {
  const products = (c.products || []).map((x) => ({ code: s(x.code, 60), name: s(x.name, 120), price: n(x.price), opening: n(x.opening) })).filter((x) => x.code);
  (c.extraProducts || []).forEach((x) => products.push({ code: s(x.code, 60), name: s(x.name, 120), price: n(x.price), opening: 0 }));
  const days = (c.days || []).filter((d) => inR(d.date)).map((d) => ({ date: d.date, memo: n(d.memo), lines: (d.lines || []).filter((l) => SEC.includes(l.section)).map((l) => ({ section: l.section, code: s(l.code, 60), name: s(l.name, 120), price: n(l.price), qty: n(l.qty), amount: Math.round(n(l.amount) * 100) / 100 })) }));
  const moves = (c.moves || []).filter((m) => inR(m.date) && ['in', 'out'].includes(m.kind) && n(m.qty) > 0).map((m) => ({ date: m.date, kind: m.kind, code: s(m.code, 60), name: s(m.name, 120), qty: n(m.qty) }));
  const ledger = (c.ledger || []).filter((l) => inR(l.date) && ['payout', 'received', 'opening'].includes(l.kind) && n(l.amount) > 0).map((l) => ({ date: l.date, kind: l.kind, amount: n(l.amount), note: s(l.note, 200) }));
  const json = JSON.stringify({ products, days, moves, ledger });
  const sql = `-- SHAKIB TRADERS: ${c.name} — October data\nselect import_month((select id from companies where name=${q(s(c.name, 60))}), '${from}', '${to}', $ax$${json}$ax$::jsonb, true, true, 'import');\n`;
  fs.writeFileSync(path.join(out, `${i + 2}-${c.name.replace(/[^\w]+/g, '_')}.sql`), sql);
});
console.log(fs.readdirSync(out).map((f) => f + ' ' + (fs.statSync(path.join(out, f)).size / 1024 | 0) + 'KB').join('\n'));
