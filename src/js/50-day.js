/* ───────── দৈনিক এন্ট্রি: sales, over-sale, returns, damage, memo ───────── */
var D = null;
var SECS = {
  sale: { t: 'বিক্রয়', icon: 'cart' }, over: { t: 'ওভার সেল', hint: 'মূল হিসাবের বাইরের বিক্রি' },
  'return': { t: 'ফেরত', hint: 'ফেরত আসা পণ্য স্টকে যোগ হয়' }, damage: { t: 'ড্যামেজ পণ্য', hint: 'স্টক কমে না — আলাদা ড্যামেজ হিসাব' }
};

async function getProducts(cid, force) {
  S.cache.prods = S.cache.prods || {};
  if (force || !S.cache.prods[cid]) S.cache.prods[cid] = (await api('products?company_id=' + cid)).products;
  return S.cache.prods[cid];
}

TABS.day = async function (ctx, r, my) {
  var date = /^\d{4}-\d{2}-\d{2}$/.test(r.extra) ? r.extra : todayStr();
  var res = await Promise.all([getProducts(ctx.id, true), api('day?' + qs({ company_id: ctx.id, date: date })), api('stock?company_id=' + ctx.id)]);
  if (stale(my)) return;
  var prods = res[0], day = res[1], items = res[2].items;
  var soldSaved = {}, retSaved = {};
  day.lines.forEach(function (l) {
    if (!l.product_id) return;
    if (l.section === 'sale' || l.section === 'over') soldSaved[l.product_id] = (soldSaved[l.product_id] || 0) + Number(l.qty);
    if (l.section === 'return') retSaved[l.product_id] = (retSaved[l.product_id] || 0) + Number(l.qty);
  });
  var base = {};
  items.forEach(function (it) { base[it.product_id] = Number(it.available) + (soldSaved[it.product_id] || 0) - (retSaved[it.product_id] || 0); });
  var t = todayStr(), isO = S.user.role === 'owner';
  var inWindow = date <= t && date >= addDays(t, -(S.user.editDays || 7));
  D = {
    cid: ctx.id, ctx: ctx, date: date, memo: day.entry.memo_amount ? String(day.entry.memo_amount) : '', note: day.entry.note || '',
    dmg: !!day.entry.dmg_deduct, closed: !!day.entry.closed, closedBy: day.entry.closed_by || '', prods: prods, base: base,
    lines: day.lines.map(function (l) { return { section: l.section, product_id: l.product_id, code: l.code, name: l.name, price: String(l.price), qty: l.section === 'adjust' ? '' : String(l.qty), amount: l.section === 'adjust' ? String(l.amount) : '' }; }),
    editable: isO || (inWindow && !day.entry.closed), inWindow: inWindow, hasEntry: day.lines.length > 0 || Number(day.entry.memo_amount) > 0,
    newDay: day.lines.length === 0 && !(Number(day.entry.memo_amount) > 0)
  };
  // first time on a new day: damage is deducted from net sales by default (same as the Excel's manual "Damage" row)
  if (D.newDay) D.dmg = true;
  renderDay();
};

function lineHtml(l, i) {
  var ro = D.editable ? '' : ' disabled';
  if (l.section === 'adjust') {
    return '<div class="ln adj" data-i="' + i + '"><input class="in sm" data-f="name" placeholder="কারণ (যেমন: Damage, কম)" value="' + esc(l.name) + '"' + ro + '><input class="in sm r" data-f="amount" inputmode="decimal" placeholder="টাকা" value="' + esc(l.amount) + '"' + ro + '>' +
      (D.editable ? '<button class="xbtn" data-act="ln-del" data-i="' + i + '" aria-label="মুছুন">' + ic('x') + '</button>' : '<span></span>') + '</div>';
  }
  return '<div class="ln" data-i="' + i + '"><div class="pn">' + esc(l.name || l.code) + '<small>' + esc(l.code) + (l.product_id ? '' : ' · তালিকায় নেই') + '</small></div>' +
    '<input class="in sm r" data-f="price" inputmode="decimal" aria-label="দাম" value="' + esc(l.price) + '"' + ro + '><input class="in sm r" data-f="qty" inputmode="decimal" aria-label="পরিমাণ" placeholder="0" value="' + esc(l.qty) + '"' + ro + '>' +
    (D.editable ? '<button class="xbtn" data-act="ln-del" data-i="' + i + '" aria-label="মুছুন">' + ic('x') + '</button>' : '<span></span>') +
    '<div class="amt"><span data-warn="' + i + '" class="neg"></span><b class="num" data-amt="' + i + '"></b></div></div>';
}

function sectionCard(sec) {
  var meta = SECS[sec], idx = [], html = '';
  D.lines.forEach(function (l, i) { if (l.section === sec || (sec === 'return' && l.section === 'adjust')) idx.push(i); });
  if (sec === 'over' && !idx.length && !D.editable) return '';
  html += '<div class="card" style="padding:10px 14px 12px"><div class="row sp"><div><h3>' + esc(meta.t) + '</h3>' + (meta.hint ? '<div class="small muted">' + esc(meta.hint) + '</div>' : '') + '</div><b class="num" data-sec="' + sec + '"></b></div>';
  if (idx.length) {
    html += '<div class="ln" style="border:0;padding:8px 0 0;font-size:10.5px;color:var(--mt2)"><span>প্রোডাক্ট</span><span style="text-align:right">দাম</span><span style="text-align:right">পরিমাণ</span><span></span></div>';
    idx.forEach(function (i) { html += lineHtml(D.lines[i], i); });
  }
  if (D.editable) {
    html += '<div class="row" style="margin-top:10px"><button class="btn soft sm grow" data-act="pick-open" data-sec="' + sec + '">' + ic('plus') + ' প্রোডাক্ট যোগ করুন</button>' +
      (sec === 'return' ? '<button class="btn ghost sm" data-act="adj-add">' + ic('plus') + ' অন্যান্য কর্তন</button>' : '') + '</div>';
  }
  return html + '</div>';
}

function renderDay() {
  var d = D, h = '';
  h += '<div class="card" style="padding:10px 12px"><div class="row"><button class="btn ghost sm" data-act="day-nav" data-n="-1" aria-label="আগের দিন">' + ic('left') + '</button>' +
    '<div class="grow" style="text-align:center"><input class="in sm" type="date" id="d-date" value="' + d.date + '" style="text-align:center;font-weight:700"><div class="small muted" style="margin-top:3px">' + fdate(d.date, true) + '</div></div>' +
    '<button class="btn ghost sm" data-act="day-nav" data-n="1" aria-label="পরের দিন">' + ic('right') + '</button></div></div>';
  if (d.closed) h += '<div class="alert g">' + ic('lock') + '<div><b>এই দিনের হিসাব বন্ধ করা আছে</b>' + (d.closedBy ? ' (' + esc(d.closedBy) + ')' : '') + '. ' + (S.user.role === 'owner' ? 'মালিক হিসেবে আপনি বদলাতে পারবেন।' : 'বদলাতে মালিককে বলুন।') + '</div></div>';
  else if (!d.editable) h += '<div class="alert">' + ic('lock') + '<div>' + (d.date > todayStr() ? 'ভবিষ্যতের তারিখে এন্ট্রি করা যায় না।' : 'এই তারিখ ' + (S.user.editDays || 7) + ' দিনের পুরোনো — শুধু মালিক বদলাতে পারবেন।') + '</div></div>';
  h += sectionCard('sale') + sectionCard('over') + sectionCard('return') + sectionCard('damage');
  var ro = d.editable ? '' : ' disabled';
  h += '<div class="card"><div class="fld"><label>মেমো টাকা (ফিজিক্যাল মেমোর যোগফল)</label><input class="in r" id="d-memo" inputmode="decimal" placeholder="0" value="' + esc(d.memo) + '"' + ro + '></div>' +
    '<label class="row" style="margin-top:10px;font-size:12.5px;cursor:pointer"><input type="checkbox" id="d-dmg" ' + (d.dmg ? 'checked' : '') + ro + ' style="width:18px;height:18px;accent-color:#059669"><span>ড্যামেজের মূল্য নিট সেল থেকে কাটুন</span></label>' +
    '<div class="fld" style="margin-top:10px"><label>নোট</label><input class="in" id="d-note" maxlength="500" placeholder="ঐচ্ছিক" value="' + esc(d.note) + '"' + ro + '></div></div>';
  h += '<div class="tot"><div class="cells"><div><b data-t="sales"></b><span>মোট বিক্রয়</span></div><div><b data-t="ret"></b><span>ফেরত</span></div><div><b data-t="net"></b><span>নিট সেল</span></div><div><b data-t="uo"></b><span>আন্ডার/ওভার</span></div></div>' +
    '<div class="row" style="margin-top:9px">' +
    (d.editable ? '<button class="btn grow" data-act="day-save">' + ic('check') + ' সেভ করুন</button>' : '') +
    (!d.closed && d.editable && d.hasEntry ? '<button class="btn soft" data-act="day-close" aria-label="দিনের হিসাব বন্ধ করুন">' + ic('lock') + ' বন্ধ</button>' : '') +
    (d.closed && S.user.role === 'owner' ? '<button class="btn soft" data-act="day-reopen">' + ic('lock') + ' খুলুন</button>' : '') +
    '<button class="btn ghost" data-act="day-share" aria-label="রিপোর্ট শেয়ার">' + ic('share') + '</button></div></div>';
  tb(h);
  dayCalc();
}

function dayTotals() {
  var t = { sales: 0, ret: 0, dmg: 0, bySec: { sale: 0, over: 0, 'return': 0, damage: 0 } };
  D.lines.forEach(function (l) {
    var a = l.section === 'adjust' ? Number(l.amount) || 0 : r2((Number(l.price) || 0) * (Number(l.qty) || 0));
    if (l.section === 'sale' || l.section === 'over') { t.sales += a; t.bySec[l.section] += a; }
    else if (l.section === 'return') { t.ret += a; t.bySec['return'] += a; }
    else if (l.section === 'adjust') { t.ret += a; t.bySec['return'] += a; }
    else if (l.section === 'damage') { t.dmg += a; t.bySec.damage += a; }
  });
  var memo = Number(D.memo) || 0, cut = D.dmg ? t.dmg : 0;
  t.sales = r2(t.sales); t.ret = r2(t.ret); t.dmg = r2(t.dmg); t.cut = r2(cut);
  t.net = r2(t.sales - t.ret - cut); t.uo = r2(memo - t.sales); t.memo = memo;
  return t;
}
function dayCalc() {
  if (!D || !$('#tabbody [data-t]')) return;
  var t = dayTotals(), use = {};
  D.lines.forEach(function (l, i) {
    var el = $('[data-amt="' + i + '"]');
    if (l.section === 'adjust') return;
    if (el) el.textContent = taka(r2((Number(l.price) || 0) * (Number(l.qty) || 0)));
    if (l.product_id && (l.section === 'sale' || l.section === 'over')) use[l.product_id] = (use[l.product_id] || 0) + (Number(l.qty) || 0);
    if (l.product_id && l.section === 'return') use[l.product_id] = (use[l.product_id] || 0) - (Number(l.qty) || 0);
  });
  D.lines.forEach(function (l, i) {
    var w = $('[data-warn="' + i + '"]'); if (!w) return;
    var b = D.base[l.product_id];
    w.textContent = (l.section === 'sale' || l.section === 'over') && l.product_id && b !== undefined && (b - use[l.product_id]) < 0 ? 'স্টকে আছে ' + fmt(b) + ' — কম পড়ছে' : '';
  });
  $$('[data-sec]').forEach(function (e) { e.textContent = taka(t.bySec[e.dataset.sec] || 0); });
  var set = function (k, v, c) { var e = $('[data-t="' + k + '"]'); if (e) { e.textContent = v; e.className = c || ''; } };
  set('sales', taka(t.sales)); set('ret', taka(t.ret)); set('net', taka(t.net), t.net < 0 ? 'neg' : 'pos'); set('uo', (t.uo > 0 ? '+' : '') + taka(t.uo), cls(t.uo));
}

function touch() { if (D && D.editable) S.dirty = true; }
document.addEventListener('input', function (e) {
  var t = e.target;
  if (t.id === 'pk-q') return pickFilter(t.value);
  if (!D || !$('#tabbody') || !$('#tabbody').contains(t)) return;
  if (t.id === 'd-memo') { D.memo = t.value; touch(); return dayCalc(); }
  if (t.id === 'd-note') { D.note = t.value; return touch(); }
  var ln = t.closest('.ln'); if (!ln || !t.dataset.f) return;
  D.lines[+ln.dataset.i][t.dataset.f] = t.value; touch(); dayCalc();
});
document.addEventListener('change', function (e) {
  var t = e.target;
  if (!D) return;
  if (t.id === 'd-dmg') { D.dmg = t.checked; touch(); dayCalc(); }
  if (t.id === 'd-date' && t.value) go('#/c/' + D.cid + '/day/' + t.value);
});
ACT['day-nav'] = function (el) { go('#/c/' + D.cid + '/day/' + addDays(D.date, +el.dataset.n)); };
ACT['ln-del'] = function (el) { D.lines.splice(+el.dataset.i, 1); touch(); renderDay(); };
ACT['adj-add'] = function () { D.lines.push({ section: 'adjust', product_id: null, code: '', name: '', price: '', qty: '', amount: '' }); touch(); renderDay(); var f = $$('.ln.adj [data-f="name"]'); if (f.length) f[f.length - 1].focus(); };

/* product picker (stays open so many items can be added quickly) */
var PICK = { sec: '', added: 0 };
ACT['pick-open'] = function (el) {
  PICK = { sec: el.dataset.sec, added: 0 };
  openSheet('<h2>' + esc(SECS[PICK.sec].t) + ' — প্রোডাক্ট বাছুন</h2><input class="in" id="pk-q" placeholder="কোড বা নাম লিখে খুঁজুন" autocomplete="off" autofocus>' +
    '<div class="pick" id="pk-list"></div><button class="btn full" style="margin-top:12px" data-act="pick-done">' + ic('check') + ' হয়েছে</button>');
  pickFilter('');
};
function pickFilter(q) {
  q = String(q || '').trim().toLowerCase();
  var have = {};
  D.lines.forEach(function (l) { if (l.section === PICK.sec && l.product_id) have[l.product_id] = 1; });
  var list = D.prods.filter(function (p) { return p.active && (!q || (p.code + ' ' + p.name).toLowerCase().indexOf(q) >= 0); }).slice(0, 80);
  var el = $('#pk-list'); if (!el) return;
  el.innerHTML = list.length ? list.map(function (p) {
    var b = D.base[p.id];
    return '<button data-act="pick-add" data-id="' + p.id + '"><span><span class="nm">' + esc(p.name) + '</span><br><span class="cd">' + esc(p.code) + (b !== undefined ? ' · স্টক ' + fmt(b) : '') + '</span></span><span style="text-align:right"><b class="num">' + taka(p.price) + '</b>' + (have[p.id] ? '<br><span class="chip g">' + ic('check') + ' যোগ আছে</span>' : '') + '</span></button>';
  }).join('') : '<div class="empty">কিছু পাওয়া যায়নি। "প্রোডাক্ট" ট্যাব থেকে নতুন প্রোডাক্ট যোগ করুন।</div>';
}
ACT['pick-add'] = function (el) {
  var p = D.prods.filter(function (x) { return x.id === +el.dataset.id; })[0]; if (!p) return;
  if (D.lines.some(function (l) { return l.section === PICK.sec && l.product_id === p.id; })) return toast('এটি আগে থেকেই আছে — লাইনে পরিমাণ বদলান');
  D.lines.push({ section: PICK.sec, product_id: p.id, code: p.code, name: p.name, price: String(p.price), qty: '', amount: '' });
  PICK.added++; touch(); toast(p.name + ' যোগ হয়েছে ✓'); pickFilter($('#pk-q').value);
};
ACT['pick-done'] = function () {
  closeSheet(); renderDay();
  var empties = $$('.ln [data-f="qty"]').filter(function (i) { return !i.value; });
  if (empties.length && PICK.added) setTimeout(function () { empties[0].focus(); empties[0].scrollIntoView({ block: 'center' }); }, 320);
};

/* save / close / share */
function dayPayload() {
  return D.lines.map(function (l) {
    return l.section === 'adjust' ? { section: 'adjust', name: l.name, amount: l.amount } : { section: l.section, product_id: l.product_id, code: l.code, name: l.name, price: l.price, qty: l.qty };
  });
}
async function saveDay(quiet) {
  for (var i = 0; i < D.lines.length; i++) {
    var l = D.lines[i];
    if (l.section === 'adjust') { if (!String(l.name).trim() || !(Number(l.amount) > 0)) { toast('অন্যান্য কর্তনে কারণ ও টাকা দিন', 'err'); return false; } }
    else if (!(Number(l.qty) > 0)) { toast((l.name || l.code) + ': পরিমাণ দিন (বা লাইনটি মুছুন)', 'err'); var f = $('.ln[data-i="' + i + '"] [data-f="qty"]'); if (f) f.focus(); return false; }
  }
  await api('day', { body: { action: 'save', company_id: D.cid, date: D.date, memo: D.memo, note: D.note, dmg_deduct: D.dmg, lines: dayPayload() } });
  S.dirty = false;
  if (!quiet) toast('সেভ হয়েছে ✓', 'ok');
  return true;
}
ACT['day-save'] = async function (el) {
  el.disabled = true;
  try { if (await saveDay()) { var my = ++S.rid; await TABS.day(S.ctx, { extra: D.date }, my); } } finally { el.disabled = false; }
};
ACT['day-close'] = async function () {
  if (S.dirty && !(await saveDay(true))) return;
  var t = dayTotals();
  if (!(await confirmBox('দিনের হিসাব বন্ধ করবেন? নিট সেল ' + taka(t.net), 'বন্ধ করুন'))) return;
  await api('day', { body: { action: 'close', company_id: D.cid, date: D.date, closed: true } });
  toast('হিসাব বন্ধ হয়েছে', 'ok'); var my = ++S.rid; await TABS.day(S.ctx, { extra: D.date }, my);
};
ACT['day-reopen'] = async function () {
  await api('day', { body: { action: 'close', company_id: D.cid, date: D.date, closed: false } });
  toast('হিসাব খোলা হয়েছে', 'ok'); var my = ++S.rid; await TABS.day(S.ctx, { extra: D.date }, my);
};
function dayReport() {
  var t = dayTotals();
  return '📊 ' + D.ctx.name + ' — ' + fdate(D.date, true) + '\n' +
    'বিক্রয়: ' + taka(t.sales) + '\nফেরত: ' + taka(t.ret) + (t.cut ? '\nড্যামেজ কর্তন: ' + taka(t.cut) : '') + '\n*নিট সেল: ' + taka(t.net) + '*\n' +
    'মেমো: ' + taka(t.memo) + '\nআন্ডার/ওভার: ' + (t.uo > 0 ? '+' : '') + taka(t.uo) + (t.dmg ? '\nড্যামেজ পণ্য: ' + taka(t.dmg) : '');
}
ACT['day-share'] = function () {
  var txt = dayReport();
  openSheet('<h2>আজকের রিপোর্ট</h2><textarea class="in" id="rp-t" rows="9" readonly style="white-space:pre-wrap">' + esc(txt) + '</textarea>' +
    '<div class="row" style="margin-top:12px"><button class="btn soft grow" data-act="rp-copy">' + ic('copy') + ' কপি করুন</button><a class="btn grow" style="text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(txt) + '">' + ic('share') + ' WhatsApp</a></div>');
};
ACT['rp-copy'] = async function () { await copyText($('#rp-t').value); toast('কপি হয়েছে ✓', 'ok'); };
