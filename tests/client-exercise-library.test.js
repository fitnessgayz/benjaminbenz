const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const {
  muscleFor, prepareRecords, matchingRecords, groupedRecords, exerciseFamilies, muscleArtwork
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

test("prepares reviewed still and motion media only from approved storage", (t) => {
  const previousConfig = globalThis.FWB_SUPABASE_CONFIG;
  globalThis.FWB_SUPABASE_CONFIG = { url: "https://example.supabase.co" };
  t.after(() => { globalThis.FWB_SUPABASE_CONFIG = previousConfig; });
  const base = "https://example.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-12";
  const valid = prepareRecords([{
    name: "Barbell Bench Press",
    libraryEntry: {
      image_url: `${base}/webp-768/barbell-bench-press-benjamin.webp`,
      motion_url: `${base}/motion-webp/barbell-bench-press-benjamin.webp`,
      instructions: "Lower to the chest, then press."
    }
  }])[0];
  assert.match(valid.imageUrl, /webp-768\/barbell-bench-press-benjamin\.webp$/);
  assert.match(valid.motionUrl, /motion-webp\/barbell-bench-press-benjamin\.webp$/);
  assert.equal(valid.instructions, "Lower to the chest, then press.");

  const untrusted = prepareRecords([{
    name: "Barbell Bench Press",
    libraryEntry: {
      image_url: `${base}/webp-768/barbell-bench-press-benjamin.webp`,
      motion_url: "https://another.example/video.webp"
    }
  }])[0];
  assert.equal(untrusted.imageUrl, "");
  assert.equal(untrusted.motionUrl, "");
});

test("searches aliases and filters by primary muscle", () => {
  const prepared = prepareRecords([
    { name: "Romanian Deadlift", aliases: ["RDL"], libraryEntry: { primary_muscle: "Hamstrings", secondary_muscles: ["Glutes"] } },
    { name: "Bench Press", libraryEntry: { primary_muscle: "Chest", secondary_muscles: ["Triceps"] } },
    { name: "Bench Press", libraryEntry: { primary_muscle: "Chest" } }
  ]);
  assert.equal(prepared.length, 2);
  assert.equal(prepared[0].highlightKey, "chest--triceps");
  assert.equal(prepared[1].highlightKey, "hamstrings--glutes");
  assert.deepEqual(matchingRecords(prepared, "rdl", "Glutes"), []);
  assert.deepEqual(matchingRecords(prepared, "bench press", "Triceps"), []);
  assert.deepEqual(matchingRecords(prepared, "bench press", "Chest").map((record) => record.name), ["Bench Press"]);
  assert.equal(matchingRecords(prepared, "bench", "Hamstrings").length, 0);
  assert.deepEqual(groupedRecords(matchingRecords(prepared, "", "All"), "All").map(([muscle]) => muscle),
    ["Chest", "Full Body"]);
});

test("keeps recent alias searches on the canonical exercise and filters equipment", () => {
  const prepared = prepareRecords([
    { name: "Romanian Deadlift", aliases: ["RDL"], libraryEntry: { primary_muscle: "Hamstrings", equipment: "barbell", substitution_group: "hip_hinge" } },
    { name: "Dumbbell Curl", libraryEntry: { primary_muscle: "Biceps", equipment: "dumbbell" } },
    { name: "Cable Curl", libraryEntry: { primary_muscle: "Biceps", equipment: "cable" } }
  ], ["RDL", "Dumbbell Curl", "RDL"]);
  assert.equal(prepared.find((entry) => entry.name === "Romanian Deadlift").recentRank, 0);
  assert.equal(prepared.find((entry) => entry.name === "Romanian Deadlift").useCount, 2);
  assert.equal(prepared.find((entry) => entry.name === "Dumbbell Curl").useCount, 1);
  assert.equal(prepared.find((entry) => entry.name === "Romanian Deadlift").substitutionGroup, "hip hinge");
  assert.deepEqual(matchingRecords(prepared, "", "All", "barbell", true).map((entry) => entry.name), ["Romanian Deadlift"]);
  assert.deepEqual(matchingRecords(prepared, "rdl", "All", "All").map((entry) => entry.name), ["Romanian Deadlift"]);
  assert.deepEqual(matchingRecords(prepared, "", "All", "cable", true), []);
});

test("groups movement variants and searches common equipment and laterality aliases", () => {
  const records = prepareRecords([
    { name: "Lat Pulldown", libraryEntry: { primary_muscle: "Back" } },
    { name: "Wide Grip Cable Lat Pulldown", libraryEntry: { primary_muscle: "Back", equipment: "cable" } },
    { name: "Single Arm Machine Lat Pulldown", libraryEntry: { primary_muscle: "Back", equipment: "machine" } },
    { name: "Single Leg Dumbbell Romanian Deadlift", libraryEntry: { primary_muscle: "Hamstrings", equipment: "dumbbell" } },
    { name: "Kettlebell Swing", libraryEntry: { primary_muscle: "Glutes", equipment: "kettlebell" } }
  ]);
  const family = exerciseFamilies(records).find((item) => item.title === "Lat Pulldown");
  assert.equal(family.entries.length, 3);
  assert.deepEqual(matchingRecords(records, "one arm", "Back").map((item) => item.name), ["Single Arm Machine Lat Pulldown"]);
  assert.deepEqual(matchingRecords(records, "one leg db", "Hamstrings").map((item) => item.name), ["Single Leg Dumbbell Romanian Deadlift"]);
  assert.deepEqual(matchingRecords(records, "dumbell", "Hamstrings").map((item) => item.name), ["Single Leg Dumbbell Romanian Deadlift"]);
  assert.deepEqual(matchingRecords(records, "kb", "Glutes").map((item) => item.name), ["Kettlebell Swing"]);
});

test("keeps distinct lifts while grouping chest and glute variations", () => {
  const names = [
    ["Barbell Bench Press", "Chest"], ["Incline Dumbbell Chest Press", "Chest"],
    ["Machine Chest Press", "Chest"], ["Cable Chest Fly", "Chest"],
    ["High-to-Low Cable Fly", "Chest"], ["Low-to-High Cable Fly", "Chest"],
    ["Hip Thrust", "Glutes"], ["Single Leg Hip Thrust", "Glutes"],
    ["Hip Thrust Machine", "Glutes"], ["Glute Bridge with Pause", "Glutes"]
  ];
  const records = prepareRecords(names.map(([name, primary_muscle]) => ({
    name, libraryEntry: { primary_muscle }
  })));
  const families = exerciseFamilies(records);
  assert.equal(families.find((family) => family.title === "Chest Press")?.entries.length, 3);
  assert.equal(families.find((family) => family.title === "Chest Fly")?.entries.length, 3);
  assert.equal(families.find((family) => family.title === "Hip Thrust")?.entries.length, 3);
  assert.equal(families.find((family) => family.title === "Glute Bridge")?.entries.length, 1);
});

test("orders chest press variants from basic through equipment angle and grip", () => {
  const names = ["Underhand Grip Chest Press", "Incline Dumbbell Chest Press",
    "Neutral Grip Chest Press", "Chest Press", "Single Arm Chest Press",
    "Decline Dumbbell Chest Press", "Dumbbell Chest Press", "Incline Dumbbell Press"];
  const records = prepareRecords(names.map((name) => ({ name, libraryEntry: { primary_muscle: "Chest" } })));
  const family = exerciseFamilies(records).find((item) => item.title === "Chest Press");
  assert.deepEqual(family.entries.map((entry) => entry.name), ["Chest Press", "Dumbbell Chest Press",
    "Incline Dumbbell Chest Press", "Incline Dumbbell Press",
    "Decline Dumbbell Chest Press", "Single Arm Chest Press",
    "Neutral Grip Chest Press", "Underhand Grip Chest Press"]);
});

test("groups deadlift squat and lat pulldown variations across inconsistent muscle metadata", () => {
  const namesAndMuscles = [
    ["Barbell Deadlift", "Quads"], ["Dumbbell Romanian Deadlift", "Hamstrings"],
    ["Sumo Deadlift", "Glutes"], ["Trap-Bar Deadlift", "Full Body"],
    ["Barbell Back Squat", "Quads"], ["Goblet Squat", "Quads"],
    ["Glute Squat Machine", "Glutes"], ["Hack Squat", "Quads"],
    ["Squat Jump", "Full Body"], ["Lat Pulldown", "Lats"],
    ["Lat Pulldown Machine", "Back"], ["Close-Grip Lat Pulldown", "Lats"]
  ];
  const records = prepareRecords(namesAndMuscles.map(([name, primary_muscle]) => ({
    name, libraryEntry: { primary_muscle }
  })));
  const families = exerciseFamilies(records);
  assert.deepEqual(families.find((family) => family.title === "Deadlift")?.entries.map((entry) => entry.name),
    ["Barbell Deadlift", "Trap-Bar Deadlift", "Dumbbell Romanian Deadlift", "Sumo Deadlift"]);
  assert.equal(families.find((family) => family.title === "Squat")?.entries.length, 4);
  assert.deepEqual(families.find((family) => family.title === "Lat Pulldown")?.entries.map((entry) => entry.name),
    ["Lat Pulldown", "Lat Pulldown Machine", "Close-Grip Lat Pulldown"]);
  assert.equal(families.find((family) => family.title === "Squat")?.entries.some((entry) => entry.name === "Squat Jump"), false);
  const sections = groupedRecords(records, "All");
  assert.equal(sections.find(([muscle]) => muscle === "Full Body")?.[1].some((record) => record.name === "Barbell Deadlift"), true);
});

test("groups biceps curls and distinct triceps movements", () => {
  const namesAndMuscles = [
    ["Dumbbell Curl", "Biceps"], ["Barbell Curl", "Biceps"],
    ["Hammer Curl", "Biceps"], ["Incline Dumbbell Curl", "Biceps"],
    ["Cable Triceps Pushdown", "Triceps"], ["Rope Triceps Pressdown", "Triceps"],
    ["Overhead Cable Triceps Extension", "Triceps"], ["Single Arm Triceps Ext", "Triceps"],
    ["Bench Dip", "Triceps"], ["Assisted Dip", "Triceps"],
    ["Dumbbell Skull Crusher", "Triceps"], ["EZ-Bar Skull Crusher", "Triceps"],
    ["JM Press", "Triceps"], ["Close-Grip Barbell Bench Press", "Triceps"]
  ];
  const records = prepareRecords(namesAndMuscles.map(([name, primary_muscle]) => ({
    name, libraryEntry: { primary_muscle }
  })));
  const families = exerciseFamilies(records);
  assert.deepEqual(families.find((family) => family.title === "Biceps Curl")?.entries.map((entry) => entry.name),
    ["Dumbbell Curl", "Barbell Curl", "Hammer Curl", "Incline Dumbbell Curl"]);
  for (const title of ["Triceps Pushdown", "Triceps Extension", "Triceps Dip", "Skull Crusher", "Triceps Press"]) {
    assert.equal(families.find((family) => family.title === title)?.entries.length, 2, title);
  }
});

test("keeps secondary muscles as details without cross-listing compounds", () => {
  const records = prepareRecords([
    { name: "Barbell Row", libraryEntry: { primary_muscle: "Back", secondary_muscles: ["Biceps"] } },
    { name: "Barbell Bench Press", libraryEntry: { primary_muscle: "Chest", secondary_muscles: ["Triceps"] } }
  ]);
  const groups = new Map(groupedRecords(records, "All"));
  assert.deepEqual(groups.get("Back").map((record) => record.name), ["Barbell Row"]);
  assert.equal(groups.has("Biceps"), false);
  assert.deepEqual(groups.get("Chest").map((record) => record.name), ["Barbell Bench Press"]);
  assert.equal(groups.has("Triceps"), false);
  assert.deepEqual(matchingRecords(records, "", "Biceps"), []);
  assert.deepEqual(matchingRecords(records, "", "Triceps"), []);
  assert.equal(groupedRecords(records, "All").reduce((total, [, entries]) => total + entries.length, 0), 2);
});

test("ranks recent exercises by use count, then latest use", () => {
  const records = prepareRecords([
    { name: "Cable Curl", libraryEntry: { primary_muscle: "Biceps" } },
    { name: "Dumbbell Curl", libraryEntry: { primary_muscle: "Biceps" } }
  ], ["Cable Curl", "Dumbbell Curl", "Dumbbell Curl", "Cable Curl", "Dumbbell Curl"]);
  assert.deepEqual(exerciseFamilies(records, true)[0].entries.map((entry) => entry.name), ["Dumbbell Curl", "Cable Curl"]);
});

test("plural exercise searches find the singular catalog entry", () => {
  const records = prepareRecords([
    { name: "Seated Dip" }, { name: "Incline Dumbbell Curl" },
    { name: "Dumbbell Lateral Raise" }, { name: "Bench Press" }, { name: "Dumbbell Fly" }
  ]);
  for (const [query, expected] of [
    ["seated dips", "Seated Dip"],
    ["incline dumbbell curls", "Incline Dumbbell Curl"],
    ["dumbbell lateral raises", "Dumbbell Lateral Raise"],
    ["bench presses", "Bench Press"],
    ["dumbbell flies", "Dumbbell Fly"]
  ]) {
    assert.deepEqual(matchingRecords(records, query, "All").map((entry) => entry.name), [expected]);
  }
});

test("lat pulldown machine searches find the approved exercise alias", () => {
  const records = prepareRecords([{
    name: "Lat Pulldown", aliases: ["Lat Pull Down", "Lat Pulldown Machine"],
    libraryEntry: { primary_muscle: "Back", equipment: "cable" }
  }]);
  assert.deepEqual(matchingRecords(records, "lat pulldown machine", "All").map((entry) => entry.name), ["Lat Pulldown"]);
});

test("illustrates every browse muscle with a distinct highlighted region", () => {
  const muscles = ["Chest", "Back", "Shoulders", "Biceps", "Triceps", "Forearms", "Core", "Glutes", "Quads", "Hamstrings", "Calves", "Full Body", "Cardio", "Mobility"];
  const artwork = muscles.map(muscleArtwork);
  assert.equal(new Set(artwork).size, muscles.length);
  artwork.forEach((svg) => {
    assert.match(svg, /<svg viewBox="0 0 96 112" aria-hidden="true"/);
    assert.match(svg, /fill="#29a9ff"/);
    assert.match(svg, /<path d=/);
  });
  assert.equal(muscleArtwork("Other"), muscleArtwork("Full Body"));
});

test("both exercise search menus offer More and connect it to the full library", () => {
  const root = path.resolve(__dirname, "..");
  const portal = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");
  const dashboard = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");
  assert.equal((portal.match(/data-custom-exercise-more>More exercises/g) || []).length, 2);
  assert.match(portal, /function openClientExerciseLibrary\(input, onSelect,/);
  assert.match(portal, /records: exerciseSuggestionRecords\(\)/);
  assert.match(portal, /openClientExerciseLibrary\(input, \(name\) =>/);
  assert.match(dashboard, /js\/client-exercise-library\.js\?v=/);
  assert.match(dashboard, /css\/client-exercise-library\.css\?v=/);
});
