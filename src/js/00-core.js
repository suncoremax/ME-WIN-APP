/* ───────── core: helpers, API, state, router, sheet, toast ───────── */
var S = { user: null, token: '', companies: [], period: null, rid: 0, cache: {}, dirty: false };
var ACT = {};          // click actions:  <button data-act="name" data-x="1">
var VIEWS = {};        // route → render function
var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

var store = {
  get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
};

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function fmt(n) {
  n = Number(n) || 0;
  var a = Math.abs(n), fr = Math.abs(a - Math.round(a)) > 0.004, s = a.toLocaleString('en-IN', { minimumFractionDigits: fr ? 2 : 0, maximumFractionDigits: 2 });
  return (n < 0 && a >= 0.005 ? '−' : '') + s;
}
function taka(n) { n = Number(n) || 0; return (n < 0 && Math.abs(n) >= 0.005 ? '−' : '') + '৳' + fmt(Math.abs(n)); }
function sgn(n) { n = Number(n) || 0; return n > 0 ? '+' + fmt(n) : fmt(n); }
function cls(n) { n = Number(n) || 0; return n < 0 ? 'neg' : (n > 0 ? 'pos' : ''); }
function r2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }

var BN_M = ['জানু', 'ফেব্রু', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টে', 'অক্টো', 'নভে', 'ডিসে'];
var BN_D = ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহ', 'শুক্র', 'শনি'];
function pd(s) { return new Date(s + 'T00:00:00Z'); }
function fdate(s, wd) { if (!s) return ''; var d = pd(s); return d.getUTCDate() + ' ' + BN_M[d.getUTCMonth()] + (wd ? ', ' + BN_D[d.getUTCDay()] : ''); }
function todayStr() { return new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10); }
function addDays(s, n) { var d = pd(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function monthRange(s) { var y = +s.slice(0, 4), m = +s.slice(5, 7); return { from: s.slice(0, 8) + '01', to: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) }; }

var ICONS = {
  home: '<path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"/>',
  building: '<path d="M4 21V5l8-3v19M12 9h8v12M8 7v.01M8 11v.01M8 15v.01M16 13v.01M16 17v.01"/>',
  box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  wallet: '<path d="M3 7a2 2 0 012-2h13v4M3 7v11a2 2 0 002 2h15V9H5a2 2 0 01-2-2zM16 14h2"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0M16 4.5a3.5 3.5 0 010 7M18 14.5a6.5 6.5 0 013.5 5.5"/>',
  alert: '<path d="M12 3l10 18H2zM12 10v5M12 18v.01"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3M14 9l2 2"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  up: '<path d="M12 16V4M6 10l6-6 6 6M4 20h16"/>',
  down: '<path d="M12 4v12M6 10l6 6 6-6M4 20h16"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  moon: '<path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/>',
  logout: '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/>',
  share: '<path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v13"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  book: '<path d="M4 4h12a3 3 0 013 3v13H7a3 3 0 01-3-3zM4 17a3 3 0 013-3h12"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  file: '<path d="M6 3h8l5 5v13H6zM14 3v5h5M9 13h6M9 17h6"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>'
};
function ic(n) { return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[n] || '') + '</svg>'; }
var LOGO = '<svg viewBox="0 0 48 48"><path d="M33 14c-2-3-5-4-9-4-5 0-9 2.5-9 7 0 9 18 4.500 18 14 0 4.500-4 7-9.500 7-4 0-7.500-1.500-9.500-4.500" fill="none" stroke="#059669" stroke-width="6" stroke-linecap="round"/></svg>';

/* ───── API ───── */
async function api(path, opt) {
  opt = opt || {};
  var r, j;
  try {
    r = await fetch('/api/' + path, {
      method: opt.method || (opt.body ? 'POST' : 'GET'),
      headers: Object.assign({ 'Content-Type': 'application/json' }, S.token ? { Authorization: 'Bearer ' + S.token } : {}),
      body: opt.body ? JSON.stringify(opt.body) : undefined
    });
    j = await r.json();
  } catch (e) { throw Object.assign(new Error('ইন্টারনেট/সার্ভারের সাথে যোগাযোগ হয়নি'), { status: 0 }); }
  if (r.status === 401 && S.token && path.indexOf('auth') !== 0) { logout(true, j.error); throw Object.assign(new Error(j.error || 'আবার লগইন করুন'), { status: 401 }); }
  if (!j.ok) throw Object.assign(new Error(j.error || 'সমস্যা হয়েছে'), { status: r.status });
  return j;
}
function qs(o) { return Object.keys(o).filter(function (k) { return o[k] != null && o[k] !== ''; }).map(function (k) { return k + '=' + encodeURIComponent(o[k]); }).join('&'); }

/* ───── toast / sheet / confirm ───── */
var toastT;
function toast(msg, kind) {
  var t = $('#toast'); t.textContent = msg; t.className = 'show ' + (kind || '');
  clearTimeout(toastT); toastT = setTimeout(function () { t.className = ''; }, 2600);
}
function fail(e) { toast(e && e.message ? e.message : 'সমস্যা হয়েছে', 'err'); }

function openSheet(html, onMount) {
  var host = $('#sheet');
  host.innerHTML = '<div class="sh" role="dialog" aria-modal="true"><div class="grab"></div>' + html + '</div>';
  $('#ovs').classList.add('show');
  requestAnimationFrame(function () { $('.sh', host).classList.add('show'); });
  if (onMount) onMount($('.sh', host));
  var f = $('.sh [autofocus]', host); if (f) setTimeout(function () { f.focus(); }, 280);
}
function closeSheet() {
  var sh = $('#sheet .sh'); if (!sh) return;
  sh.classList.remove('show'); $('#ovs').classList.remove('show');
  setTimeout(function () { $('#sheet').innerHTML = ''; }, 300);
}
function confirmBox(msg, okText, danger) {
  return new Promise(function (res) {
    openSheet('<h2>' + esc(msg) + '</h2><div class="row"><button class="btn ghost grow" data-act="cf-no">না</button><button class="btn ' + (danger ? 'red' : '') + ' grow" data-act="cf-yes">' + esc(okText || 'হ্যাঁ') + '</button></div>');
    ACT['cf-yes'] = function () { closeSheet(); res(true); };
    ACT['cf-no'] = function () { closeSheet(); res(false); };
  });
}
ACT['sheet-close'] = closeSheet;

/* ───── period (shared by dashboard & company pages) ───── */
function periodPreset(key) {
  var t = todayStr(), m = monthRange(t);
  if (key === 'month') return { key: key, from: m.from, to: m.to };
  if (key === 'last') { var l = monthRange(addDays(m.from, -1)); return { key: key, from: l.from, to: l.to }; }
  if (key === '7') return { key: key, from: addDays(t, -6), to: t };
  if (key === 'all') return { key: key, from: '', to: '' };
  return null;
}
function getPeriod() {
  if (!S.period) {
    var sv = store.get('ax_period');
    try { S.period = sv ? JSON.parse(sv) : null; } catch (e) {}
    if (!S.period || (S.period.key !== 'custom' && S.period.key !== 'all')) S.period = periodPreset((S.period && S.period.key) || 'month');
    if (!S.period) S.period = periodPreset('month');
  }
  return S.period;
}
function setPeriod(p) { S.period = p; store.set('ax_period', JSON.stringify(p)); }
function periodLabel(p) {
  if (p.key === 'all') return 'শুরু থেকে এখন পর্যন্ত';
  return fdate(p.from) + ' – ' + fdate(p.to);
}
function periodBar() {
  var p = getPeriod();
  var b = function (k, l) { return '<button class="' + (p.key === k ? 'on' : '') + '" data-act="period" data-k="' + k + '">' + l + '</button>'; };
  return '<div class="card" style="padding:10px 12px"><div class="row sp wrap"><div class="seg">' + b('month', 'এই মাস') + b('last', 'গত মাস') + b('7', '৭ দিন') + b('all', 'সব') + b('custom', 'তারিখ') + '</div>' +
    '<span class="small muted">' + esc(periodLabel(p)) + '</span></div>' +
    (p.key === 'custom' ? '<div class="row" style="margin-top:8px"><input class="in sm" type="date" id="pf" value="' + esc(p.from) + '"><span class="muted">–</span><input class="in sm" type="date" id="pt" value="' + esc(p.to) + '"><button class="btn sm" data-act="period-apply">দেখান</button></div>' : '') + '</div>';
}
ACT.period = function (el) {
  var k = el.dataset.k;
  if (k === 'custom') { var cur = getPeriod(); setPeriod({ key: 'custom', from: cur.from || periodPreset('month').from, to: cur.to || todayStr() }); }
  else setPeriod(periodPreset(k));
  route();
};
ACT['period-apply'] = function () {
  var f = $('#pf').value, t = $('#pt').value;
  if (!f || !t || f > t) return toast('তারিখ ঠিক করুন', 'err');
  setPeriod({ key: 'custom', from: f, to: t }); route();
};

/* ───── router: #/home  #/c/<id>/<tab>  #/settings ───── */
function parseHash() {
  var h = (location.hash || '').replace(/^#\/?/, '').split('/');
  return { page: h[0] || '', id: h[1] ? (h[1] === 'shared' ? 'shared' : Number(h[1])) : null, tab: h[2] || '', extra: h[3] || '' };
}
function go(h) { if (location.hash === h) route(); else location.hash = h; }
async function guardLeave() {
  if (!S.dirty) return true;
  var ok = await confirmBox('সেভ না করা পরিবর্তন আছে। ছেড়ে যাবেন?', 'ছেড়ে যান', true);
  if (ok) S.dirty = false;
  return ok;
}
var lastHash = '', skipHash = false;
window.addEventListener('hashchange', async function () {
  if (skipHash) { skipHash = false; return; }
  if (S.dirty && location.hash !== lastHash) {
    var next = location.hash; skipHash = true; location.hash = lastHash;
    if (await guardLeave()) location.hash = next;
    return;
  }
  lastHash = location.hash; route();
});

function route() {
  if (!S.user) return;
  closeMenu(); S.dirty = false;
  var r = parseHash(), my = ++S.rid;
  if (S.user.role === 'so') {
    // an SO can only ever be inside his own company
    if (r.page === 'c' && r.id === S.user.companyId) { /* ok */ }
    else if (r.page === 'settings') { /* own PIN page */ }
    else { r = { page: 'c', id: S.user.companyId, tab: 'summary' }; history.replaceState(null, '', '#/c/' + S.user.companyId + '/summary'); }
  } else if (!r.page) { r = { page: 'home' }; }
  lastHash = location.hash;
  var fn = VIEWS[r.page] || VIEWS.home;
  setNav(r);
  var v = $('#view'); v.scrollTop = 0;
  Promise.resolve(fn(r, my)).catch(function (e) { if (my === S.rid) $('#view').innerHTML = '<div class="page"><div class="alert r">' + ic('alert') + '<div>' + esc(e.message) + '</div></div></div>'; });
}
function stale(my) { return my !== S.rid; }
function setView(html) { $('#view').innerHTML = '<div class="page">' + html + '</div>'; }
function skeleton(n) { var s = ''; for (var i = 0; i < (n || 3); i++) s += '<div class="skel"></div>'; setView(s); }

/* ───── global event delegation ───── */
document.addEventListener('click', function (e) {
  var a = e.target.closest('[data-act]');
  if (!a) return;
  var fn = ACT[a.dataset.act];
  if (fn) { e.preventDefault(); Promise.resolve(fn(a, e)).catch(fail); }
});
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeSheet(); closeMenu(); } });

function loadScript(src) {
  return new Promise(function (ok, no) {
    var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { no(new Error('লাইব্রেরি লোড হয়নি — ইন্টারনেট দেখুন')); };
    document.head.appendChild(s);
  });
}
async function loadXLSX() {
  if (window.XLSX) return window.XLSX;
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
  return window.XLSX;
}
function download(name, blob) {
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function copyText(t) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t);
  return new Promise(function (ok) { var x = document.createElement('textarea'); x.value = t; document.body.appendChild(x); x.select(); try { document.execCommand('copy'); } catch (e) {} x.remove(); ok(); });
}
