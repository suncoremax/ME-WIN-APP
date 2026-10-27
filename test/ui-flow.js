// Interactive flows in a real browser: day entry as SO, import through the UI, role isolation.
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.argv[2], XLS = process.argv[3];
(async () => {
  const b = await chromium.launch(); const errs = []; let fails = 0;
  const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ FAIL ') + m); if (!c) fails++; };
  async function page(pin) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Dhaka', acceptDownloads: true });
    await ctx.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync('node_modules/xlsx/dist/xlsx.full.min.js') }));
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load/.test(m.text())) errs.push(m.text()); });
    await p.goto('http://localhost:3100/'); await p.waitForSelector('.pad');
    for (const d of pin) await p.click(`.pad [data-k="${d}"]`);
    await p.waitForSelector('#app:not(.hide) .page'); await p.waitForTimeout(600);
    return p;
  }
  // ── SO enters today's sales
  const so = await page('22222');
  await so.goto('http://localhost:3100/#/c/2/day'); await so.waitForSelector('.tot'); await so.waitForTimeout(800);
  ok(await so.$('[data-act="day-save"]') !== null, 'SO can edit today');
  await so.click('[data-act="pick-open"][data-sec="sale"]'); await so.waitForSelector('#pk-list button');
  await so.click('#pk-list button >> nth=0'); await so.click('#pk-list button >> nth=1');
  await so.click('[data-act="pick-done"]'); await so.waitForTimeout(500);
  const qtys = await so.$$('.ln [data-f="qty"]'); ok(qtys.length === 2, 'two lines added');
  await qtys[0].fill('10'); await qtys[1].fill('5');
  await so.fill('#d-memo', '1000');
  const net1 = await so.textContent('[data-t="net"]'); console.log('  net shown:', net1);
  await so.click('[data-act="day-save"]'); await so.waitForTimeout(1200);
  ok(/সেভ হয়েছে/.test(await so.textContent('#toast')), 'saved toast');
  await so.screenshot({ path: OUT + '/35-so-day-saved.png' });
  // dirty guard
  await so.fill('#d-memo', '1234'); await so.evaluate(() => { location.hash = '#/c/2/stock'; }); await so.waitForTimeout(500);
  ok(/সেভ না করা/.test(await so.textContent('#sheet')), 'unsaved-changes guard shown');
  await so.click('[data-act="cf-no"]'); await so.waitForTimeout(400);
  ok((await so.evaluate(() => location.hash)).includes('/day'), 'stays on the day page');
  await so.click('[data-act="day-save"]'); await so.waitForTimeout(1000);
  // SO cannot reach another company through the URL
  await so.goto('http://localhost:3100/#/c/1/summary'); await so.waitForTimeout(1000);
  ok((await so.evaluate(() => location.hash)).startsWith('#/c/2/'), 'SO redirected away from company 1');
  const leak = await so.evaluate(async () => (await fetch('/api/report?action=company&company_id=1', { headers: { Authorization: 'Bearer ' + localStorage.getItem('ax_token') } })).status);
  ok(leak === 403, 'SO API call for company 1 is 403 (got ' + leak + ')');
  // old day read-only
  await so.goto('http://localhost:3100/#/c/2/day/2026-10-05'); await so.waitForTimeout(1000);
  ok(await so.$('[data-act="day-save"]') === null, 'SO sees old day read-only');

  // ── owner: import through the UI
  const ow = await page('54321');
  await ow.goto('http://localhost:3100/#/settings'); await ow.waitForSelector('#imp-f', { state: 'attached' });
  await ow.setInputFiles('#imp-f', XLS); await ow.waitForSelector('#imp-out table', { timeout: 20000 });
  const rows = await ow.$$eval('#imp-out tbody tr', t => t.map(r => r.innerText.replace(/\s+/g, ' ')));
  console.log('  preview:', rows);
  ok(rows.length === 4 && rows.every(r => /মিলেছে/.test(r)), 'preview matches Excel for all 4 companies');
  await ow.screenshot({ path: OUT + '/81-import-preview.png', fullPage: false });
  await ow.click('[data-act="imp-go"]'); await ow.waitForSelector('[data-act="cf-yes"]'); await ow.click('[data-act="cf-yes"]');
  await ow.waitForSelector('#imp-out .alert.g', { timeout: 30000 }); await ow.waitForTimeout(500);
  console.log('  import result:', (await ow.textContent('#imp-out')).replace(/\s+/g, ' ').slice(0, 300));
  await ow.screenshot({ path: OUT + '/82-import-done.png' });
  await ow.goto('http://localhost:3100/#/home'); await ow.waitForTimeout(1500);
  const txt = await ow.textContent('#view');
  ok(/5,87,677\.48/.test(txt), 'dashboard shows ৳5,87,677.48 after re-import');
  // owner adds SO via UI
  await ow.goto('http://localhost:3100/#/c/3/access'); await ow.waitForTimeout(1000);
  await ow.click('[data-act="so-edit"]:not([data-id])'); await ow.fill('#so-n', 'নতুন SO'); await ow.click('[data-act="so-gen"]'); await ow.waitForTimeout(500);
  const pin = await ow.inputValue('#so-p'); ok(/^\d{5}$/.test(pin), 'generated PIN ' + pin);
  await ow.click('[data-act="so-save"]'); await ow.waitForTimeout(1000);
  ok(/PIN:/.test(await ow.textContent('#sheet')), 'PIN shown once to owner');
  await ow.screenshot({ path: OUT + '/71-so-pin-shown.png' });
  // export
  await ow.keyboard.press('Escape'); await ow.evaluate(() => { location.reload(); }); await ow.waitForTimeout(2000);
  await ow.goto('http://localhost:3100/#/c/1/summary'); await ow.waitForSelector('[data-act="export-co"]');
  const [dl] = await Promise.all([ow.waitForEvent('download', { timeout: 20000 }), ow.click('[data-act="export-co"]')]);
  ok(/\.xlsx$/.test(dl.suggestedFilename()), 'Excel export downloads: ' + dl.suggestedFilename());
  console.log('ERRORS:', errs.length ? errs : 'none'); await b.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
