const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'client-dashboard.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'js/client-portal.js'), 'utf8');

function declaration(name) {
  const match = new RegExp(`function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(match, `${name} exists`);
  const after = source.slice(match.index + match[0].length);
  const end = after.search(/\n(?:async\s+)?function\s+[\w$]+\s*\(/);
  return source.slice(match.index, end < 0 ? undefined : match.index + match[0].length + end);
}

test('workout chooser separates routines, personal training and FWB Trainer', () => {
  const context = vm.createContext({
    clientPreviewProgramSelected: false,
    clientAvailablePrograms: [{ program_title: 'Strength + Mobility', workouts: Array(7).fill({}) }],
    currentProgram: { program_title: 'Strength + Mobility', workouts: Array(7).fill({}) },
    window: { FWB_CLIENT_WORKOUT_ROUTINES: require('../js/client-workout-routines.js') },
    escapeHtml: (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
  });
  vm.runInContext([
    'clientWorkoutChoiceContent', 'clientCardioWorkoutChoiceMarkup', 'clientWorkoutChoiceDialogMarkup', 'clientWorkoutListMarkup'
  ].map(declaration).join('\n'), context);
  const markup = context.clientWorkoutListMarkup([{ isCardio: true, panelIndex: 8 }]);
  for (const title of ['Routines', 'Personal Training', 'FWB Trainer', 'Start Workout', 'Previous Workout',
    'Explore Routines', 'Workout calendar', 'Strength + Mobility', 'Start with FWB Trainer', 'Saved FWB Workout', 'Benjamin’s Routine']) {
    assert.ok(markup.includes(title), `${title} is shown`);
  }
  const routines = markup.match(/id="workout-hub-routines"[\s\S]*?<\/section>/)[0];
  const trainer = markup.match(/id="workout-hub-trainer"[\s\S]*?<\/section>/)[0];
  assert(routines.indexOf('Start Workout') < routines.indexOf('Previous Workout'));
  assert.match(markup, /aria-selected="true"[^>]*[\s\S]*?data-client-workout-hub-tab="routines"/);
  assert.match(routines, /client-workout-hub-start/);
  assert.doesNotMatch(routines, /Find a Gym|data-find-nearby-gym|data-client-saved-workout-plans/);
  assert.doesNotMatch(routines, /Find a Gym|data-find-nearby-gym/);
  assert.doesNotMatch(html, /gym-directory-dialog|client-gym-directory\.js|client-gym-directory\.css/);
  assert.match(markup, /data-client-workout-calendar-open/);
  assert.doesNotMatch(markup, /Form Checks/);
  assert.match(markup, /data-preview-program="0"/);
  assert.match(trainer, /data-client-saved-workout-plans/);
  assert.doesNotMatch(declaration('customWorkoutPanelMarkup'), /data-client-saved-workout-plans/);
  assert.match(markup, /data-client-workout-picker-choose="0"/);
  assert.match(markup, /data-client-generate-workout-plan/);
  assert.match(markup, /data-generate-workout data-generator-preset="today"/);
  assert.doesNotMatch(markup, /data-generator-preset="mobility"|data-log-cardio/);
  assert.match(html, /client-workout-hub\.css\?v=8/);
  assert.match(html, /client-workout-hub-parity\.css/);
});

test('multiple trainer programs stay under one choice', () => {
  const context = vm.createContext({
    clientPreviewProgramSelected: false,
    clientAvailablePrograms: [
      { id: 'a', program_title: 'Strength', workouts: [{}, {}] },
      { id: 'b', program_title: 'Mobility', workouts: [{}] }
    ],
    currentProgram: { id: 'a', program_title: 'Strength', workouts: [{}, {}] },
    escapeHtml: (value) => String(value ?? '')
  });
  vm.runInContext(['clientWorkoutChoiceContent', 'clientCardioWorkoutChoiceMarkup', 'clientWorkoutChoiceDialogMarkup', 'clientWorkoutListMarkup'].map(declaration).join('\n'), context);
  const markup = context.clientWorkoutListMarkup([{ isCardio: true, panelIndex: 4 }]);
  assert.equal((markup.match(/data-preview-program="/g) || []).length, 1);
  assert.match(markup, /2 plans/);
});

test('assigned workout preview keeps Generate Workout and Cardio in its footer', () => {
  const context = vm.createContext({
    clientPreviewProgramSelected: true,
    clientAvailablePrograms: [],
    currentProgram: { program_title: 'Strength', workouts: [] },
    clientWorkoutLayoutSaving: false,
    workoutElapsedTimerState: null,
    escapeHtml: (value) => String(value ?? '')
  });
  vm.runInContext(['clientWorkoutChoiceContent', 'clientCardioWorkoutChoiceMarkup', 'clientWorkoutChoiceDialogMarkup', 'clientWorkoutListMarkup'].map(declaration).join('\n'), context);
  const markup = context.clientWorkoutListMarkup([{ isCardio: true, panelIndex: 2 }]);
  assert.match(markup, /data-client-workout-choice-menu="generate"/);
  assert.match(markup, /data-log-cardio/);
  assert.doesNotMatch(markup, /cardio-mobility|data-generator-preset="mobility"/);
  assert.match(markup, /data-client-workout-choice-dialog/);
  assert.match(markup, /data-client-workout-picker-choose="2"/);
});
