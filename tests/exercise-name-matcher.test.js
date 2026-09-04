const test = require("node:test");
const assert = require("node:assert/strict");
const matcher = require("../js/exercise-name-matcher.js");

const library = [
  { name: "Dumbbell Bench Press", aliases: ["Dumbbell Chest Press"], equipment: "dumbbell" },
  { name: "Incline Dumbbell Press", aliases: ["Incline DB Chest Press"], equipment: "dumbbell" },
  { name: "Hip Thrust", aliases: [], equipment: "barbell" },
  { name: "Hip Thrust Machine", aliases: ["Machine Hip Thrust"], equipment: "machine" },
  { name: "Hip Abduction Machine", aliases: [], equipment: "machine" },
  { name: "Hip Adduction Machine", aliases: [], equipment: "machine" }
];

test("expands DB to dumbbell", () => {
  assert.equal(matcher.normalizeName("DB bench press"), "dumbbell bench press");
  assert.equal(matcher.recommendedLibraryMatch("DB bench press", library).exercise.name, "Dumbbell Bench Press");
});

test("maps a known synonym to the canonical library name", () => {
  const match = matcher.recommendedLibraryMatch("Dumbbell Chest Press", library);
  assert.equal(match.exercise.name, "Dumbbell Bench Press");
  assert.equal(match.score, 1);
});

test("does not prompt when the canonical name is already entered", () => {
  assert.equal(matcher.recommendedLibraryMatch("Hip Thrust", library), null);
});

test("keeps barbell and machine hip thrusts distinct", () => {
  const match = matcher.recommendedLibraryMatch("hip thrust machien", library);
  assert.equal(match.exercise.name, "Hip Thrust Machine");
});

test("keeps incline intent when matching a dumbbell press", () => {
  const match = matcher.recommendedLibraryMatch("Incline Dumbbell Bench Press", library);
  assert.equal(match.exercise.name, "Incline Dumbbell Press");
});

test("does not confuse abduction with adduction", () => {
  const matches = matcher.rankedLibraryMatches("Hip adduction machne", library);
  assert.equal(matches[0].exercise.name, "Hip Adduction Machine");
  assert.ok(matches[0].score > matches.find((entry) => entry.exercise.name === "Hip Abduction Machine").score);
});
