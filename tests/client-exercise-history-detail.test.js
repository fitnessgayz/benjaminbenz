const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const detail = require(path.join(root, 'js/client-exercise-history-detail.js'));
const source = fs.readFileSync(path.join(root, 'js/client-exercise-history-detail.js'), 'utf8');

const rows = [
  { id: 'a1', session_id: 'a', entry_date: '2026-10-02', workout_title: 'Upper', gym_name: 'Fitness SF Castro', exercise_name: 'Archer Push-Up', set_number: 1001, set_type: 'warm_up', weight_used: 20, reps: 5 },
  { id: 'a2', session_id: 'a', entry_date: '2026-10-02', workout_title: 'Upper', gym_name: 'Fitness SF Castro', exercise_name: 'Archer Push-Up', set_number: 1, set_type: 'working', weight_used: 40, reps: 10 },
  { id: 'a3', session_id: 'a', entry_date: '2026-10-02', workout_title: 'Upper', gym_name: 'Fitness SF Castro', exercise_name: 'Archer Push-Up', set_number: 2, set_type: 'working', weight_used: 50, reps: 8 },
  { id: 'b1', session_id: 'b', entry_date: '2026-10-08', workout_title: 'Upper', gym_name: 'Alex Fitness', exercise_name: 'Archer Push-Up', set_number: 1, weight_used: 70, reps: 6 },
  { id: 'c1', session_id: 'c', entry_date: '2026-10-10', workout_title: 'Upper', gym_name: '', exercise_name: 'Archer Push-Up', set_number: 1, weight_used: 0, reps: 12 },
  { id: 'other', session_id: 'z', entry_date: '2026-10-12', workout_title: 'Upper', gym_name: 'Fitness SF Castro', exercise_name: 'Archer Push-Up Machine', set_number: 1, weight_used: 205, reps: 15 }
];

test('history uses exact exercise identity and separates gyms, including unknown gym', () => {
  const all = detail.buildHistory(rows, ' archer   push-up ');
  assert.equal(all.sessions.length, 3);
  assert.equal(all.gyms.length, 3);
  assert.deepEqual(all.sessions.map((session) => session.date), ['2026-10-10', '2026-10-08', '2026-10-02']);
  assert.equal(all.metrics.maxWeight, 70);
  assert.equal(all.metrics.maxReps, 12);
  assert.equal(all.metrics.totalVolume, 1220);
  assert.equal(all.metrics.workingCount, 4);
  const castro = all.gyms.find((gym) => gym.name === 'Fitness SF Castro');
  assert.equal(castro.metrics.totalVolume, 800);
  assert.equal(castro.metrics.maxWeight, 50);
  assert.equal(detail.buildHistory(rows, 'Archer Push-Up', castro.id).sessions.length, 1);
  assert.equal(detail.buildHistory(rows, 'Archer Push-Up Machine').metrics.maxWeight, 205);
  assert.equal(detail.buildHistory(rows, 'Never done').sessions.length, 0);
});

test('detail view renders dated sets and gym filter without RIR or unsafe markup', () => {
  const handlers = new Map();
  const dialog = {
    innerHTML: '', open: false,
    setAttribute() {},
    addEventListener(name, handler) { handlers.set(name, handler); },
    showModal() { this.open = true; },
    querySelector() { return { focus() {} }; }
  };
  const document = {
    body: { append() {} },
    createElement() { return dialog; },
    addEventListener() {}
  };
  const window = { document };
  vm.runInNewContext(source, { window });
  window.FWB_CLIENT_EXERCISE_HISTORY_DETAIL.setLogs([
    ...rows,
    { ...rows[3], id: 'xss', session_id: 'bad', exercise_name: '<img src=x onerror=alert(1)>', gym_name: '<script>alert(1)</script>' }
  ]);
  window.FWB_CLIENT_EXERCISE_HISTORY_DETAIL.open('Archer Push-Up');
  assert.equal(dialog.open, true);
  assert.match(dialog.innerHTML, /Fitness SF Castro/);
  assert.match(dialog.innerHTML, /Oct 8, 2026/);
  assert.match(dialog.innerHTML, /<table>/);
  assert.match(dialog.innerHTML, /<th scope="row">W1<\/th>/);
  assert.match(dialog.innerHTML, /Total volume/);
  assert.match(dialog.innerHTML, /By gym/);
  assert.match(dialog.innerHTML, /Trend/);
  assert.doesNotMatch(dialog.innerHTML, /RIR/);
  const castroId = detail.buildHistory(rows, 'Archer Push-Up').gyms.find((gym) => gym.name === 'Fitness SF Castro').id;
  handlers.get('change')({ target: { value: castroId, matches() { return true; } } });
  assert.match(dialog.innerHTML, /<span>Sessions<\/span><strong>1<\/strong>/);
  assert.match(dialog.innerHTML, /800 lb/);
  window.FWB_CLIENT_EXERCISE_HISTORY_DETAIL.open('<img src=x onerror=alert(1)>');
  assert.match(dialog.innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(dialog.innerHTML, /<script>/);
});

test('long histories render ten sessions at a time', () => {
  let dialog;
  const handlers = new Map();
  const document = {
    body: { append() {} },
    createElement() {
      dialog = {
        innerHTML: '', open: false,
        setAttribute() {},
        addEventListener(name, handler) { handlers.set(name, handler); },
        showModal() { this.open = true; },
        querySelector() { return { focus() {} }; }
      };
      return dialog;
    },
    addEventListener() {}
  };
  const window = { document };
  vm.runInNewContext(source, { window });
  window.FWB_CLIENT_EXERCISE_HISTORY_DETAIL.setLogs(Array.from({ length: 12 }, (_, index) => ({
    id: `set-${index}`, session_id: `session-${index}`, entry_date: `2026-10-${String(index + 1).padStart(2, '0')}`,
    exercise_name: 'Bench Press', workout_title: 'Upper', gym_name: 'Downtown Gym', set_number: 1,
    weight_used: 100 + index, reps: 8
  })));
  window.FWB_CLIENT_EXERCISE_HISTORY_DETAIL.open('Bench Press');
  assert.equal((dialog.innerHTML.match(/<table>/g) || []).length, 10);
  assert.match(dialog.innerHTML, /Show 2 more sessions/);
  handlers.get('click')({ target: { closest(selector) { return selector.includes('more') ? {} : null; } } });
  assert.equal((dialog.innerHTML.match(/<table>/g) || []).length, 12);
  assert.doesNotMatch(dialog.innerHTML, /Show 2 more sessions/);
});

test('dashboard loads the detail asset and keeps history buttons inside saved exercise rows', () => {
  const dashboard = fs.readFileSync(path.join(root, 'client-dashboard.html'), 'utf8');
  const portal = fs.readFileSync(path.join(root, 'js/client-portal.js'), 'utf8');
  assert.match(dashboard, /client-exercise-history-detail\.css/);
  assert.match(dashboard, /client-exercise-history-detail\.js/);
  assert.match(portal, /FWB_CLIENT_EXERCISE_HISTORY_DETAIL\?\.setLogs\(trainingLogs\)/);
  assert.match(portal, /data-client-exercise-history-open/);
});
