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

test('workout chooser offers the seven requested paths without Form Checks', () => {
  const context = vm.createContext({
    clientPreviewProgramSelected: false,
    clientAvailablePrograms: [{ program_title: 'Strength + Mobility', workouts: Array(7).fill({}) }],
    currentProgram: { program_title: 'Strength + Mobility', workouts: Array(7).fill({}) },
    escapeHtml: (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
  });
  vm.runInContext([
    'clientWorkoutChoiceContent', 'clientCardioWorkoutChoiceMarkup', 'clientWorkoutListMarkup'
  ].map(declaration).join('\n'), context);
  const markup = context.clientWorkoutListMarkup([{ isCardio: true, panelIndex: 8 }]);
  assert.equal((markup.match(/class="workout-choice-card"/g) || []).length, 7);
  for (const title of ['Trainer Prescribed Workouts', 'Saved Workout Program', 'Log Workout',
    'Generate Workout Plan', 'Generate Today’s Workout', 'Cardio', 'Mobility']) {
    assert.ok(markup.includes(title), `${title} is shown`);
  }
  assert.doesNotMatch(markup, /Form Checks/);
  assert.match(markup, /data-preview-program="0"/);
  assert.match(markup, /data-client-saved-workout-plans/);
  assert.match(markup, /data-client-workout-picker-choose="0"/);
  assert.match(markup, /data-client-generate-workout-plan/);
  assert.match(markup, /data-generate-workout data-generator-preset="today"/);
  assert.match(markup, /data-generate-workout data-generator-preset="mobility"/);
  assert.match(markup, /data-log-cardio/);
  assert.match(html, /client-workout-hub\.css\?v=2/);
  assert.match(html, /Choose Your Workout/);
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
  vm.runInContext(['clientWorkoutChoiceContent', 'clientCardioWorkoutChoiceMarkup', 'clientWorkoutListMarkup'].map(declaration).join('\n'), context);
  const markup = context.clientWorkoutListMarkup([{ isCardio: true, panelIndex: 4 }]);
  assert.equal((markup.match(/class="workout-choice-card"/g) || []).length, 7);
  assert.match(markup, /2 plans/);
});
