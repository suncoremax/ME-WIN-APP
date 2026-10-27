const XLSX = require('xlsx'); const Ax = require('../src/lib/excel-import.js');
const wb = XLSX.readFile(process.argv[2]); const out = Ax.parseWorkbook(XLSX, wb, {month:10,year:2026});
const rows = XLSX.utils.sheet_to_json(wb.Sheets['সামারি শিট'], {header:1, raw:true, defval:null});
// first section rows 2..31 (Day1..Day30) for company 0
const secStart = [2, 35, 68, 101];
out.companies.forEach((c, ci) => {
  console.log('==', c.name);
  for (let d = 1; d <= 30; d++) {
    const ex = rows[secStart[ci] + d - 1]; if (!ex) continue;
    const day = c.days.find(x => +x.date.slice(8) === d);
    let t = 0, r = 0; if (day) day.lines.forEach(l => { if (l.section==='sale'||l.section==='over') t += l.amount; if (l.section==='return'||l.section==='adjust') r += l.amount; });
    if (Math.abs(t - (ex[1]||0)) > 0.5 || Math.abs(r - (ex[4]||0)) > 0.5) console.log(ex[0], 'total mine', t.toFixed(2), 'excel', ex[1], '| ret mine', r.toFixed(2), 'excel', ex[4]);
  }
});
