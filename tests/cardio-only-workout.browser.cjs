// Isolated browser proof: production markup/navigation/validation, synthetic data,
// actual dashboard styles, and no network access or account writes.
// NODE_PATH=<runtime node_modules> node tests/cardio-only-workout.browser.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const playwright = require('playwright');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/client-portal.js'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'client-dashboard.html'), 'utf8');
const styles = [...dashboard.matchAll(/<link[^>]+href="\/?(css\/[^"?]+)[^>]*>/g)]
  .map(match => fs.readFileSync(path.join(root, match[1]), 'utf8')).join('\n');
const sectionStart = dashboard.indexOf('<section class="client-workouts-panel"');
const sectionEnd = dashboard.indexOf('<section class="progress-panel nutrition-panel"', sectionStart);
assert.ok(sectionStart >= 0 && sectionEnd > sectionStart);
const workoutsSection = dashboard.slice(sectionStart, sectionEnd).replace('aria-labelledby="client-workouts-title" hidden', 'aria-labelledby="client-workouts-title"');

function production(name) {
  const match = new RegExp(`(?:async )?function ${name}\\(`).exec(source);
  assert.ok(match, `Missing production function ${name}`);
  const following = source.slice(match.index + match[0].length);
  const end = following.search(/\n(?:async )?function [\w$]+\(/);
  assert.ok(end >= 0, `Missing function boundary for ${name}`);
  return source.slice(match.index, match.index + match[0].length + end);
}

const names = [
  'formatLogDate', 'clientWorkoutPickerItems', 'clientWorkoutChoiceContent',
  'clientCardioWorkoutChoiceMarkup', 'clientWorkoutListMarkup', 'cardioLogFields',
  'workoutActionsMarkup', 'cardioWorkoutPanelMarkup', 'renderClientWorkoutTabs',
  'clientWorkoutPickerIndex', 'syncClientWorkoutSelectionSummary', 'syncClientWorkoutPicker',
  'activateClientWorkoutPanel', 'showClientWorkoutPicker', 'handleClientWorkoutTabs',
  'handleClientWorkoutPreview', 'syncWorkoutPanelDate', 'handleTrainingDateChange',
  'cardioLogIssues', 'cardioWorkoutCompletionFields', 'workoutFinishIssues',
  'showWorkoutFinishIssues', 'workoutSectionForButton', 'cancelTrainingLogAutosaves',
  'handleTrainingLogSave'
];

const fixture = `
window.fixtureEvents = [];
var activeClientEmail = 'synthetic-client@example.com';
var customWorkoutTitle = 'Custom workout', cardioExerciseCode = 'CARDIO';
var clientPreviewProgramSelected = false, clientAvailablePrograms = [];
var clientWorkoutLayoutSaving = false, workoutElapsedTimerState = null;
var activeWorkoutTabIndex = 0, clientWorkoutPickerIsOpen = true;
var pendingGroupedCustomWorkoutRestart = null;
var currentProgram = {
  program_title: 'Synthetic strength program',
  workouts: [{ title: 'Full body strength', exercises: [
    { name: 'Dumbbell floor press', prescription: '3 sets x 8-12 reps' },
    { name: 'Bodyweight squat', prescription: '3 sets x 10 reps' }
  ]}]
};
function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
function todayDate() { return '2026-09-26'; }
// Unrelated strength rendering is intentionally inert; cardio production markup
// and all chooser/navigation/date/finish handlers are exercised unchanged.
function customWorkoutPanelMarkup(index) { return '<section class="client-workout-panel client-workout-panel-custom" id="client-workout-panel-' + index + '" hidden></section>'; }
function inferWorkoutFormat() { return 'single'; }
function formatLabel() { return 'Straight sets'; }
function warmupLogFields() { return ''; }
function workoutStartControlMarkup() { return ''; }
function workoutExerciseMarkup() { return ''; }
function workoutExerciseListMarkup() { return ''; }
function renderClientHomeSummary() {}
function syncWorkoutStartButtons() {}
function syncCustomWorkoutCarousels() {}
function syncAssignedWorkoutCarousels() {}
function syncCustomWorkoutCarousel() {}
function updateExerciseLogField() {}
function persistCustomWorkoutDraftFromPanel(panel) {
  if (panel.classList.contains('client-workout-panel-custom')) throw new Error('Unexpected strength draft write');
}
function restartDeletedClientWorkoutContext(context) { fixtureEvents.push(['restart-context', context]); }
function requestWorkoutDifficulty() { fixtureEvents.push(['feedback']); return Promise.resolve(null); }
function saveTrainingLogRows() { throw new Error('Network persistence is forbidden in browser proof'); }
${names.map(production).join('\n')}
renderClientWorkoutTabs(currentProgram.workouts);
handleClientWorkoutTabs();
handleClientWorkoutPreview();
handleTrainingDateChange();
handleTrainingLogSave();
`;

async function checkLayout(page, label) {
  const result = await page.evaluate(() => {
    const visible = element => element.getClientRects().length && !element.closest('[hidden]');
    const elements = [...document.querySelectorAll('#client-workouts-panel button, #client-workouts-panel input:not([type=hidden]), #client-workouts-panel textarea')]
      .filter(visible).map(element => {
        const rect = element.getBoundingClientRect();
        return { name: element.textContent.trim() || element.getAttribute('placeholder') || element.type,
          left: rect.left, right: rect.right, width: rect.width, height: rect.height };
      });
    const dates = [...document.querySelectorAll('[data-workout-date-value]')].filter(visible).map(element => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const text = range.getBoundingClientRect();
      const control = element.closest('.workout-session-date-control').getBoundingClientRect();
      return { text: { top: text.top, bottom: text.bottom, left: text.left, right: text.right },
        control: { top: control.top, bottom: control.bottom, left: control.left, right: control.right } };
    });
    return { width: innerWidth, scroll: document.documentElement.scrollWidth, elements, dates };
  });
  assert.ok(result.scroll <= result.width + 1, `${label}: page overflows ${result.scroll} > ${result.width}`);
  for (const element of result.elements) {
    assert.ok(element.left >= -1 && element.right <= result.width + 1,
      `${label}: ${element.name} is outside viewport (${element.left}, ${element.right})`);
    assert.ok(element.width > 0 && element.height > 0, `${label}: ${element.name} is collapsed`);
  }
  for (const { text, control } of result.dates) {
    assert.ok(text.top >= control.top - 1 && text.bottom <= control.bottom + 1 &&
      text.left >= control.left - 1 && text.right <= control.right + 1,
      `${label}: displayed date is clipped inside its control (${JSON.stringify({ text, control })})`);
  }
}

(async () => {
  const engine = process.env.PLAYWRIGHT_BROWSER || 'chromium';
  const directory = process.env.CARDIO_SCREENSHOT_DIR || '/private/tmp/fwb-cardio-browser-proof';
  fs.mkdirSync(directory, { recursive: true });
  const browser = await playwright[engine].launch({ headless: true,
    ...(engine === 'chromium' ? { channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' } : {}) });
  let scenarios = 0;
  const screenshots = [];
  try {
    for (const width of [320, 390, 1280]) {
      for (const scale of [1, 2]) {
        const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => route.abort());
        await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
          <body class="dashboard-page client-dashboard-page"><main class="dashboard-shell"><div id="dashboard-content">${workoutsSection}</div></main></body></html>`);
        await page.addStyleTag({ content: styles });
        await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'js/workout-layout.js'), 'utf8') });
        await page.addScriptTag({ content: fixture });
        await page.evaluate(scale => { document.documentElement.style.fontSize = `${16 * scale}px`; }, scale);
        const take = async suffix => {
          const filename = path.join(directory, `${engine}-${width}-${scale * 100}-${suffix}.png`);
          await page.screenshot({ path: filename, fullPage: true });
          screenshots.push(filename);
        };
        for (const mode of ['chooser', 'selected-program']) {
          const label = `${engine} ${width}px ${scale * 100}% ${mode}`;
          if (mode === 'selected-program') await page.locator('[data-preview-program]').click();
          const shortcut = page.getByRole('button', { name: 'Log cardio', exact: true });
          await shortcut.waitFor({ state: 'visible' });
          assert.equal(await shortcut.count(), 1, `${label}: exactly one cardio shortcut`);
          await checkLayout(page, label);
          if (scale === 1) await take(mode);
          await shortcut.click();
          const panel = page.locator('.client-workout-panel-cardio');
          await panel.waitFor({ state: 'visible' });
          assert.equal(await page.locator('#client-workout-tabs').isVisible(), false);
          assert.equal(await panel.locator('.workout-cardio-card').getAttribute('class').then(value => value.includes('is-open')), true);
          assert.equal(await panel.locator('[data-exercise-toggle]').getAttribute('aria-expanded'), 'true');
          for (const selector of ['[data-workout-date]', '[data-cardio-type]', '[data-cardio-duration]', '[data-cardio-distance]', '[data-cardio-calories]', '[data-log-notes]']) {
            assert.equal(await panel.locator(selector).isVisible(), true, `${label}: visible ${selector}`);
          }
          assert.equal(await panel.locator('[data-set-row], [data-warmup-log], [data-set-weight], [data-set-reps], [data-add-custom-exercise]').count(), 0);
          await panel.getByRole('button', { name: 'Save & finish cardio', exact: true }).waitFor({ state: 'visible' });
          await checkLayout(page, label + ' cardio form');
          if (mode === 'chooser' && (scale === 1 || width === 390)) await take('cardio');

          await panel.getByRole('button', { name: 'Save & finish cardio', exact: true }).click();
          const alert = panel.getByRole('alert');
          await alert.waitFor({ state: 'visible' });
          assert.match(await alert.innerText(), /Enter a duration in minutes above 0/);
          assert.match(await alert.innerText(), /Distance, calories, and notes are optional/);
          assert.equal(await page.evaluate(() => fixtureEvents.filter(event => event[0] === 'feedback').length), scenarios % 2,
            `${label}: blank duration must stop before feedback`);
          await alert.getByRole('button', { name: 'Enter a duration in minutes above 0.' }).click();
          assert.equal(await page.evaluate(() => document.activeElement.hasAttribute('data-cardio-duration')), true);
          await panel.locator('[data-workout-date]').fill('2026-09-21');
          await panel.locator('[data-workout-date]').dispatchEvent('change');
          assert.equal(await panel.locator('[data-log-date]').inputValue(), '2026-09-21');
          assert.equal(await panel.locator('[data-workout-date-value]').innerText(), 'Sep 21, 2026');
          await panel.locator('[data-cardio-type]').fill('Outdoor walk');
          await panel.locator('[data-cardio-duration]').fill('30');
          await panel.locator('[data-cardio-distance]').fill('2.5');
          await panel.locator('[data-cardio-calories]').fill('180');
          await panel.locator('[data-log-notes]').fill('Synthetic browser proof: comfortable pace.');
          await panel.getByRole('button', { name: 'Save & finish cardio', exact: true }).click();
          await page.waitForFunction(() => !document.querySelector('.client-workout-panel-cardio').dataset.workoutFinishing);
          assert.equal(await page.evaluate(() => fixtureEvents.filter(event => event[0] === 'feedback').length), scenarios % 2 + 1,
            `${label}: valid entries reach feedback before the mocked cancel`);
          assert.equal(await panel.getByRole('alert').count(), 0, `${label}: valid entries clear field errors`);
          assert.equal(await panel.locator('[data-cardio-duration]').isEnabled(), true, `${label}: canceling feedback restores controls`);
          await page.locator('[data-client-workout-picker-back]').click();
          assert.equal(await panel.isVisible(), false);
          assert.equal(await shortcut.isVisible(), true);
          assert.deepEqual(errors, [], `${label}: browser script errors`);
          scenarios++;
        }
        await page.close();
      }
    }
    console.log(`Cardio browser proof passed: ${scenarios} ${engine} scenarios; 320/390/1280px; 100%/200% text; chooser/program → cardio → validation → back; no network writes.`);
    console.log(JSON.stringify({ screenshots }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
