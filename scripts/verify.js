// End-to-end verification: drive installed Chrome with iPhone 15 emulation,
// visit every tab, capture screenshots, and fail on console errors,
// horizontal overflow, or missing PWA plumbing.
const puppeteer = require('puppeteer-core');
const path = require('path');

const BASE = process.env.BASE_URL || 'http://localhost:8642/index.html';
const OUT = path.join(__dirname, '..', 'docs', 'screens');
const VIEWS = ['today', 'report', 'observe', 'learn', 'safety',
  'learn/backcountry-tips', 'report--vic', 'report--hazards'];

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
      'report--vic': 'VIC Dividing Range', 'report--hazards': 'Wind chill'
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
