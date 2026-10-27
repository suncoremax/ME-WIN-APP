/* ───────── স্টক ও প্রোডাক্ট ───────── */
var STK = { items: [], q: '', f: 'all' };

TABS.stock = async function (ctx, r, my) {
  var j = await api('stock?company_id=' + ctx.id);
  if (stale(my)) return;
  STK = { items: j.items.filter(function (i) { return i.active; }), q: '', f: STK.f || 'all', cid: ctx.id };
  var value = 0, neg = 0, low = 0;
  STK.items.forEach(function (i) { if (i.available > 0) value += i.value; if (i.available < 0) neg++; if (i.daysLeft !== null && i.daysLeft <= 3) low++; });
  var h = '<div class="grid g2 g-md3"><div class="kpi acc"><div class="l">স্টকের মূল্য</div><div class="v">' + taka(value) + '</div><div class="s">' + STK.items.length + 'টি প্রোডাক্ট</div></div>' +
    '<div class="kpi"><div class="l">নেগেটিভ স্টক</div><div class="v ' + (neg ? 'neg' : '') + '">' + neg + '</div><div class="s">এন্ট্রি মিলিয়ে দেখুন</div></div>' +
    '<div class="kpi s2m"><div class="l">শেষ হচ্ছে (≤৩ দিন)</div><div class="v ' + (low ? 'neg' : '') + '">' + low + '</div><div class="s">১৪ দিনের গড় বিক্রি ধরে</div></div></div>';
  h += '<div class="row"><button class="btn grow" data-act="mv-open" data-k="in">' + ic('down') + ' স্টক ইন</button><button class="btn soft grow" data-act="mv-open" data-k="out">' + ic('up') + ' স্টক আউট</button><button class="btn ghost" data-act="mv-hist" aria-label="ইতিহাস">' + ic('clock') + '</button></div>';
  h += '<div class="card" style="padding:10px 12px"><div class="row"><input class="in sm grow" id="st-q" placeholder="কোড বা নাম খুঁজুন" autocomplete="off"></div>' +
    '<div class="seg" style="margin-top:8px">' + [['all', 'সব'], ['neg', 'নেগেটিভ'], ['low', 'শেষ হচ্ছে'], ['zero', 'শূন্য']].map(function (x) { return '<button data-act="st-f" data-f="' + x[0] + '" class="' + (STK.f === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div></div>';
  h += '<div class="card" style="padding:4px 14px"><div id="st-list" class="list"></div></div>';
  tb(h); stockList();
};
function stockList() {
  var q = STK.q.trim().toLowerCase(), f = STK.f;
  var rows = STK.items.filter(function (i) {
    if (q && (i.code + ' ' + i.name).toLowerCase().indexOf(q) < 0) return false;
    if (f === 'neg') return i.available < 0;
    if (f === 'low') return i.daysLeft !== null && i.daysLeft <= 3;
    if (f === 'zero') return i.available === 0;
    return true;
  });
  $('#st-list').innerHTML = rows.length ? rows.map(function (i) {
    var chip = i.available < 0 ? '<span class="chip r">নেগেটিভ</span>' : (i.daysLeft !== null && i.daysLeft <= 3 ? '<span class="chip a">~' + i.daysLeft + ' দিন</span>' : (i.daysLeft !== null ? '<span class="chip">~' + i.daysLeft + ' দিন</span>' : ''));
    return '<button class="li clk" data-act="st-open" data-id="' + i.product_id + '"><div class="grow"><div class="t1">' + esc(i.name) + '</div><div class="t2">' + esc(i.code) + ' · ' + taka(i.price) + '</div></div><div style="text-align:right"><b class="num ' + (i.available < 0 ? 'neg' : '') + '" style="font-size:16px">' + fmt(i.available) + '</b><div>' + chip + '</div></div></button>';
  }).join('') : '<div class="empty">কোনো প্রোডাক্ট নেই</div>';
}
document.addEventListener('input', function (e) { if (e.target.id === 'st-q') { STK.q = e.target.value; stockList(); } if (e.target.id === 'pr-q') { PRD.q = e.target.value; productList(); } });
ACT['st-f'] = function (el) { STK.f = el.dataset.f; $$('[data-act="st-f"]').forEach(function (b) { b.classList.toggle('on', b === el); }); stockList(); };

ACT['st-open'] = function (el) {
  var i = STK.items.filter(function (x) { return x.product_id === +el.dataset.id; })[0]; if (!i) return;
  var row = function (l, v, c) { return '<div class="row sp" style="padding:6px 0;border-top:1px solid var(--bdr)"><span class="muted">' + l + '</span><b class="num ' + (c || '') + '">' + v + '</b></div>'; };
  openSheet('<h2>' + esc(i.name) + '</h2><div class="small muted" style="margin:-8px 0 8px">' + esc(i.code) + ' · দাম ' + taka(i.price) + '</div>' +
    row('ওপেনিং স্টক', fmt(i.opening)) + row('+ স্টক ইন', fmt(i.stock_in)) + row('− স্টক আউট', fmt(i.stock_out)) + row('+ ফেরত', fmt(i.returned)) + row('− বিক্রি', fmt(i.sold)) +
    row('এখন স্টকে আছে', fmt(i.available) + ' (' + taka(i.value) + ')', i.available < 0 ? 'neg' : 'pos') + row('ড্যামেজ (স্টকে ধরা হয় না)', fmt(i.damaged)) +
    row('গড় বিক্রি / দিন', fmt(i.perDay)) + row('কতদিন চলবে', i.daysLeft === null ? '—' : '~' + i.daysLeft + ' দিন') +
    '<div class="row" style="margin-top:14px"><button class="btn grow" data-act="mv-open" data-k="in" data-id="' + i.product_id + '">' + ic('down') + ' স্টক ইন</button><button class="btn soft grow" data-act="mv-open" data-k="out" data-id="' + i.product_id + '">' + ic('up') + ' আউট</button></div>' +
    (S.user.role === 'owner' ? '<button class="btn ghost full" style="margin-top:8px" data-act="open-set" data-id="' + i.product_id + '">ওপেনিং স্টক ঠিক করুন</button>' : ''));
};
ACT['open-set'] = function (el) {
  var i = STK.items.filter(function (x) { return x.product_id === +el.dataset.id; })[0];
  openSheet('<h2>ওপেনিং স্টক — ' + esc(i.name) + '</h2><div class="fld"><label>ওপেনিং পরিমাণ</label><input class="in" id="os" inputmode="decimal" value="' + i.opening + '" autofocus></div>' +
    '<button class="btn full" style="margin-top:14px" data-act="open-save" data-id="' + i.product_id + '">সেভ করুন</button>');
};
ACT['open-save'] = async function (el) {
  await api('stock?action=x', { body: { action: 'opening', company_id: S.ctx.id, items: [{ product_id: +el.dataset.id, qty: $('#os').value }] } });
  closeSheet(); toast('ওপেনিং স্টক বদলেছে', 'ok'); route();
};

ACT['mv-open'] = async function (el) {
  var kind = el.dataset.k, pre = el.dataset.id ? +el.dataset.id : null;
  var prods = (await getProducts(S.ctx.id)).filter(function (p) { return p.active; });
  openSheet('<h2>' + (kind === 'in' ? 'স্টক ইন (মাল আসা)' : 'স্টক আউট (মাল বের হওয়া)') + '</h2>' +
    '<div class="fld"><label>প্রোডাক্ট</label><select class="in" id="mv-p"><option value="">— বাছুন —</option>' + prods.map(function (p) { return '<option value="' + p.id + '"' + (p.id === pre ? ' selected' : '') + '>' + esc(p.code + ' — ' + p.name) + '</option>'; }).join('') + '</select></div>' +
    '<div class="row"><div class="fld grow"><label>পরিমাণ</label><input class="in" id="mv-q" inputmode="decimal" placeholder="0"' + (pre ? ' autofocus' : '') + '></div><div class="fld grow"><label>তারিখ</label><input class="in" type="date" id="mv-d" value="' + todayStr() + '"></div></div>' +
    '<div class="fld"><label>নোট (ঐচ্ছিক)</label><input class="in" id="mv-n" maxlength="200"></div>' +
    '<button class="btn full" style="margin-top:14px" data-act="mv-save" data-k="' + kind + '">সেভ করুন</button>');
};
ACT['mv-save'] = async function (el) {
  var pid = $('#mv-p').value, q = $('#mv-q').value;
  if (!pid) return toast('প্রোডাক্ট বাছুন', 'err');
  if (!(Number(q) > 0)) return toast('পরিমাণ দিন', 'err');
  await api('stock?action=x', { body: { action: 'move', company_id: S.ctx.id, kind: el.dataset.k, product_id: +pid, qty: q, date: $('#mv-d').value, note: $('#mv-n').value } });
  closeSheet(); toast('সেভ হয়েছে ✓', 'ok'); route();
};
ACT['mv-hist'] = async function () {
  var p = getPeriod();
  var j = await api('stock?' + qs({ action: 'moves', company_id: S.ctx.id, from: p.from, to: p.to }));
  openSheet('<h2>স্টক ইন/আউট ইতিহাস</h2><div class="small muted" style="margin:-8px 0 8px">' + esc(periodLabel(p)) + '</div><div class="list">' + (j.moves.length ? j.moves.map(function (m) {
    return '<div class="li"><span class="chip ' + (m.kind === 'in' ? 'g' : 'a') + '">' + (m.kind === 'in' ? 'ইন' : 'আউট') + '</span><div class="grow"><div class="t1">' + esc(m.name || m.code) + '</div><div class="t2">' + fdate(m.entry_date) + (m.note ? ' · ' + esc(m.note) : '') + '</div></div><b class="num">' + fmt(m.qty) + '</b><button class="xbtn" data-act="mv-del" data-id="' + m.id + '" aria-label="মুছুন">' + ic('trash') + '</button></div>';
  }).join('') : '<div class="empty">এই সময়ে কোনো এন্ট্রি নেই</div>') + '</div>');
};
ACT['mv-del'] = async function (el) {
  if (!(await confirmBox('এই স্টক এন্ট্রি মুছবেন?', 'মুছুন', true))) return;
  await api('stock?action=x', { body: { action: 'move-delete', company_id: S.ctx.id, id: +el.dataset.id } });
  closeSheet(); toast('মুছে গেছে', 'ok'); route();
};

/* ───── products ───── */
var PRD = { items: [], q: '' };
TABS.products = async function (ctx, r, my) {
  var items = await getProducts(ctx.id, true);
  if (stale(my)) return;
  PRD = { items: items, q: '' };
  tb('<div class="row"><input class="in sm grow" id="pr-q" placeholder="কোড বা নাম খুঁজুন" autocomplete="off"><button class="btn sm" data-act="pr-edit">' + ic('plus') + ' নতুন</button></div>' +
    '<div class="card" style="padding:4px 14px"><div id="pr-list" class="list"></div></div>');
  productList();
};
function productList() {
  var q = PRD.q.trim().toLowerCase();
  var rows = PRD.items.filter(function (p) { return !q || (p.code + ' ' + p.name).toLowerCase().indexOf(q) >= 0; });
  $('#pr-list').innerHTML = rows.length ? rows.map(function (p) {
    return '<button class="li clk" data-act="pr-edit" data-id="' + p.id + '"><div class="grow"><div class="t1">' + esc(p.name) + (p.active ? '' : ' <span class="chip r">বন্ধ</span>') + '</div><div class="t2">' + esc(p.code) + '</div></div><b class="num">' + taka(p.price) + '</b></button>';
  }).join('') : '<div class="empty"><b>কোনো প্রোডাক্ট নেই</b>"নতুন" চাপে প্রোডাক্ট যোগ করুন</div>';
}
ACT['pr-edit'] = function (el) {
  var p = el.dataset.id ? PRD.items.filter(function (x) { return x.id === +el.dataset.id; })[0] : null, isO = S.user.role === 'owner';
  openSheet('<h2>' + (p ? 'প্রোডাক্ট বদলান' : 'নতুন প্রোডাক্ট') + '</h2><div class="row"><div class="fld grow"><label>কোড</label><input class="in" id="pe-c" maxlength="60" value="' + esc(p ? p.code : '') + '"' + (p ? '' : ' autofocus') + '></div><div class="fld grow"><label>দাম (৳)</label><input class="in" id="pe-p" inputmode="decimal" value="' + (p ? p.price : '') + '"></div></div>' +
    '<div class="fld"><label>নাম</label><input class="in" id="pe-n" maxlength="120" value="' + esc(p ? p.name : '') + '"></div>' +
    (isO ? '<div class="fld"><label>ওপেনিং স্টক</label><input class="in" id="pe-o" inputmode="decimal" value="' + (p ? p.opening_qty : 0) + '"></div>' : '') +
    (p ? '<label class="row" style="margin-top:10px;font-size:13px"><input type="checkbox" id="pe-a" ' + (p.active ? 'checked' : '') + ' style="width:18px;height:18px;accent-color:#059669"><span>চালু আছে (বন্ধ করলে এন্ট্রির তালিকায় আসবে না)</span></label>' : '') +
    '<button class="btn full" style="margin-top:14px" data-act="pr-save"' + (p ? ' data-id="' + p.id + '"' : '') + '>সেভ করুন</button>' +
    (p && isO ? '<button class="btn red full" style="margin-top:8px" data-act="pr-del" data-id="' + p.id + '">' + ic('trash') + ' মুছুন (লেনদেন না থাকলে)</button>' : ''));
};
ACT['pr-save'] = async function (el) {
  var b = { action: 'save', company_id: S.ctx.id, code: $('#pe-c').value, name: $('#pe-n').value, price: $('#pe-p').value };
  if (el.dataset.id) b.id = +el.dataset.id;
  if ($('#pe-o')) b.opening_qty = $('#pe-o').value;
  if ($('#pe-a')) b.active = $('#pe-a').checked;
  await api('products', { body: b });
  closeSheet(); toast('সেভ হয়েছে ✓', 'ok'); route();
};
ACT['pr-del'] = async function (el) {
  if (!(await confirmBox('প্রোডাক্টটি মুছে ফেলবেন?', 'মুছুন', true))) return;
  await api('products', { body: { action: 'delete', company_id: S.ctx.id, id: +el.dataset.id } });
  closeSheet(); toast('মুছে গেছে', 'ok'); route();
};
