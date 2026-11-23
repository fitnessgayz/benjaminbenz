const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/client-portal.js'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'client-dashboard.html'), 'utf8');
function production(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0);
  const end = source.slice(start + 1).search(/\n(?:async )?function /);
  return source.slice(start, start + end + 1);
}
test('Enter logs exactly one focused, incomplete and enabled row', () => {
  let clicks = 0, prevents = 0;
  const handler = vm.runInNewContext(production('handleGroupedWorkoutLogEnter')+';handleGroupedWorkoutLogEnter');
  function event({input = true, complete = false, disabled = false, ...props} = {}) {
    const row = {querySelector(selector) {
      assert.match(selector, /aria-pressed="false".*:not\(:disabled\)/);
      return disabled ? null : {click() { clicks++; }};
    }};
    const field = {closest(selector) {
      assert.equal(selector, '.custom-workout-grouped-row:not(.is-complete)');
      return complete ? null : row;
    }};
    return {key:'Enter', target:{closest() {return input ? field : null;}}, preventDefault() {prevents++;}, ...props};
  }
  for (const override of [{complete:true},{disabled:true},{input:false},{repeat:true},{isComposing:true},
    {defaultPrevented:true},{shiftKey:true},{key:'Tab'}]) assert.equal(handler(event(override)), false);
  assert.equal(handler(event()), true);
  assert.deepEqual([clicks,prevents], [1,1]);
});
test('grouped gym history labels only selected-site PR even if not among recent sets', () => {
  const record = (weight_used,gym_name,entry_date,set_number=1,set_type='working') =>
    ({weight_used,gym_name,entry_date,set_number,set_type,reps:10,exercise_code:'EX'});
  const aRecent = record(150,'Gym A','2026-11-15');
  const aPR = record(175,'gym a ','2026-04-01');
  const bRecent = record(250,'Gym B','2026-11-18');
  const unknown = record(260,'','2026-11-17');
  const warm = record(350,'Gym A','2026-11-14',1001,'warm_up');
  let gym = 'Gym A';
  const log = {dataset:{},querySelector() {return {value:'2026-11-22'};}};
  const dialog = {showModal(){},addEventListener(){}};
  const globals = {
    customWorkoutGroupedLogElements: () => [log], currentExerciseHistoryName:()=> 'bench',
    workoutGymLocationForElement:()=>gym, escapeHtml:String, currentExerciseLabel:()=> 'Bench Press',
    workoutSetUnit:()=> 'Set', formatLogDate:String, customWorkoutGroupedCopyValue:v=>v ?? null,
    workingSetType:'working', warmupExerciseCode:'warmup', cardioExerciseCode:'cardio',
    normalizedSetType:t=> t, exerciseHistoryLookup:()=>new Map([['bench',[aPR,aRecent,bRecent,unknown,warm]]]),
    document:{body:{append(){}},createElement:()=>dialog},
  };
  const names = ['normalizeWorkoutGymName','sameWorkoutGym','logsForExerciseDisplay','recentExerciseHistoryByGym',
    'personalBestWeightLog','openCustomWorkoutGroupedHistory'];
  const run = vm.runInNewContext(names.map(production).join('\n')+'\nopenCustomWorkoutGroupedHistory',globals);
  const button = {dataset:{customGroupedHistory:'1'},closest:()=>({})};
  run(button);
  assert.match(dialog.innerHTML,/PR at this gym · <\/strong>175 lb/);
  assert.match(dialog.innerHTML,/250 lb/);
  assert.doesNotMatch(dialog.innerHTML,/PR at this gym · <\/strong>(250|260|350) lb/);
  gym='Gym B'; run(button);
  assert.match(dialog.innerHTML,/PR at this gym · <\/strong>250 lb/);
  gym='Gym C'; run(button);
  assert.doesNotMatch(dialog.innerHTML,/PR at this gym ·/);
  gym=''; run(button);
  assert.doesNotMatch(dialog.innerHTML,/PR at this gym ·/);
});
test('icon-only controls retain semantic names and target handlers', () => {
  const markup = vm.runInNewContext(production('floatingWorkoutFinishMarkup')+';floatingWorkoutFinishMarkup');
  for (const assigned of [true,false]) {
    const html = markup({assigned});
    assert.match(html,/aria-label="Discard workout"/);
    assert.match(html,/aria-label="Save and finish workout"/);
    assert.ok(html.includes(assigned?'data-reset-assigned-workout':'data-reset-custom-workout'));
  }
  assert.match(dashboard, /data-compact-workout-later aria-label="Finish later"[^>]*>\s*<svg[^>]*aria-hidden="true"/);
});
