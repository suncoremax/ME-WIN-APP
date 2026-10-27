/* ───────── সতর্কতা (data checks) and অ্যাক্সেস (owner: SOs, PINs, company settings) ───────── */
var CHECK_T = {
  memo_no_lines: ['মেমো আছে কিন্তু পণ্যের লাইন নেই', 'এন্ট্রি অসম্পূর্ণ — দিনটি খুলে বিক্রির লাইন তুলুন', 'r'],
  unitemized: ['শুধু মোট টাকা আছে, আইটেমের বিবরণ নেই', 'Excel থেকে আসা মোট টাকা ধরা আছে; পণ্য-ভিত্তিক হিসাব ও স্টক মিলবে না', 'a'],
  memo_gap: ['মেমো ও হিসাবে বড় ফারাক', 'ফারাক = মেমো − বিক্রয়। দাম, পরিমাণ বা মেমো আবার মিলিয়ে দেখুন', 'a'],
  no_price: ['দাম ছাড়া লাইন', 'দাম শূন্য থাকায় টাকার হিসাবে ধরা হয়নি', 'r'],
  unknown_product: ['প্রোডাক্ট তালিকায় নেই', 'কোড মেলেনি (বানান/স্পেস)। প্রোডাক্ট যোগ করুন বা কোড ঠিক করুন', 'a'],
  price_mismatch: ['ফেরত/ড্যামেজে অস্বাভাবিক দাম', 'বিক্রয়মূল্যের সাথে অনেক ফারাক — কার্টন দামে টাকা ধরা হয়েছে কি?', 'a'],
  negative_stock: ['স্টক নেগেটিভ', 'স্টক ইন বাদ পড়েছে, নয়তো ওপেনিং স্টক ভুল', 'r']
};
var SEC_N = { sale: 'বিক্রয়', over: 'ওভার সেল', 'return': 'ফেরত', damage: 'ড্যামেজ', adjust: 'কর্তন' };

TABS.checks = async function (ctx, r, my) {
  var p = getPeriod();
  var j = await api('report?' + qs({ action: 'checks', company_id: ctx.id, from: p.from, to: p.to }));
  if (stale(my)) return;
  var groups = {};
  j.checks.forEach(function (c) { (groups[c.kind] = groups[c.kind] || []).push(c); });
  var h = periodBar();
  var kinds = Object.keys(CHECK_T).filter(function (k) { return groups[k]; });
  if (!kinds.length) h += '<div class="card empty"><b>সব ঠিক আছে ✓</b>এই সময়ে কোনো সন্দেহজনক এন্ট্রি পাওয়া যায়নি।</div>';
  kinds.forEach(function (k) {
    var m = CHECK_T[k], rows = groups[k];
    h += '<div class="card"><div class="hd"><h3>' + esc(m[0]) + '</h3><span class="chip ' + m[2] + '">' + rows.length + '</span></div><div class="small muted" style="margin:-4px 0 8px">' + esc(m[1]) + '</div><div class="list">' +
      rows.slice(0, 40).map(function (c) {
        var href = c.d ? '#/c/' + ctx.id + '/day/' + c.d : '#/c/' + ctx.id + '/stock';
        var label = k === 'negative_stock' ? esc(c.detail) + ' <span class="muted">(' + esc(c.ref) + ')</span>' : (c.d ? fdate(c.d, true) : '') + (c.ref ? ' · ' + esc(c.ref) : '') + (c.detail && k !== 'memo_gap' && k !== 'memo_no_lines' && k !== 'unitemized' ? ' · ' + esc(SEC_N[c.detail] || c.detail) : '');
        var val = k === 'memo_gap' ? sgn(c.amount) : (k === 'no_price' ? fmt(c.amount) + ' পিস' : (k === 'negative_stock' ? fmt(c.amount) : taka(c.amount)));
        return '<button class="li clk" data-act="nav" data-h="' + href + '"><div class="grow t1">' + label + '</div><b class="num ' + (c.amount < 0 ? 'neg' : '') + '">' + val + '</b>' + ic('right') + '</button>';
      }).join('') + (rows.length > 40 ? '<div class="small muted" style="padding:8px 2px">আরও ' + (rows.length - 40) + 'টি…</div>' : '') + '</div></div>';
  });
  tb(h);
};

/* ───── access ───── */
var ACC = { users: [] };
TABS.access = async function (ctx, r, my) {
  var j = await api('company?' + qs({ action: 'users', company_id: ctx.id }));
  var all = await api('company?all=1'); S.companies = all.companies; var co = companyById(ctx.id) || ctx.co;
  if (stale(my)) return;
  ACC.users = j.users;
  var h = '<div class="card"><div class="hd"><h3>' + ic('users') + ' এই কোম্পানির SO / কর্মী</h3><button class="btn sm" data-act="so-edit">' + ic('plus') + ' যোগ করুন</button></div>' +
    '<div class="small muted" style="margin:-4px 0 6px">এখানে যাদের PIN দেবেন, তারা PIN দিয়ে ঢুকলে <b>শুধু ' + esc(co.name) + '</b>-এর তথ্য দেখবে — অন্য কোম্পানির কিছুই নয়।</div><div class="list">' +
    (j.users.length ? j.users.map(function (u) {
      return '<div class="li"><div class="grow"><div class="t1">' + esc(u.name) + (u.active ? '' : ' <span class="chip r">বন্ধ</span>') + (u.can_finance ? ' <span class="chip t">হিসাব দেখতে পারে</span>' : '') + '</div><div class="t2">' + (u.last_login ? 'শেষ লগইন ' + fdate(u.last_login.slice(0, 10)) : 'এখনো লগইন করেনি') + '</div></div><button class="btn soft sm" data-act="so-edit" data-id="' + u.id + '">বদলান</button></div>';
    }).join('') : '<div class="empty"><b>কোনো SO নেই</b>"যোগ করুন" চেপে নাম ও PIN দিন</div>') + '</div></div>';
  h += '<div class="card"><div class="hd"><h3>' + ic('cog') + ' কোম্পানির সেটিংস</h3></div><div class="fld"><label>নাম</label><input class="in" id="cs-n" maxlength="60" value="' + esc(co.name) + '"></div>' +
    '<div class="row" style="margin-top:10px"><div class="fld grow"><label>কমিশন (%)</label><input class="in" id="cs-p" inputmode="decimal" value="' + esc(co.commission_pct) + '"></div><div class="fld"><label>রঙ</label><input type="color" class="in" id="cs-c" value="' + esc(co.color) + '" style="width:64px;padding:3px"></div></div>' +
    '<label class="row" style="margin-top:10px;font-size:13px"><input type="checkbox" id="cs-a" ' + (co.active !== false ? 'checked' : '') + ' style="width:18px;height:18px;accent-color:#059669"><span>চালু আছে (বন্ধ করলে হোম ও মেনুতে দেখাবে না, ডেটা থাকবে)</span></label>' +
    '<button class="btn full" style="margin-top:12px" data-act="cs-save">সেভ করুন</button></div>';
  tb(h);
};
ACT['cs-save'] = async function () {
  await api('company?action=save', { body: { id: S.ctx.id, name: $('#cs-n').value, commission_pct: $('#cs-p').value, color: $('#cs-c').value, active: $('#cs-a').checked } });
  var c = await api('company'); S.companies = c.companies; toast('সেভ হয়েছে ✓', 'ok'); route();
};

ACT['so-edit'] = function (el) {
  var u = el && el.dataset.id ? ACC.users.filter(function (x) { return x.id === +el.dataset.id; })[0] : null;
  openSheet('<h2>' + (u ? 'SO — ' + esc(u.name) : 'নতুন SO') + '</h2><div class="fld"><label>নাম</label><input class="in" id="so-n" maxlength="60" value="' + esc(u ? u.name : '') + '"' + (u ? '' : ' autofocus') + '></div>' +
    '<div class="fld"><label>' + (u ? 'নতুন PIN (না বদলাতে চাইলে ফাঁকা রাখুন)' : 'PIN (৫ সংখ্যা)') + '</label><div class="row"><input class="in grow" id="so-p" inputmode="numeric" maxlength="5" autocomplete="off" placeholder="•••••"><button class="btn soft sm" data-act="so-gen" type="button">তৈরি করুন</button></div></div>' +
    '<label class="row" style="margin-top:10px;font-size:13px"><input type="checkbox" id="so-f" ' + (u && u.can_finance ? 'checked' : '') + ' style="width:18px;height:18px;accent-color:#059669"><span>কমিশন, খরচ ও কোম্পানির লেজার দেখতে পারবে</span></label>' +
    (u ? '<label class="row" style="margin-top:8px;font-size:13px"><input type="checkbox" id="so-a" ' + (u.active ? 'checked' : '') + ' style="width:18px;height:18px;accent-color:#059669"><span>চালু আছে (বন্ধ করলে সাথে সাথে লগআউট হবে)</span></label>' : '') +
    '<button class="btn full" style="margin-top:14px" data-act="so-save"' + (u ? ' data-id="' + u.id + '"' : '') + '>সেভ করুন</button>' +
    (u ? '<button class="btn red full" style="margin-top:8px" data-act="so-del" data-id="' + u.id + '">' + ic('trash') + ' এই SO-কে মুছুন</button>' : ''));
};
ACT['so-gen'] = async function () { var j = await api('company?action=suggest-pin'); $('#so-p').value = j.pin; };
ACT['so-save'] = async function (el) {
  var n = $('#so-n').value.trim(), p = $('#so-p').value.trim();
  if (!n) return toast('নাম দিন', 'err');
  if (!el.dataset.id && !/^\d{5}$/.test(p)) return toast('৫ সংখ্যার PIN দিন', 'err');
  if (p && !/^\d{5}$/.test(p)) return toast('PIN অবশ্যই ৫ সংখ্যার হতে হবে', 'err');
  var b = { action: 'x', company_id: S.ctx.id, name: n, can_finance: $('#so-f').checked };
  if (p) b.pin = p;
  if (el.dataset.id) { b.id = +el.dataset.id; b.active = $('#so-a').checked; }
  await api('company?action=user-save', { body: b });
  if (p) openSheet('<h2>' + (el.dataset.id ? 'নতুন PIN সেট হয়েছে' : 'SO যোগ হয়েছে') + '</h2><div class="alert g">' + ic('key') + '<div><b>' + esc(n) + '</b>-এর PIN: <b class="num" style="font-size:22px;letter-spacing:4px">' + esc(p) + '</b><br>এখনই তাকে জানিয়ে দিন — পরে এই PIN আর দেখা যাবে না (শুধু নতুন করে সেট করা যাবে)।</div></div><button class="btn full" style="margin-top:14px" data-act="sheet-close">ঠিক আছে</button>');
  else closeSheet();
  toast('সেভ হয়েছে ✓', 'ok'); route();
};
ACT['so-del'] = async function (el) {
  if (!(await confirmBox('এই SO-কে স্থায়ীভাবে মুছবেন?', 'মুছুন', true))) return;
  await api('company?action=user-delete', { body: { company_id: S.ctx.id, id: +el.dataset.id } });
  closeSheet(); toast('মুছে গেছে', 'ok'); route();
};
