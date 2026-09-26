const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const generator = require('../js/workout-generator.js');
const workoutLayout = require('../js/workout-layout.js');

// Read both checked-in exercise seed batches, including the newer equipment-
// specific variations, so assertions exercise the actual coach library shapes.
function seededLibrary() {
  const files = ['20260822053131_create_shared_exercise_library.sql', '20260904042044_refine_ambiguous_exercise_names.sql', '20260926044818_add_recovery_exercise_library.sql'];
  return files.flatMap((file) => {
    const source = fs.readFileSync(path.join(__dirname, '../supabase/migrations', file), 'utf8');
    const insert = source.match(/insert into public\.exercise_library\s*\(([^)]+)\)\s*values\s*([\s\S]*?)(?:;|on conflict)/i);
    const columns = insert[1].split(',').map((value) => value.trim());
    return [...insert[2].matchAll(/\(([^()]+)\)/g)].map((match) => {
      const tokens = match[1].match(/array\[[^\]]*\]|'(?:[^']|'')*'|\d+/g);
      const values = tokens.map((token) => token.startsWith('array') ? [...token.matchAll(/'([^']+)'/g)].map((item) => item[1])
        : token.startsWith("'") ? token.slice(1, -1).replace(/''/g, "'") : Number(token));
      assert.equal(columns.length, values.length, file);
      const entry = { default_sets: 3, aliases: [], is_active: true, is_approved: true, instructions: '', demo_url: null, ...Object.fromEntries(columns.map((column, index) => [column, values[index]])) };
      entry.id = entry.name.toLowerCase().replace(/\W+/g, '-');
      return entry;
    });
  });
}
const library = seededLibrary();
const settings = { library, history: [], focus: 'full_body', equipment: ['full_gym'], minutes: 30, intensity: 'moderate', seed: 'stable', now: '2026-09-25T12:00:00Z' };
const build = (overrides = {}) => generator.generate({ ...settings, ...overrides });
const baseExercise = (overrides = {}) => ({ ...library.find((entry) => entry.name === 'Push-Up'), ...overrides });

function assertValidWorkout(workout) {
  assert.ok(workout.exercises.length > 0);
  assert.ok(workout.estimatedMinutes > 3 && workout.estimatedMinutes <= workout.minutes);
  assert.equal(new Set(workout.exercises.map((entry) => entry.id)).size, workout.exercises.length);
  assert.equal(new Set(workout.exercises.map((entry) => entry.name.toLowerCase())).size, workout.exercises.length);
  for (const exercise of workout.exercises) {
    assert.ok(library.some((entry) => entry.id === exercise.id), exercise.name);
    assert.ok(exercise.sets >= 1 && exercise.sets <= 4);
    const recovery = workout.focus.startsWith('recovery_');
    assert.ok(exercise.restSeconds >= (recovery ? 0 : 45) && exercise.restSeconds <= (recovery ? 60 : 180));
    assert.ok(['beginner', 'intermediate'].includes(exercise.difficulty));
    assert.equal(typeof exercise.prescription, 'string');
    assert.equal(typeof exercise.instructions, 'string');
  }
}

test('uses actual seed batches and exports the browser/CommonJS interface', () => {
  assert.ok(library.length > 58);
  assert.ok(library.some((entry) => entry.name === 'Cat-Cow'));
  assert.ok(library.some((entry) => entry.name === 'Dumbbell Chest Fly'));
  assert.equal(globalThis.FWB_WORKOUT_GENERATOR, generator);
  assert.ok(generator.FOCUS_OPTIONS.some((option) => option.value === 'full_body'));
  assert.ok(generator.EQUIPMENT_OPTIONS.some((option) => option.value === 'bodyweight'));
});

test('every focus, intensity and duration produces a bounded workout with a full gym', () => {
  for (const { value: focus } of generator.FOCUS_OPTIONS) {
    for (const intensity of ['easy', 'moderate', 'challenging']) {
      for (const minutes of [20, 30, 45, 60]) assertValidWorkout(build({ focus, intensity, minutes }));
    }
  }
});

test('full-body, upper/lower, chest/back and arm plans cover their requested muscle groups', () => {
  const groups = {
    full_body: [['chest', 'shoulders'], ['back', 'lats'], ['quads', 'glutes', 'hamstrings']],
    upper_body: [['chest', 'shoulders'], ['back', 'lats']], lower_body: [['quads'], ['glutes', 'hamstrings']],
    chest_back: [['chest'], ['back', 'lats']], arms: [['biceps'], ['triceps']]
  };
  for (const [focus, required] of Object.entries(groups)) {
    for (let seed = 0; seed < 20; seed++) {
      const workout = build({ focus, minutes: 20, intensity: 'challenging', seed });
      for (const group of required) assert.ok(workout.exercises.some((entry) => group.includes(entry.primary_muscle)), `${focus}: ${group}`);
      assertValidWorkout(workout);
    }
  }
});

test('equipment filters include bodyweight but never assume bench, hanging stations or other apparatus', () => {
  for (let seed = 0; seed < 20; seed++) {
    const core = build({ focus: 'core', equipment: [], seed, minutes: 60 });
    assert.ok(core.exercises.every((entry) => entry.equipment === 'bodyweight'));
    assert.ok(!core.exercises.some((entry) => /Hanging/.test(entry.name)));
    const chest = build({ focus: 'chest', equipment: ['dumbbell'], minutes: 60, seed });
    assert.deepEqual(chest.exercises.map((entry) => entry.name), ['Push-Up']);
    const supported = build({ focus: 'chest', equipment: ['dumbbell', 'bench'], minutes: 60, seed });
    assert.ok(supported.exercises.some((entry) => entry.name === 'Dumbbell Bench Press'));
    assert.ok(supported.exercises.every((entry) => ['dumbbell', 'bodyweight'].includes(entry.equipment)));
  }
  const stations = [
    baseExercise({ id: 'hang', name: 'Hanging Knee Raise', primary_muscle: 'core' }),
    baseExercise({ id: 'pull', name: 'Pull-Up', primary_muscle: 'lats' }),
    baseExercise({ id: 'dip', name: 'Dip', primary_muscle: 'triceps' }),
    baseExercise({ id: 'roman', name: '45-Degree Back Extension', primary_muscle: 'glutes', equipment: 'bench' })
  ];
  for (const entry of stations) {
    assert.throws(() => build({ library: [entry], focus: entry.primary_muscle, equipment: ['bench'] }), /enough approved/);
    assert.equal(build({ library: [entry], focus: entry.primary_muscle }).exercises[0].id, entry.id);
  }
});

test('equipment and focus shortages are actionable, and short sessions report their actual duration', () => {
  for (const focus of ['full_body', 'upper_body', 'lower_body', 'chest_back', 'arms']) {
    assert.throws(() => build({ focus, equipment: [] }), /Try another focus, add available equipment/);
  }
  const workout = build({ focus: 'chest', equipment: [], minutes: 60 });
  assert.equal(workout.exercises.length, 1);
  assert.ok(workout.estimatedMinutes < 20);
  assert.ok(workout.notes.some((note) => note.includes(`about ${workout.estimatedMinutes} minutes`)));
  assert.ok(workout.notes.some((note) => note.includes('3-minute warm-up')));
  assert.throws(() => build({ library: [] }), /enough approved/);
  assert.throws(() => build({ focus: 'chest', excludedNames: library.map((entry) => entry.name) }), /enough approved/);
});

test('missing approval, invalid metadata and advanced movements fail closed', () => {
  for (const override of [
    { is_approved: undefined }, { is_active: undefined }, { is_approved: 'true' }, { is_active: false },
    { difficulty: 'advanced' }, { difficulty: 'unknown' }, { primary_muscle: 'mystery' }, { equipment: 'other' },
    { movement_pattern: '' }, { name: '' }, { id: null }, { default_sets: 0 }, { default_sets: '3' },
    { default_sets: 11 }, { default_rest_seconds: -1 }, { default_rest_seconds: 601 },
    { default_reps: 'AMRAP' }, { default_reps: '1000' }, { default_reps: '2-1' }, { default_reps: '30 min' },
    { default_reps: '8-12 <script>' }, { default_reps: null }
  ]) assert.throws(() => build({ focus: 'chest', library: [baseExercise(override)] }), /enough approved/, JSON.stringify(override));
  assert.throws(() => build({ focus: 'chest', intensity: 'easy', library: [baseExercise({ difficulty: 'intermediate' })] }), /enough approved/);
});

test('valid coach defaults remain bounded and timed/unilateral targets preserve their meaning', () => {
  const workout = build({ focus: 'core', library: [baseExercise({ primary_muscle: 'core', default_reps: '20-45 sec each', default_sets: 10, default_rest_seconds: 600 })], minutes: 20, intensity: 'challenging' });
  const exercise = workout.exercises[0];
  assert.equal(exercise.sets, 4);
  assert.equal(exercise.restSeconds, 180);
  assert.equal(exercise.prescription, '20-45 sec/side x 4 sets');
  // 3-minute warmup + four 90-second bilateral holds + three rests + transition.
  assert.equal(workout.estimatedMinutes, 19);
  const unilateral = build({ focus: 'chest', library: [baseExercise({ default_reps: '8-12 each' })] });
  assert.equal(unilateral.exercises[0].reps, '8-12 each');
  assert.equal(unilateral.estimatedMinutes, 10);
});

test('generated unilateral prescriptions retain per-side targets through the existing workout editor', () => {
  for (const [default_reps, expectedPrescription, expectedTarget] of [
    ['8-12 each', '8-12 reps/side', '8-12/side'],
    ['8-12 reps per side', '8-12 reps/side', '8-12/side'],
    ['10/side', '10 reps/side', '10/side'],
    ['20-45 sec each', '20-45 sec/side', '20-45 sec/side'],
    ['30 seconds each', '30 seconds/side', '30 seconds/side'],
    ['30 s per side', '30 sec/side', '30 sec/side'],
    ['1 min/side', '1 min/side', '1 min/side']
  ]) {
    const exercise = build({ focus: 'core', library: [baseExercise({ primary_muscle: 'core', default_reps })] }).exercises[0];
    assert.equal(exercise.reps, default_reps);
    assert.equal(exercise.prescription, `${expectedPrescription} x ${exercise.sets} sets`);
    const parsed = workoutLayout.prescription(exercise.prescription);
    assert.equal(parsed.reps, expectedTarget);
    assert.equal(parsed.sets, String(exercise.sets));
    const edited = workoutLayout.prescription(workoutLayout.compose('2', parsed.reps));
    assert.equal(edited.reps, expectedTarget);
    assert.equal(edited.sets, '2');
  }
});

test('uses library instructions and safe demo URLs without inventing replacements', () => {
  const entry = baseExercise({ demo_url: 'https://www.youtube.com/watch?v=abcdefghijk', instructions: 'Pause with control.' });
  const workout = build({ focus: 'chest', library: [entry] });
  assert.equal(workout.exercises[0].demo_url, entry.demo_url);
  assert.equal(workout.exercises[0].instructions, entry.instructions);
  for (const extension of ['mp4', 'mov', 'm4v', 'webm']) {
    const demo_url = `https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/coach/push-up.${extension}`;
    assert.equal(build({ focus: 'chest', library: [baseExercise({ demo_url })] }).exercises[0].demo_url, demo_url);
  }
  for (const demo_url of [null, 'javascript:alert(1)', 'https://youtube.com.evil.example/watch?v=abc', 'https://qukdfjeupjhpthfbaonv.supabase.co.evil.example/storage/v1/object/public/exercise-videos/demo.mp4', 'https://user:secret@youtube.com/watch?v=abc']) {
    assert.equal(build({ focus: 'chest', library: [baseExercise({ demo_url })] }).exercises[0].demo_url, '');
  }
});

test('recent exercises and aliases get variety preference without counting each set separately', () => {
  const selection = { ...settings, focus: 'chest', minutes: 20, library: Array.from({ length: 8 }, (_, index) => baseExercise({ id: `push-${index}`, name: `Push-Up Variation ${index}`, aliases: [`Pushup ${index}`] })) };
  const first = generator.generate(selection);
  const repeat = first.exercises[0];
  const history = [{ exercise_name: `Pushup ${repeat.id.split('-')[1]}`, entry_date: '2026-09-24' }];
  const varied = generator.generate({ ...selection, history });
  assert.notEqual(varied.exercises[0].id, repeat.id);
  assert.ok(!varied.exercises.some((entry) => entry.id === repeat.id));
  assert.deepEqual(generator.generate({ ...selection, history: Array(15).fill(history[0]) }), varied);
  assert.ok(varied.notes.some((note) => note.includes('does not determine recovery')));
});

test('stale, future, impossible dates and absent history do not affect selection', () => {
  const first = build();
  const history = ['2026-01-01', '2026-09-26', '2026-02-30', 'not-a-date', null].flatMap((entry_date) => library.map((entry) => ({ exercise_name: entry.name, entry_date })));
  assert.deepEqual(build({ history }), first);
  assert.deepEqual(build({ history: null }), first);
});

test('generation is reproducible, does not mutate inputs, deduplicates names/ids and respects exclusions', () => {
  const original = JSON.stringify(library);
  const first = build();
  assert.deepEqual(build(), first);
  assert.equal(JSON.stringify(library), original);
  const duplicate = baseExercise({ name: '  PUSH-UP ' });
  assert.equal(build({ focus: 'chest', library: [baseExercise(), duplicate] }).exercises.length, 1);
  const excluded = build({ focus: 'chest', excludedNames: [' push-up '] });
  assert.ok(excluded.exercises.every((entry) => entry.name !== 'Push-Up'));
});

test('alternative exercises retain focus and equipment, exclude selected exercises, and fit the session', () => {
  const workout = build({ focus: 'chest_back', minutes: 20 });
  let swaps = 0;
  for (const [index, exercise] of workout.exercises.entries()) {
    const replacements = generator.alternatives({ ...settings, focus: workout.focus, workout, exercise });
    for (const replacement of replacements) {
      assert.ok(!workout.exercises.some((item) => item.name === replacement.name));
      const old = JSON.stringify(workout);
      const swapped = generator.swap(workout, index, replacement);
      assertValidWorkout(swapped);
      assert.equal(swapped.exercises[index].id, replacement.id);
      assert.equal(JSON.stringify(workout), old);
      swaps++;
    }
  }
  assert.ok(swaps > 0);
  const chest = build({ focus: 'chest', equipment: [], minutes: 60 });
  assert.deepEqual(generator.alternatives({ ...settings, focus: 'chest', equipment: [], workout: chest, exercise: chest.exercises[0] }), []);
});

test('swap rejects duplicates, invalid indices, equipment mismatch and time overruns', () => {
  const workout = build();
  assert.throws(() => generator.swap(workout, 0, workout.exercises[1]), /already in this workout/);
  assert.throws(() => generator.swap(workout, -1, workout.exercises[0]), /available replacement/);
  const core = build({ focus: 'core', equipment: [], minutes: 20 });
  const hanging = build({ focus: 'core', library: [library.find((item) => item.name === 'Hanging Knee Raise')] }).exercises[0];
  assert.throws(() => generator.swap(core, 0, hanging), /available equipment/);
  const long = { ...workout.exercises[0], id: 'long', name: 'Long Hold', reps: '120 sec each', sets: 4, restSeconds: 180 };
  assert.throws(() => generator.swap(workout, 0, long), /does not fit/);
});

test('invalid selections produce useful errors', () => {
  for (const overrides of [{ focus: 'unknown' }, { intensity: 'extreme' }, { minutes: 5 }, { equipment: ['mystery'] }, { equipment: 'dumbbell' }]) {
    assert.throws(() => build(overrides), /Choose/);
  }
});

test('recovery regions contain only approved gentle mobility and stretching at easy intensity', () => {
  const regions = {
    recovery_upper: ['chest', 'back', 'lats', 'shoulders', 'biceps', 'triceps'],
    recovery_lower: ['quads', 'hamstrings', 'glutes', 'calves', 'adductors']
  };
  for (const focus of [...Object.keys(regions), 'recovery_full']) {
    for (const intensity of ['easy', 'moderate', 'challenging']) {
      for (const minutes of [20, 30, 45, 60]) {
        const result = build({ focus, intensity, minutes, equipment: [] });
        assertValidWorkout(result);
        assert.equal(result.intensity, 'easy');
        assert.match(result.title, /recovery$/);
        for (const exercise of result.exercises) {
          const coach = library.find((entry) => entry.id === exercise.id);
          assert.ok(['mobility', 'stretching'].includes(exercise.movement_pattern));
          assert.equal(exercise.equipment, 'bodyweight');
          assert.equal(exercise.difficulty, 'beginner');
          assert.equal(exercise.reps, coach.default_reps);
          assert.ok(exercise.sets <= 2 && exercise.sets <= coach.default_sets);
          assert.equal(exercise.instructions, coach.instructions);
          if (regions[focus]) assert.ok(regions[focus].includes(exercise.primary_muscle));
        }
        if (focus === 'recovery_full') {
          for (const muscles of Object.values(regions)) assert.ok(result.exercises.some((entry) => muscles.includes(entry.primary_muscle)));
        }
        assert.ok(result.notes.some((note) => note.includes('comfortable range')));
        assert.ok(!result.notes.some((note) => /challenging|controlled weight/.test(note)));
      }
    }
  }
});

test('ordinary strength workouts do not fill their exercise slots with new recovery movements', () => {
  for (const { value: focus, recovery } of generator.FOCUS_OPTIONS) {
    if (recovery) continue;
    for (const intensity of ['easy', 'moderate', 'challenging']) {
      assert.ok(build({ focus, intensity, minutes: 60 }).exercises.every((entry) => !['mobility', 'stretching'].includes(entry.movement_pattern)));
    }
  }
});

test('recovery does not silently substitute strength or incomplete full-body coverage', () => {
  const recovery = library.find((entry) => entry.name === 'Cat-Cow');
  const strength = library.filter((entry) => !['mobility', 'stretching'].includes(entry.movement_pattern));
  assert.throws(() => build({ focus: 'recovery_full', library: strength }), /approved mobility or stretching/);
  assert.throws(() => build({ focus: 'recovery_full', library: [recovery] }), /add recovery movements/);
  for (const overrides of [
    { difficulty: 'intermediate' }, { equipment: 'dumbbell' }, { is_approved: false },
    { is_active: false }, { default_reps: '90 sec' }, { default_reps: '20' },
    { movement_pattern: 'horizontal_pull', name: 'Easy recovery row' }
  ]) {
    assert.throws(() => build({ focus: 'recovery_upper', library: [{ ...recovery, ...overrides }] }), /approved mobility or stretching/);
  }
  const brief = build({ focus: 'recovery_upper', library: [{ ...recovery, default_sets: 1 }], minutes: 60 });
  assert.equal(brief.exercises[0].sets, 1);
  assert.ok(brief.estimatedMinutes < 10);
  assert.ok(brief.notes.some((note) => note.includes('no need to add extra work')));
});

test('recovery swaps preserve gentle targets, region coverage, and the requested time limit', () => {
  const workout = build({ focus: 'recovery_full', equipment: [], minutes: 20 });
  let count = 0;
  for (const [index, exercise] of workout.exercises.entries()) {
    for (const alternative of generator.alternatives({ ...settings, focus: workout.focus, equipment: [], intensity: 'challenging', workout, exercise })) {
      const result = generator.swap(workout, index, alternative);
      assertValidWorkout(result);
      assert.equal(result.intensity, 'easy');
      assert.ok(alternative.sets <= 2);
      assert.ok(['mobility', 'stretching'].includes(alternative.movement_pattern));
      count++;
    }
  }
  assert.ok(count > 0);
  const original = workout.exercises[0];
  for (const changes of [
    { movement_pattern: 'horizontal_press' }, { sets: 3 }, { restSeconds: 90 },
    { reps: '90 sec', default_reps: '20 sec' }, { difficulty: 'intermediate' }, { equipment: 'dumbbell' }
  ]) assert.throws(() => generator.swap(workout, 0, { ...original, ...changes }), /matches your focus/);
});

test('recovery seed migration preserves existing coach rows and needs no schema changes', () => {
  const migration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20260926044818_add_recovery_exercise_library.sql'), 'utf8');
  assert.match(migration, /on conflict \(lower\(name\)\) do nothing/);
  assert.doesNotMatch(migration, /\b(?:delete|update|alter|drop)\b/i);
  const recovery = library.filter((entry) => ['mobility', 'stretching'].includes(entry.movement_pattern));
  assert.equal(recovery.length, 12);
  assert.ok(recovery.every((entry) => entry.default_sets <= 2 && entry.instructions && !entry.demo_url));
});
