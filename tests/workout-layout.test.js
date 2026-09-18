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
