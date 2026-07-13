// End-to-end verification: drive installed Chrome with iPhone 15 emulation,
// visit every tab, capture screenshots, and fail on console errors,
// horizontal overflow, or missing PWA plumbing.
const puppeteer = require('puppeteer-core');
const path = require('path');

const BASE = process.env.BASE_URL || 'http://localhost:8642/index.html';
const OUT = path.join(__dirname, '..', 'docs', 'screens');
const VIEWS = ['today', 'report', 'observe', 'learn', 'safety',
  'learn/backcountry-tips', 'report--vic', 'report--hazards', 'account'];

const iPhone = {
  viewport: { width: 393, height: 852, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
};

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new'
  });
  const page = await browser.newPage();
  await page.setUserAgent(iPhone.userAgent);
  await page.setViewport(iPhone.viewport);
  // deterministic tests: pin the app to bundled sample data (no live fetch)
  await page.evaluateOnNewDocument(() => localStorage.setItem('msc.disableLive', '1'));

  // page.type/page.click do a one-shot element lookup that intermittently
  // goes stale after same-document hash navigations (evaluate() keeps seeing
  // the element; the isolated-world query returns null). waitForSelector
  // polls, so interactions ride out the context churn.
  const type = async (sel, text) => (await page.waitForSelector(sel, { timeout: 8000 })).type(text);
  const click = async (sel) => (await page.waitForSelector(sel, { timeout: 8000 })).click();

  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console error: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));

  await page.goto(BASE + '#/today', { waitUntil: 'networkidle2' });

  // PWA plumbing checks
  const manifestOk = await page.$eval('link[rel="manifest"]', (l) => !!l.href).catch(() => false);
  const touchIconOk = await page.$eval('link[rel="apple-touch-icon"]', (l) => !!l.href).catch(() => false);
  if (!manifestOk) problems.push('manifest link missing');
  if (!touchIconOk) problems.push('apple-touch-icon missing');

  for (const view of VIEWS) {
    let name = view.replace('/', '_');
    if (view === 'report--vic') {
      await page.evaluate(() => { localStorage.setItem('msc.region', 'dividing-range'); location.hash = '#/report'; });
    } else if (view === 'report--hazards') {
      await page.evaluate(() => { sessionStorage.setItem('msc.reportTab', 'hazards'); location.hash = '#/x'; location.hash = '#/report'; });
    } else {
      await page.evaluate((v) => {
        localStorage.setItem('msc.region', 'main-range');
        location.hash = '#/' + v;
      }, view);
    }
    await new Promise((r) => setTimeout(r, 450));

    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) problems.push(`${view}: horizontal overflow ${overflow}px`);

    const MARKERS = {
      today: 'DAY SCORE', report: 'Conditions report', observe: 'Observations',
      learn: 'Learn', safety: 'Call 000', 'learn/backcountry-tips': 'Ten backcountry',
      'report--vic': 'VIC Dividing Range', 'report--hazards': 'Primary hazard',
      account: 'Demo accounts'
    };
    const text = await page.evaluate(() => document.querySelector('#view').innerText);
    const marker = MARKERS[view];
    if (marker && !text.toLowerCase().includes(marker.toLowerCase()))
      problems.push(`${view}: expected marker "${marker}" not found`);

    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  }

  // full-length capture of today for design review
  await page.evaluate(() => { location.hash = '#/today'; });
  await new Promise((r) => setTimeout(r, 450));
  await page.screenshot({ path: path.join(OUT, 'today-full.png'), fullPage: true });

  // interactions: hazard-chip sheet and aspect-rose sheet
  await page.evaluate(() => { localStorage.setItem('msc.region', 'main-range'); location.hash = '#/today'; });
  await new Promise((r) => setTimeout(r, 450));
  await click('[data-hazard="exposure"]');
  await new Promise((r) => setTimeout(r, 350));
  let sheetText = await page.evaluate(() => document.querySelector('#sheet-root .sheet')?.innerText || '');
  if (!sheetText.toLowerCase().includes('exposure')) problems.push('hazard sheet did not open');
  await page.screenshot({ path: path.join(OUT, 'sheet-hazard.png') });
  await click('.sheet-close');
  await new Promise((r) => setTimeout(r, 300));
  await click('[data-aspect="SE"]');
  await new Promise((r) => setTimeout(r, 350));
  sheetText = await page.evaluate(() => document.querySelector('#sheet-root .sheet')?.innerText || '');
  if (!sheetText.toLowerCase().includes('south-east')) problems.push('aspect sheet did not open');
  await page.screenshot({ path: path.join(OUT, 'sheet-aspect.png') });
  await click('.sheet-backdrop');

  // account flow: forecaster login → editor gate opens
  await page.evaluate(() => { localStorage.clear(); location.hash = '#/account'; });
  await new Promise((r) => setTimeout(r, 450));
  await type('#lg-user', 'forecaster');
  await type('#lg-pin', '2626');
  await click('#login-form .btn');
  await new Promise((r) => setTimeout(r, 400));
  const acctText = await page.evaluate(() => document.querySelector('#view').innerText.toLowerCase());
  if (!acctText.includes('edit forecast')) problems.push('forecaster login did not unlock editor');
  await page.screenshot({ path: path.join(OUT, 'account-forecaster.png') });
  await page.evaluate(() => { location.hash = '#/edit'; });
  await new Promise((r) => setTimeout(r, 450));
  const editText = await page.evaluate(() => document.querySelector('#view').innerText.toLowerCase());
  if (!editText.includes('publish update')) problems.push('forecast editor did not render');
  await page.screenshot({ path: path.join(OUT, 'editor.png') });

  // admin user management: create account, sign in as it
  await page.evaluate(() => { location.hash = '#/account'; });
  await new Promise((r) => setTimeout(r, 450));
  await page.evaluate(() => {
    document.getElementById('au-name').value = 'Test Patroller';
    document.getElementById('au-user').value = 'patroller1';
    document.getElementById('au-pin').value = '4321';
    document.getElementById('au-role').value = 'observer';
    document.getElementById('adduser-form').requestSubmit();
  });
  await new Promise((r) => setTimeout(r, 500));
  const userList = await page.evaluate(() => document.querySelector('#view').innerText.toLowerCase());
  if (!userList.includes('patroller1')) problems.push('admin user creation failed');
  await page.evaluate(() => { localStorage.removeItem('msc.session'); render(); });
  await new Promise((r) => setTimeout(r, 450));
  await type('#lg-user', 'patroller1');
  await type('#lg-pin', '4321');
  await click('#login-form .btn');
  await new Promise((r) => setTimeout(r, 500));
  const newUserAcct = await page.evaluate(() => document.querySelector('#view').innerText.toLowerCase());
  if (!newUserAcct.includes('test patroller')) problems.push('created user could not sign in');

  // observer flow: field-data form renders
  // (hash is already #/account here, so assigning it again would be a no-op
  // — re-render explicitly after dropping the session)
  await page.evaluate(() => { localStorage.removeItem('msc.session'); render(); });
  await new Promise((r) => setTimeout(r, 450));
  await type('#lg-user', 'observer');
  await type('#lg-pin', '1850');
  await click('#login-form .btn');
  await new Promise((r) => setTimeout(r, 400));
  await page.evaluate(() => { location.hash = '#/observe'; });
  await new Promise((r) => setTimeout(r, 450));
  const obsText = await page.evaluate(() => document.querySelector('#view').innerText.toLowerCase());
  if (!obsText.includes('snow profile')) problems.push('observer field-data form did not render');
  await page.screenshot({ path: path.join(OUT, 'observer-form.png') });

  // member tier: archive gated for guests, open after member login
  await page.evaluate(() => { localStorage.removeItem('msc.session'); location.hash = '#/archive'; });
  await new Promise((r) => setTimeout(r, 450));
  let archText = await page.evaluate(() => document.querySelector('#view').innerText.toLowerCase());
  if (!archText.includes('member feature')) problems.push('archive not gated for base tier');
  await page.evaluate(() => { location.hash = '#/account'; });
  await new Promise((r) => setTimeout(r, 450));
  await type('#lg-user', 'member');
  await type('#lg-pin', '0000');
  await click('#login-form .btn');
  await new Promise((r) => setTimeout(r, 400));
  await page.evaluate(() => { location.hash = '#/archive'; });
  await new Promise((r) => setTimeout(r, 450));
  archText = await page.evaluate(() => document.querySelector('#view').innerText.toLowerCase());
  if (!archText.includes('report date')) problems.push('member archive did not unlock');
  await page.screenshot({ path: path.join(OUT, 'archive-member.png') });

  // dark mode toggle
  await page.evaluate(() => { localStorage.removeItem('msc.session'); location.hash = '#/today'; });
  await new Promise((r) => setTimeout(r, 400));
  // DOM-dispatched click: page.click's one-shot lookup can go stale after
  // hash navigations (same churn the type/click helpers above absorb).
  const themeBefore = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  await page.evaluate(() => document.getElementById('theme-btn').click());
  await new Promise((r) => setTimeout(r, 250));
  const themeAfter = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  if (themeAfter === themeBefore) problems.push(`dark mode toggle failed (stayed ${themeBefore})`);
  if (themeAfter === 'dark') await page.screenshot({ path: path.join(OUT, 'today-dark.png') });
  await page.evaluate(() => { if (document.documentElement.getAttribute('data-theme') !== 'light') document.getElementById('theme-btn').click(); });
  const themeFinal = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  if (themeFinal !== 'light') problems.push('theme did not toggle back to light');

  // service worker registration (http localhost counts as secure context)
  const swOk = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    const reg = await navigator.serviceWorker.getRegistration();
    return !!reg;
  });
  if (!swOk) problems.push('service worker not registered');

  await browser.close();

  if (problems.length) {
    console.log('PROBLEMS:\n' + problems.join('\n'));
    process.exit(1);
  }
  console.log('ALL CHECKS PASSED — screenshots in docs/screens/');
})();
