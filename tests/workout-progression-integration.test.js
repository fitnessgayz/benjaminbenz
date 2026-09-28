const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const engine = require('../js/workout-progression.js');
const ui = require('../js/workout-progression-ui.js');
const layout = require('../js/workout-layout.js');
const portal = fs.readFileSync(require.resolve('../js/client-portal.js'), 'utf8');
const coach = fs.readFileSync(require.resolve('../js/coach-admin.js'), 'utf8');
const source = (text, name) => {
  const start = text.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  const rest = text.slice(start), end = rest.slice(1).search(/\n(?:async )?function /);
  return rest.slice(0, end < 0 ? undefined : end + 1);
};
const config = { enabled: true, exercise_key: 'name:bench press', rep_min: 8, rep_max: 12,
  planned_sets: 3, target_rir: 2, increment: 2.5, unit: 'lb', required_sessions: 2 };
function fixture(options = {}) {
  const memory = options.memory || new Map();
  const row = (number, type = 'working', weight = '', reps = '', completed = false) => ({
    dataset: { setNumber: String(number), setType: type }, fields: { weight: { value: weight }, reps: { value: reps } },
    classList: { contains: name => name === 'is-complete' && completed },
    querySelector(selector) { return this.fields[selector.match(/data-set-(weight|reps)/)?.[1]] || null; }
  });
  const panel = { innerHTML: '' };
  const log = {
    dataset: { exerciseCode: 'A1', exercisePrescription: '8–12 reps x 3 sets', progressionConfig: JSON.stringify(options.config ?? config) },
    rows: [row(1001, 'warm_up'), row(1), row(2), row(3)],
    querySelectorAll() { return this.rows; },
    querySelector: selector => selector === '[data-workout-progression]' ? panel : null,
    closest: () => null
  };
  const history = ['2026-09-20', '2026-09-23'].flatMap((date, day) => [1, 2, 3].map(set_number => ({
    session_id: 'session-' + day, entry_date: date, completed_at: date + 'T20:00:00Z', exercise_name: 'Bench Press',
    exercise_code: 'A1', set_number, set_type: 'working', weight_used: 40, reps: 12,
    effort_scale: 'rir', effort_value: 2, progression_target: { ...config }
  })));
  const context = { name: 'Bench Press', clientEmail: 'test@example.com', date: '2026-09-26', title: 'Strength',
    custom: true, now: new Date('2026-09-26T20:00:00Z'), history, historyComplete: true, sessionId: 'current',
    storage: { getItem: key => memory.get(key), setItem: (key, value) => memory.set(key, value) },
    afterApply: () => {} };
  return { log, context, row, panel, memory };
}

test('applying a recommendation fills only empty normal working fields, never entered values, warm-ups, or completed rows', () => {
  const f = fixture();
  f.log.rows = [f.row(1001, 'warm_up'), f.row(1, 'working', '45', ''), f.row(2, 'working', '', '10'),
    f.row(3, 'working', '', '', true), f.row(4, 'drop_set')];
  assert.equal(ui.apply(f.log, f.context), 2);
  assert.equal(f.log.rows[1].fields.weight.value, '45');
  assert.equal(f.log.rows[1].fields.reps.value, '8');
  assert.equal(f.log.rows[2].fields.weight.value, '42.5');
  assert.equal(f.log.rows[2].fields.reps.value, '10');
  for (const index of [0, 3, 4]) assert.equal(f.log.rows[index].fields.weight.value, '');
  assert.equal(f.log.rows[1].classList.contains('is-complete'), false);
});

test('Start/apply snapshot preserves original set count after an unfinished set is removed and across reloads', () => {
  const f = fixture();
  ui.freeze(f.log, f.context);
  f.log.rows.pop();
  f.log.dataset.progressionConfig = JSON.stringify({ ...config, planned_sets: 2, rep_max: 15 });
  assert.deepEqual(ui.freeze(f.log, f.context), config);
  const reloaded = fixture({ memory: f.memory });
  reloaded.log.rows.pop();
  assert.deepEqual(ui.configFor(reloaded.log, reloaded.context), config);
});

test('custom draft serialization restores the original snapshot before render', () => {
  const f = fixture(); ui.freeze(f.log, f.context);
  const saved = ui.serialize(f.log), reloaded = fixture();
  reloaded.log.rows.pop(); ui.restore(reloaded.log, saved);
  assert.deepEqual(ui.configFor(reloaded.log, reloaded.context), config);
  assert.equal(saved.progression_target.planned_sets, 3);
});

test('server snapshot restoration takes priority over a changed program', () => {
  const f = fixture({ config: { ...config, rep_max: 15 } });
  ui.restore(f.log, { progression_target: config });
  assert.equal(ui.configFor(f.log, f.context).rep_max, 12);
});

test('changing exercise or date does not reuse a frozen snapshot from the previous exercise/session', () => {
  const f = fixture(); ui.freeze(f.log, f.context);
  f.log.rows.pop();
  assert.equal(ui.configFor(f.log, { ...f.context, name: 'Dumbbell bench press' }), null);
  assert.equal(ui.configFor(f.log, { ...f.context, date: '2026-09-27' }).planned_sets, 2);
});

test('a disabled coach plan cannot expose Apply or fill fields', () => {
  const f = fixture({ config: { ...config, enabled: false } });
  assert.equal(ui.markup(f.log, f.context), '');
  assert.equal(ui.apply(f.log, f.context), 0);
  assert.equal(f.log.rows[1].fields.weight.value, '');
});

test('missing history and new exercises do not invent starting weights', () => {
  for (const change of [{ history: [] }, { historyComplete: false }]) {
    const f = fixture(); Object.assign(f.context, change);
    assert.equal(ui.apply(f.log, f.context), 0);
    assert.doesNotMatch(ui.markup(f.log, f.context), /data-progression-apply/);
  }
});

test('unconfigured custom sets offer explicit range setup, and timed prescriptions do not', () => {
  const f = fixture(); f.log.dataset.progressionConfig = 'null'; f.log.dataset.exercisePrescription = 'Custom sets';
  assert.match(ui.markup(f.log, f.context), /Set progression targets/);
  assert.doesNotMatch(ui.markup(f.log, f.context), /data-progression-apply/);
  f.log.dataset.exercisePrescription = '3 x 30 seconds';
  assert.doesNotMatch(ui.markup(f.log, f.context), /data-progression-settings/);
});

test('configuration validates inputs and cannot mutate a frozen session', () => {
  const f = fixture();
  const fields = { rep_min: { value: '8' }, rep_max: { value: '12' }, target_rir: { value: '2' }, increment: { value: '5' } };
  const form = { querySelector: selector => fields[selector.match(/data-progression-field="(\w+)"/)?.[1]] || {} };
  assert.equal(ui.configure(f.log, f.context, form), true);
  assert.equal(ui.configFor(f.log, f.context).increment, 5);
  ui.freeze(f.log, f.context); fields.increment.value = '10';
  assert.equal(ui.configure(f.log, f.context, form), false);
  assert.equal(ui.configFor(f.log, f.context).increment, 5);
});

test('older schemas trigger compatibility handling only for the specific missing target column', () => {
  assert.equal(ui.isMissingTargetColumn({ code: 'PGRST204', message: "Could not find the 'progression_target' column in the schema cache" }), true);
  assert.equal(ui.isMissingTargetColumn({ code: '42703', message: 'column progression_target does not exist' }), true);
  assert.equal(ui.isMissingTargetColumn({ code: '42501', message: 'Permission denied for progression_target column' }), false);
  assert.equal(ui.isMissingTargetColumn({ code: '42703', message: 'column effort_value does not exist' }), false);
});

const coachAPI = Function('window', 'WorkoutLayout', 'youtubeExerciseDemoUrl', [
  source(coach, 'parseExercises'), source(coach, 'exercisesToText'), source(coach, 'coachExercisesWithProgression'),
  'return { parseExercises, exercisesToText, coachExercisesWithProgression };'
].join('\n'))({ FWB_WORKOUT_PROGRESSION: engine }, layout, value => value || '');

test('coach six-field textarea round trips retain progression after editing, reordering, renaming and changing codes', () => {
  const exercises = [{ code: 'A1', name: 'Bench Press', prescription: '8–12 reps x 3 sets', rest: '90s', progression: config },
    { code: 'A2', name: 'Row', prescription: '8–12 reps x 3 sets', progression: { ...config, exercise_key: 'name:row', enabled: false } }];
  const textarea = { value: coachAPI.exercisesToText(exercises), dataset: { exerciseMetadata: JSON.stringify(exercises) } };
  assert.deepEqual(coachAPI.coachExercisesWithProgression(textarea)[0].progression, config);
  textarea.value = textarea.value.split('\n').reverse().join('\n').replace('A1 | Bench Press', 'B2 | Bench Press').replace('A2 | Row', 'A2 | Cable Row');
  const result = coachAPI.coachExercisesWithProgression(textarea);
  assert.equal(result[0].progression.enabled, false);
  assert.equal(result[0].progression.exercise_key, 'name:cable row');
  assert.equal(result[1].progression.exercise_key, config.exercise_key);
  assert.equal(result[1].code, 'B2');
  assert.equal(coachAPI.exercisesToText(result).split('\n')[0].split('|').length, 6);
});

test('coach set-count edits update future plans without mutating metadata snapshots', () => {
  const textarea = { value: 'A1 | Bench Press | 8–12 reps x 4 sets | 90s | |', dataset: { exerciseMetadata: JSON.stringify([{ code: 'A1', name: 'Bench Press', progression: config }]) } };
  assert.equal(coachAPI.coachExercisesWithProgression(textarea)[0].progression.planned_sets, 4);
  assert.equal(JSON.parse(textarea.dataset.exerciseMetadata)[0].progression.planned_sets, 3);
});

test('all logger formats share the progression renderer and copied/generated metadata survives', () => {
  assert.match(source(portal, 'exerciseLogFields'), /data-progression-config/);
  assert.match(source(portal, 'customWorkoutGroupedExerciseKeyMarkup'), /data-workout-progression-index/);
  assert.match(source(portal, 'generatedCustomWorkoutDraft'), /exercise\.progression/);
  assert.match(source(portal, 'customWorkoutDraftFromLogs'), /progression_target/);
  assert.match(source(portal, 'serializeCustomExerciseDraft'), /workoutProgressionDraft/);
  assert.match(source(portal, 'rowsForTrainingLog'), /isSetRowLogged\(setRow\).*workoutProgressionLogTarget/);
});

test('kilogram plans cannot populate a logger that stores pounds', () => {
  const f = fixture({ config: { ...config, unit: 'kg' } });
  assert.equal(ui.apply(f.log, f.context), 0);
  assert.match(ui.markup(f.log, f.context), /logger records pounds/);
});

test('different session identities on the same date/title never share a frozen plan', () => {
  const f = fixture(); ui.freeze(f.log, f.context);
  f.log.rows.pop();
  assert.equal(ui.configFor(f.log, { ...f.context, sessionId: 'restarted-session' }).planned_sets, 2);
  assert.equal(ui.configFor(f.log, f.context).planned_sets, 3);
});

test('applied/editable suggestions stay out of autosave until explicitly logged, including after draft reload', () => {
  const f = fixture(); ui.apply(f.log, f.context);
  f.log.rows[1].fields.weight.value = '44';
  ui.persistPending(f.log, f.context);
  const isLogged = Function(source(portal, 'setRowInputValues') + '\n' + source(portal, 'isSetRowLogged') + '; return isSetRowLogged;')();
  assert.equal(isLogged(f.log.rows[1]), false);
  assert.equal(isLogged(f.log.rows[2]), false);
  const reloaded = fixture({ memory: f.memory });
  ui.restorePending(reloaded.log, reloaded.context);
  assert.equal(reloaded.log.rows[1].fields.weight.value, '44');
  assert.equal(isLogged(reloaded.log.rows[1]), false);
  assert.equal(ui.isPending(reloaded.log, reloaded.log.rows[1], reloaded.context), true);
  reloaded.log.rows[1].classList.contains = () => true;
  reloaded.log.rows[1].closest = () => null;
  assert.equal(isLogged(reloaded.log.rows[1]), true);
  assert.equal(isLogged(reloaded.log.rows[2]), false);
  ui.persistPending(reloaded.log, reloaded.context);
  const afterSave = fixture({ memory: f.memory }); ui.restorePending(afterSave.log, afterSave.context);
  assert.equal(afterSave.log.rows[1].fields.weight.value, '');
  assert.equal(afterSave.log.rows[2].fields.weight.value, '42.5');
});

test('saved plans restored after a date switch are bound to the selected session', () => {
  const f = fixture(); ui.freeze(f.log, f.context);
  const next = { ...f.context, date: '2026-09-27', sessionId: 'next-session' };
  ui.restore(f.log, { progression_target: { ...config, planned_sets: 4 } }, next);
  assert.equal(ui.configFor(f.log, next).planned_sets, 4);
});

test('malformed explicit plans stay unavailable and survive drafts without silently enabling defaults', () => {
  const invalid = { ...config, increment: -1 }, f = fixture({ config: invalid });
  assert.equal(ui.configFor(f.log, f.context), null);
  assert.equal(ui.apply(f.log, f.context), 0);
  assert.deepEqual(ui.serialize(f.log).progression, invalid);
});

test('kg plans cannot attach a kg snapshot to manually entered pound values', () => {
  const f = fixture({ config: { ...config, unit: 'kg' } });
  assert.equal(ui.freeze(f.log, f.context), null);
  assert.equal(f.log.dataset.progressionTarget, undefined);
});

test('coach preserves exercise metadata and updates configured range on prescription edits', () => {
  const exercise = { code: 'A1', name: 'Bench Press', prescription: '8–12 reps x 3 sets', progression: config,
    instructions: 'Control the lowering', equipment: 'barbell', library_id: 'stable-id', group: 'A' };
  const textarea = { value: coachAPI.exercisesToText([{ ...exercise, prescription: '6–8 reps x 4 sets' }]), dataset: { exerciseMetadata: JSON.stringify([exercise]) } };
  const result = coachAPI.coachExercisesWithProgression(textarea)[0];
  assert.equal(result.instructions, exercise.instructions); assert.equal(result.library_id, 'stable-id');
  assert.equal(result.progression.rep_min, 6); assert.equal(result.progression.rep_max, 8); assert.equal(result.progression.planned_sets, 4);
  textarea.value = textarea.value.replace('6–8 reps x 4 sets', '3 x AMRAP');
  assert.equal(coachAPI.coachExercisesWithProgression(textarea)[0].progression.enabled, false);
  textarea.value = textarea.value.replace('Bench Press', 'Cable Fly');
  const substitute = coachAPI.coachExercisesWithProgression(textarea)[0];
  assert.equal(substitute.progression.enabled, false); assert.equal(substitute.library_id, undefined);
});

test('editing a coach effort target preserves weight units and required-session overrides', () => {
  const exercise = { name: 'Bench Press', prescription: '8–12 reps x 3 sets', progression: { ...config, unit: 'kg', required_sessions: 3 } };
  const fields = { enabled: { checked: true }, rep_min: { value: '8' }, rep_max: { value: '12' }, target_rir: { value: '3' }, increment: { value: '2.5' } };
  const row = { querySelector: selector => fields[selector.match(/data-builder-progression="(\w+)"/)[1]] };
  const fromRow = Function('window', 'WorkoutLayout', source(coach, 'coachProgressionFromRow') + '; return coachProgressionFromRow;')({ FWB_WORKOUT_PROGRESSION: engine }, layout);
  const saved = fromRow(row, exercise); assert.equal(saved.unit, 'kg'); assert.equal(saved.required_sessions, 3); assert.equal(saved.target_rir, 3);
});
