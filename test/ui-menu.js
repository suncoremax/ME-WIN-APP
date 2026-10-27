// Mobile: the slide menu must be ABOVE its dimmed overlay and clickable (regression: it was trapped under the blur).
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await p.goto('http://localhost:3100/'); await p.waitForSelector('.pad');
  for (const d of '54321') await p.click(`.pad [data-k="${d}"]`);
  const sawBusy = await p.waitForSelector('.lg-card.busy .spn', { timeout: 1500 }).then(() => true).catch(() => false);
  await p.waitForSelector('#app:not(.hide) .page'); await p.waitForTimeout(500);
  await p.click('#menu-btn'); await p.waitForTimeout(500);
  const top = await p.evaluate(() => { const e = document.elementFromPoint(100, 300); return e.closest('#menu') ? 'menu' : e.id || e.className; });
  console.log('element at menu position:', top, '| spinner shown during login:', sawBusy);
  await p.click('#menu .mb >> nth=2'); await p.waitForTimeout(800);
  console.log('after click → hash', await p.evaluate(() => location.hash), '| overlay shown:', await p.evaluate(() => document.getElementById('ovm').classList.contains('show')));
  await b.close(); process.exit(top === 'menu' ? 0 : 1);
})();
