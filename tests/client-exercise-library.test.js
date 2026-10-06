const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const {
  muscleFor, prepareRecords, matchingRecords, groupedRecords
} = require("../js/client-exercise-library.js");

test("normalizes common muscle names into useful browse filters", () => {
  assert.equal(muscleFor("Quadriceps"), "Quads");
  assert.equal(muscleFor("Gluteals"), "Glutes");
  assert.equal(muscleFor("Deltoids"), "Shoulders");
  assert.equal(muscleFor("Lower Back"), "Lower Back");
  assert.equal(muscleFor(""), "Other");
});

test("shows the full catalog without a suggestion-list limit", () => {
  const records = Array.from({ length: 404 }, (_, index) => ({
    name: `Exercise ${String(index).padStart(3, "0")}`,
    libraryEntry: { primary_muscle: index % 2 ? "Chest" : "Quadriceps" }
  }));
  const prepared = prepareRecords(records);
  assert.equal(prepared.length, 404);
  assert.equal(matchingRecords(prepared, "", "All").length, 404);
  assert.equal(groupedRecords(prepared, "All").reduce((sum, [, group]) => sum + group.length, 0), 404);
});

test("searches aliases and filters by primary or secondary muscle", () => {
  const prepared = prepareRecords([
    { name: "Romanian Deadlift", aliases: ["RDL"], libraryEntry: { primary_muscle: "Hamstrings", secondary_muscles: ["Glutes"] } },
    { name: "Bench Press", libraryEntry: { primary_muscle: "Chest", secondary_muscles: ["Triceps"] } },
    { name: "Bench Press", libraryEntry: { primary_muscle: "Chest" } }
  ]);
  assert.equal(prepared.length, 2);
  assert.deepEqual(matchingRecords(prepared, "rdl", "Glutes").map((record) => record.name), ["Romanian Deadlift"]);
  assert.deepEqual(matchingRecords(prepared, "bench press", "Triceps").map((record) => record.name), ["Bench Press"]);
  assert.equal(matchingRecords(prepared, "bench", "Hamstrings").length, 0);
  assert.deepEqual(groupedRecords(matchingRecords(prepared, "", "All"), "All").map(([muscle]) => muscle), ["Chest", "Hamstrings"]);
});

test("both exercise search menus offer More and connect it to the full library", () => {
  const root = path.resolve(__dirname, "..");
  const portal = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");
  const dashboard = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");
  assert.equal((portal.match(/data-custom-exercise-more>More exercises/g) || []).length, 2);
  assert.match(portal, /function openClientExerciseLibrary\(input, onSelect\)/);
  assert.match(portal, /records: exerciseSuggestionRecords\(\)/);
  assert.match(portal, /openClientExerciseLibrary\(input, \(name\) =>/);
  assert.match(dashboard, /js\/client-exercise-library\.js\?v=/);
  assert.match(dashboard, /css\/client-exercise-library\.css\?v=/);
});
