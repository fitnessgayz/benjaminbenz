// NODE_PATH=/Users/benjamingonzales/.local/lib/node_modules node tests/client-dashboard-back.browser.cjs
// PLAYWRIGHT_BROWSER=webkit runs the same checks with Safari's engine.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');

const source = fs.readFileSync(path.join(__dirname, '..', 'js/client-portal.js'), 'utf8');
function production(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}`);
  const next = source.slice(start + 1).search(/\nfunction [\w$]+\(/);
  assert.ok(next >= 0, `Missing boundary after ${name}`);
  return source.slice(start, start + next + 1);
}

const fixture = `
let activeClientDashboardTab = new URLSearchParams(location.search).get('tab') || 'home';
let clientDashboardBrowserHistoryReady = false;
let clientDashboardHistoryHasDetail = false;
let clientWorkoutPickerIsOpen = false, savedWorkoutScrollY = null;
let clientWebNotificationController = null, clientProfilePhotoController = null;
let clientAppleHealthController = null, clientGoogleHealthController = null;
window.FWB_CLIENT_WORKOUT_CALENDAR = { close() {} };
function syncClientDashboardMobileNavigationIcon() {}
function flushScheduledClientTrainingLogsRender() {}
function setClientSettingsView() {}
${production('clientDashboardHistoryUrl')}
${production('initializeClientDashboardBrowserHistory')}
${production('syncClientDashboardBrowserHistory')}
${production('setClientDashboardTab')}
initializeClientDashboardBrowserHistory(new Set(['home', 'workouts', 'logs']));
setClientDashboardTab(activeClientDashboardTab, { fromHistory: true });
`;

(async () => {
  const browserName = process.env.PLAYWRIGHT_BROWSER || 'chromium';
  const engine = { chromium, webkit }[browserName];
  assert.ok(engine, `Unsupported browser ${browserName}`);
  const browser = await engine.launch({ headless: true });
  try {
    for (const width of [360, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      await page.route('https://fixture.test/client-dashboard.html**', route => route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html><body><nav><button data-client-dashboard-tab="home">Home</button><button data-client-dashboard-tab="workouts">Workouts</button><button data-client-dashboard-tab="logs">Logs</button></nav><main><section data-client-dashboard-panel="home">Home panel</section><section data-client-dashboard-panel="workouts">Workout logger</section><section data-client-dashboard-panel="logs">Logs panel</section></main></body></html>'
      }));

      await page.goto('https://fixture.test/client-dashboard.html?v=1&tab=home');
      await page.addScriptTag({ content: fixture });
      await page.evaluate(() => {
        setClientDashboardTab('workouts');
        setClientDashboardTab('logs');
      });
      assert.equal(new URL(page.url()).searchParams.get('tab'), 'logs');
      await page.evaluate(() => history.back());
      await page.waitForFunction(() => activeClientDashboardTab === 'home');
      assert.equal(new URL(page.url()).searchParams.get('tab'), 'home');
      assert.equal(await page.locator('[data-client-dashboard-panel="home"]').isVisible(), true);
      assert.equal(await page.locator('[data-client-dashboard-panel="workouts"]').isVisible(), false);

      await page.evaluate(() => setClientDashboardTab('workouts'));
      await page.evaluate(() => setClientDashboardTab('home'));
      await page.waitForFunction(() => new URLSearchParams(location.search).get('tab') === 'home');
      assert.equal(await page.locator('[data-client-dashboard-panel="home"]').isVisible(), true);

      await page.goto('https://fixture.test/client-dashboard.html?v=1&tab=workouts');
      await page.addScriptTag({ content: fixture });
      assert.equal(await page.locator('[data-client-dashboard-panel="workouts"]').isVisible(), true);
      await page.evaluate(() => history.back());
      await page.waitForFunction(() => activeClientDashboardTab === 'home');
      assert.equal(new URL(page.url()).searchParams.get('tab'), 'home');
      assert.equal(await page.locator('[data-client-dashboard-panel="home"]').isVisible(), true);
      await page.close();
      process.stdout.write(`${browserName} ${width}px: browser Back returns client Home\n`);
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
