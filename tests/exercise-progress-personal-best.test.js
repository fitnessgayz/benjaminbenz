const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");

function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf("\nfunction ", start + 1);
  assert.ok(start >= 0, `Expected ${name}`);
  return source.slice(start, end < 0 ? undefined : end);
}

const { records, markup, formatNumber } = Function(`
  const warmupExerciseCode = "WARMUP";
  const cardioExerciseCode = "CARDIO";
  const warmUpSetType = "warm_up";
  const workingSetType = "working";
  const warmUpSetNumberBase = 1000;
  const escapeHtml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;");
  const formatLogDate = (date) => date;
  ${functionSource("normalizedSetType")}
  ${functionSource("normalizeExerciseHistoryName")}
  ${functionSource("exerciseProgressNumber")}
  ${functionSource("exerciseProgressRecords")}
  ${functionSource("clientExerciseProgressCardMarkup")}
  return { records: exerciseProgressRecords, markup: clientExerciseProgressCardMarkup, formatNumber: exerciseProgressNumber };
`)();

function log(weight, date, overrides = {}) {
  return {
    exercise_name: "Chest-Supported Dumbbell Row",
    exercise_code: "A",
    workout_title: "Workout A",
    entry_date: date,
    weight_used: weight,
    reps: 8,
    set_number: 1,
    set_type: "working",
    ...overrides
  };
}

test("shows the all-time heaviest working weight even after a lighter workout", () => {
  const [record] = records([
    log(25, "2026-09-19"),
    log(75, "2026-08-02"),
    log(60, "2026-07-19"),
    log(70, "2026-07-19", { set_number: 2 })
  ]);
  assert.equal(record.startingValue, 70);
  assert.equal(record.bestValue, 75);
  assert.equal(record.best.date, "2026-08-02");
  assert.equal(record.latestDate, "2026-09-19");
  assert.equal(record.change, 5);
  assert.equal(record.unit, "lb");
  const html = markup(record);
  assert.match(html, /<small>Started<\/small>/);
  assert.match(html, /<small>Personal best<\/small>/);
  assert.match(html, /<strong>75 lb<\/strong>/);
  assert.match(html, /<em>2026-08-02<\/em>/);
  assert.doesNotMatch(html, /<small>Now<\/small>|25 lb/);
});

test("warm-ups, cardio and invalid weights cannot inflate a personal best", () => {
  const [record] = records([
    log(60, "2026-07-19"),
    log(900, "2026-09-19", { set_type: "warm_up" }),
    log(800, "2026-09-19", { set_type: null, set_number: 1001 }),
    log(700, "2026-09-19", { exercise_code: "WARMUP" }),
    log(600, "2026-09-19", { exercise_code: "CARDIO" }),
    log(Infinity, "2026-09-19"),
    log("bad", "2026-09-19"),
    log(-5, "2026-09-19")
  ]);
  assert.equal(record.bestValue, 60);
  assert.equal(record.best.date, "2026-07-19");
  assert.equal(record.change, 0);
});

test("personal-best ties retain the first achievement date regardless of input order", () => {
  const [record] = records([
    log(60, "2026-09-19"),
    log(60, "2026-08-02"),
    log(40, "2026-07-19")
  ]);
  assert.equal(record.bestValue, 60);
  assert.equal(record.best.date, "2026-08-02");
});

test("the same exercise combines across programs without confusing similar names or reused codes", () => {
  const entries = records([
    log(40, "2026-07-19", { exercise_name: "Cable fly", exercise_code: "CW1" }),
    log(50, "2026-08-02", { exercise_name: "  CABLE   FLY  ", exercise_code: "B", workout_title: "Workout B" }),
    log(70, "2026-08-02", { exercise_name: "Cable reverse fly", exercise_code: "CW1" }),
    log(30, "2026-08-02", { exercise_name: "", exercise_code: "CW1", workout_title: "Workout A" }),
    log(20, "2026-08-02", { exercise_name: "", exercise_code: "CW1", workout_title: "Workout B" })
  ]);
  assert.equal(entries.length, 4);
  const fly = entries.find((entry) => entry.name === "Cable fly");
  assert.equal(fly.startingValue, 40);
  assert.equal(fly.bestValue, 50);
  assert.equal(entries.find((entry) => entry.name === "Cable reverse fly").bestValue, 70);
});

test("bodyweight exercise records use best reps and a single session is already a record", () => {
  const [record] = records([
    log(0, "2026-09-19", { exercise_name: "Push-up", reps: 10 }),
    log(0, "2026-08-02", { exercise_name: "Push-up", reps: 20 }),
    log(0, "2026-07-19", { exercise_name: "Push-up", reps: 15 })
  ]);
  assert.equal(record.unit, "reps");
  assert.equal(record.bestValue, 20);
  assert.equal(record.change, 5);
  assert.equal(record.best.date, "2026-08-02");
  const [first] = records([log(17.5, "2026-09-20")]);
  assert.equal(first.bestValue, 17.5);
  assert.equal(first.change, 0);
  assert.deepEqual(records([log(0, "2026-09-20", { reps: 0 })]), []);
});

test("cards remain ordered by last workout date instead of the date of the record", () => {
  const entries = records([
    log(100, "2026-07-19", { exercise_name: "Squat" }),
    log(50, "2026-09-20", { exercise_name: "Squat" }),
    log(40, "2026-09-19", { exercise_name: "Row" })
  ]);
  assert.deepEqual(entries.map((entry) => entry.name), ["Squat", "Row"]);
});

test("personal-best values preserve the exact logged decimal weight", () => {
  const [record] = records([log("17.15", "2026-09-20")]);
  assert.match(markup(record), /<strong>17\.15 lb<\/strong>/);
  assert.equal(formatNumber("17.125"), "17.125");
  assert.equal(formatNumber(60), "60");
  assert.equal(formatNumber(Infinity), "0");
  assert.equal(formatNumber("invalid"), "0");
  assert.deepEqual(records([log(0, "2026-09-20", { reps: "invalid" })]), []);
  const [decimalChange] = records([log(17.1, "2026-09-19"), log(17.3, "2026-09-20")]);
  assert.equal(decimalChange.change, 0.2);
  assert.match(markup(decimalChange), /\+0\.2 lb<\/strong>/);
});
