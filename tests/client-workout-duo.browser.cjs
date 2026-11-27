const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const portal = read('js/client-portal.js');
const functions = [
  'setTypeForRow', 'workoutExerciseListLogs', 'jumpToWorkoutExercise', 'workoutSectionForButton',
  'showWorkoutFinishIssues', 'setWorkoutExerciseCardExpanded', 'customWorkoutCarouselCards',
  'customWorkoutGroupedLogElements', 'syncGroupedExerciseCollapse'
].map((name) => {
  const start = portal.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  const next = portal.slice(start + 1).search(/\n(?:async )?function [\w$]+\(/);
  assert.ok(next >= 0, name);
  return portal.slice(start, start + next + 1);
}).join('\n');

const fixture = `
const workingSetType = 'working';
const warmUpSetType = 'warm_up';
const warmUpSetNumberBase = 1000;
function normalizedSetType(type, number) { return type || workingSetType; }
function autoCollapseCompletedExercises() { return true; }
function exerciseNameInputForLog(log) { return log.querySelector('[data-exercise-name-input]'); }
${functions}
function refreshCustomWorkoutGroupedCompletion(carousel) {
  const logs = customWorkoutGroupedLogElements(carousel);
  carousel.querySelectorAll('[data-ios-log-exercise-index]').forEach((block) => {
    const log = logs[Number(block.dataset.iosLogExerciseIndex)];
    syncGroupedExerciseCollapse(block, log, [...log.querySelectorAll('[data-set-row]')]
      .filter((row) => setTypeForRow(row) !== warmUpSetType));
  });
  const panel = carousel.closest('.client-workout-panel');
  ClientWorkoutDuo.sync(panel, workoutExerciseListLogs(panel));
}
function fixtureLog(code, name, finished) {
  return '<article data-custom-exercise-card><div data-exercise-log data-exercise-code="' + code + '">' +
    '<input data-exercise-name-input value="' + name + '">' +
    '<div class="is-complete" data-set-row data-set-type="warm_up"></div>' +
    '<div class="' + (finished ? 'is-complete' : '') + '" data-set-row><input data-set-weight></div>' +
    '</div></article>';
}
function exerciseGroup(id, format, entries) {
  return '<section id="' + id + '" data-custom-workout-carousel data-custom-workout-grouped="true" data-custom-workout-format="' + format + '">' +
    entries.map((entry, index) => '<section data-ios-log-exercise-index="' + index + '"><input aria-label="Set ' + entry[0] + '"></section>').join('') +
    '<div hidden data-custom-workout-list>' + entries.map((entry) => fixtureLog(...entry)).join('') + '</div></section>';
}
const panel = document.querySelector('.client-workout-panel');
panel.innerHTML = '<div class="workout-duo-shell"><div class="workout-duo-layout">' + ClientWorkoutDuo.markup() +
  '<div class="custom-workout-builder">' + exerciseGroup('first', 'single', [['A1', 'Press', false]]) +
  '<div class="workout-format-group" id="second-wrapper">' + exerciseGroup('second', 'superset', [
    ['B1', 'Press', true], ['B2', 'Row', false]]) + '</div></div></div></div>';
const second = document.getElementById('second');
refreshCustomWorkoutGroupedCompletion(second);
const weights = [...panel.querySelectorAll('[data-set-weight]')];
weights[0].value = '135';
weights[2].value = '80';
panel.addEventListener('click', (event) => {
  const choice = event.target.closest('[data-workout-duo-exercise]');
  if (choice) jumpToWorkoutExercise(choice);
});
window.fixture = { panel, second, weights, workoutExerciseListLogs, showWorkoutFinishIssues };
`;

(async () => {
  const browser = process.env.PLAYWRIGHT_BROWSER === 'webkit'
    ? await webkit.launch() : await chromium.launch({ channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 820 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', (route) => route.abort());
    await page.setContent('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<body class="client-dashboard-page"><section class="client-workout-panel client-workout-panel-assigned"></section></body>');
    await page.addStyleTag({ content: read('css/client-workout-duo.css') });
    await page.addScriptTag({ content: read('js/client-workout-duo.js') });
    await page.addScriptTag({ content: fixture });

    const rail = page.locator('[data-workout-duo-sidebar]');
    const row = (index) => rail.locator(`[data-workout-duo-exercise="${index}"]`);
    assert.equal(await rail.isVisible(), true);
    assert.equal(await row(0).getAttribute('aria-current'), 'true');
    assert.match(await row(1).getAttribute('aria-label'), /Press, Superset, 1 of 1 sets complete/);
    assert.equal(await page.locator('#first').isVisible(), true);
    assert.equal(await page.locator('#second-wrapper').isVisible(), false);

    await row(1).click();
    assert.equal(await row(1).getAttribute('aria-current'), 'true');
    assert.equal(await page.locator('#first').isVisible(), false);
    assert.equal(await page.locator('#second [data-ios-log-exercise-index]').count(), 2);
    assert.equal(await page.locator('#second [data-ios-log-exercise-index="0"]').evaluate(
      (block) => block.classList.contains('is-exercise-collapsed')), false);
    await page.evaluate(() => ClientWorkoutDuo.advance(fixture.second, fixture.workoutExerciseListLogs(fixture.panel)[2]));
    assert.equal(await row(2).getAttribute('aria-current'), 'true');

    await page.evaluate(() => fixture.showWorkoutFinishIssues(
      document.querySelector('[data-workout-duo-finish]'),
      [{ message: 'Complete Exercise A1', target: document.querySelector('[aria-label="Set A1"]') }]
    ));
    await page.getByRole('button', { name: 'Complete Exercise A1' }).click();
    assert.equal(await row(0).getAttribute('aria-current'), 'true');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Set A1');

    await page.locator('.workout-duo-shell').evaluate((shell) => { shell.style.width = '650px'; });
    assert.equal(await rail.isVisible(), false);
    assert.equal(await page.locator('#second-wrapper').isVisible(), true);
    await page.locator('.workout-duo-shell').evaluate((shell) => { shell.style.width = ''; });
    await page.setViewportSize({ width: 390, height: 820 });
    assert.equal(await rail.isVisible(), false);
    assert.equal(await page.locator('#first').isVisible(), true);
    assert.equal(await page.locator('#second-wrapper').isVisible(), true);
    assert.deepEqual(await page.evaluate(() => fixture.weights.map((input) => [input.isConnected, input.value])),
      [[true, '135'], [true, ''], [true, '80']]);
    assert.deepEqual(errors, []);
    console.log('Duo wide sidebar, whole-group visibility, validation focus and compact draft retention passed.');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
