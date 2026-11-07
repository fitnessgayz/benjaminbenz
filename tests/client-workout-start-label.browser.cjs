// Synthetic browser check for the grouped custom workout action and persisted timer.
// Run: NODE_PATH=<runtime node_modules> node tests/client-workout-start-label.browser.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { webkit } = require('playwright');

const source = fs.readFileSync(path.join(__dirname, '../js/client-portal.js'), 'utf8');
function production(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}`);
  const end = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, end < 0 ? undefined : end);
}
const functions = [
  'workoutElapsedTimerClientEmail', 'readWorkoutElapsedTimerState', 'workoutElapsedTimerIsStale',
  'persistWorkoutElapsedTimerState', 'syncWorkoutStartButtons', 'startWorkoutElapsedTimer',
  'finishWorkoutElapsedTimer'
].map(production).join('\n');

const pageHtml = (format, count) => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body><section class="client-workout-panel client-workout-panel-custom" data-format="${format}">
  <input data-workout-date value="2026-11-06">
  ${Array.from({ length: count }, (_, index) => `<article data-exercise-log>Exercise ${index + 1}</article>`).join('')}
  <button data-workout-start data-workout-title="Custom Workout">Start workout</button>
  <button data-reset-custom-workout>Reset</button>
</section><script>
var activeClientEmail = 'synthetic-client@example.com', signedInDashboardEmail = '';
var workoutElapsedTimerStorageKey = 'fwb-browser-start-label-${format}';
var workoutElapsedTimerMaximumMilliseconds = 43200000, workoutElapsedTimerState = null;
var restTimerRunSequence = 0, customWorkoutGroupedRestAction = null, restTimerReturnFocus = null;
function todayDate() { return '2026-11-06'; }
function activeWorkoutElapsedTitle() { return 'Custom Workout'; }
function runWorkoutElapsedTimer() { syncWorkoutStartButtons(); }
function syncFloatingWorkoutFinishButtons() {}
function clearWorkoutElapsedTimerInterval() {}
function resetRestTimer() {}
function closeRestTimer() {}
function renderWorkoutElapsedTimer() { syncWorkoutStartButtons(); }
${functions}
workoutElapsedTimerState = readWorkoutElapsedTimerState();
syncWorkoutStartButtons();
document.querySelector('[data-workout-start]').addEventListener('click', () => {
  if (workoutElapsedTimerState) finishWorkoutElapsedTimer();
  else startWorkoutElapsedTimer('Custom Workout', { workoutDate: '2026-11-06' });
  syncWorkoutStartButtons();
});
document.querySelector('[data-reset-custom-workout]').addEventListener('click', () => {
  if (workoutElapsedTimerState) finishWorkoutElapsedTimer();
  syncWorkoutStartButtons();
});
</script></body></html>`;

(async () => {
  const browser = await webkit.launch({ headless: true });
  try {
    for (const [format, count] of [['superset', 2], ['circuit', 3]]) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      const html = pageHtml(format, count);
      await page.route('http://fwb.local/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: html }));
      const action = page.locator('[data-workout-start]');
      await page.goto('http://fwb.local/');
      assert.equal(await page.locator('[data-exercise-log]').count(), count);
      assert.equal(await action.innerText(), 'Start workout');
      await action.click();
      assert.equal(await action.innerText(), 'Finish workout');
      await page.reload();
      assert.equal(await action.innerText(), 'Finish workout', `${format} resumes after reload`);
      await page.locator('[data-reset-custom-workout]').click();
      assert.equal(await action.innerText(), 'Start workout');
      await page.reload();
      assert.equal(await action.innerText(), 'Start workout', `${format} reset survives reload`);
      await action.click();
      assert.equal(await action.innerText(), 'Finish workout');
      await action.click();
      assert.equal(await action.innerText(), 'Start workout', `${format} finish returns to Start`);
      await page.reload();
      assert.equal(await action.innerText(), 'Start workout', `${format} finish survives reload`);
      await context.close();
      process.stdout.write(`${format}: Start → Finish, reload, Reset, and finish passed\n`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
