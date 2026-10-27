/* ───────── boot ───────── */
(async function boot() {
  applyTheme(store.get('ax_theme') || (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  $('#theme-btn').innerHTML = ic(document.documentElement.getAttribute('data-theme') === 'dark' ? 'sun' : 'moon');
  $('#menu-btn').innerHTML = ic('menu');
  setInterval(tickClock, 30000);
  var tok = store.get('ax_token'), user = null;
  var minShow = new Promise(function (r) { setTimeout(r, 1100); });
  if (tok) {
    S.token = tok;
    try { user = (await api('auth?action=me')).user; } catch (e) { S.token = ''; store.del('ax_token'); }
  }
  await minShow;
  $('#spl').classList.add('fade'); setTimeout(function () { $('#spl').remove(); }, 600);
  if (user) { try { await enter(user); } catch (e) { logout(true, e.message); } }
  else showLogin();
})();
