/* ───────── সেটিংস: Excel import, companies, change log ───────── */
var IMP = { wb: null, name: '', parsed: null, year: 0, month: 0 };

VIEWS.settings = async function (r, my) {
  if (S.user.role !== 'owner') {
    return setView('<div class="card"><h3>' + ic('key') + ' আমার PIN</h3><p class="muted" style="margin:8px 0 12px">নিজের PIN বদলাতে পারবেন। অন্য কিছু বদলানোর অনুমতি মালিকের।</p><button class="btn" data-act="pin-change">PIN বদলান</button></div>');
  }
  var all = await api('company?all=1'); S.companies = all.companies;
  if (stale(my)) return;
  var h = '<div class="h3" style="font-size:17px">সেটিংস</div>';
  h += '<div class="card"><div class="hd"><h3>' + ic('up') + ' Excel থেকে ইমপোর্ট</h3></div><p class="muted small" style="margin-bottom:10px">আপনার মাসিক Excel ফাইল (Day1…Day30, Over Sales, Master Product, Opening Stock, inout, Code) নির্বাচন করুন। অ্যাপ নিজেই সব কোম্পানি, প্রোডাক্ট, বিক্রি, ফেরত, ড্যামেজ, স্টক ও হিসাব পড়ে নেবে।</p>' +
    '<label class="btn soft full" style="cursor:pointer">' + ic('file') + ' Excel ফাইল বাছুন<input type="file" id="imp-f" accept=".xlsx,.xlsm,.xls" class="hide"></label><div id="imp-out" style="margin-top:12px"></div></div>';
  h += '<div class="card"><div class="hd"><h3>' + ic('building') + ' কোম্পানিসমূহ</h3><button class="btn sm" data-act="co-new">' + ic('plus') + ' নতুন</button></div><div class="list">' + all.companies.map(function (c) {
    return '<button class="li clk" data-act="nav" data-h="#/c/' + c.id + '/access"><i style="width:10px;height:10px;border-radius:50%;background:' + esc(c.color) + '"></i><div class="grow"><div class="t1">' + esc(c.name) + (c.active ? '' : ' <span class="chip r">বন্ধ</span>') + '</div><div class="t2">কমিশন ' + c.commission_pct + '% · SO ও PIN ম্যানেজ করুন</div></div>' + ic('right') + '</button>';
  }).join('') + '</div></div>';
  h += '<div class="card"><div class="hd"><h3>' + ic('shield') + ' নিরাপত্তা ও লগ</h3></div><div class="row wrap"><button class="btn soft grow" data-act="audit-open">' + ic('clock') + ' কে কী করেছে (লগ)</button><button class="btn soft grow" data-act="pin-change">' + ic('key') + ' আমার PIN</button></div>' +
    '<p class="small muted" style="margin-top:10px">SO গত ' + (S.user.editDays || 7) + ' দিনের বেশি পুরোনো এন্ট্রি বদলাতে পারে না। বন্ধ করা দিন শুধু মালিক খুলতে পারেন। ৫টি ভুল PIN-এ ১৫ মিনিটের জন্য লগইন আটকে যায়।</p></div>';
  setView(h);
};

document.addEventListener('change', async function (e) {
  if (e.target.id === 'imp-f' && e.target.files[0]) {
    var f = e.target.files[0], out = $('#imp-out');
    out.innerHTML = '<div class="skel" style="height:50px"></div>';
    try {
      var X = await loadXLSX();
      var buf = await f.arrayBuffer();
      IMP.wb = X.read(buf, { type: 'array' }); IMP.name = f.name;
      IMP.parsed = AxExcel.parseWorkbook(X, IMP.wb, { filename: f.name });
      IMP.year = IMP.parsed.year; IMP.month = IMP.parsed.month;
      impPreview();
    } catch (err) { out.innerHTML = '<div class="alert r">' + ic('alert') + '<div>' + esc(err.message) + '</div></div>'; }
    e.target.value = '';
  }
  if (e.target.id === 'imp-m' || e.target.id === 'imp-y') {
    IMP.month = +$('#imp-m').value; IMP.year = +$('#imp-y').value;
    IMP.parsed = AxExcel.parseWorkbook(window.XLSX, IMP.wb, { filename: IMP.name, year: IMP.year, month: IMP.month }); impPreview();
  }
});

function impNet(c) {
  var s = 0, ret = 0, lines = 0, unitem = [];
  c.days.forEach(function (d) { d.lines.forEach(function (l) {
    lines++;
    if (l.section === 'sale' || l.section === 'over') s += l.amount;
    if (l.section === 'return' || l.section === 'adjust') ret += l.amount;
    if (l.section === 'sale' && l.code === '') unitem.push(d.date);
  }); });
  return { net: r2(s - ret), sales: r2(s), lines: lines, unitem: unitem };
}
function impPreview() {
  var P = IMP.parsed, out = $('#imp-out'), ms = '';
  for (var i = 1; i <= 12; i++) ms += '<option value="' + i + '"' + (i === IMP.month ? ' selected' : '') + '>' + BN_M[i - 1] + '</option>';
  var rows = '', warn = '';
  P.companies.forEach(function (c) {
    var n = impNet(c), match = c.excel && Math.abs(c.excel.net - n.net) < 0.01;
    rows += '<tr><td>' + esc(c.name) + '</td><td>' + c.products.length + '</td><td>' + c.days.length + '</td><td>' + n.lines + '</td><td><b>' + fmt(n.net) + '</b></td><td>' + (c.excel ? (match ? '<span class="pos">✓ মিলেছে</span>' : '<span class="neg">Excel: ' + fmt(c.excel.net) + '</span>') : '—') + '</td></tr>';
    if (n.unitem.length) warn += '<li><b>' + esc(c.name) + '</b>: ' + n.unitem.map(function (d) { return pd(d).getUTCDate(); }).join(', ') + ' তারিখে শুধু মোট টাকা আছে, পণ্যের লাইন নেই</li>';
  });
  if (P.warnings.unroutedStock.length) warn += '<li>স্টক ইন/আউটের ' + P.warnings.unroutedStock.length + 'টি সারির প্রোডাক্ট কোন কোম্পানির বোঝা যায়নি (বাদ যাবে)</li>';
  if (P.warnings.ambiguousStock.length) warn += '<li>' + P.warnings.ambiguousStock.length + 'টি স্টক সারির কোড একাধিক কোম্পানিতে আছে — প্রথমটিতে ধরা হয়েছে</li>';
  out.innerHTML = '<div class="alert g">' + ic('check') + '<div><b>' + esc(IMP.name) + '</b> পড়া হয়েছে — ' + P.companies.length + 'টি কোম্পানি পাওয়া গেছে।</div></div>' +
    '<div class="row" style="margin-top:10px"><div class="fld grow"><label>কোন মাসের ফাইল?</label><select class="in" id="imp-m">' + ms + '</select></div><div class="fld"><label>সাল</label><input class="in" id="imp-y" type="number" min="2020" max="2100" value="' + IMP.year + '" style="width:90px"></div></div>' +
    '<div class="tbl-w" style="margin-top:10px"><table class="t"><thead><tr><th>কোম্পানি</th><th>প্রোডাক্ট</th><th>দিন</th><th>লাইন</th><th>নিট সেল</th><th>Excel-এর সাথে</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    (warn ? '<div class="alert" style="margin-top:10px">' + ic('alert') + '<ul style="margin-left:16px">' + warn + '</ul></div>' : '') +
    '<label class="row" style="margin-top:12px;font-size:13px"><input type="checkbox" id="imp-r" checked style="width:18px;height:18px;accent-color:#059669"><span>এই মাসের আগের ডেটা মুছে নতুন করে বসান (আবার ইমপোর্ট করলে ডুপ্লিকেট হবে না)</span></label>' +
    '<label class="row" style="margin-top:8px;font-size:13px"><input type="checkbox" id="imp-o" ' + (S.hasData ? '' : 'checked') + ' style="width:18px;height:18px;accent-color:#059669"><span>Excel-এর ওপেনিং স্টক বসান <span class="muted">(প্রথমবার ইমপোর্টে চালু রাখুন; পরের মাসে বন্ধ)</span></span></label>' +
    '<button class="btn full" style="margin-top:14px" data-act="imp-go">' + ic('up') + ' ইমপোর্ট শুরু করুন</button>';
}
ACT['imp-go'] = async function (el) {
  var P = IMP.parsed, replace = $('#imp-r').checked, opening = $('#imp-o').checked;
  if (replace && !(await confirmBox(BN_M[IMP.month - 1] + ' ' + IMP.year + ' মাসের এই কোম্পানিগুলোর আগের এন্ট্রি মুছে Excel-এর ডেটা বসবে। এগোবেন?', 'এগিয়ে যান', true))) return;
  el.disabled = true;
  var out = $('#imp-out'), log = [];
  var step = function (m) { out.insertAdjacentHTML('beforeend', '<div class="small muted">' + esc(m) + '</div>'); };
  try {
    var mr = monthRange(IMP.year + '-' + (IMP.month < 10 ? '0' : '') + IMP.month + '-01');
    out.innerHTML = '<div class="skel" style="height:40px"></div>';
    var ens = await api('import', { body: { action: 'ensure', names: P.companies.map(function (c) { return c.name; }) } });
    var ids = {}; ens.companies.forEach(function (c) { ids[c.name] = c.id; });
    for (var i = 0; i < P.companies.length; i++) {
      var c = P.companies[i];
      step(c.name + ' ইমপোর্ট হচ্ছে… (' + (i + 1) + '/' + P.companies.length + ')');
      var res = await api('import', { body: { action: 'month', company_id: ids[c.name], from: mr.from, to: mr.to, replace: replace, set_opening: opening, payload: { products: c.products, extraProducts: c.extraProducts, days: c.days, moves: c.moves, ledger: c.ledger } } });
      log.push(c.name + ': ' + res.result.days + ' দিন, ' + res.result.lines + ' লাইন, ' + res.result.products + ' প্রোডাক্ট');
    }
    var ex = await api('import', { body: { action: 'extras', clients: P.clients, expenses: P.expenses } });
    if (ex.clients) log.push('বাকি ক্লায়েন্ট: ' + ex.clients + ' জন যোগ হয়েছে');
    var cs = await api('company'); S.companies = cs.companies; buildMenu();
    out.innerHTML = '<div class="alert g">' + ic('check') + '<div><b>ইমপোর্ট সম্পন্ন ✓</b><ul style="margin:6px 0 0 16px">' + log.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul></div></div>' +
      '<button class="btn full" style="margin-top:12px" data-act="nav" data-h="#/home">হোমে গিয়ে দেখুন</button>';
    S.hasData = true;
  } catch (e) { out.insertAdjacentHTML('beforeend', '<div class="alert r" style="margin-top:8px">' + ic('alert') + '<div>' + esc(e.message) + '</div></div>'); el.disabled = false; }
};

var AUD = { 'login': 'লগইন', 'pin-change': 'PIN বদল', 'day-save': 'দিনের হিসাব সেভ', 'day-close': 'দিন বন্ধ', 'day-reopen': 'দিন খোলা', 'company-create': 'কোম্পানি তৈরি', 'company-update': 'কোম্পানি বদল', 'so-create': 'SO যোগ', 'so-update': 'SO বদল', 'so-pin-set': 'SO-র PIN সেট', 'so-delete': 'SO মোছা', 'product-create': 'প্রোডাক্ট যোগ', 'product-update': 'প্রোডাক্ট বদল', 'product-delete': 'প্রোডাক্ট মোছা', 'stock-in': 'স্টক ইন', 'stock-out': 'স্টক আউট', 'stock-delete': 'স্টক এন্ট্রি মোছা', 'opening-stock': 'ওপেনিং স্টক', 'ledger-payout': 'পরিশোধ', 'ledger-received': 'মাল গ্রহণ', 'ledger-opening': 'ওপেনিং ব্যালেন্স', 'ledger-delete': 'লেনদেন মোছা', 'expense-add': 'খরচ যোগ', 'expense-delete': 'খরচ মোছা', 'import-month': 'Excel ইমপোর্ট', 'import-extras': 'Excel ইমপোর্ট (অতিরিক্ত)', 'client-save': 'ক্লায়েন্ট সেভ', 'client-due': 'বাকি দেওয়া', 'client-paid': 'বাকি আদায়' };
ACT['audit-open'] = async function () {
  var j = await api('report?action=audit');
  var cn = {}; S.companies.forEach(function (c) { cn[c.id] = c.name; });
  openSheet('<h2>কে কী করেছে (শেষ ২০০টি)</h2><div class="list">' + j.log.map(function (x) {
    var d = new Date(new Date(x.at).getTime() + 6 * 3600e3).toISOString();
    return '<div class="li"><div class="grow"><div class="t1">' + esc(AUD[x.action] || x.action) + (x.company_id && cn[x.company_id] ? ' · ' + esc(cn[x.company_id]) : '') + '</div><div class="t2">' + esc(x.user_name || '—') + ' · ' + fdate(d.slice(0, 10)) + ' ' + d.slice(11, 16) + '</div></div></div>';
  }).join('') + '</div>');
};
