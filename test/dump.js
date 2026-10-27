const XLSX = require('xlsx'); const wb = XLSX.readFile(process.argv[2]);
const [sn, a, b, c0, c1] = [process.argv[3], +process.argv[4], +process.argv[5], +(process.argv[6]||0), +(process.argv[7]||16)];
const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], {header:1, raw:true, defval:null});
for (let i = a-1; i < Math.min(b, rows.length); i++) { const r = rows[i].slice(c0, c1+1); if (r.some(x => x!=null)) console.log(i+1, r.map(x => x==null?'':String(x).slice(0,16)).join('|')); }
