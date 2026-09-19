const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/client-portal.js'), 'utf8');
const start = source.indexOf('async function saveWorkoutDifficultyFeedback(');
const saveSource = source.slice(start, source.indexOf('\nfunction ', start));
function fixture(fail = false) {
  let payload, local;
  const context = vm.createContext({
    activeClientEmail: 'client@example.com',
    workoutFeedbackSessionId: row => row?.session_id,
    workoutDifficultyLabel: value => value >= 1 && value <= 5 ? 'Rated' : '',
    upsertLocalWorkoutSessionFeedback: value => { local = value; },
    supabaseClient: { from: () => ({ upsert: value => {
      payload = value;
      return { select: () => ({ single: async () => fail ? { error: 'offline' } : { data: value } }) };
    } }) }
  });
  vm.runInContext(saveSource, context);
  return { save: context.saveWorkoutDifficultyFeedback, payload: () => payload, local: () => local };
}
const rows = [{session_id:'test-session',entry_date:'2026-09-18',workout_title:'Workout'}];
test('saves difficulty and both energy ratings in the same feedback record', async () => {
  const f = fixture();
  assert.equal((await f.save(rows, 3, {before:2,after:5})).saved, true);
  assert.equal(f.payload().difficulty_rating, 3);
  assert.equal(f.payload().energy_before, 2);
  assert.equal(f.payload().energy_after, 5);
  assert.equal(f.local().energy_after, 5);
});
test('rejects invalid energy ratings without a write', async () => {
  for (const value of [0,6,1.5,'3']) {
    const f = fixture();
    assert.equal((await f.save(rows, 3, {before:value,after:4})).saved, false);
    assert.equal(f.payload(), undefined);
  }
});
test('failed saves do not mark feedback saved locally', async () => {
  const f = fixture(true);
  assert.equal((await f.save(rows,3,{before:2,after:4})).saved,false);
  assert.equal(f.local(),undefined);
});
