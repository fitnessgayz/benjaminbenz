// NODE_PATH=/Users/benjamingonzales/.local/lib/node_modules node tests/custom-workout-format-switch.browser.cjs
// PLAYWRIGHT_BROWSER=webkit repeats the check with Safari's engine.
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

const functions = [
  'normalizeCustomWorkoutFormat', 'normalizeCustomWorkoutInlineGroupType',
  'customWorkoutFormatGroupSize', 'customWorkoutCardHasEnteredContent',
  'removeEmptyCustomWorkoutWarmUps',
  'customWorkoutMixedGroups', 'customWorkoutCarousels', 'customWorkoutCarouselCards',
  'regroupCustomWorkoutCarousels', 'workoutCarouselExerciseCode',
  'customWorkoutGroupNameRowMarkup', 'customWorkoutExerciseAddConfig',
  'addCustomWorkoutPickedExercise', 'updateCustomWorkoutFormat'
].map(production).join('\n');

const fixture = `
const customWorkoutFormats = {
  single: { label: 'Straight sets', guide: '' },
  superset: { label: 'Superset', guide: '' },
  circuit: { label: 'Circuit', guide: '' }
};
let activeCustomWorkoutFormat = 'single';
const customWorkoutTitle = 'Custom Workout';
const removedAutosaves = [];
const escapeHtml = value => String(value);
const exerciseNameInputForLog = log => log.querySelector('[data-exercise-name-input]');
const warmUpSetType = 'warm_up';
const setTypeForRow = row => row.dataset.setType;
const renumberSetRows = () => {};
const syncVisibleSetTarget = () => {};
const updateVisibleSetProgress = () => {};
const storeCustomWorkoutFormat = () => {};
const cancelTrainingLogAutosaves = card => removedAutosaves.push(card.id);
const syncCustomWorkoutSetupSummary = () => {};
const syncCustomWorkoutExerciseControls = () => {};
const syncCustomWorkoutFormatMarkers = () => {};
const persistCustomWorkoutDraftFromPanel = () => {};
const approvedExerciseForName = () => null;
const todayDate = () => '2026-11-09';
const updateExerciseLogField = () => {};
const customWorkoutEditableNameInput = card => card.querySelector('[data-exercise-name-input]');
let nextCode = 4;
const nextCustomExerciseCode = () => 'CUSTOM' + nextCode++;
const customWorkoutCardMarkup = exercise => '<article id="new-row" data-custom-exercise-card data-custom-workout-group="' +
  exercise.group + '" data-custom-workout-group-type="' + exercise.groupType + '">' +
  '<div data-exercise-log data-exercise-code="' + exercise.code + '"><input data-exercise-name-input value="' +
  exercise.name + '"><textarea data-log-notes></textarea><div data-set-row><input data-set-weight value=""><input data-set-reps value=""></div></div></article>';
const customWorkoutCarouselGroupMarkup = (format, _exercises, index, _start, _title, options) =>
  '<section data-custom-workout-carousel data-custom-workout-format="' + format +
  '" data-custom-workout-group="' + index + '">' +
  '<div data-custom-workout-list></div>' +
  (format !== 'single' && options.isLastGroup ? '<button data-custom-grouped-finish-workout></button>' : '') +
  '</section>';
const syncCustomWorkoutCarousel = panel => regroupCustomWorkoutCarousels(panel);
${functions}
window.switchFormat = format => updateCustomWorkoutFormat(document.querySelector('.client-workout-panel-custom'), format);
window.addPicked = name => addCustomWorkoutPickedExercise(document.querySelector('.client-workout-panel-custom'), name);
window.groupState = () => [...document.querySelectorAll('[data-custom-workout-carousel]')].map(group => {
  const format = group.dataset.customWorkoutFormat;
  const index = Number(group.dataset.customWorkoutGroup);
  return [...group.querySelectorAll('[data-custom-exercise-card]')].map((card, position) => ({
    id: card.id,
    label: workoutCarouselExerciseCode(format, index, position)
  }));
});
window.cardState = () => [...document.querySelectorAll('[data-custom-exercise-card]')].map(card => ({
  id: card.id,
  name: card.querySelector('[data-exercise-name-input]').value,
  notes: card.querySelector('[data-log-notes]').value,
  sets: [...card.querySelectorAll('[data-set-row]')].map(row => ({
    type: row.dataset.setType,
    weight: row.querySelector('[data-set-weight]').value,
    reps: row.querySelector('[data-set-reps]').value,
    complete: row.classList.contains('is-complete')
  }))
}));
window.originalCards = [...document.querySelectorAll('[data-custom-exercise-card]')];
window.sameCards = () => [...document.querySelectorAll('[data-custom-exercise-card]')].every((card, index) => card === window.originalCards[index]);
window.removedAutosaves = removedAutosaves;
`;

const card = (id, name, notes, warmupWeight, workingWeight, reps, complete = false) => `
  <article id="${id}" data-custom-exercise-card data-custom-workout-group="0" data-custom-workout-group-type="single">
    <div data-exercise-log><input data-exercise-name-input value="${name}"><textarea data-log-notes>${notes}</textarea>
      <div data-set-row data-set-type="warm_up"><input data-set-weight value="${warmupWeight}"><input data-set-reps value="5"></div>
      <div data-set-row data-set-type="working" class="${complete ? 'is-complete' : ''}"><input data-set-weight value="${workingWeight}"><input data-set-reps value="${reps}"><button data-complete-set aria-pressed="${complete}"></button></div>
    </div>
  </article>`;

const html = `<!doctype html><html><body><section class="client-workout-panel-custom" data-custom-workout-format="single" data-custom-workout-title="Custom Workout">
  <span data-custom-workout-format-pill></span><span data-custom-workout-format-guide></span>
  <div data-custom-workout-carousel-stack><section data-custom-workout-carousel data-custom-workout-format="single" data-custom-workout-group="0">
    <div data-custom-workout-list>
      ${card('chest', 'Chest Press', 'Keep shoulders down', '45', '90', '8', true)}
      ${card('row', 'Cable Row', 'Pause at chest', '25', '70', '10')}
      ${card('squat', 'Squat', 'Brace', '65', '135', '6')}
      <article id="unused" data-custom-exercise-card data-custom-workout-group="0" data-custom-workout-group-type="single"><div data-exercise-log><input data-exercise-name-input value=""><textarea data-log-notes></textarea><div data-set-row><input data-set-weight value=""><input data-set-reps value=""><button data-complete-set aria-pressed="false"></button></div></div></article>
    </div>
  </section></div>
</section><script>${fixture.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;

(async () => {
  const browserName = process.env.PLAYWRIGHT_BROWSER || 'chromium';
  const browser = await { chromium, webkit }[browserName].launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto('about:blank');
    await page.setContent(html);
    const original = await page.evaluate(() => window.cardState().slice(0, 3));
    const cases = [
      ['superset', [['chest:A1', 'row:A2'], ['squat:B1']]],
      ['single', [['chest:A1'], ['row:B1'], ['squat:C1']]],
      ['circuit', [['chest:A1', 'row:A2', 'squat:A3']]],
      ['superset', [['chest:A1', 'row:A2'], ['squat:B1']]],
      ['circuit', [['chest:A1', 'row:A2', 'squat:A3']]],
      ['single', [['chest:A1'], ['row:B1'], ['squat:C1']]]
    ];
    for (const [format, expected] of cases) {
      await page.evaluate(value => window.switchFormat(value), format);
      const result = await page.evaluate(() => ({
        groups: window.groupState().map(group => group.map(item => `${item.id}:${item.label}`)),
        cards: window.cardState(), sameCards: window.sameCards(), removed: window.removedAutosaves
      }));
      assert.deepEqual(result.groups, expected, `${browserName}: ${format} groups`);
      assert.deepEqual(result.cards, original, `${browserName}: ${format} kept names, values, notes, and warm-ups`);
      assert.equal(result.sameCards, true, `${browserName}: ${format} retained the same card nodes`);
      assert.deepEqual(result.removed, ['unused'], `${browserName}: only unused placeholder removed`);
    }
    // A second exercise added after the first is logged takes the open A2 slot.
    await page.setContent(html
      .replace(card('row', 'Cable Row', 'Pause at chest', '25', '70', '10'), '')
      .replace(card('squat', 'Squat', 'Brace', '65', '135', '6'), ''));
    await page.evaluate(() => window.switchFormat('superset'));
    await page.evaluate(() => window.addPicked('Cable Row'));
    const added = await page.evaluate(() => window.groupState());
    assert.deepEqual(added[0].map(item => item.label), ['A1', 'A2']);
    await page.evaluate(() => window.switchFormat('single'));
    const back = await page.evaluate(() => window.groupState());
    assert.equal(back[1][0].label, 'B1', `${browserName}: A2 becomes B1`);
    await page.evaluate(() => {
      const warmup = document.querySelector('#chest [data-set-type="warm_up"]');
      warmup.querySelector('[data-set-weight]').value = '';
      warmup.querySelector('[data-set-reps]').value = '';
      window.switchFormat('circuit');
      window.switchFormat('single');
    });
    const warmups = await page.evaluate(() => document.querySelectorAll('#chest [data-set-type="warm_up"]').length);
    assert.equal(warmups, 0, `${browserName}: an unused grouped warm-up is removed on return to Straight`);
    await page.close();
    console.log(`${browserName}: format switches keep exercise cards and values, including A2 → B1`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
