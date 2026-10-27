/* AXIION — reads the client's monthly Excel workbook (Day1…Day30, Over Sales,
 * Master Product, Opening Stock, inout, Code, Stock Value) and turns it into
 * clean per-company data. Works in the browser (SheetJS) and in Node (tests).
 *
 *   const out = AxExcel.parseWorkbook(XLSX, workbook, { year: 2026, month: 10 });
 *   out.companies[i] = { name, products, days, moves, ledger }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AxExcel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var L = {
    header: 'প্রোডাক্ট কোড', total: 'টোটাল টাকা', memo: 'মেমো টাকা', uo: 'আন্ডার/ওভার',
    ret: 'ফেরত', net: 'নিট সেল', retTotal: 'ফেরত মোট টাকা', dmgTotal: 'ড্যামেজ মোট',
    grand: 'সর্বমোট', over: 'মোট'
  };
  var BN = '০১২৩৪৫৬৭৮৯';

  function str(v) { return v == null ? '' : String(v).trim(); }
  function norm(v) { return str(v).toLowerCase().replace(/\s+/g, ' '); }
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v === 'string') {
      var t = v.replace(/,/g, '').trim();
      if (t !== '' && isFinite(+t)) return +t;
    }
    return null;
  }
  function r2(n) { return Math.round(n * 100) / 100; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function digits(s) { return String(s).replace(/[০-৯]/g, function (c) { return BN.indexOf(c); }); }
  function isoDate(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }

  function rowsOf(XLSX, wb, name) {
    var ws = wb.Sheets[name];
    if (!ws) return null;
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
  }
  function cell(rows, r, c) { return rows[r] ? rows[r][c] : null; }

  // ── a company block starts on a row whose NEXT row is the "প্রোডাক্ট কোড" header
  function findTitles(rows) {
    var t = [];
    for (var i = 0; i < rows.length - 1; i++) {
      var a = str(cell(rows, i, 0));
      if (a && a !== L.header && str(cell(rows, i + 1, 0)) === L.header) t.push({ row: i, name: a });
    }
    return t;
  }

  function mkLine(section, code, name, price, qty, amount, master) {
    code = str(code);
    var m = master && master[norm(code)];
    price = num(price);
    if (price == null) price = 0;   // never invent a price: the sheet's own lookup failed, so flag it instead
    var a = num(amount);
    if (a == null) a = price > 0 ? r2(price * qty) : 0;
    return { section: section, code: code, name: str(name) || (m ? m.name : code), price: price, qty: qty, amount: a };
  }

  // ── Day1…Day30
  function parseDaySheet(rows, masterOf, resolve) {
    // a sheet may rename a block ("Matador Food" instead of "Abul Kahir") → resolve() maps by name, else by position
    var titles = findTitles(rows), out = {};
    titles.forEach(function (t, k) {
      var end = k + 1 < titles.length ? titles[k + 1].row : rows.length;
      var hdr = t.row + 1, totalRow = -1, memoRow = -1;
      for (var r = hdr + 1; r < end; r++) {
        var a = str(cell(rows, r, 0));
        if (a === L.total && totalRow < 0) totalRow = r;
        if (a === L.memo && memoRow < 0) memoRow = r;
      }
      var cname = resolve(t.name, k), master = masterOf(cname), lines = [];
      var salesEnd = totalRow > 0 ? totalRow : end;
      for (var r2_ = hdr + 1; r2_ < salesEnd; r2_++) {
        var code = cell(rows, r2_, 0), qty = num(cell(rows, r2_, 3));
        if (!str(code) && !str(cell(rows, r2_, 1))) continue;
        if (qty == null || qty === 0) continue;
        lines.push(mkLine('sale', code, cell(rows, r2_, 1), cell(rows, r2_, 2), qty, cell(rows, r2_, 4), master));
      }
      for (var r3 = hdr + 1; r3 < end; r3++) {
        var rc = str(cell(rows, r3, 6)), rq = num(cell(rows, r3, 8)), ra = num(cell(rows, r3, 9));
        if (rc !== L.retTotal) {
          if (rc && rq != null && rq !== 0)
            lines.push(mkLine('return', rc, cell(rows, r3, 7), cell(rows, r3, 10), rq, ra, master));
          else if (ra != null && ra !== 0)   // "Damage", "Kom", a person's name… = money-only deduction
            lines.push({ section: 'adjust', code: '', name: rc || str(cell(rows, r3, 7)) || 'অন্যান্য কর্তন', price: 0, qty: 0, amount: ra });
        }
        var dc = str(cell(rows, r3, 12)), dq = num(cell(rows, r3, 14));
        if (dc && dc !== L.dmgTotal && dq != null && dq !== 0)
          lines.push(mkLine('damage', dc, cell(rows, r3, 13), cell(rows, r3, 16), dq, cell(rows, r3, 15), master));
      }
      // The sheet shows a day total but the item lines were cleared → keep the money, flag it
      var hasSale = lines.some(function (l) { return l.section === 'sale'; });
      var cachedTotal = totalRow > 0 ? num(cell(rows, totalRow, 4)) : null;
      if (!hasSale && cachedTotal > 0)
        lines.unshift({ section: 'sale', code: '', name: 'আইটেম বিবরণ নেই (Excel মোট)', price: cachedTotal, qty: 1, amount: cachedTotal });
      out[cname] = { lines: lines, memo: memoRow > 0 ? (num(cell(rows, memoRow, 4)) || 0) : 0 };
    });
    return out;
  }

  // ── Over Sales: 4 companies side by side, one block per day
  function parseOverSales(rows, masterOf, hint) {
    var res = {}, dates = [];
    for (var i = 0; i < rows.length; i++) {
      var a = digits(str(cell(rows, i, 0)));
      var mm = /^দিন\s*(\d+)\s*এর বিক্রয়/.exec(a);
      if (!mm) continue;
      var day = +mm[1];
      var dm = /(\d{1,2})\D+(\d{1,2})\D+(\d{4})/.exec(digits(str(cell(rows, i + 1, 0))));
      if (dm) dates.push({ d: +dm[1], m: +dm[2], y: +dm[3] });
      var comps = [];
      [0, 6, 12, 18].forEach(function (c0) {
        var nm = str(cell(rows, i + 2, c0));
        if (nm) comps.push({ c0: c0, name: nm });
      });
      var totalRow = -1, memoRow = -1;
      for (var r = i + 4; r < Math.min(rows.length, i + 25); r++) {
        var lab = str(cell(rows, r, 0));
        if (lab === L.over && totalRow < 0) totalRow = r;
        if (lab === L.memo && memoRow < 0) memoRow = r;
        if (/^দিন\s*\d+\s*এর বিক্রয়/.test(digits(lab)) && r > i) break;
      }
      if (totalRow < 0) continue;
      comps.forEach(function (c) {
        var master = masterOf(c.name), lines = [];
        for (var r = i + 4; r < totalRow; r++) {
          var qty = num(cell(rows, r, c.c0 + 3));
          if (qty == null || qty === 0) continue;
          lines.push(mkLine('over', cell(rows, r, c.c0), cell(rows, r, c.c0 + 1), cell(rows, r, c.c0 + 2), qty, cell(rows, r, c.c0 + 4), master));
        }
        var memo = memoRow > 0 ? (num(cell(rows, memoRow, c.c0 + 4)) || 0) : 0;
        (res[c.name] = res[c.name] || {})[day] = { lines: lines, memo: memo };
      });
    }
    return { byCompany: res, dates: dates };
  }

  // ── Master Product: sections per company, cols A (code) B (name) C (price)
  function parseMaster(rows, companyNames) {
    var starts = [];
    companyNames.forEach(function (nm) {
      for (var i = 0; i < rows.length; i++) if (norm(cell(rows, i, 0)) === norm(nm)) { starts.push({ name: nm, row: i }); break; }
    });
    starts.sort(function (a, b) { return a.row - b.row; });
    var clientsRow = -1;
    for (var i2 = 0; i2 < rows.length; i2++) if (/Due Clients/i.test(str(cell(rows, i2, 0)))) { clientsRow = i2; break; }
    var out = {};
    starts.forEach(function (s, k) {
      var end = k + 1 < starts.length ? starts[k + 1].row : (clientsRow > 0 ? clientsRow : rows.length);
      var list = [], seen = {};
      for (var r = s.row; r < end; r++) {
        var code = str(cell(rows, r, 0)), name = str(cell(rows, r, 1)), price = num(cell(rows, r, 2));
        if (!code || !name || price == null || code === L.header) continue;
        if (seen[norm(code)]) continue;
        seen[norm(code)] = 1;
        list.push({ code: code, name: name, price: price, opening: 0 });
      }
      out[s.name] = list;
    });
    var clients = [];
    if (clientsRow > 0) {
      for (var r4 = clientsRow + 2; r4 < rows.length; r4++) {
        var cn = str(cell(rows, r4, 1));
        if (!cn) continue;
        clients.push({ name: cn, phone: str(cell(rows, r4, 2)) });
      }
    }
    return { products: out, clients: clients };
  }

  // ── Opening Stock: [name, opening, available, rate, value] per company
  function parseOpening(rows) {
    var out = {}, cur = null;
    for (var i = 0; i < rows.length; i++) {
      var a = str(cell(rows, i, 0));
      if (a && str(cell(rows, i + 1, 0)) === 'প্রোডাক্ট নাম') { cur = a; out[cur] = []; continue; }
      if (!cur || !a || a === 'প্রোডাক্ট নাম') continue;
      out[cur].push({ name: a, opening: num(cell(rows, i, 1)) || 0, available: num(cell(rows, i, 2)), rate: num(cell(rows, i, 3)) });
    }
    return out;
  }

  // ── Code sheet: Day rows with Opening / Received / Paidout, plus "product recvd" note
  function parseCode(rows, monthStart) {
    var out = {}, cur = null;
    for (var i = 0; i < rows.length; i++) {
      var a = str(cell(rows, i, 0));
      if (a && a !== 'Day' && !/^Day\d+$/i.test(a) && /^day$/i.test(str(cell(rows, i + 1, 0)))) { cur = a; out[cur] = []; continue; }
      if (!cur) continue;
      var dm = /^Day(\d+)$/i.exec(a);
      if (dm) {
        var d = +dm[1];
        var o = num(cell(rows, i, 1)), rc = num(cell(rows, i, 2)), po = num(cell(rows, i, 3));
        if (o) out[cur].push({ day: d, kind: 'opening', amount: o });
        if (rc) out[cur].push({ day: d, kind: 'received', amount: rc });
        if (po) out[cur].push({ day: d, kind: 'payout', amount: po });
      }
      if (/product recvd/i.test(str(cell(rows, i, 7)))) {
        var m = /([\d.]+)/.exec(str(cell(rows, i, 8)));
        if (m && +m[1] > 0) out[cur].push({ day: 0, kind: 'received', amount: +m[1], note: 'Excel: product recvd' });
      }
    }
    return out;
  }

  // ── inout: no dates in the sheet; rows carry code, in, out
  function parseInOut(rows) {
    var list = [];
    for (var i = 3; i < rows.length; i++) {
      var code = str(cell(rows, i, 0));
      if (!code) continue;
      var si = num(cell(rows, i, 2)), so = num(cell(rows, i, 3));
      if (si > 0) list.push({ code: code, name: str(cell(rows, i, 1)), kind: 'in', qty: si });
      if (so > 0) list.push({ code: code, name: str(cell(rows, i, 1)), kind: 'out', qty: so });
    }
    return list;
  }

  function parseExpenses(rows) {
    var out = [], on = false;
    for (var i = 0; i < rows.length; i++) {
      var a = str(cell(rows, i, 0));
      if (a === 'খরচের নাম') { on = true; continue; }
      if (on && /মোট খরচ/.test(a)) break;
      if (on && a && num(cell(rows, i, 1)) > 0) out.push({ name: a, amount: num(cell(rows, i, 1)) });
    }
    return out;
  }

  // totals the Excel itself shows (for the "does it match?" check)
  function parseSummary(rows) {
    var out = [];
    rows.forEach(function (r) {
      if (str(r[0]) === L.grand && num(r[1]) != null && out.length < 12)
        out.push({ total: num(r[1]), memo: num(r[2]), uo: num(r[3]), ret: num(r[4]), net: num(r[5]) });
    });
    return out;
  }

  function monthFromFilename(name) {
    var M = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    var n = String(name || '').toLowerCase();
    for (var i = 0; i < 12; i++) if (n.indexOf(M[i]) >= 0 || n.indexOf(M[i].slice(0, 3) + '_') >= 0) return i + 1;
    return null;
  }

  function parseWorkbook(XLSX, wb, opt) {
    opt = opt || {};
    var names = wb.SheetNames;
    var daySheets = names.filter(function (n) { return /^Day\d+$/i.test(n); })
      .sort(function (a, b) { return +a.slice(3) - +b.slice(3); });
    if (!daySheets.length) throw new Error('এই ফাইলে Day1, Day2… নামের শিট পাওয়া যায়নি');

    var firstRows = rowsOf(XLSX, wb, daySheets[0]);
    var titles = findTitles(firstRows);
    var companyNames = titles.map(function (t) { return t.name; });
    if (!companyNames.length) throw new Error('Day শিটে কোনো কোম্পানির ব্লক পাওয়া যায়নি');

    var masterRows = rowsOf(XLSX, wb, 'Master Product');
    var mp = masterRows ? parseMaster(masterRows, companyNames) : { products: {}, clients: [] };
    var masterMap = {};
    companyNames.forEach(function (n) {
      masterMap[n] = {};
      (mp.products[n] || []).forEach(function (p) { masterMap[n][norm(p.code)] = p; });
    });
    var masterOf = function (n) { return masterMap[n] || {}; };

    var over = null, ovRows = rowsOf(XLSX, wb, 'Over Sales');
    if (ovRows) over = parseOverSales(ovRows, masterOf);

    // month / year
    var year = opt.year, month = opt.month;
    if (!month) month = opt.filename && monthFromFilename(opt.filename);
    if (!month && over && over.dates.length) { month = over.dates[0].m; year = year || over.dates[0].y; }
    if (!year && over && over.dates.length) year = over.dates[0].y;
    var now = new Date();
    month = month || now.getMonth() + 1;
    year = year || now.getFullYear();
    var monthStart = isoDate(year, month, 1);

    // per-company accumulators
    var comp = {};
    companyNames.forEach(function (n) { comp[n] = { name: n, products: [], days: {}, moves: [], ledger: [] }; });

    daySheets.forEach(function (sn) {
      var day = +sn.slice(3), res = parseDaySheet(rowsOf(XLSX, wb, sn), masterOf, function (title, k) {
        return comp[title] ? title : (companyNames[k] || title);
      });
      Object.keys(res).forEach(function (cn) {
        if (!comp[cn]) return;
        comp[cn].days[day] = { lines: res[cn].lines.slice(), memo: res[cn].memo };
      });
    });
    if (over) Object.keys(over.byCompany).forEach(function (cn) {
      if (!comp[cn]) return;
      Object.keys(over.byCompany[cn]).forEach(function (d) {
        var o = over.byCompany[cn][d], tgt = comp[cn].days[d] || (comp[cn].days[d] = { lines: [], memo: 0 });
        tgt.lines = tgt.lines.concat(o.lines);
        tgt.memo = r2(tgt.memo + o.memo);
      });
    });

    // products = master list + opening stock (matched by NAME, like the Excel does)
    var opening = rowsOf(XLSX, wb, 'Opening Stock');
    var op = opening ? parseOpening(opening) : {};
    var excelAvail = {};
    companyNames.forEach(function (n) {
      var prods = (mp.products[n] || []).map(function (p) { return Object.assign({}, p); });
      var byName = {};
      prods.forEach(function (p) { byName[norm(p.name)] = p; });
      (op[n] || []).forEach(function (o) {
        var p = byName[norm(o.name)];
        if (!p) {
          // a product that is in Opening Stock but not in the master list
          p = { code: o.name, name: o.name, price: o.rate || 0, opening: 0 };
          prods.push(p); byName[norm(o.name)] = p;
        }
        p.opening = o.opening;
        if (o.available != null) excelAvail[n + '|' + norm(p.code)] = o.available;
      });
      // products used on a day but unknown anywhere → keep them (price from the line)
      var known = {};
      prods.forEach(function (p) { known[norm(p.code)] = 1; });
      comp[n].products = prods;
      comp[n]._known = known;
    });

    // stock in/out has no company column → route by product code
    var io = rowsOf(XLSX, wb, 'inout'), ambiguous = [], unrouted = [];
    if (io) parseInOut(io).forEach(function (m) {
      var hits = companyNames.filter(function (n) { return comp[n]._known[norm(m.code)]; });
      if (!hits.length) { unrouted.push(m); return; }
      if (hits.length > 1) ambiguous.push({ code: m.code, companies: hits });
      comp[hits[0]].moves.push({ date: monthStart, kind: m.kind, code: m.code, name: m.name, qty: m.qty });
    });

    var codeRows = rowsOf(XLSX, wb, 'Code');
    var cd = codeRows ? parseCode(codeRows, monthStart) : {};
    companyNames.forEach(function (n) {
      (cd[n] || []).forEach(function (e) {
        comp[n].ledger.push({ date: isoDate(year, month, e.day || 1), kind: e.kind, amount: e.amount, note: e.note || '' });
      });
    });

    var svRows = rowsOf(XLSX, wb, 'Stock Value');
    var expenses = svRows ? parseExpenses(svRows).map(function (e) { return { date: monthStart, name: e.name, amount: e.amount }; }) : [];
    var sumRows = rowsOf(XLSX, wb, 'সামারি শিট');
    var excelSummary = sumRows ? parseSummary(sumRows) : [];

    var companies = companyNames.map(function (n, idx) {
      var c = comp[n], days = [];
      Object.keys(c.days).map(Number).sort(function (a, b) { return a - b; }).forEach(function (d) {
        var x = c.days[d];
        if (!x.lines.length && !x.memo) return;
        days.push({ date: isoDate(year, month, d), memo: x.memo, lines: x.lines });
      });
      // add any product that is used on a day but missing from the product list
      var have = c._known;
      var extra = [];
      days.forEach(function (d) { d.lines.forEach(function (l) {
        var k = norm(l.code);
        if (k && !have[k] && l.price > 0 && !extra.some(function (e) { return norm(e.code) === k; })) extra.push({ code: l.code, name: l.name, price: l.price, opening: 0 });
      }); });
      return { name: n, products: c.products, extraProducts: extra, days: days, moves: c.moves, ledger: c.ledger, excel: excelSummary[idx] || null };
    });

    return {
      year: year, month: month, companies: companies, clients: mp.clients, expenses: expenses,
      warnings: { ambiguousStock: ambiguous, unroutedStock: unrouted }, excelAvailable: excelAvail
    };
  }

  return { parseWorkbook: parseWorkbook, monthFromFilename: monthFromFilename, norm: norm };
});
