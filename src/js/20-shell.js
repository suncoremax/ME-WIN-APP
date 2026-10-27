/* ───────── shell: header, side menu, theme, clock, entering the app ───────── */
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  var b = $('#theme-btn'); if (b) b.innerHTML = ic(t === 'dark' ? 'sun' : 'moon');
}
ACT.theme = function () {
  var t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  store.set('ax_theme', t); applyTheme(t); buildMenu();
};

function openMenu() { $('#menu').classList.add('show'); $('#ovm').classList.add('show'); }
function closeMenu() { $('#menu').classList.remove('show'); $('#ovm').classList.remove('show'); }
ACT.menu = openMenu;
ACT['menu-close'] = closeMenu;

function companyById(id) { return S.companies.filter(function (c) { return c.id === id; })[0]; }

function buildMenu() {
  var u = S.user; if (!u) return;
  var isO = u.role === 'owner', r = parseHash(), h = '';
  var btn = function (href, icon, label, on, extra) {
    return '<button class="mb' + (on ? ' on' : '') + '" data-act="nav" data-h="' + href + '"><span class="mi-ic">' + ic(icon) + '</span><span>' + esc(label) + '</span>' + (extra || '') + '</button>';
  };
  if (isO) {
    h += '<div class="mg">মূল</div>' + btn('#/home', 'home', 'হোম — সব কোম্পানি', r.page === 'home' || !r.page);
    h += '<div class="mg">কোম্পানি</div>';
    S.companies.forEach(function (c) {
      h += btn('#/c/' + c.id + '/summary', 'building', c.name, r.page === 'c' && r.id === c.id, '<i class="dotc" style="background:' + esc(c.color) + '"></i>');
    });
    h += '<div class="mg">ব্যবস্থাপনা</div>' + btn('#/c/shared/clients', 'users', 'বাকি ক্লায়েন্ট (সবার)', r.page === 'c' && r.id === 'shared') +
      btn('#/c/shared/expenses', 'wallet', 'মালিকের খরচ', r.page === 'c' && r.id === 'shared' && r.tab === 'expenses') +
      btn('#/settings', 'cog', 'সেটিংস ও Excel ইমপোর্ট', r.page === 'settings');
  } else {
    h += '<div class="mg">আমার কোম্পানি</div>';
    S.companies.forEach(function (c) { h += btn('#/c/' + c.id + '/summary', 'building', c.name, r.page === 'c', '<i class="dotc" style="background:' + esc(c.color) + '"></i>'); });
  }
  h += '<div class="mg">অ্যাকাউন্ট</div>' +
    '<button class="mb" data-act="theme"><span class="mi-ic">' + ic(document.documentElement.getAttribute('data-theme') === 'dark' ? 'sun' : 'moon') + '</span><span>' + (document.documentElement.getAttribute('data-theme') === 'dark' ? 'লাইট মোড' : 'ডার্ক মোড') + '</span></button>' +
    '<button class="mb" data-act="pin-change"><span class="mi-ic">' + ic('key') + '</span><span>আমার PIN বদলান</span></button>' +
    '<button class="mb danger" data-act="logout"><span class="mi-ic">' + ic('logout') + '</span><span>লগ আউট</span></button>';
  $('#menu').innerHTML = '<div class="mh"><div class="lg">AX</div><div><div class="nm">' + esc(u.name) + '</div><div class="rl">' +
    (isO ? 'মালিক · সব কোম্পানি' : 'SO · ' + esc(u.companyName || '')) + '</div></div></div><div class="mi">' + h + '</div>';
}
ACT.nav = function (el) { closeMenu(); go(el.dataset.h); };

var TAB_NAMES = { summary: 'সারাংশ', day: 'দৈনিক এন্ট্রি', stock: 'স্টক', products: 'প্রোডাক্ট', money: 'হিসাব', clients: 'বাকি ক্লায়েন্ট', checks: 'সতর্কতা', access: 'অ্যাক্সেস' };
function setNav(r) {
  var name = 'হোম';
  if (r.page === 'c') {
    var c = r.id === 'shared' ? { name: 'মালিকের নিজস্ব' } : companyById(r.id);
    name = (c ? c.name : 'কোম্পানি') + ' · ' + (TAB_NAMES[r.tab || 'summary'] || '');
  } else if (r.page === 'settings') name = 'সেটিংস';
  $('#secname').textContent = name;
  buildMenu();
}

function tickClock() {
  var d = new Date(Date.now() + 6 * 3600e3), el = $('#clock'); if (!el) return;
  var h = d.getUTCHours(), m = d.getUTCMinutes();
  el.textContent = BN_D[d.getUTCDay()] + ', ' + d.getUTCDate() + ' ' + BN_M[d.getUTCMonth()] + ' · ' + (h % 12 || 12) + ':' + (m < 10 ? '0' : '') + m + (h < 12 ? ' AM' : ' PM');
}

async function enter(user) {
  S.user = user;
  $('#login').classList.add('hide'); $('#login').innerHTML = '';
  $('#app').classList.remove('hide');
  skeleton(3);
  var j = await api('company');
  S.companies = j.companies;
  if (!location.hash || location.hash === '#') history.replaceState(null, '', user.role === 'owner' ? '#/home' : '#/c/' + user.companyId + '/summary');
  tickClock();
  route();
}
