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
  'customWorkoutPanelMarkup', 'syncWorkoutStartButtons'
].map(production).join('\n');
const fixture = `
var activeCustomWorkoutFormat = 'single', workoutElapsedTimerState = null;
var customWorkoutTitle = 'Custom Workout', fixtureExercises = [];
function escapeHtml(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }
function todayDate() { return '2026-11-06'; }
function formatLogDate() { return 'Nov 6, 2026'; }
function activeCustomWorkoutDraft() { return null; }
function normalizeCustomWorkoutFormat(value) { return value; }
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
function floatingWorkoutFinishMarkup() { return ''; }
function syncFloatingWorkoutFinishButtons() {}
function customWorkoutMixedGroups(exercises) { return exercises.map((exercise, index) => ({ index, startIndex: index, format: 'single', items: [exercise] })); }
${functions}
function renderCase(format, names, active) {
  activeCustomWorkoutFormat = format;
  fixtureExercises = names.map((name, index) => ({ name, code: 'EX' + index, group: 0, prescription: '1 set' }));
  workoutElapsedTimerState = active ? { workoutTitle: 'Custom Workout', workoutDate: todayDate(), running: true } : null;
  document.querySelector('#client-workout-panels').innerHTML = customWorkoutPanelMarkup(0);
  const panel = document.querySelector('.client-workout-panel-custom');
  panel.hidden = false;
  syncWorkoutStartButtons();
}
`;

(async () => {
  const browserName = process.env.PLAYWRIGHT_BROWSER || 'chromium';
  const browser = await playwright[browserName].launch({ headless: true });
  try {
    for (const width of [360, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style></head><body class="dashboard-page client-dashboard-page"><div id="client-workout-panels"></div></body></html>`);
      await page.addScriptTag({ content: fixture });
      for (const [format, names] of [
        ['single', []], ['single', ['Leg Press']],
        ['superset', ['Leg Press', 'Chest Press']],
        ['circuit', ['Leg Press', 'Chest Press', 'Cable Row']]
      ]) {
        await page.evaluate(([f, n]) => renderCase(f, n, false), [format, names]);
        const primary = page.locator('.client-workout-panel-custom [data-workout-start]');
        assert.equal(await primary.innerText(), 'Start workout', `${format} initial label`);
        assert.ok(await primary.isVisible(), `${format} Start visible`);
        assert.equal(await page.locator('.client-workout-panel-custom [data-custom-workout-default-finish] .workout-finish-button').isVisible(), false,
          `${format} legacy Finish hidden`);
        assert.equal(await page.locator('.client-workout-panel-custom [data-workout-finish-later]').filter({ visible: true }).count(), 0,
          `${format} legacy Finish later hidden`);
        const grouped = page.locator('.client-workout-panel-custom .custom-workout-grouped-actions');
        if (await grouped.count()) assert.equal(await grouped.isVisible(), false, `${format} grouped footer hidden`);
        await page.evaluate(([f, n]) => renderCase(f, n, true), [format, names]);
        assert.equal(await primary.innerText(), 'Finish workout', `${format} active label`);
        assert.ok(await primary.isVisible(), `${format} Finish visible`);
      }
      await page.close();
      process.stdout.write(`${browserName} ${width}px: empty, single, superset, circuit primary action passed\n`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
