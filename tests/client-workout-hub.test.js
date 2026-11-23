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

const email = "training-client@example.test";
const eligible = fields => ({ active: true, client_email: email, membership_type: "personal_training", ...fields });
const accessGlobals = {
  activeDashboardUser: {email}, isCoachDashboardPreview: false,
  normalizeClientEmail: value => String(value || "").trim().toLowerCase(),
  clientWorkoutHubSection: "routines"
};
const accessDeclarations = [
  "clientCoachingMembership", "clientPersonalTrainingAccess", "currentClientPersonalTrainingAccess", "allowedClientWorkoutHubSection"
];

test('workout chooser separates routines, personal training and GRUNTR Trainer', () => {
  const context = vm.createContext({
    ...accessGlobals,
    clientPreviewProgramSelected: false,
    clientAvailablePrograms: [eligible({ id: 'a', program_title: 'Strength + Mobility', workouts: Array(7).fill({}) })],
    currentProgram: { id: 'a', program_title: 'Strength + Mobility', workouts: Array(7).fill({}) },
    window: { FWB_CLIENT_WORKOUT_ROUTINES: require('../js/client-workout-routines.js') },
    escapeHtml: (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
  });
  vm.runInContext([
    ...accessDeclarations, 'clientWorkoutChoiceContent', 'clientCardioWorkoutChoiceMarkup', 'clientWorkoutChoiceDialogMarkup', 'clientWorkoutListMarkup'
  ].map(declaration).join('\n'), context);
  const markup = context.clientWorkoutListMarkup([{ isCardio: true, panelIndex: 8 }]);
  for (const title of ['Routines', 'Personal Training', 'GRUNTR Trainer', 'Start Workout', 'Previous Workout',
    'Explore Routines', 'Workout calendar', 'Strength + Mobility', 'Start with GRUNTR Trainer', 'Saved workouts', 'Benjamin’s Routine']) {
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
  assert.match(markup, /<dialog[^>]*data-client-workout-choice-dialog[^>]*>\s*<button[^>]*class="lifthardr-profile-return"[^>]*data-client-workout-choice-close="explore"[^>]*>Close<\/button>/);
  assert.match(markup, /<button[^>]*data-client-workout-choice-close="generate"[^>]*>✕<\/button>/);
  assert.match(markup, /data-client-generate-workout-plan/);
  assert.match(markup, /data-generate-workout data-generator-preset="today"/);
  assert.doesNotMatch(markup, /data-generator-preset="mobility"|data-log-cardio/);
  assert.match(html, /client-workout-hub\.css\?v=8/);
  assert.match(html, /client-workout-hub-parity\.css/);
});

test('multiple eligible trainer programs stay in the Personal Training section', () => {
  const context = vm.createContext({
    ...accessGlobals,
    clientPreviewProgramSelected: false,
    clientAvailablePrograms: [
      eligible({ id: 'a', program_title: 'Strength', workouts: [{}, {}] }),
      eligible({ id: 'b', program_title: 'Mobility', workouts: [{}] }),
      eligible({ id: 'c', account_type: 'beta_tester', program_title: 'Hidden beta plan', workouts: [{}] })
    ],
    currentProgram: { id: 'a', program_title: 'Strength', workouts: [{}, {}] },
    escapeHtml: (value) => String(value ?? '')
  });
  vm.runInContext([...accessDeclarations, 'clientWorkoutChoiceContent', 'clientCardioWorkoutChoiceMarkup', 'clientWorkoutChoiceDialogMarkup', 'clientWorkoutListMarkup'].map(declaration).join('\n'), context);
  const markup = context.clientWorkoutListMarkup([{ isCardio: true, panelIndex: 4 }]);
  const personal = markup.match(/id="workout-hub-personal"[\s\S]*?<\/section>/)[0];
  assert.equal((personal.match(/data-preview-program="/g) || []).length, 2);
  assert.match(personal, /Strength/);
  assert.match(personal, /Mobility/);
  assert.doesNotMatch(markup, /Hidden beta plan/);
});

test('assigned workout preview keeps Generate Workout and Cardio in its footer', () => {
  const context = vm.createContext({
    ...accessGlobals,
    clientPreviewProgramSelected: true,
    clientAvailablePrograms: [eligible({ id: 'a' })],
    currentProgram: { id: 'a', program_title: 'Strength', workouts: [] },
    clientWorkoutLayoutSaving: false,
    workoutElapsedTimerState: null,
    escapeHtml: (value) => String(value ?? '')
  });
  vm.runInContext([...accessDeclarations, 'clientWorkoutChoiceContent', 'clientCardioWorkoutChoiceMarkup', 'clientWorkoutChoiceDialogMarkup', 'clientWorkoutListMarkup'].map(declaration).join('\n'), context);
  const markup = context.clientWorkoutListMarkup([{ isCardio: true, panelIndex: 2 }]);
  assert.match(markup, /data-client-workout-choice-menu="generate"/);
  assert.match(markup, /data-log-cardio/);
  assert.doesNotMatch(markup, /cardio-mobility|data-generator-preset="mobility"/);
  assert.match(markup, /data-client-workout-choice-dialog/);
  assert.match(markup, /data-client-workout-picker-choose="2"/);
});
