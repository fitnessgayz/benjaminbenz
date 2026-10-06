const assert = require('node:assert/strict');
const test = require('node:test');
const { parse, parseCsv } = require('../js/workout-csv-import.js');

test('reads quoted CSV fields and preserves commas and newlines', () => {
  assert.deepEqual(parseCsv('Date,Exercise,Note\r\n2026-01-01,"Press, dumbbell","slow\ncontrolled"'), [
    { date: '2026-01-01', exercise: 'Press, dumbbell', note: 'slow\ncontrolled' }
  ]);
});

test('imports Hevy sets as pounds with stable workout title and set types', () => {
  const csv = [
    'title,start_time,end_time,exercise_title,set_index,set_type,weight_kg,reps,duration_seconds,rpe',
    'Push Day,"5 Jan 2026, 17:00","5 Jan 2026, 18:00",Bench Press,0,warmup,20,10,,',
    'Push Day,"5 Jan 2026, 17:00","5 Jan 2026, 18:00",Bench Press,1,normal,60,8,,8'
  ].join('\n');
  const result = parse(csv);
  assert.equal(result.source, 'hevy');
  assert.equal(result.workouts.length, 1);
  assert.equal(result.workouts[0].rows[0].set_type, 'warm_up');
  assert.equal(result.workouts[0].rows[1].weight_used, 132.28);
  assert.equal(result.workouts[0].rows[1].effort_value, 8);
  assert.equal(result.workouts[0].workout_title, 'Hevy import · Push Day · 5 Jan 2026, 17:00');
});

test('imports Fitbod warmups and skips invalid rows', () => {
  const csv = [
    'Date,Exercise,Reps,Weight(kg),Duration(s),isWarmup,Note',
    '2026-03-02 10:30,Squat,10,40,,true,Easy',
    '2026-03-02 10:30,Squat,8,80,,false,',
    'not a date,Squat,8,80,,false,'
  ].join('\n');
  const result = parse(csv);
  assert.equal(result.source, 'fitbod');
  assert.equal(result.workouts[0].rows.length, 2);
  assert.equal(result.workouts[0].rows[0].set_type, 'warm_up');
  assert.equal(result.workouts[0].rows[1].set_number, 2);
  assert.equal(result.skipped, 1);
});

test('rejects an unknown export format', () => {
  assert.throws(() => parse('foo,bar\n1,2'), /Fitbod or Hevy/);
});
