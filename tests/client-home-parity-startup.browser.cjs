// Run: NODE_PATH=<runtime node_modules> node tests/client-home-parity-startup.browser.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');

(async () => {
  const dashboard = fs.readFileSync(path.join(root, 'client-dashboard.html'), 'utf8');
  const start = dashboard.indexOf('<section class="progress-panel client-home-panel"');
  const end = dashboard.indexOf('<section class="client-workouts-panel"', start);
  const home = start >= 0 && end > start ? dashboard.slice(start, end) : '';
  assert.ok(home, 'Home dashboard markup is available');

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent(`<main>${home}</main>`);
    await page.addScriptTag({ path: path.join(root, 'js/client-home-parity.js') });
    await page.evaluate(() => {
      window.FWB_CLIENT_HOME_PARITY.configure(null, 'client@example.com', true);
      window.FWB_CLIENT_HOME_PARITY.render([{
        session_id: 'session-1', entry_date: '2026-11-05', completed_at: '2026-11-05T19:00:00Z',
        workout_title: 'Custom Workout', exercise_code: 'BENCH', set_number: 1,
        weight_used: 100, reps: 8, workout_duration_seconds: 1800
      }], { workouts: [{ title: 'Strength Day', exercises: [{ name: 'Bench Press' }] }] });
    });
    assert.deepEqual(errors, []);
    assert.equal(await page.locator('[data-client-last-title]').textContent(), 'Custom Workout');
    assert.equal(await page.locator('[data-client-home-suggestion]').textContent(), 'Strength Day');
    assert.equal(await page.locator('[data-client-home-next-day]').textContent(), 'Ready when you are');
    assert.equal(await page.locator('[data-copy-workout-to-custom]').getAttribute('data-copy-workout-to-custom'), 'session:session-1');
    assert.equal(await page.locator('[data-client-home-week-streak]').textContent(), await page.locator('[data-client-home-streak]').textContent());
    console.log('Home parity startup rendered without a page error.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
