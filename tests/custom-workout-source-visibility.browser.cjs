// NODE_PATH=/Users/benjamingonzales/.local/lib/node_modules node tests/custom-workout-source-visibility.browser.cjs
// PLAYWRIGHT_BROWSER=webkit repeats the check with Safari's engine.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/client-portal.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'css/client-workout-compact-setup.css'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'client-dashboard.html'), 'utf8');
const messageButton = dashboard.match(/<button class="client-workouts-message-button"[\s\S]*?<\/button>/)?.[0];
assert.ok(messageButton, 'workout message control exists');

function production(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}`);
  const next = source.slice(start + 1).search(/\nfunction [\w$]+\(/);
  assert.ok(next >= 0, `Missing boundary after ${name}`);
  return source.slice(start, start + next + 1);
}

const fixture = `<!doctype html><html><head><style>${styles}</style></head><body class="client-dashboard-page">
  <section class="client-workout-panel client-workout-panel-custom" data-custom-workout-title="Custom Workout">
    <button data-workout-start data-workout-title="Custom Workout">Start workout</button>
    <input data-workout-date value="2026-11-09">
    <div class="workout-compact-source"><h3>Source</h3><button>Past workout</button><button>Saved program</button></div>
  </section>
  ${messageButton}
  <script>
    let workoutElapsedTimerState = null;
    const todayDate = () => '2026-11-09';
    const customWorkoutExerciseAddConfig = () => ({ count: 1, label: 'Add exercise' });
    const syncFloatingWorkoutFinishButtons = () => {};
    ${production('syncCustomWorkoutExerciseControls')}
    ${production('syncWorkoutStartButtons')}
    window.setWorkout = state => { workoutElapsedTimerState = state; syncWorkoutStartButtons(); };
  </script>
</body></html>`;

(async () => {
  const name = process.env.PLAYWRIGHT_BROWSER || 'chromium';
  const browser = await { chromium, webkit }[name].launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent(fixture);
    const visible = () => page.locator('.workout-compact-source').evaluate(node => ({
      hidden: node.hidden,
      display: getComputedStyle(node).display
    }));
    await page.evaluate(() => syncWorkoutStartButtons());
    assert.deepEqual(await visible(), { hidden: false, display: 'grid' });

    await page.evaluate(() => {
      const card = document.createElement('article');
      card.dataset.customExerciseCard = '';
      document.querySelector('.client-workout-panel-custom').append(card);
      syncWorkoutStartButtons();
    });
    assert.deepEqual(await visible(), { hidden: true, display: 'none' }, `${name}: picked exercise hides Source`);

    await page.evaluate(() => {
      document.querySelector('[data-custom-exercise-card]').remove();
      syncWorkoutStartButtons();
    });
    assert.deepEqual(await visible(), { hidden: false, display: 'grid' });

    await page.evaluate(() => window.setWorkout({ workoutTitle: 'Custom Workout', workoutDate: '2026-11-09', running: true }));
    assert.deepEqual(await visible(), { hidden: true, display: 'none' }, `${name}: starting hides Source`);
    await page.evaluate(() => window.setWorkout({ workoutTitle: 'Another Workout', workoutDate: '2026-11-09', running: true }));
    assert.deepEqual(await visible(), { hidden: false, display: 'grid' }, `${name}: another workout does not hide Source`);
    await page.evaluate(() => window.setWorkout(null));
    assert.deepEqual(await visible(), { hidden: false, display: 'grid' }, `${name}: fresh workout restores Source`);

    const message = await page.locator('.client-workouts-message-button').evaluate(node => ({
      hasIcon: Boolean(node.querySelector('svg')),
      hasVisibleTitle: Boolean(node.querySelector('span:not(.client-dashboard-nav-unread)'))
    }));
    assert.deepEqual(message, { hasIcon: true, hasVisibleTitle: false }, `${name}: message control is icon-only`);
    await page.close();
    console.log(`${name}: Source hides after exercise selection or Start; message control is icon-only`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
