const test = require('node:test');
const assert = require('node:assert/strict');
const layout = require('../js/workout-layout.js');

test('prescriptions retain ranges, ladders, unilateral targets and timed holds', () => {
  for (const [source, expected] of [
    ['8 reps x 4 sets', '4 × 8'], ['3 sets x 8-12 reps', '3 × 8-12'],
    ['12, 10, 8 reps x 3 sets', '3 × 12, 10, 8'],
    ['10 reps per side x 3 sets', '3 × 10/side'],
    ['45 sec x 3 sets', '3 × 45 sec'], ['4 × 8', '4 × 8'],
    ['AMRAP', 'AMRAP'], ['', 'Not set']
  ]) assert.equal(layout.label(source), expected);
  assert.equal(layout.label(layout.compose('3', '10/side')), '3 × 10/side');
  assert.equal(layout.label(layout.compose('3', '45 sec')), '3 × 45 sec');
});

test('assigned prescriptions preserve explicit set and round counts across multiplication formats', () => {
  for (const [source, sets, reps] of [
    ['5×6–8', '5', '6–8'], ['4 × 6–8', '4', '6–8'],
    ['5x6-8', '5', '6-8'], ['5 X 6—8', '5', '6—8'],
    ['6–8 reps x 5 sets', '5', '6–8'], ['4 sets x 6–8', '4', '6–8'],
    ['3 rounds x 12 reps', '3', '12'], ['12 reps × 4 rounds', '4', '12'],
    ['6–8 x 5 sets', '5', '6–8'], ['12 x 3 sets', '3', '12'],
    ['2 sets of 8−12 reps', '2', '8−12'], ['12, 10, 8 reps x 3 rounds', '3', '12, 10, 8']
  ]) {
    assert.deepEqual(layout.prescription(source), { sets, reps, original: source }, source);
  }
});

test('timed, unilateral, and AMRAP prescriptions retain their target meaning', () => {
  for (const [source, sets, reps] of [
    ['4 × 6–8/side', '4', '6–8/side'], ['3 sets x 10 per side', '3', '10/side'],
    ['10 reps per side × 3 sets', '3', '10/side'], ['10 / side reps x 3 sets', '3', '10/side'],
    ['3 × 30—45 seconds', '3', '30—45 seconds'], ['30−45 sec x 4 rounds', '4', '30−45 sec'],
    ['3 sets x 45 sec per side', '3', '45 sec/side'], ['2 min x 3 sets', '3', '2 min'],
    ['3 × AMRAP', '3', 'AMRAP'], ['AMRAP x 3 sets', '3', 'AMRAP'], ['3 sets x AMRAP', '3', 'AMRAP'],
    ['3 sets x max reps', '3', 'max reps']
  ]) {
    assert.deepEqual(layout.prescription(source), { sets, reps, original: source }, source);
  }
  assert.deepEqual(layout.prescription('AMRAP'), { sets: '', reps: '', original: 'AMRAP' });
  assert.deepEqual(layout.prescription('As comfortable'), { sets: '', reps: '', original: 'As comfortable' });
  assert.deepEqual(layout.prescription(null), { sets: '', reps: '', original: '' });
  assert.deepEqual(layout.prescription('5 sets'), { sets: '5', reps: '', original: '5 sets' });
  assert.equal(layout.compose('5', '6–8'), '6–8 reps x 5 sets');
  assert.equal(layout.compose('3', '45 sec'), '45 sec x 3 sets');
});

test('personal plans support reorder, deletion, substitution and invalidate on coach changes', () => {
  const workouts = [{ title: 'A' }, { title: 'B' }, { title: 'C' }];
  const source = JSON.stringify(workouts);
  assert.deepEqual(layout.order(workouts, { source, order: [2, 0, 1] }), [2, 0, 1]);
  assert.deepEqual(layout.order(workouts, { source, order: [2] }), [2]);
  assert.deepEqual(layout.order(workouts, { source, order: [2, 2] }), [2, 2]);
  assert.deepEqual(layout.order(workouts, { source, order: [] }), []);
  assert.deepEqual(layout.order(workouts, { source, order: [-1, 8, '1', 0] }), [0]);
  assert.deepEqual(layout.order([...workouts, { title: 'D' }], { source, order: [2] }), [0, 1, 2, 3]);
  assert.deepEqual(layout.order(workouts, null), [0, 1, 2]);
});

test('exercise edits persist without changing assigned workouts or their order', () => {
  const workouts = [{ title: 'A', exercises: [{ name: 'Press', prescription: '8 reps x 3 sets' }, { name: 'Curl' }] }, { title: 'B', exercises: [{ name: 'Squat' }] }];
  const original = JSON.stringify(workouts);
  const saved = JSON.parse(JSON.stringify({ version: 2, source: original, order: [1], exercises: [[{ name: 'Row', prescription: '10 reps x 4 sets' }], []] }));
  const result = layout.apply(workouts, saved);
  assert.deepEqual(result.map(w => w.title), ['A', 'B']);
  assert.deepEqual(result[0].exercises, saved.exercises[0]);
  assert.deepEqual(result[1].exercises, []);
  result[0].exercises[0].name = 'Changed';
  assert.equal(saved.exercises[0][0].name, 'Row');
  assert.equal(JSON.stringify(workouts), original);
  assert.deepEqual(layout.apply(workouts, { source: original, order: [] }), workouts);
  assert.deepEqual(layout.apply(workouts, { ...saved, exercises: [] }), workouts);
  const updated = [...workouts, { title: 'New', exercises: [] }];
  assert.deepEqual(layout.apply(updated, saved), updated);
});
