/* ───────── company panel: frame + tabs + summary ───────── */
var TABS = {};   // tab → async function(ctx, r, my)

function tabList(ctx) {
  if (ctx.shared) return [['clients', 'বাকি ক্লায়েন্ট', 'users'], ['expenses', 'মালিকের খরচ', 'wallet']];
  var t = [['summary', 'সারাংশ', 'chart'], ['day', 'দৈনিক এন্ট্রি', 'edit'], ['stock', 'স্টক', 'box'], ['products', 'প্রোডাক্ট', 'book']];
  if (S.user.canFinance) t.push(['money', 'হিসাব', 'wallet']);
  t.push(['clients', 'বাকি ক্লায়েন্ট', 'users'], ['checks', 'সতর্কতা', 'alert']);
  if (S.user.role === 'owner') t.push(['access', 'অ্যাক্সেস', 'key']);
  return t;
}

VIEWS.c = async function (r, my) {
  D = null;
  var shared = r.id === 'shared';
  if (shared && S.user.role !== 'owner') return go('#/c/' + S.user.companyId + '/summary');
  var co = shared ? { id: 'shared', name: 'মালিকের নিজস্ব তালিকা', color: '#10B981' } : companyById(r.id);
  if (!co) {
    var c = await api('company?all=1'); S.companies = c.companies; co = companyById(r.id);
    if (!co) { setView('<div class="empty"><b>কোম্পানি পাওয়া যায়নি</b></div>'); return; }
  }
  var ctx = { id: co.id, shared: shared, name: co.name, color: co.color, co: co };
  var tabs = tabList(ctx), tab = r.tab || tabs[0][0];
  if (!tabs.some(function (t) { return t[0] === tab; })) tab = tabs[0][0];
  S.ctx = ctx;
  var bar = '<div class="tabs" role="tablist">' + tabs.map(function (t) {
    return '<button class="tab' + (t[0] === tab ? ' on' : '') + '" role="tab" aria-selected="' + (t[0] === tab) + '" data-act="nav" data-h="#/c/' + co.id + '/' + t[0] + '">' + ic(t[2]) + t[1] + '</button>';
  }).join('') + '</div>';
  var head = '<div class="cohd" style="--cc:' + esc(co.color) + '"><div class="grow"><div class="nm">' + esc(co.name) + '</div><div class="small muted">' +
    (S.user.role === 'owner' ? 'মালিক হিসেবে দেখছেন' : 'আপনি শুধু এই কোম্পানির তথ্য দেখছেন') + '</div></div>' +
    (co.active === false ? '<span class="chip r">বন্ধ</span>' : '') + '</div>';
  setView(head + bar + '<div id="tabbody"></div>');
  var t = $('.tab.on'); if (t && t.scrollIntoView) t.scrollIntoView({ inline: 'center', block: 'nearest' });
  $('#tabbody').innerHTML = '<div class="skel"></div><div class="skel" style="margin-top:12px"></div>';
  await TABS[tab](ctx, r, my);
};

function tb(html) { $('#tabbody').innerHTML = html; }

/* ───── summary ───── */
TABS.summary = async function (ctx, r, my) {
  var p = getPeriod();
  var d = await api('report?' + qs({ action: 'company', company_id: ctx.id, from: p.from, to: p.to }));
  if (stale(my)) return;
  var t = d.totals, fin = d.commission !== undefined;
  var h = periodBar();
  h += '<div class="grid g2 g-md3">' +
    '<div class="kpi acc big" style="grid-column:span 2"><div class="l">নিট সেল</div><div class="v">' + taka(t.net) + '</div><div class="s">বিক্রয় ' + taka(t.sales) + ' − ফেরত ' + taka(t.returns) + (t.damageCut ? ' − ড্যামেজ ' + taka(t.damageCut) : '') + '</div></div>' +
    '<div class="kpi"><div class="l">মেমো টাকা</div><div class="v">' + taka(t.memo) + '</div><div class="s">' + t.activeDays + ' দিনের হিসাব</div></div>' +
    '<div class="kpi"><div class="l">আন্ডার/ওভার</div><div class="v ' + cls(t.underOver) + '">' + taka(t.underOver) + '</div><div class="s">মেমো − বিক্রয়</div></div>' +
    '<div class="kpi"><div class="l">ড্যামেজ</div><div class="v ' + (t.damage ? 'neg' : '') + '">' + taka(t.damage) + '</div><div class="s">পণ্যের ড্যামেজ মূল্য</div></div>' +
    '<div class="kpi"><div class="l">স্টকের মূল্য</div><div class="v">' + taka(d.stock.value) + '</div><div class="s">' + d.stock.items + 'টি প্রোডাক্ট</div></div></div>';

  if (fin) {
    var lg = d.ledger;
    h += '<div class="card"><div class="hd"><h3>' + ic('wallet') + ' কোম্পানির হিসাব</h3><span class="chip g">কমিশন ' + d.company.commissionPct + '%</span></div><div class="grid g2 g-md3">' +
      '<div class="kpi"><div class="l">কমিশন</div><div class="v pos">' + taka(d.commission) + '</div></div>' +
      '<div class="kpi"><div class="l">খরচ</div><div class="v">' + taka(d.expenses) + '</div></div>' +
      '<div class="kpi"><div class="l">নিট লাভ</div><div class="v ' + cls(d.profit) + '">' + taka(d.profit) + '</div></div>' +
      '<div class="kpi"><div class="l">পরিশোধ (এই সময়ে)</div><div class="v">' + taka(lg.payoutPeriod) + '</div></div>' +
      '<div class="kpi"><div class="l">কোম্পানিকে বাকি</div><div class="v">' + taka(lg.dueToPay) + '</div><div class="s">মোট নিট সেল ' + taka(lg.lifetimeNet) + ' − মোট পরিশোধ ' + taka(lg.payout) + '</div></div>' +
      '<div class="kpi"><div class="l">কোড ব্যালেন্স</div><div class="v ' + cls(lg.codeBalance) + '">' + taka(lg.codeBalance) + '</div><div class="s">ওপেনিং + পরিশোধ − মাল গ্রহণ</div></div></div></div>';
  }

  var alerts = '';
  if (d.stock.negative) alerts += '<div class="alert r">' + ic('alert') + '<div><b>' + d.stock.negative + 'টি প্রোডাক্টের স্টক নেগেটিভ।</b> স্টক ইন এন্ট্রি বাদ পড়েছে বা ওপেনিং স্টক ভুল হতে পারে।</div></div>';
  if (d.stock.low) alerts += '<div class="alert">' + ic('clock') + '<div><b>' + d.stock.low + 'টি প্রোডাক্ট ৩ দিনের মধ্যে শেষ হতে পারে</b> (গত ১৪ দিনের গড় বিক্রি অনুযায়ী)। <a href="#/c/' + ctx.id + '/stock" style="color:inherit;font-weight:700">স্টক দেখুন</a></div></div>';
  if (d.checks) alerts += '<div class="alert">' + ic('alert') + '<div><b>' + d.checks + 'টি ডেটা সতর্কতা।</b> <a href="#/c/' + ctx.id + '/checks" style="color:inherit;font-weight:700">দেখুন ও ঠিক করুন</a></div></div>';
  h += alerts;

  h += '<div class="row"><button class="btn grow" data-act="nav" data-h="#/c/' + ctx.id + '/day/' + d.today + '">' + ic('edit') + ' আজকের এন্ট্রি</button><button class="btn soft" data-act="export-co" data-id="' + ctx.id + '">' + ic('down') + ' Excel</button></div>';

  // daily table = Excel "সামারি শিট"
  var days = d.days.filter(function (x) { return x.sales || x.memo || x.returns; });
  if (days.length) {
    var rows = days.slice().reverse().map(function (x) {
      return '<tr class="clk" data-act="nav" data-h="#/c/' + ctx.id + '/day/' + x.date + '"><td>' + fdate(x.date) + (x.closed ? ' <span class="pos" title="বন্ধ">' + ic('lock') + '</span>' : '') + '</td><td>' + fmt(x.sales) + '</td><td>' + fmt(x.returns) + '</td><td><b class="' + (x.net < 0 ? 'neg' : '') + '">' + fmt(x.net) + '</b></td><td>' + fmt(x.memo) + '</td><td class="' + cls(x.underOver) + '">' + sgn(x.underOver) + '</td></tr>';
    }).join('');
    h += '<div class="card" style="padding:12px 0 0;overflow:hidden"><div class="hd" style="padding:0 14px"><h3>' + ic('cal') + ' দিন অনুযায়ী হিসাব</h3><span class="small muted">দিনে ট্যাপ করুন</span></div><div class="tbl-w" style="border:0;border-radius:0"><table class="t"><thead><tr><th>দিন</th><th>মোট টাকা</th><th>ফেরত</th><th>নিট সেল</th><th>মেমো</th><th>আন্ডার/ওভার</th></tr></thead><tbody>' + rows +
      '</tbody><tfoot><tr><td>সর্বমোট</td><td>' + fmt(t.sales) + '</td><td>' + fmt(t.returns) + '</td><td>' + fmt(t.net) + '</td><td>' + fmt(t.memo) + '</td><td class="' + cls(t.underOver) + '">' + sgn(t.underOver) + '</td></tr></tfoot></table></div></div>';
    var trend = d.days.slice(-31).map(function (x) { var bc = {}; bc[ctx.id] = x.net; return { date: x.date, byCompany: bc, net: x.net }; });
    h += '<div class="card"><div class="hd"><h3>' + ic('chart') + ' দৈনিক নিট সেল</h3></div>' + stackedBars(trend, [{ id: ctx.id, name: ctx.name, color: ctx.color }]) + '</div>';
  } else {
    h += '<div class="card empty"><b>এই সময়ে কোনো এন্ট্রি নেই</b>"দৈনিক এন্ট্রি" থেকে বিক্রির হিসাব তোলা শুরু করুন।</div>';
  }

  // products
  var prods = d.products.filter(function (x) { return x.sold_amount > 0; }).slice(0, 10);
  if (prods.length) {
    var mx = prods[0].sold_amount || 1;
    h += '<div class="card"><div class="hd"><h3>' + ic('box') + ' সবচেয়ে বেশি বিক্রি</h3></div>' + prods.map(function (x) {
      var dmg = x.sold_qty > 0 ? Math.round(x.damage_qty / x.sold_qty * 1000) / 10 : 0;
      return '<div class="pr"><div><div class="t1" style="font-weight:600;font-size:12.5px">' + esc(x.name || x.code) + '</div><div class="small muted">' + fmt(x.sold_qty) + ' পিস' + (x.return_qty ? ' · ফেরত ' + fmt(x.return_qty) : '') + (x.damage_qty ? ' · ড্যামেজ ' + fmt(x.damage_qty) + ' (' + dmg + '%)' : '') + '</div></div><b class="num">' + taka(x.sold_amount) + '</b><div class="bar"><i style="width:' + Math.max(2, x.sold_amount / mx * 100).toFixed(1) + '%;background:' + esc(ctx.color) + '"></i></div></div>';
    }).join('') + '</div>';
  }
  var dm = d.products.filter(function (x) { return x.damage_amount > 0; }).sort(function (a, b) { return b.damage_amount - a.damage_amount; }).slice(0, 5);
  if (dm.length) {
    h += '<div class="card"><div class="hd"><h3>' + ic('alert') + ' ড্যামেজ বেশি যেসব প্রোডাক্টে</h3></div>' + dm.map(function (x) {
      return '<div class="li"><div class="grow"><div class="t1">' + esc(x.name || x.code) + '</div><div class="t2">' + fmt(x.damage_qty) + ' পিস' + (x.sold_qty ? ' · বিক্রির ' + (Math.round(x.damage_qty / x.sold_qty * 1000) / 10) + '%' : '') + '</div></div><b class="neg num">' + taka(x.damage_amount) + '</b></div>';
    }).join('') + '</div>';
  }
  S.cache.summary = d;
  tb(h);
};

/* ───── Excel export of the selected period ───── */
ACT['export-co'] = async function (el) {
  var id = Number(el.dataset.id), p = getPeriod(), co = companyById(id) || { name: 'company' };
  toast('Excel তৈরি হচ্ছে…');
  var X = await loadXLSX();
  var [rep, ln] = await Promise.all([
    api('report?' + qs({ action: 'company', company_id: id, from: p.from, to: p.to })),
    api('report?' + qs({ action: 'lines', company_id: id, from: p.from, to: p.to }))
  ]);
  var SEC = { sale: 'বিক্রয়', over: 'ওভার সেল', 'return': 'ফেরত', adjust: 'অন্যান্য কর্তন', damage: 'ড্যামেজ' };
  var sum = [['তারিখ', 'মোট টাকা', 'মেমো টাকা', 'আন্ডার/ওভার', 'ফেরত', 'ড্যামেজ', 'নিট সেল']].concat(rep.days.map(function (x) { return [x.date, x.sales, x.memo, x.underOver, x.returns, x.damage, x.net]; }));
  sum.push(['সর্বমোট', rep.totals.sales, rep.totals.memo, rep.totals.underOver, rep.totals.returns, rep.totals.damage, rep.totals.net]);
  var lines = [['তারিখ', 'ধরন', 'প্রোডাক্ট কোড', 'প্রোডাক্ট নাম', 'দাম', 'পরিমাণ', 'টোটাল টাকা']].concat(ln.lines.map(function (x) { return [x.entry_date, SEC[x.section] || x.section, x.code, x.name, x.price, x.qty, x.amount]; }));
  var wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(sum), 'সামারি');
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(lines), 'লাইন');
  var out = X.write(wb, { bookType: 'xlsx', type: 'array' });
  download(co.name.replace(/[^\w.-]+/g, '_') + '_' + (p.from || 'all') + '_' + (p.to || '') + '.xlsx', new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  toast('Excel নামানো হয়েছে', 'ok');
};
