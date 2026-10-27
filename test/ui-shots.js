const { chromium } = require('playwright');
const OUT = process.argv[2];
(async () => {
  const b = await chromium.launch();
  const errs = [];
  async function newPage(w = 390, h = 844, dark = false) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: dark ? 'dark' : 'light', timezoneId: 'Asia/Dhaka' });
    const p = await ctx.newPage();
    p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    p.on('pageerror', e => errs.push('pageerror: ' + e.message));
    return p;
  }
  async function login(p, pin) {
    await p.goto('http://localhost:3100/');
    await p.waitForSelector('.pad', { timeout: 8000 });
    for (const d of pin) await p.click(`.pad [data-k="${d}"]`);
    await p.waitForSelector('#app:not(.hide) .page', { timeout: 8000 });
    await p.waitForTimeout(500);
  }
  const shot = async (p, n) => p.screenshot({ path: `${OUT}/${n}.png` });

  // splash + login screen
  let p = await newPage();
  await p.goto('http://localhost:3100/'); await p.waitForTimeout(400); await shot(p, '00-splash');
  await p.waitForSelector('.pad'); await shot(p, '01-login');
  // wrong pin
  for (const d of '99999') await p.click(`.pad [data-k="${d}"]`);
  await p.waitForTimeout(500); await shot(p, '02-login-wrong');
  console.log('wrong pin error text:', await p.textContent('#lgerr'));
  await login(p, '54321');
  await shot(p, '10-home-top');
  await p.evaluate(() => document.querySelector('#view').scrollTo(0, 700)); await p.waitForTimeout(300); await shot(p, '11-home-mid');
  await p.evaluate(() => document.querySelector('#view').scrollTo(0, 1500)); await p.waitForTimeout(300); await shot(p, '12-home-cards');
  // menu
  await p.evaluate(() => document.querySelector('#view').scrollTo(0, 0));
  await p.click('#menu-btn'); await p.waitForTimeout(400); await shot(p, '13-menu'); await p.click('#ovm', { position: { x: 350, y: 400 } }); await p.waitForTimeout(300);
  // company
  await p.goto('http://localhost:3100/#/c/1/summary'); await p.waitForSelector('.cohd'); await p.waitForSelector('.kpi'); await p.waitForTimeout(500);
  await shot(p, '20-co-summary');
  await p.evaluate(() => document.querySelector('#view').scrollTo(0, 800)); await p.waitForTimeout(300); await shot(p, '21-co-summary-table');
  await p.evaluate(() => document.querySelector('#view').scrollTo(0, 1900)); await p.waitForTimeout(300); await shot(p, '22-co-summary-bottom');
  for (const [tab, n] of [['day/2026-10-26', '30-day'], ['stock', '40-stock'], ['products', '41-products'], ['money', '50-money'], ['clients', '51-clients'], ['checks', '60-checks'], ['access', '70-access']]) {
    await p.goto('http://localhost:3100/#/c/1/' + tab); await p.waitForTimeout(1200); await shot(p, n);
  }
  await p.goto('http://localhost:3100/#/c/1/day/2026-10-26'); await p.waitForTimeout(1000);
  await p.evaluate(() => document.querySelector('#view').scrollTo(0, 600)); await p.waitForTimeout(300); await shot(p, '31-day-scroll');
  await p.goto('http://localhost:3100/#/settings'); await p.waitForTimeout(1000); await shot(p, '80-settings');

  // desktop owner
  const d = await newPage(1280, 800); await login(d, '54321'); await d.waitForTimeout(800); await shot(d, '90-desktop-home');
  await d.goto('http://localhost:3100/#/c/2/summary'); await d.waitForTimeout(1200); await shot(d, '91-desktop-company');
  // dark
  const k = await newPage(390, 844, true); await login(k, '54321'); await k.waitForTimeout(600); await shot(k, '95-dark-home');

  // SO
  const s = await newPage(); await login(s, '22222'); await s.waitForTimeout(800); await shot(s, '96-so-home');
  console.log('SO sees hash:', await s.evaluate(() => location.hash), '| menu items:', await s.$$eval('#menu .mb', e => e.map(x => x.textContent.trim())));
  console.log('SO tabs:', await s.$$eval('.tab', e => e.map(x => x.textContent.trim())));
  await s.goto('http://localhost:3100/#/c/1/summary'); await s.waitForTimeout(1200);
  console.log('SO forced back to hash:', await s.evaluate(() => location.hash));
  await s.goto('http://localhost:3100/#/home'); await s.waitForTimeout(1200);
  console.log('SO after #/home:', await s.evaluate(() => location.hash));
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
