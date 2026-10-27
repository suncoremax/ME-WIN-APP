/* ───────── হিসাব (ledger + expenses) and বাকি ক্লায়েন্ট ───────── */
var KIND_T = { payout: 'কোম্পানিকে পরিশোধ (Paid out)', received: 'কোম্পানি থেকে মাল গ্রহণ (Product received)', opening: 'ওপেনিং কোড ব্যালেন্স' };

async function expensesBlock(ctx) {
  var p = getPeriod();
  var ex = await api('money?' + qs({ type: 'expenses', company_id: ctx.id, from: p.from, to: p.to }));
  return '<div class="card"><div class="hd"><h3>' + ic('wallet') + ' খরচ হিসাব</h3><button class="btn sm" data-act="ex-add">' + ic('plus') + ' খরচ</button></div>' +
    '<div class="row sp" style="margin-bottom:6px"><span class="muted small">' + esc(periodLabel(p)) + '</span><b class="num">মোট ' + taka(ex.total) + '</b></div>' +
    '<div class="list">' + (ex.rows.length ? ex.rows.map(function (x) {
      return '<div class="li"><div class="grow"><div class="t1">' + esc(x.name) + '</div><div class="t2">' + fdate(x.entry_date) + ' · ' + esc(x.created_by || '') + '</div></div><b class="num">' + taka(x.amount) + '</b><button class="xbtn" data-act="ex-del" data-id="' + x.id + '" aria-label="মুছুন">' + ic('trash') + '</button></div>';
    }).join('') : '<div class="empty">এই সময়ে কোনো খরচ নেই</div>') + '</div></div>';
}

TABS.money = async function (ctx, r, my) {
  var p = getPeriod();
  var lg = await api('money?' + qs({ type: 'ledger', company_id: ctx.id, from: p.from, to: p.to }));
  var exb = await expensesBlock(ctx);
  if (stale(my)) return;
  var t = lg.totals, isO = S.user.role === 'owner';
  var h = periodBar() + '<div class="grid g2 g-md4"><div class="kpi acc" style="grid-column:span 2"><div class="l">কোড ব্যালেন্স</div><div class="v">' + taka(t.codeBalance) + '</div><div class="s">ওপেনিং + পরিশোধ − মাল গ্রহণ</div></div>' +
    '<div class="kpi"><div class="l">মোট পরিশোধ</div><div class="v">' + taka(t.payout) + '</div></div><div class="kpi"><div class="l">মোট মাল গ্রহণ</div><div class="v">' + taka(t.received) + '</div></div></div>';
  h += '<div class="row wrap"><button class="btn grow" data-act="lg-add" data-k="payout">' + ic('up') + ' পরিশোধ করেছি</button><button class="btn soft grow" data-act="lg-add" data-k="received">' + ic('down') + ' মাল পেয়েছি</button>' + (isO ? '<button class="btn ghost" data-act="lg-add" data-k="opening">ওপেনিং</button>' : '') + '</div>';
  h += '<div class="card"><div class="hd"><h3>' + ic('book') + ' কোম্পানির সাথে লেনদেন</h3></div><div class="list">' + (lg.rows.length ? lg.rows.map(function (x) {
    return '<div class="li"><span class="chip ' + (x.kind === 'payout' ? 'g' : x.kind === 'received' ? 'a' : 't') + '">' + (x.kind === 'payout' ? 'পরিশোধ' : x.kind === 'received' ? 'মাল' : 'ওপেনিং') + '</span><div class="grow"><div class="t1">' + fdate(x.entry_date, true) + '</div><div class="t2">' + esc(x.note || '') + (x.created_by ? ' · ' + esc(x.created_by) : '') + '</div></div><b class="num">' + taka(x.amount) + '</b><button class="xbtn" data-act="lg-del" data-id="' + x.id + '" aria-label="মুছুন">' + ic('trash') + '</button></div>';
  }).join('') : '<div class="empty">এই সময়ে কোনো লেনদেন নেই</div>') + '</div></div>' + exb;
  tb(h);
};
TABS.expenses = async function (ctx, r, my) { var b = await expensesBlock(ctx); if (!stale(my)) tb(periodBar() + b); };

ACT['lg-add'] = function (el) {
  var k = el.dataset.k;
  openSheet('<h2>' + esc(KIND_T[k]) + '</h2><div class="row"><div class="fld grow"><label>টাকা</label><input class="in" id="lg-a" inputmode="decimal" placeholder="0" autofocus></div><div class="fld grow"><label>তারিখ</label><input class="in" type="date" id="lg-d" value="' + todayStr() + '"></div></div><div class="fld"><label>নোট (ঐচ্ছিক)</label><input class="in" id="lg-n" maxlength="200"></div><button class="btn full" style="margin-top:14px" data-act="lg-save" data-k="' + k + '">সেভ করুন</button>');
};
ACT['lg-save'] = async function (el) {
  if (!(Number($('#lg-a').value) > 0)) return toast('টাকার পরিমাণ দিন', 'err');
  await api('money', { body: { type: 'ledger', action: 'add', company_id: S.ctx.id, kind: el.dataset.k, amount: $('#lg-a').value, date: $('#lg-d').value, note: $('#lg-n').value } });
  closeSheet(); toast('সেভ হয়েছে ✓', 'ok'); route();
};
ACT['lg-del'] = async function (el) {
  if (!(await confirmBox('এই লেনদেন মুছবেন?', 'মুছুন', true))) return;
  await api('money', { body: { type: 'ledger', action: 'delete', company_id: S.ctx.id, id: +el.dataset.id } }); toast('মুছে গেছে', 'ok'); route();
};
ACT['ex-add'] = function () {
  openSheet('<h2>নতুন খরচ</h2><div class="fld"><label>খরচের নাম</label><input class="in" id="ex-n" maxlength="120" placeholder="যেমন: গাড়ি ভাড়া" autofocus></div><div class="row"><div class="fld grow"><label>টাকা</label><input class="in" id="ex-a" inputmode="decimal" placeholder="0"></div><div class="fld grow"><label>তারিখ</label><input class="in" type="date" id="ex-d" value="' + todayStr() + '"></div></div><button class="btn full" style="margin-top:14px" data-act="ex-save">সেভ করুন</button>');
};
ACT['ex-save'] = async function () {
  var n = $('#ex-n').value.trim(), a = $('#ex-a').value;
  if (!n || !(Number(a) > 0)) return toast('নাম ও টাকা দিন', 'err');
  await api('money', { body: { type: 'expenses', action: 'add', company_id: S.ctx.id, name: n, amount: a, date: $('#ex-d').value } });
  closeSheet(); toast('সেভ হয়েছে ✓', 'ok'); route();
};
ACT['ex-del'] = async function (el) {
  if (!(await confirmBox('এই খরচ মুছবেন?', 'মুছুন', true))) return;
  await api('money', { body: { type: 'expenses', action: 'delete', company_id: S.ctx.id, id: +el.dataset.id } }); toast('মুছে গেছে', 'ok'); route();
};

/* ───── due clients ───── */
var CLI = [];
TABS.clients = async function (ctx, r, my) {
  var j = await api('money?' + qs({ type: 'clients', company_id: ctx.id }));
  if (stale(my)) return;
  CLI = j.clients;
  var due = 0; CLI.forEach(function (c) { if (c.balance > 0) due += c.balance; });
  var h = '<div class="grid g2"><div class="kpi acc"><div class="l">মোট বাকি</div><div class="v">' + taka(due) + '</div><div class="s">' + CLI.filter(function (c) { return c.balance > 0; }).length + ' জনের কাছে</div></div><div class="kpi"><div class="l">ক্লায়েন্ট</div><div class="v">' + CLI.length + '</div></div></div>';
  h += '<button class="btn soft full" data-act="cl-edit">' + ic('plus') + ' নতুন ক্লায়েন্ট</button>';
  h += '<div class="card" style="padding:4px 14px"><div class="list">' + (CLI.length ? CLI.slice().sort(function (a, b) { return b.balance - a.balance; }).map(function (c) {
    return '<button class="li clk" data-act="cl-open" data-id="' + c.id + '"><div class="grow"><div class="t1">' + esc(c.name) + '</div><div class="t2">' + esc(c.phone || 'ফোন নেই') + (c.last ? ' · শেষ লেনদেন ' + fdate(c.last) : '') + '</div></div><b class="num ' + (c.balance > 0 ? 'neg' : '') + '">' + (c.balance ? taka(c.balance) : '—') + '</b></button>';
  }).join('') : '<div class="empty"><b>কোনো ক্লায়েন্ট নেই</b>যাদের কাছে বাকি আছে তাদের যোগ করুন</div>') + '</div></div>';
  tb(h);
};
ACT['cl-edit'] = function (el) {
  var c = el && el.dataset.id ? CLI.filter(function (x) { return x.id === +el.dataset.id; })[0] : null;
  openSheet('<h2>' + (c ? 'ক্লায়েন্ট বদলান' : 'নতুন ক্লায়েন্ট') + '</h2><div class="fld"><label>নাম</label><input class="in" id="cl-n" maxlength="120" value="' + esc(c ? c.name : '') + '" autofocus></div><div class="fld"><label>ফোন</label><input class="in" id="cl-p" inputmode="tel" maxlength="30" value="' + esc(c ? c.phone : '') + '"></div><div class="fld"><label>নোট</label><input class="in" id="cl-o" maxlength="200" value="' + esc(c ? c.note : '') + '"></div><button class="btn full" style="margin-top:14px" data-act="cl-save"' + (c ? ' data-id="' + c.id + '"' : '') + '>সেভ করুন</button>');
};
ACT['cl-save'] = async function (el) {
  var n = $('#cl-n').value.trim(); if (!n) return toast('নাম দিন', 'err');
  var b = { type: 'clients', action: 'save', company_id: S.ctx.id, name: n, phone: $('#cl-p').value, note: $('#cl-o').value };
  if (el.dataset.id) b.id = +el.dataset.id;
  await api('money', { body: b }); closeSheet(); toast('সেভ হয়েছে ✓', 'ok'); route();
};
ACT['cl-open'] = async function (el) {
  var id = +el.dataset.id, c = CLI.filter(function (x) { return x.id === id; })[0];
  var j = await api('money?' + qs({ type: 'clients', company_id: S.ctx.id, client_id: id }));
  openSheet('<h2>' + esc(c.name) + '</h2><div class="row sp" style="margin:-6px 0 10px"><span class="muted">' + (c.phone ? '<a href="tel:' + esc(c.phone) + '" style="color:var(--bl);font-weight:700;text-decoration:none">' + ic('phone') + ' ' + esc(c.phone) + '</a>' : 'ফোন নেই') + '</span><b class="num ' + (c.balance > 0 ? 'neg' : '') + '" style="font-size:18px">বাকি ' + taka(c.balance) + '</b></div>' +
    '<div class="row"><button class="btn grow" data-act="cl-tx" data-id="' + id + '" data-k="due">' + ic('plus') + ' বাকি দিলাম</button><button class="btn soft grow" data-act="cl-tx" data-id="' + id + '" data-k="paid">' + ic('down') + ' টাকা পেলাম</button></div>' +
    '<div class="list" style="margin-top:10px">' + (j.txns.length ? j.txns.map(function (t) {
      return '<div class="li"><span class="chip ' + (t.kind === 'due' ? 'r' : 'g') + '">' + (t.kind === 'due' ? 'বাকি' : 'জমা') + '</span><div class="grow"><div class="t1">' + fdate(t.entry_date, true) + '</div><div class="t2">' + esc(t.note || '') + '</div></div><b class="num">' + taka(t.amount) + '</b></div>';
    }).join('') : '<div class="empty">এখনো কোনো লেনদেন নেই</div>') + '</div>' +
    '<button class="btn ghost full" style="margin-top:10px" data-act="cl-edit" data-id="' + id + '">তথ্য বদলান</button>');
};
ACT['cl-tx'] = function (el) {
  var id = el.dataset.id, k = el.dataset.k;
  openSheet('<h2>' + (k === 'due' ? 'বাকি দেওয়া' : 'টাকা পাওয়া') + '</h2><div class="row"><div class="fld grow"><label>টাকা</label><input class="in" id="tx-a" inputmode="decimal" placeholder="0" autofocus></div><div class="fld grow"><label>তারিখ</label><input class="in" type="date" id="tx-d" value="' + todayStr() + '"></div></div><div class="fld"><label>নোট</label><input class="in" id="tx-n" maxlength="200"></div><button class="btn full" style="margin-top:14px" data-act="cl-tx-save" data-id="' + id + '" data-k="' + k + '">সেভ করুন</button>');
};
ACT['cl-tx-save'] = async function (el) {
  if (!(Number($('#tx-a').value) > 0)) return toast('টাকার পরিমাণ দিন', 'err');
  await api('money', { body: { type: 'clients', action: 'txn', company_id: S.ctx.id, client_id: +el.dataset.id, kind: el.dataset.k, amount: $('#tx-a').value, date: $('#tx-d').value, note: $('#tx-n').value } });
  closeSheet(); toast('সেভ হয়েছে ✓', 'ok'); route();
};
