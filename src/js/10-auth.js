/* ───────── login (5-digit PIN pad), forced PIN change, logout ───────── */
var PAD = { mode: 'login', buf: '', first: '', old: '', busy: false };

function padHtml(title, sub) {
  var d = '';
  for (var i = 0; i < 5; i++) d += '<i class="' + (i < PAD.buf.length ? 'on' : '') + '"></i>';
  var keys = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (n) { return '<button data-act="pad" data-k="' + n + '" aria-label="' + n + '">' + n + '</button>'; }).join('');
  return '<div class="lg-card"><div class="sl-logo">' + LOGO + '</div><div class="lg-t">' + esc(title) + '</div><div class="lg-s">' + esc(sub) + '</div>' +
    '<div class="dots" id="dots" aria-live="polite">' + d + '</div><div class="lg-err" id="lgerr"></div>' +
    '<div class="pad">' + keys + '<button class="fn" data-act="pad" data-k="clr">মুছুন</button><button data-act="pad" data-k="0" aria-label="0">0</button><button class="fn" data-act="pad" data-k="del" aria-label="Backspace">⌫</button></div>' +
    '<div class="lg-foot">AXIION TECHNOLOGY</div></div>';
}
function showLogin(msg) {
  PAD = { mode: 'login', buf: '', first: '', old: '', busy: false };
  $('#app').classList.add('hide');
  var l = $('#login'); l.classList.remove('hide');
  l.innerHTML = padHtml('SHAKIB TRADERS', 'আপনার ৫ সংখ্যার PIN দিন');
  if (msg) $('#lgerr').textContent = msg;
}
function padRefresh() {
  $$('#dots i').forEach(function (d, i) { d.classList.toggle('on', i < PAD.buf.length); });
}
function padErr(m) {
  $('#lgerr').textContent = m || '';
  var d = $('#dots'); d.classList.remove('shake'); void d.offsetWidth; d.classList.add('shake');
  PAD.buf = ''; padRefresh();
}
ACT.pad = function (el) {
  if (PAD.busy) return;
  var k = el.dataset.k;
  if (k === 'clr') PAD.buf = '';
  else if (k === 'del') PAD.buf = PAD.buf.slice(0, -1);
  else if (PAD.buf.length < 5) PAD.buf += k;
  $('#lgerr').textContent = '';
  padRefresh();
  if (PAD.buf.length === 5) padDone();
};
document.addEventListener('keydown', function (e) {
  if ($('#login').classList.contains('hide')) return;
  if (/^\d$/.test(e.key)) { var b = $('[data-k="' + e.key + '"]'); if (b) b.click(); }
  else if (e.key === 'Backspace') { var d = $('[data-k="del"]'); if (d) d.click(); }
});

async function padDone() {
  var pin = PAD.buf;
  if (PAD.mode === 'login') {
    PAD.busy = true;
    try {
      var j = await api('auth', { body: { pin: pin } });
      S.token = j.token; store.set('ax_token', j.token);
      PAD.old = pin;
      if (j.user.mustChange) { S.user = j.user; PAD.mode = 'new'; PAD.buf = ''; $('#login').innerHTML = padHtml('নতুন PIN তৈরি করুন', 'নিজের একটি নতুন ৫ সংখ্যার PIN দিন'); }
      else enter(j.user);
    } catch (e) { padErr(e.message); }
    PAD.busy = false;
  } else if (PAD.mode === 'new') {
    if (pin === PAD.old) return padErr('আগের PIN আবার দেওয়া যাবে না');
    PAD.first = pin; PAD.mode = 'confirm'; PAD.buf = '';
    $('#login').innerHTML = padHtml('PIN আবার দিন', 'নিশ্চিত করতে একই PIN আবার লিখুন');
  } else if (PAD.mode === 'confirm') {
    if (pin !== PAD.first) { PAD.mode = 'new'; $('#login').innerHTML = padHtml('নতুন PIN তৈরি করুন', 'নিজের একটি নতুন ৫ সংখ্যার PIN দিন'); return padErr('দুইবার একই PIN হয়নি, আবার দিন'); }
    PAD.busy = true;
    try {
      var r = await api('auth?action=change', { body: { oldPin: PAD.old, newPin: pin } });
      S.token = r.token; store.set('ax_token', r.token);
      var me = await api('auth?action=me');
      enter(me.user); toast('নতুন PIN সেট হয়েছে', 'ok');
    } catch (e) { PAD.mode = 'new'; $('#login').innerHTML = padHtml('নতুন PIN তৈরি করুন', 'নিজের একটি নতুন ৫ সংখ্যার PIN দিন'); padErr(e.message); }
    PAD.busy = false;
  }
}

function logout(silent, msg) {
  S.token = ''; S.user = null; S.cache = {}; S.companies = []; S.dirty = false;
  store.del('ax_token'); closeSheet(); closeMenu();
  history.replaceState(null, '', location.pathname);
  showLogin(msg || '');
}
ACT.logout = function () { logout(); };

// Change my own PIN from the menu
ACT['pin-change'] = function () {
  openSheet('<h2>PIN বদলান</h2><div class="fld"><label>পুরোনো PIN</label><input class="in" id="op" inputmode="numeric" maxlength="5" autocomplete="off" autofocus></div>' +
    '<div class="fld"><label>নতুন PIN (৫ সংখ্যা)</label><input class="in" id="np" inputmode="numeric" maxlength="5" autocomplete="off"></div>' +
    '<button class="btn full" style="margin-top:14px" data-act="pin-save">সেভ করুন</button>');
};
ACT['pin-save'] = async function () {
  var o = $('#op').value.trim(), n = $('#np').value.trim();
  if (!/^\d{5}$/.test(o) || !/^\d{5}$/.test(n)) return toast('দুটো PIN-ই ৫ সংখ্যার হতে হবে', 'err');
  var r = await api('auth?action=change', { body: { oldPin: o, newPin: n } });
  S.token = r.token; store.set('ax_token', r.token); closeSheet(); toast('PIN বদলে গেছে', 'ok');
};
