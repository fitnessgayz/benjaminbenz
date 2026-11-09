// Production quick-workout markup and dashboard styles, with synthetic data only.
// NODE_PATH=<runtime node_modules> node tests/client-quick-workout-primary.browser.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const playwright = require('playwright');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/client-portal.js'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'client-dashboard.html'), 'utf8');
const styles = [...dashboard.matchAll(/<link[^>]+href="\/?(css\/[^"?]+)[^>]*>/g)]
  .map(match => fs.readFileSync(path.join(root, match[1]), 'utf8')).join('\n');
function production(name) {
  const match = new RegExp(`(?:async )?function ${name}\\(`).exec(source);
  assert.ok(match, `Missing ${name}`);
  const following = source.slice(match.index + match[0].length);
  const end = following.search(/\n(?:async )?function [\w$]+\(/);
  assert.ok(end >= 0, `Missing function boundary for ${name}`);
  return source.slice(match.index, match.index + match[0].length + end);
}
const functions = [
  'workoutStartControlMarkup', 'workoutActionsMarkup', 'customWorkoutGroupedRoundCardMarkup',
  'customWorkoutCarouselGroupMarkup', 'customWorkoutCarouselMarkup',
  'customWorkoutPanelMarkup', 'regroupCustomWorkoutCarousels',
  'floatingWorkoutFinishMarkup', 'syncFloatingWorkoutFinishButtons', 'syncWorkoutStartButtons'
].map(production).join('\n');
const fixture = `
var activeCustomWorkoutFormat = 'single', workoutElapsedTimerState = null;
var customWorkoutTitle = 'Custom Workout', fixtureExercises = [];
function escapeHtml(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }
function todayDate() { return '2026-11-06'; }
function formatLogDate() { return 'Nov 6, 2026'; }
function activeCustomWorkoutDraft() { return null; }
function normalizeCustomWorkoutFormat(value) { return value; }
function normalizeCustomWorkoutInlineGroupType(value) { return value || 'single'; }
function customWorkoutExercises() { return fixtureExercises; }
function customWorkoutCopyStatusMessage() { return ''; }
function customWorkoutStorageTitle() { return 'Custom Workout'; }
function storedWorkoutGymLocation() { return 'Gym'; }
function workoutGymPickerMarkup() { return ''; }
function customWorkoutFormatPickerMarkup() { return ''; }
function clientWorkoutChoiceContent() { return ''; }
function workoutExerciseListMarkup() { return ''; }
function workoutCarouselExerciseCode(format, group, index) { return String(index + 1); }
function setCountFromPrescription() { return 1; }
function customWorkoutGroupNameEditorMarkup() { return ''; }
function customWorkoutCardMarkup(exercise) { return '<article data-custom-exercise-card><div data-exercise-log>' + escapeHtml(exercise.name) + '</div></article>'; }
function customWorkoutMixedGroups(exercises) { return exercises.map((exercise, index) => ({ index, startIndex: index, format: 'single', items: [exercise] })); }
function customWorkoutCarousels(panel) { return [...panel.querySelectorAll('[data-custom-workout-carousel]')]; }
function customWorkoutCarouselCards(carousel) { return carousel ? [...carousel.querySelectorAll('[data-custom-exercise-card]')] : []; }
${functions}
function renderCase(format, names, active) {
  activeCustomWorkoutFormat = format;
  fixtureExercises = names.map((name, index) => ({ name, code: 'EX' + index, group: 0, prescription: '1 set' }));
  workoutElapsedTimerState = active ? { workoutTitle: 'Custom Workout', workoutDate: todayDate(), running: true } : null;
  document.querySelector('#client-workout-panels').innerHTML = customWorkoutPanelMarkup(0);
  const panel = document.querySelector('.client-workout-panel-custom');
  panel.hidden = false;
  panel.classList.add('is-active');
  syncWorkoutStartButtons();
}
function renderAssignedCase(active) {
  workoutElapsedTimerState = active ? { workoutTitle: 'Trainer Workout', workoutDate: todayDate(), running: true } : null;
  document.querySelector('#client-workout-panels').innerHTML = '<section class="client-workout-panel client-workout-panel-assigned is-active" data-custom-workout-title="Trainer Workout">'
    + '<input data-workout-date value="' + todayDate() + '">'
    + workoutStartControlMarkup('Trainer Workout')
    + floatingWorkoutFinishMarkup({ assigned: true }) + '</section>';
  syncWorkoutStartButtons();
}
`;

(async () => {
  const browserName = process.env.PLAYWRIGHT_BROWSER || 'chromium';
  const browser = await playwright[browserName].launch({ headless: true });
  try {
    for (const width of [360, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style></head><body class="dashboard-page client-dashboard-page"><nav class="client-dashboard-tabs" aria-label="FWB Training sections"><button>Home</button><button>Workouts</button></nav><button class="client-dashboard-mobile-nav-toggle">Navigation</button><section id="client-workouts-panel"><div id="client-workout-panels"></div></section></body></html>`);
      await page.addScriptTag({ content: fixture });
      for (const [format, names] of [
        ['single', []], ['superset', []], ['circuit', []], ['single', ['Leg Press']],
        ['superset', ['Leg Press', 'Chest Press']],
        ['circuit', ['Leg Press', 'Chest Press', 'Cable Row']]
      ]) {
        await page.evaluate(([f, n]) => renderCase(f, n, false), [format, names]);
        if (names.length === 0) {
          await page.evaluate(() => regroupCustomWorkoutCarousels(document.querySelector('.client-workout-panel-custom')));
          assert.equal(await page.locator('.client-workout-panel-custom [data-custom-workout-carousel]').count(), 0,
            `${format} must not show a blank exercise group before a choice`);
          assert.equal(await page.locator('.client-workout-panel-custom [data-custom-workout-launcher-add]').isVisible(), true,
            `${format} must show Add first exercise`);
        }
        const primary = page.locator('.client-workout-panel-custom [data-workout-start]');
        assert.equal(await primary.innerText(), 'Start workout', `${format} initial label`);
        assert.equal(await primary.isVisible(), false, `${format} top Start hidden on mobile`);
        assert.equal(await page.locator('[data-floating-workout-start-action]').isVisible(), true,
          `${format} floating Start visible`);
        assert.equal(await page.locator('.client-dashboard-tabs').isVisible(), false,
          `${format} logger setup hides the navigation bar`);
        assert.equal(await page.locator('[data-floating-workout-reset-action]').isVisible(), true,
          `${format} floating Reset visible`);
        assert.equal(await page.locator('[data-floating-workout-more]').isVisible(), false,
          `${format} More hidden until workout starts`);
        assert.equal(await page.locator('.workout-floating-finish').evaluate(bar => {
          const rect = bar.getBoundingClientRect();
          return getComputedStyle(bar).position === 'fixed' && rect.left >= 0 && rect.right <= innerWidth;
        }), true, `${format} action bar fits the phone viewport`);
        assert.ok(await page.locator('.workout-floating-finish').evaluate(bar =>
          innerHeight - bar.getBoundingClientRect().bottom <= 12),
        `${format} Start action also sits at the bottom of the logger`);
        assert.equal(await page.locator('.client-workout-panel-custom [data-custom-workout-default-finish] .workout-finish-button').isVisible(), false,
          `${format} legacy Finish hidden`);
        assert.equal(await page.locator('.client-workout-panel-custom [data-workout-finish-later]').filter({ visible: true }).count(), 0,
          `${format} legacy Finish later hidden`);
        const grouped = page.locator('.client-workout-panel-custom .custom-workout-grouped-actions');
        if (await grouped.count()) assert.equal(await grouped.isVisible(), false, `${format} grouped footer hidden`);
        await page.evaluate(([f, n]) => renderCase(f, n, true), [format, names]);
        assert.equal(await primary.innerText(), 'Finish workout', `${format} active label`);
        assert.equal(await page.locator('[data-floating-workout-finish-action]').isVisible(), true,
          `${format} floating Finish visible`);
        assert.equal(await page.locator('.client-dashboard-tabs').isVisible(), false,
          `${format} logger hides the navigation bar`);
        assert.equal(await page.locator('.client-dashboard-mobile-nav-toggle').isVisible(), false,
          `${format} logger hides the mobile navigation control`);
        assert.ok(await page.locator('.workout-floating-finish').evaluate(bar =>
          innerHeight - bar.getBoundingClientRect().bottom <= 12),
        `${format} save action moves to the bottom of the viewport`);
        assert.equal(await page.locator('[data-floating-workout-reset-action]').isVisible(), false,
          `${format} direct Reset hidden after Start`);
        assert.equal(await page.locator('[data-floating-workout-more]').isVisible(), true,
          `${format} reset menu available after Start`);
        assert.equal(await page.locator('[data-floating-workout-more] [data-reset-custom-workout]').isVisible(), false,
          `${format} Reset requires opening More`);
        await page.locator('[data-floating-workout-more] > summary').click();
        assert.equal(await page.locator('[data-floating-workout-more] [data-reset-custom-workout]').isVisible(), true,
          `${format} More reveals Reset`);
        assert.equal(await page.locator('[data-floating-workout-more] > div').evaluate(menu => {
          const rect = menu.getBoundingClientRect();
          return rect.left >= 0 && rect.right <= innerWidth;
        }), true, `${format} reset menu fits the phone viewport`);
      }
      for (const active of [false, true]) {
        await page.evaluate(active => renderAssignedCase(active), active);
        assert.equal(await page.locator('.client-workout-panel-assigned > .workout-start-control').isVisible(), false,
          'trainer Start control is replaced by the floating bar on mobile');
        assert.equal(await page.locator('[data-floating-workout-start-action]').isVisible(), !active,
          'trainer floating Start follows session state');
        assert.equal(await page.locator('[data-floating-workout-finish-action]').isVisible(), active,
          'trainer floating Finish follows session state');
        assert.equal(await page.locator('.client-dashboard-tabs').isVisible(), false,
          'trainer logger keeps navigation hidden before and after Start');
        assert.equal(await page.locator('[data-floating-workout-more]').isVisible(), active,
          'trainer reset menu follows session state');
        if (active) {
          assert.equal(await page.locator('[data-floating-workout-more] [data-reset-assigned-workout]').isVisible(), false,
            'trainer Reset requires opening More');
          await page.locator('[data-floating-workout-more] > summary').click();
          assert.equal(await page.locator('[data-floating-workout-more] [data-reset-assigned-workout]').isVisible(), true,
            'trainer More reveals Reset');
          assert.equal(await page.locator('[data-floating-workout-more] > div').evaluate(menu => {
            const rect = menu.getBoundingClientRect();
            return rect.left >= 0 && rect.right <= innerWidth;
          }), true, 'trainer reset menu fits the phone viewport');
          await page.evaluate(() => { document.documentElement.dataset.clientTheme = 'light'; });
          assert.equal(await page.locator('[data-floating-workout-more] > div').evaluate(menu =>
            getComputedStyle(menu).backgroundColor), 'rgb(255, 255, 255)',
          'trainer reset menu follows light mode');
          await page.evaluate(() => { delete document.documentElement.dataset.clientTheme; });
        }
      }
      await page.evaluate(() => { document.querySelector('.workout-floating-finish').hidden = true; });
      assert.equal(await page.locator('.client-dashboard-tabs').isVisible(), true,
        'navigation returns when the client backs out to the workout picker');
      await page.evaluate(() => { document.getElementById('client-workouts-panel').hidden = true; });
      assert.equal(await page.locator('.client-dashboard-tabs').isVisible(), true,
        'navigation returns when the client leaves the workout logger');
      await page.close();
      process.stdout.write(`${browserName} ${width}px: quick and trainer floating actions passed\n`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
