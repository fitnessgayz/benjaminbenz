import assert from 'node:assert/strict';
import test from 'node:test';
import history from '../js/client-exercise-history.js';

const logs = [
  { exercise_name: 'Bench Press', exercise_code: 'A1', entry_date: '2026-10-25', workout_title: 'Chest', gym_name: 'Downtown Gym', session_id: 'session-1', set_number: 1, set_type: 'working', weight_used: 135, reps: 10, notes: '<script>alert(1)</script>' },
  { exercise_name: 'Bench Press', exercise_code: 'A1', entry_date: '2026-10-25', workout_title: 'Chest', gym_name: 'Downtown Gym', session_id: 'session-1', set_number: 2, set_type: 'working', weight_used: 145, reps: 8 },
  { exercise_name: 'Bench Press', exercise_code: 'A1', entry_date: '2026-10-20', workout_title: 'Chest', gym_name: 'Uptown Gym', session_id: 'session-2', set_number: 1, set_type: 'working', weight_used: 95, reps: 12 },
  { exercise_name: 'Bench Press', exercise_code: 'A1', entry_date: '2026-10-20', workout_title: 'Chest', gym_name: 'Uptown Gym', session_id: 'session-2', set_number: -1, set_type: 'warmup', weight_used: 45, reps: 10 },
  { exercise_name: 'Dumbbell Row', exercise_code: 'A2', entry_date: '2026-10-25', workout_title: 'Chest', gym_name: 'Downtown Gym', session_id: 'session-1', set_number: 1, set_type: 'working', weight_used: 50, reps: 12 }
];

test('exercise history separates gym sessions and excludes warm-ups from strength metrics', () => {
  const rows = history.rowsForExercise(logs, 'bench press');
  assert.equal(rows.length, 4);
  assert.equal(history.rowsForExercise(logs, 'Bench Press', 'Downtown Gym').length, 2);
  assert.equal(history.sessionsForRows(rows).length, 2);
  assert.deepEqual(history.metricsForRows(rows), {
    workouts: 2,
    sets: 3,
    volume: 1350 + 1160 + 1140,
    bestWeight: 145,
    bestEstimatedMax: 145 * (1 + 8 / 30)
  });
});

test('history shows records, session sets and gym comparison without RIR or raw notes markup', () => {
  const html = history.historyMarkup('Bench Press', history.rowsForExercise(logs, 'Bench Press'));
  assert.match(html, /Downtown Gym/);
  assert.match(html, /Uptown Gym/);
  assert.match(html, /Heaviest set/);
  assert.match(html, /Session history/);
  assert.match(html, /145 lb × 8 reps/);
  assert.doesNotMatch(html, /RIR|<script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);

  const uptown = history.historyMarkup('Bench Press', history.rowsForExercise(logs, 'Bench Press'), 'Uptown Gym');
  assert.match(uptown, /95 lb × 12 reps/);
  assert.doesNotMatch(uptown, /145 lb × 8 reps/);
});
