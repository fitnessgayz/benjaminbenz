const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/client-portal.js'), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));
function declaration(name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(match, `${name} exists`);
  const after = source.slice(match.index + match[0].length);
  const end = after.search(/\n(?:async\s+)?function\s+[\w$]+\s*\(/);
  return source.slice(match.index, end < 0 ? undefined : match.index + match[0].length + end);
}
function evaluate(names, values = {}) {
  const context = vm.createContext({
    Date, activeClientEmail: 'client@example.com', customWorkoutTitle: 'Custom workout', cardioExerciseCode: 'CARDIO',
    todayDate: () => '2026-09-26', formatLogDate: (value) => value,
    normalizeClientEmail: (value) => String(value || '').trim().toLowerCase(),
    escapeHtml: (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
    ...values
  });
  vm.runInContext(names.map(declaration).join('\n'), context);
  return context;
}
function cardioFixture(overrides = {}) {
  const fields = {
    '[data-log-date]': { value: '2026-09-26' },
    '[data-workout-date]': { value: '2026-09-26' },
    '[data-cardio-type]': { value: 'Outdoor walk' },
    '[data-cardio-duration]': { value: '30' },
    '[data-cardio-distance]': { value: '' },
    '[data-cardio-calories]': { value: '' },
    '[data-log-notes]': { value: '' }
  };
  for (const [name, value] of Object.entries(overrides)) fields[`[data-${name}]`].value = value;
  const status = { textContent: '' };
  const button = { dataset: {}, disabled: false, closest: () => section };
  const log = {
    dataset: { cardioLog: '', exerciseCode: 'CARDIO', workoutTitle: 'Cardio', exerciseName: 'Cardio' },
    querySelector: (selector) => fields[selector] || null,
    querySelectorAll: () => [],
    closest: (selector) => selector.includes('client-workout-panel') ? section : selector === '.workout-exercise-card' ? { classList: { contains: () => false } } : null
  };
  const section = {
    dataset: { customWorkoutTitle: 'Cardio' },
    classList: { contains: (value) => value === 'client-workout-panel-cardio' || value === 'client-workout-panel' },
    querySelector(selector) {
      if (selector === '[data-cardio-log]' || selector === '[data-exercise-log]') return log;
      if (selector === '[data-workout-status]') return status;
      if (selector === '[data-workout-finish]') return button;
      return fields[selector] || null;
    },
    querySelectorAll(selector) {
      if (selector === '[data-exercise-log]' || selector === '[data-cardio-log]') return [log];
      if (selector === 'input, textarea, select, button') return [...Object.values(fields), button];
      return [];
    }
  };
  return { fields, log, section, button, status };
}

test('cardio shortcut appears in both workout chooser views and is excluded from assigned previews', () => {
  const context = evaluate(['clientWorkoutPickerItems', 'clientWorkoutChoiceContent', 'clientCardioWorkoutChoiceMarkup', 'clientWorkoutListMarkup'], {
    clientPreviewProgramSelected: false,
    clientAvailablePrograms: [], currentProgram: { program_title: 'Strength plan', workouts: [] },
    clientWorkoutLayoutSaving: false, workoutElapsedTimerState: null,
    WorkoutLayout: { label: (value) => value }
  });
  const items = context.clientWorkoutPickerItems([{ title: 'Assigned strength', exercises: [] }]);
  const cardio = items.find((item) => item.isCardio);
  assert.ok(cardio);
  for (const selected of [false, true]) {
    context.clientPreviewProgramSelected = selected;
    const markup = context.clientWorkoutListMarkup(items);
    assert.match(markup, /Log cardio/);
    assert.match(markup, new RegExp(`data-client-workout-picker-choose="${cardio.panelIndex}"`));
    assert.match(markup, new RegExp(`data-client-workout-picker-card="${cardio.panelIndex}"`));
    assert.match(markup, /data-client-workout-selection-target="Cardio"/);
    assert.doesNotMatch(markup, /data-preview-workout="1"/, 'Cardio must not become another assigned exercise editor');
  }
});

test('standalone cardio panel exposes date and expanded cardio fields with no strength or warm-up fields', () => {
  const context = evaluate(['cardioLogFields', 'workoutActionsMarkup', 'cardioWorkoutPanelMarkup']);
  const markup = context.cardioWorkoutPanelMarkup(3);
  assert.match(markup, /client-workout-panel-cardio/);
  assert.match(markup, /id="client-workout-panel-3"/);
  assert.match(markup, /data-custom-workout-title="Cardio"/);
  assert.match(markup, /data-workout-date/);
  assert.match(markup, /data-log-date/);
  assert.match(markup, /data-cardio-log/);
  assert.match(markup, /aria-expanded="true"/);
  assert.match(markup, /is-open/);
  assert.match(markup, /data-workout-finish/);
  assert.doesNotMatch(markup, /data-set-row|data-warmup-log|data-custom-exercise-card|client-workout-panel-custom/);
});

test('cardio completion records entered minutes as seconds and keeps the selected workout date', () => {
  const f = cardioFixture({ 'log-date': '2026-09-21', 'workout-date': '2026-09-21', 'cardio-distance': '2.5', 'cardio-calories': '180', 'log-notes': 'Comfortable pace' });
  const context = evaluate(['cardioWorkoutCompletionFields', 'rowsForTrainingLog', 'buildCardioNotes'], {
    exerciseNameInputForLog: (log) => log.querySelector('[data-cardio-type]')
  });
  const now = Date.parse('2026-09-26T10:20:30.000Z');
  const completion = plain(context.cardioWorkoutCompletionFields(f.section, now));
  assert.deepEqual(completion, { workout_duration_seconds: 1800, completed_at: '2026-09-26T10:20:30.000Z' });
  const rows = plain(context.rowsForTrainingLog(f.log));
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    client_email: 'client@example.com', entry_date: '2026-09-21', workout_title: 'Cardio',
    exercise_code: 'CARDIO', exercise_name: 'Outdoor walk', set_number: 1,
    weight_used: 30, reps: 2.5, notes: 'Calories: 180\nComfortable pace'
  });
});

test('cardio validation rejects missing, nonfinite and negative values but allows empty optional metrics', () => {
  const context = evaluate(['cardioLogIssues']);
  assert.deepEqual(plain(context.cardioLogIssues(cardioFixture().log)), []);
  assert.deepEqual(plain(context.cardioLogIssues(cardioFixture({ 'cardio-distance': '0', 'cardio-calories': '0' }).log)), []);
  for (const value of ['', '0', '-1', 'NaN', 'Infinity', '-Infinity']) {
    const f = cardioFixture({ 'cardio-duration': value });
    const issues = context.cardioLogIssues(f.log);
    assert.ok(issues.length > 0, `duration ${value} must be rejected`);
    assert.ok(issues.some((issue) => issue.target === f.fields['[data-cardio-duration]']));
  }
  for (const field of ['cardio-distance', 'cardio-calories']) {
    for (const value of ['-1', 'NaN', 'Infinity']) {
      const f = cardioFixture({ [field]: value });
      assert.ok(context.cardioLogIssues(f.log).some((issue) => issue.target === f.fields[`[data-${field}]`]), `${field}: ${value}`);
    }
  }
});

test('invalid standalone cardio cannot autosave or delete an existing saved row before validation', async () => {
  for (const fields of [{ 'cardio-duration': '' }, { 'cardio-duration': '0' }, { 'cardio-distance': '-1' }, { 'cardio-calories': 'Infinity' }]) {
    const f = cardioFixture(fields);
    let deletes = 0, writes = 0;
    const context = evaluate(['cardioLogIssues', 'rowsForTrainingLog', 'buildCardioNotes', 'trainingLogHasAutosavePayload', 'saveTrainingLogRows'], {
      exerciseNameInputForLog: (log) => log.querySelector('[data-cardio-type]'),
      trainingLogs: [{ client_email: 'client@example.com', entry_date: '2026-09-26', workout_title: 'Cardio', exercise_code: 'CARDIO', set_number: 1, weight_used: 30 }],
      deleteRemovedTrainingLogRows: async () => { deletes++; throw new Error('Invalid cardio must not reconcile/delete saved data'); },
      supabaseClient: { from() { writes++; throw new Error('Invalid cardio must not reach persistence'); } }
    });
    assert.equal(context.trainingLogHasAutosavePayload(f.log), false);
    const result = await context.saveTrainingLogRows(f.button, [f.log], f.status);
    assert.equal(result.saved, false);
    assert.equal(deletes, 0);
    assert.equal(writes, 0);
    assert.equal(context.trainingLogs.length, 1);
    assert.equal(f.button.disabled, false);
  }
});

function finishFixture({ outcome = 'success', hasStrengthTimer = true, isCardio = true } = {}) {
  const f = cardioFixture();
  if (!isCardio) f.section.classList.contains = (value) => value === 'client-workout-panel-assigned' || value === 'client-workout-panel';
  const events = [];
  const listeners = new Map();
  const strengthTimer = hasStrengthTimer ? { workoutTitle: 'Strength A', workoutDate: '2026-09-26', accumulatedMilliseconds: 900000, startedAt: 100, running: true } : null;
  const customDraft = { workoutTitle: 'Custom strength', exercises: [{ name: 'Keep this squat' }] };
  const context = evaluate(['cardioLogIssues', 'cardioWorkoutCompletionFields', 'workoutFinishIssues', 'handleTrainingLogSave', 'rowsForTrainingLog', 'buildCardioNotes'], {
    document: { addEventListener: (name, handler) => listeners.set(name, handler) },
    workoutSectionForButton: () => f.section,
    exerciseNameInputForLog: (log) => log.querySelector('[data-cardio-type]'),
    showWorkoutFinishIssues(_button, issues) { if (issues.length) events.push(['issues', issues.map((issue) => issue.message)]); return !issues.length; },
    workoutElapsedTimerState: strengthTimer,
    restTimerEndsAt: 777777,
    pendingGroupedCustomWorkoutRestart: { panel: { id: 'unrelated-strength-panel' }, format: 'superset' },
    cancelTrainingLogAutosaves: () => events.push(['cancel-autosaves']),
    requestWorkoutDifficulty: async () => outcome === 'cancel' ? null : { difficulty: 3, before: 2, after: 4 },
    workoutHistoryDifficultyLabel: () => 'Moderate',
    startWorkoutElapsedTimer: () => events.push(['timer-start']),
    pauseWorkoutTimersForCompletion: () => { events.push(['timer-pause']); return {}; },
    workoutCompletionFields: () => { events.push(['timer-fields']); return { workout_duration_seconds: 999 }; },
    finishWorkoutElapsedTimer: () => events.push(['timer-finish']),
    resumeWorkoutTimersAfterCancelledCompletion: () => events.push(['timer-resume']),
    saveTrainingLogRows: async (_button, logs, _status, options) => {
      events.push(['save', plain(options)]);
      if (outcome === 'throw') throw new Error('Offline');
      if (outcome === 'save-fails') return { saved: false };
      return { saved: true, rows: logs.flatMap((log) => context.rowsForTrainingLog(log)).map((row) => ({ ...row, ...options.workoutCompletion, session_id: 'saved-session' })) };
    },
    saveWorkoutDifficultyFeedback: async () => { events.push(['feedback']); return { saved: outcome !== 'feedback-fails' }; },
    renderClientTrainingLogs: () => events.push(['render-logs']),
    activeCustomWorkoutDraft: () => customDraft,
    clearCustomWorkoutDraft: () => events.push(['clear-custom-draft']),
    workoutCompletionShareSummary: (rows) => rows,
    openWorkoutCompletionSharePrompt: (rows) => events.push(['share', plain(rows)]),
    startFreshGroupedCustomWorkout: () => events.push(['restart-grouped'])
  });
  context.handleTrainingLogSave();
  return { ...f, context, events, customDraft, strengthTimer, click: () => listeners.get('click')({ target: { closest: (selector) => selector === '[data-workout-finish]' ? f.button : null } }) };
}

for (const hasStrengthTimer of [false, true]) {
  test(`successful cardio-only finish preserves strength work (${hasStrengthTimer ? 'running timer' : 'no timer'})`, async () => {
    const f = finishFixture({ hasStrengthTimer });
    const timerBefore = plain(f.strengthTimer);
    const draftBefore = plain(f.customDraft);
    await f.click();
    assert.deepEqual(plain(f.context.workoutElapsedTimerState), timerBefore);
    assert.deepEqual(f.customDraft, draftBefore);
    assert.equal(f.context.restTimerEndsAt, 777777);
    assert.equal(f.context.pendingGroupedCustomWorkoutRestart.format, 'superset');
    assert.ok(!f.events.some(([name]) => name.startsWith('timer-') || name === 'clear-custom-draft'));
    assert.equal(f.events.filter(([name]) => name === 'save').length, 1);
    assert.equal(f.events.find(([name]) => name === 'save')[1].workoutCompletion.workout_duration_seconds, 1800);
    assert.equal(f.events.find(([name]) => name === 'share')[1][0].weight_used, 30);
    assert.equal(f.section.workoutCompletionPendingFeedback, undefined);
    assert.equal(f.button.disabled, false);
  });
}

for (const outcome of ['cancel', 'save-fails', 'throw', 'feedback-fails']) {
  test(`cardio ${outcome} retains entries, active strength timer and retry controls`, async () => {
    const f = finishFixture({ outcome });
    const timerBefore = plain(f.strengthTimer);
    await f.click();
    assert.deepEqual(plain(f.context.workoutElapsedTimerState), timerBefore);
    assert.equal(f.context.restTimerEndsAt, 777777);
    assert.equal(f.fields['[data-cardio-duration]'].value, '30');
    assert.equal(f.fields['[data-cardio-type]'].value, 'Outdoor walk');
    assert.equal(f.button.disabled, false);
    assert.equal(f.section.dataset.workoutFinishing, undefined);
    assert.equal(f.context.pendingGroupedCustomWorkoutRestart.format, 'superset');
    assert.ok(!f.events.some(([name]) => name.startsWith('timer-') || name === 'clear-custom-draft' || name === 'share'));
    if (outcome === 'cancel') assert.ok(!f.events.some(([name]) => name === 'save'));
    if (outcome === 'feedback-fails') assert.equal(f.section.workoutCompletionPendingFeedback.workout_duration_seconds, 1800);
  });
}

test('opening cardio explicitly restarts a deleted daily context without rotating strength sessions', () => {
  for (const isCardio of [false, true]) {
    const f = cardioFixture({ 'workout-date': '2026-09-21' });
    f.section.classList.contains = (name) => isCardio && name === 'client-workout-panel-cardio';
    const button = { dataset: { clientWorkoutPickerChoose: '3' }, hasAttribute: (name) => isCardio && name === 'data-log-cardio' };
    const listeners = new Map();
    const calls = [];
    const context = evaluate(['handleClientWorkoutTabs'], {
      document: {
        addEventListener: (name, fn) => listeners.set(name, fn),
        getElementById: (id) => id === 'client-workout-panel-3' ? f.section : null,
        querySelectorAll: () => [{}, {}, {}, f.section]
      },
      activateClientWorkoutPanel: (index) => calls.push(['activate', index]),
      restartDeletedClientWorkoutContext: (record) => calls.push(['restart', plain(record)]),
      workoutElapsedTimerState: null, clientWorkoutLayoutSaving: false
    });
    context.handleClientWorkoutTabs();
    listeners.get('click')({ target: { closest: (selector) => selector === '[data-client-workout-picker-choose]' ? button : null } });
    assert.ok(calls.some(([name, index]) => name === 'activate' && index === 3));
    const restarts = calls.filter(([name]) => name === 'restart');
    assert.equal(restarts.length, isCardio ? 1 : 0);
    if (isCardio) assert.deepEqual(restarts[0][1], { client_email: 'client@example.com', entry_date: '2026-09-21', workout_title: 'Cardio' });
  }
});

for (const outcome of ['success', 'cancel', 'save-fails']) {
  test(`ordinary workout ${outcome} still follows the existing strength timer completion path`, async () => {
    const f = finishFixture({ outcome, isCardio: false });
    await f.click();
    const timerCalls = f.events.filter(([name]) => name.startsWith('timer-')).map(([name]) => name);
    assert.deepEqual(timerCalls, ['timer-pause', 'timer-fields', outcome === 'success' ? 'timer-finish' : 'timer-resume']);
    if (outcome !== 'cancel') assert.equal(f.events.find(([name]) => name === 'save')[1].workoutCompletion.workout_duration_seconds, 999);
  });
}

test('invalid cardio finish reports field issues before feedback or persistence', async () => {
  const f = finishFixture();
  f.fields['[data-cardio-duration]'].value = '';
  await f.click();
  assert.deepEqual(f.events.map(([name]) => name), ['issues']);
  assert.equal(f.button.disabled, false);
  assert.equal(f.context.workoutElapsedTimerState, f.strengthTimer);
});

test('cardio date synchronization refreshes only the cardio entry and preserves the custom strength draft', () => {
  const f = cardioFixture();
  const updates = [];
  const originalQuery = f.section.querySelectorAll;
  f.section.querySelectorAll = (selector) => selector === '[data-exercise-log] [data-log-date]'
    ? [f.fields['[data-log-date]']] : originalQuery(selector);
  f.fields['[data-log-date]'].closest = () => f.log;
  const customDraft = { workoutTitle: 'My strength session', exercises: [{ name: 'Squat' }] };
  const context = evaluate(['syncWorkoutPanelDate', 'persistCustomWorkoutDraftFromPanel'], {
    updateExerciseLogField: (log) => updates.push(log),
    renderCustomWorkoutCarousel: () => assert.fail('Cardio has no strength carousel'),
    storeCustomWorkoutDraft: () => assert.fail('Cardio must not replace a strength draft'),
    activeCustomWorkoutDraft: () => customDraft
  });
  context.syncWorkoutPanelDate(f.section, '2026-09-20');
  context.persistCustomWorkoutDraftFromPanel(f.section);
  assert.equal(f.fields['[data-workout-date]'].value, '2026-09-20');
  assert.equal(f.fields['[data-log-date]'].value, '2026-09-20');
  assert.deepEqual(updates, [f.log]);
  assert.deepEqual(customDraft, { workoutTitle: 'My strength session', exercises: [{ name: 'Squat' }] });
});
