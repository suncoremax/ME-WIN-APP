const XLSX = require('xlsx');
const AxExcel = require('../src/lib/excel-import.js');
const file = process.argv[2];
const wb = XLSX.readFile(file);
const out = AxExcel.parseWorkbook(XLSX, wb, { filename: 'October_v.1.0.xlsx' });
console.log('month', out.year, out.month, 'clients', out.clients.length, 'expenses', out.expenses.length);
console.log('warnings', JSON.stringify(out.warnings).slice(0, 600));
for (const c of out.companies) {
  let tot = 0, ret = 0, dmg = 0, memo = 0, lines = 0, unk = 0;
  for (const d of c.days) { memo += d.memo; for (const l of d.lines) { lines++; if (l.section === 'sale' || l.section === 'over') tot += l.amount; if (l.section === 'return' || l.section === 'adjust') ret += l.amount; if (l.section === 'damage') dmg += l.amount; } }
  const known = new Set(c.products.map(p => p.code.trim().toLowerCase()));
  for (const d of c.days) for (const l of d.lines) if (!known.has(l.code.trim().toLowerCase())) unk++;
  const net = tot - ret;
  console.log(c.name.padEnd(12), 'products', c.products.length, 'days', c.days.length, 'lines', lines, 'unknownLines', unk, 'moves', c.moves.length, 'ledger', c.ledger.length);
  console.log('   mine : total', tot.toFixed(2), 'memo', memo.toFixed(2), 'return', ret.toFixed(2), 'net', net.toFixed(2), 'damage', dmg.toFixed(2));
  console.log('   excel:', JSON.stringify(c.excel));
}
