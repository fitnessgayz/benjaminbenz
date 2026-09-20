const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const adminSource = fs.readFileSync(path.join(root, "js/coach-admin.js"), "utf8");
const saveFunctionSource = fs.readFileSync(
  path.join(root, "supabase/functions/save-client-program/index.ts"),
  "utf8"
);
const migrationSource = fs.readFileSync(
  path.join(root, "supabase/migrations/20260918173155_ensure_workout_exercise_demo_links.sql"),
  "utf8"
);

function sourceForFunction(name) {
  const start = adminSource.indexOf(`function ${name}(`);
  const end = adminSource.indexOf("\nfunction ", start + 1);

  assert.ok(start >= 0, `Expected ${name} to exist`);
  return adminSource.slice(start, end >= 0 ? end : undefined);
}

function adminExerciseHelpers() {
  return Function(`
    ${sourceForFunction("parseExercises")}
    ${sourceForFunction("youtubeExerciseSearchUrl")}
    ${sourceForFunction("uploadedExerciseDemoUrl")}
    ${sourceForFunction("youtubeExerciseDemoUrl")}
    ${sourceForFunction("exercisesToText")}
    return { parseExercises, exercisesToText };
  `)();
}

test("program editor writes a YouTube demo link for every exercise line", () => {
  const { parseExercises } = adminExerciseHelpers();
  const exercises = parseExercises([
    "A1 | Dumbbell Bench Press | 8 reps x 3 sets | 90s rest | chest",
    "A2 | Cable Row | 10 reps x 3 sets | 75s rest | back | https://vimeo.com/not-allowed",
    "B1 | Goblet Squat | 12 reps x 3 sets | 90s rest | quads | youtu.be/demo123"
  ].join("\n"));

  assert.equal(exercises.length, 3);
  assert.equal(
    exercises[0].video,
    "https://www.youtube.com/results?search_query=Dumbbell%20Bench%20Press%20exercise%20demo"
  );
  assert.match(exercises[1].video, /^https:\/\/www\.youtube\.com\/results\?search_query=/);
  assert.equal(exercises[2].video, "https://youtu.be/demo123");
});

test("loading an older program writes its generated demo link into the editor text", () => {
  const { exercisesToText } = adminExerciseHelpers();
  const text = exercisesToText([{ code: "A", name: "Lat Pulldown", prescription: "10 x 3", rest: "60s" }]);
  const fields = text.split(" | ");

  assert.equal(fields.length, 6);
  assert.equal(fields[4], "");
  assert.equal(
    fields[5],
    "https://www.youtube.com/results?search_query=Lat%20Pulldown%20exercise%20demo"
  );
});

test("save API and migration enforce persisted YouTube demo links", () => {
  assert.match(saveFunctionSource, /workouts: arrayValue\(source\.workouts\)\.map\(cleanWorkout\)/);
  assert.match(saveFunctionSource, /video: youtubeExerciseDemoUrl\(exercise\)/);
  assert.match(saveFunctionSource, /allowedHosts = new Set\(\["youtube\.com", "youtube-nocookie\.com", "m\.youtube\.com", "youtu\.be"\]\)/);

  assert.match(migrationSource, /disable trigger fwb_program_notifications/i);
  assert.match(migrationSource, /exercise\.value \|\| jsonb_build_object\(\s*'video'/i);
  assert.match(migrationSource, /youtube\.com\/results\?search_query=/i);
  assert.match(migrationSource, /enable trigger fwb_program_notifications/i);
});
