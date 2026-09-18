const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/coach-workout-log.js'), 'utf8');
function fn(name) {
  const start = source.indexOf(`function ${name}(`);
  return source.slice(start, source.indexOf('\nfunction ', start + 1));
}
test('active-client names resolve to identities; duplicate names require an unambiguous choice', () => {
  const select = {value: ''};
  let switches = 0;
  const context = vm.createContext({
    coachWorkoutPrograms: [
      {client_name:'Jorge Ortiz',client_email:'jorge@example.com',active:true},
      {client_name:'Sam',client_email:'sam1@example.com',active:true},
      {client_name:'Sam',client_email:'sam2@example.com',active:true},
      {client_name:'Old',client_email:'old@example.com',active:false},
      {client_name:'Archived',client_email:'archive@example.com',client_archived:true}
    ],
    normalizeCoachWorkoutEmail: value => String(value || '').trim().toLowerCase(),
    document: {getElementById: () => select},
    switchCoachWorkoutContext: () => switches++
  });
  vm.runInContext(['activeCoachWorkoutClients','coachWorkoutClientNameOptions','handleCoachWorkoutClientNameInput'].map(fn).join('\n'), context);
  assert.equal(context.coachWorkoutClientNameOptions().length, 3);
  const input = {value:'Jorge Ortiz', setCustomValidity(value) {this.error = value;}};
  context.handleCoachWorkoutClientNameInput(input);
  assert.equal(select.value, 'jorge@example.com');
  input.value = 'Sam';
  context.handleCoachWorkoutClientNameInput(input);
  assert.equal(select.value, '');
  assert.ok(input.error);
  input.value = 'Sam — sam2@example.com';
  context.handleCoachWorkoutClientNameInput(input);
  assert.equal(select.value, 'sam2@example.com');
  assert.equal(input.error, '');
  input.value = '';
  context.handleCoachWorkoutClientNameInput(input);
  assert.equal(select.value, '');
  assert.equal(switches, 4);
});
