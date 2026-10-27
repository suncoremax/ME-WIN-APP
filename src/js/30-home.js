/* ───────── charts (hand-drawn SVG) ───────── */
function kfmt(n) { var a = Math.abs(n); return (n < 0 ? '−' : '') + (a >= 100000 ? (a / 100000).toFixed(a >= 1000000 ? 0 : 1).replace(/\.0$/, '') + 'L' : a >= 1000 ? (a / 1000).toFixed(a >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : Math.round(a)); }

function sparkline(vals, color) {
  if (!vals.length) return '';
  var W = 200, H = 36, mx = Math.max.apply(null, vals.concat([1])), mn = Math.min.apply(null, vals.concat([0])), rg = (mx - mn) || 1;
  var step = vals.length > 1 ? W / (vals.length - 1) : W;
  var pts = vals.map(function (v, i) { return (i * step).toFixed(1) + ',' + (H - 3 - ((v - mn) / rg) * (H - 8)).toFixed(1); });
  return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true"><polyline points="' + pts.join(' ') + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>';
}

// stacked daily bars: one colour per company, negatives hang below the zero line
function stackedBars(trend, companies) {
  if (!trend.length) return '<div class="empty">এই সময়ে কোনো বিক্রি নেই</div>';
  var W = 620, H = 190, pl = 38, pb = 20, pt = 8, pr = 6, n = trend.length;
  var up = 0, dn = 0;
  trend.forEach(function (t) { var p = 0, m = 0; companies.forEach(function (c) { var v = t.byCompany[c.id] || 0; if (v >= 0) p += v; else m += v; }); up = Math.max(up, p); dn = Math.min(dn, m); });
  up = up || 1;
  var rg = up - dn, y = function (v) { return pt + (up - v) / rg * (H - pt - pb); };
  var bw = (W - pl - pr) / n, g = '';
  [0, 0.5, 1].forEach(function (f) { var v = dn + rg * f; g += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '" stroke="var(--bdr)" stroke-width="1"/><text x="' + (pl - 5) + '" y="' + (y(v) + 3).toFixed(1) + '" text-anchor="end">' + kfmt(v) + '</text>'; });
  trend.forEach(function (t, i) {
    var x = pl + i * bw + bw * 0.15, w = bw * 0.7, ypos = 0, yneg = 0, tip = fdate(t.date, true) + '\n';
    companies.forEach(function (c) {
      var v = t.byCompany[c.id] || 0; if (!v) return;
      tip += c.name + ': ' + taka(v) + '\n';
      var y0, y1;
      if (v >= 0) { y0 = y(ypos + v); y1 = y(ypos); ypos += v; } else { y0 = y(yneg); y1 = y(yneg + v); yneg += v; }
      g += '<rect x="' + x.toFixed(1) + '" y="' + y0.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + Math.max(1, y1 - y0).toFixed(1) + '" fill="' + c.color + '" rx="1.5"/>';
    });
    g += '<rect x="' + (pl + i * bw).toFixed(1) + '" y="' + pt + '" width="' + bw.toFixed(1) + '" height="' + (H - pt - pb) + '" fill="transparent"><title>' + esc(tip + 'মোট: ' + taka(t.net)) + '</title></rect>';
    if (n <= 12 || i % Math.ceil(n / 10) === 0) g += '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (H - 5) + '" text-anchor="middle">' + pd(t.date).getUTCDate() + '</text>';
  });
  g += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(0).toFixed(1) + '" y2="' + y(0).toFixed(1) + '" stroke="var(--mt2)" stroke-width="1"/>';
  return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="দৈনিক নিট সেল, কোম্পানি অনুযায়ী">' + g + '</svg>' +
    '<div class="legend">' + companies.map(function (c) { return '<span><i style="background:' + c.color + '"></i>' + esc(c.name) + '</span>'; }).join('') + '</div>';
}

/* ───────── owner home ───────── */
VIEWS.home = async function (r, my) {
  if (S.user.role !== 'owner') return go('#/c/' + S.user.companyId + '/summary');
  skeleton(4);
  var p = getPeriod();
  var d = await api('report?' + qs({ action: 'dashboard', from: p.from, to: p.to }));
  if (stale(my)) return;
  S.cache.dash = d;
  var o = d.overall, cs = d.companies, today = d.today;
  S.hasData = cs.some(function (c) { return c.lifetimeNet !== 0; });

  var h = '<div class="row sp"><div><div class="h3" style="font-size:17px">আসসালামু আলাইকুম, ' + esc(S.user.name) + '</div><div class="small muted">সব কোম্পানির এক নজরে হিসাব</div></div></div>';
  h += periodBar();

  if (!cs.length) {
    h += '<div class="card empty"><b>এখনো কোনো কোম্পানি নেই</b>নতুন কোম্পানি যোগ করুন, অথবা Excel ফাইল ইমপোর্ট করুন।<div class="row" style="justify-content:center;margin-top:12px"><button class="btn" data-act="co-new">' + ic('plus') + ' কোম্পানি যোগ করুন</button><button class="btn soft" data-act="nav" data-h="#/settings">' + ic('up') + ' Excel ইমপোর্ট</button></div></div>';
    return setView(h);
  }

  h += '<div class="grid g2 g-md4">' +
    '<div class="kpi acc big" style="grid-column:span 2"><div class="l">মোট নিট সেল</div><div class="v">' + taka(o.net) + '</div><div class="s">বিক্রয় ' + taka(o.sales) + ' − ফেরত ' + taka(o.returns) + '</div></div>' +
    '<div class="kpi"><div class="l">কমিশন</div><div class="v pos">' + taka(o.commission) + '</div><div class="s">নিট সেলের উপর</div></div>' +
    '<div class="kpi"><div class="l">নিট লাভ</div><div class="v ' + cls(o.profit) + '">' + taka(o.profit) + '</div><div class="s">কমিশন − খরচ ' + taka(o.expenses) + '</div></div>' +
    '<div class="kpi"><div class="l">কোম্পানিকে বাকি</div><div class="v">' + taka(o.dueToPay) + '</div><div class="s">নিট সেল − পরিশোধ</div></div>' +
    '<div class="kpi"><div class="l">স্টকের মূল্য</div><div class="v">' + taka(o.stockValue) + '</div><div class="s">এখন হাতে আছে</div></div>' +
    '<div class="kpi"><div class="l">ড্যামেজ</div><div class="v ' + (o.damage > 0 ? 'neg' : '') + '">' + taka(o.damage) + '</div><div class="s">এই সময়ে</div></div>' +
    '<div class="kpi"><div class="l">আন্ডার/ওভার</div><div class="v ' + cls(o.underOver) + '">' + taka(o.underOver) + '</div><div class="s">মেমো − বিক্রয়</div></div></div>';

  // today
  var inToday = d.trend.filter(function (t) { return t.date === today; })[0];
  var rows = cs.map(function (c) {
    var has = inToday && inToday.byCompany[c.id] !== undefined;
    return '<button class="li clk" data-act="nav" data-h="#/c/' + c.id + '/day/' + today + '"><i class="dotc" style="width:10px;height:10px;border-radius:50%;background:' + esc(c.color) + '"></i><span class="grow t1">' + esc(c.name) + '</span>' +
      (has ? '<span class="chip g">' + ic('check') + ' আজ এন্ট্রি আছে</span>' : '<span class="chip a">আজ এন্ট্রি হয়নি</span>') + '</button>';
  }).join('');
  h += '<div class="card"><div class="hd"><h3>' + ic('clock') + ' আজকের অবস্থা · ' + fdate(today, true) + '</h3></div><div class="list">' + rows + '</div></div>';

  if (o.checks > 0) h += '<div class="alert">' + ic('alert') + '<div><b>' + o.checks + 'টি ডেটা সতর্কতা</b> আছে (ভুল বা অসম্পূর্ণ এন্ট্রি, নেগেটিভ স্টক)। প্রতিটি কোম্পানির "সতর্কতা" ট্যাবে দেখুন।</div></div>';

  h += '<div class="card"><div class="hd"><h3>' + ic('chart') + ' দৈনিক নিট সেল</h3><span class="small muted">শেষ ৩০ দিন</span></div>' + stackedBars(d.trend, cs) + '</div>';

  h += '<div class="grid g-md2">' + cs.map(function (c) {
    var vals = d.trend.map(function (t) { return t.byCompany[c.id] || 0; });
    return '<button class="co" style="--cc:' + esc(c.color) + '" data-act="nav" data-h="#/c/' + c.id + '/summary">' +
      '<div class="row sp"><span class="nm">' + esc(c.name) + '</span><span class="small muted">' + c.totals.activeDays + ' দিন</span></div>' +
      '<div class="big">' + taka(c.totals.net) + '</div><div class="small muted">নিট সেল · কমিশন ' + taka(c.commission) + '</div>' + sparkline(vals, c.color) +
      '<div class="mini"><span class="chip t">বাকি ' + taka(c.dueToPay) + '</span><span class="chip">স্টক ' + taka(c.stock.value) + '</span>' +
      (c.stock.negative ? '<span class="chip r">নেগেটিভ স্টক ' + c.stock.negative + '</span>' : '') + (c.stock.low ? '<span class="chip a">শেষ হচ্ছে ' + c.stock.low + '</span>' : '') +
      (c.checks ? '<span class="chip a">' + ic('alert') + ' ' + c.checks + '</span>' : '') + '</div></button>';
  }).join('') + '</div>';

  h += '<button class="btn soft full" data-act="co-new">' + ic('plus') + ' নতুন কোম্পানি যোগ করুন</button>';
  setView(h);
};

ACT['co-new'] = function () {
  openSheet('<h2>নতুন কোম্পানি</h2><div class="fld"><label>কোম্পানির নাম</label><input class="in" id="cn" autofocus maxlength="60"></div>' +
    '<div class="fld"><label>কমিশন (%)</label><input class="in" id="cp" inputmode="decimal" value="6"></div>' +
    '<button class="btn full" style="margin-top:14px" data-act="co-create">যোগ করুন</button>');
};
ACT['co-create'] = async function () {
  var name = $('#cn').value.trim(); if (!name) return toast('নাম দিন', 'err');
  var j = await api('company?action=save', { body: { name: name, commission_pct: $('#cp').value } });
  var c = await api('company'); S.companies = c.companies; closeSheet(); toast('কোম্পানি যোগ হয়েছে', 'ok'); go('#/c/' + j.company.id + '/access');
};
