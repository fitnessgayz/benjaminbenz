const assert = require('node:assert/strict');
const test = require('node:test');
const calendar = require('../js/client-workout-calendar.js');

test('calendar uses Monday-first months and handles leap years', () => {
  const october = calendar.monthDays('2026-10');
  assert.equal(october.length, 35);
  assert.equal(october.slice(0, 3).every(day => day === null), true);
  assert.equal(october[3], '2026-10-01');
  assert.equal(october.at(-2), '2026-10-31');
  assert.equal(calendar.monthDays('2028-02').filter(Boolean).length, 29);
  assert.equal(calendar.shiftedMonth('2026-12', 1), '2027-01');
  assert.equal(calendar.shiftedMonth('2026-01', -1), '2025-12');
});

test('coach and both saved plan formats become schedulable workout choices', () => {
  const exercise = { name: 'Hip Thrust Machine', prescription: '8 reps x 3 sets' };
  const choices = calendar.workoutOptions(
    [{ programId: 'coach-program', programTitle: 'Lower Body', index: 0,
      workout: { id: 'coach-workout', title: 'Glute Day', exercises: [exercise] } }],
    [{ id: 'saved-session', title: 'Favorite', plan: { title: 'Favorite', exercises: [exercise] } },
      { id: 'saved-week', title: 'Weekly Plan', plan: { workouts: [
        { title: 'Day One', exercises: [exercise] }, { title: 'Day Two', exercises: [exercise] }
      ] } },
      { id: 'saved-ios-program', title: 'iOS Program', plan: { workouts: [
        { id: 'scheduled-1', workout: { title: 'Day Three', exercises: [exercise] } }
      ] } }]
  );
  assert.deepEqual(choices.map(choice => choice.title), ['Glute Day', 'Favorite', 'Day One', 'Day Two', 'Day Three']);
  assert.deepEqual(choices.map(choice => choice.type), ['assigned', 'generated', 'generated', 'generated', 'generated']);
  assert.equal(choices.at(-1).sourceId, 'scheduled-1');
  assert.equal(choices[0].detail, 'Lower Body');
});

test('saved schedule snapshot can be opened on the selected day', () => {
  const option = calendar.workoutOptions([{ workout: {
    id: 'abc', title: 'Chest Day', format: 'single', exercises: [{ name: 'Bench Press', sets: 3 }]
  } }], [])[0];
  const snapshot = calendar.snapshotFor(option, 'schedule-id', '2026-10-30');
  const workout = calendar.parsedWorkout({ snapshot_json: snapshot });
  assert.equal(workout.title, 'Chest Day');
  assert.equal(workout.source, 'assigned');
  assert.equal(workout.sourceID, 'abc');
  assert.equal(workout.exercises[0].name, 'Bench Press');
  assert.equal(calendar.parsedWorkout({ snapshot_json: '{bad json' }), null);
});
