const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const generator = require('../js/workout-generator.js');
const plans = require('../js/client-workout-plans.js');

function seededLibrary() {
  const files = ['20260822053131_create_shared_exercise_library.sql', '20260904042044_refine_ambiguous_exercise_names.sql', '20260926050807_add_recovery_exercise_library.sql'];
  return files.flatMap((file) => {
    const source = fs.readFileSync(path.join(__dirname, '../supabase/migrations', file), 'utf8');
    const insert = source.match(/insert into public\.exercise_library\s*\(([^)]+)\)\s*values\s*([\s\S]*?)(?:;|on conflict)/i);
    const columns = insert[1].split(',').map((value) => value.trim());
    return [...insert[2].matchAll(/\(([^()]+)\)/g)].map((match) => {
      const tokens = match[1].match(/array\[[^\]]*\]|'(?:[^']|'')*'|\b(?:true|false)\b|\d+/g);
      const values = tokens.map((token) => token.startsWith('array') ? [...token.matchAll(/'([^']+)'/g)].map((item) => item[1])
        : token.startsWith("'") ? token.slice(1, -1).replace(/''/g, "'") : token === 'true' ? true : token === 'false' ? false : Number(token));
      return { default_sets: 3, aliases: [], is_active: true, is_approved: true, instructions: '', demo_url: null,
        ...Object.fromEntries(columns.map((column, index) => [column, values[index]])),
        id: `${file}-${match.index}` };
    });
  });
}

const library = seededLibrary();

test('generates a reusable weekly plan with individual workouts that can be started later', () => {
  const plan = plans.build({ days: 3, split: 'balanced', minutes: 30, intensity: 'moderate',
    equipment: ['full_gym'], library, history: [], seed: 'weekly-plan-test' }, generator);
  assert.equal(plan.days, 3);
  assert.deepEqual(plan.workouts.map((workout) => workout.focus), ['full_body', 'upper_body', 'lower_body']);
  assert.ok(plan.workouts.every((workout) => workout.exercises.length > 0 && workout.estimatedMinutes <= 30));
  assert.ok(plans.validPlan(JSON.parse(JSON.stringify(plan))));
  assert.equal(plans.validPlan({ ...plan, workouts: [] }), false);
  assert.equal(plans.validPlan({ ...plan, workouts: [{ exercises: [{ name: '' }] }] }), false);
});

test('rejects unsupported schedules and reports which day cannot be generated', () => {
  const base = { days: 3, split: 'balanced', minutes: 30, intensity: 'moderate', equipment: [], library, history: [] };
  assert.throws(() => plans.build({ ...base, days: 7 }, generator), /Choose your schedule/);
  assert.throws(() => plans.build(base, { generate(input) {
    if (input.focus === 'upper_body') throw new Error('No exercises available');
    return { title: 'Workout', estimatedMinutes: 20, exercises: [{ name: 'Squat' }] };
  } }), /Day 2: No exercises available/);
});

test('weekly formats and selected set counts reach every generated day', () => {
  const calls = [];
  const engine = { generate(input) {
    calls.push(input);
    return { title: 'Workout', format: input.format, warmUpCount: input.warmUpCount,
      workingSetCount: input.workingSetCount, exercises: [{ name: 'Squat', sets: 3 }] };
  } };
  for (const format of ['superset', 'circuit']) {
    const plan = plans.build({ days: 2, split: 'balanced', minutes: 30, intensity: 'moderate',
      equipment: ['full_gym'], format, warmUpCount: 3, workingSetCount: 10 }, engine);
    assert.equal(plan.format, format);
    assert.equal(plan.warmUpCount, 3);
    assert.equal(plan.workingSetCount, 10);
    assert.ok(plan.workouts.every((day) => day.format === format && day.warmUpCount === 3 && day.workingSetCount === 10));
  }
  assert.equal(calls.length, 4);
  assert.ok(calls.every((input) => input.warmUpCount === 3 && input.workingSetCount === 10));
  assert.deepEqual(calls.map((input) => input.format), ['superset', 'superset', 'circuit', 'circuit']);
});
