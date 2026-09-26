const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluate, sessionKey } = require("../js/client-achievements.js");

const options = { today: "2026-09-25", clientEmail: "client@example.com" };
function row(date, changes = {}) {
  return {
    id: `${date}-a-1`, session_id: date, client_email: "client@example.com",
    entry_date: date, completed_at: `${date}T18:00:00Z`, workout_title: "Strength",
    exercise_name: "Bench press", exercise_code: "A", set_number: 1, set_type: "working",
    weight_used: 50, reps: 8, ...changes
  };
}
const snapshot = (rows, settings = {}) => evaluate(rows, { ...options, ...settings });
const badge = (result, id) => result.badges.find(item => item.id === id);
const prs = result => result.events.filter(event => event.kind === "pr");
function dateAfter(start, days) {
  return new Date(Date.parse(`${start}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

test("empty history has all 24 discoverable badges and a zero-progress first level", () => {
  const result = snapshot([]);
  assert.deepEqual([result.workouts, result.prs, result.bestWeeks, result.comebacks, result.cardioWorkouts, result.xp], [0, 0, 0, 0, 0, 0]);
  assert.equal(result.badges.length, 24);
  assert.equal(result.mobilityWorkouts, 0);
  assert.equal(result.yogaWorkouts, 0);
  assert.ok(result.badges.every(item => !item.unlocked && item.current === 0 && item.earnedOn === null));
  assert.deepEqual(result.level, { number: 1, name: "Getting Started", minimumXP: 0, nextXP: 300,
    nextName: "Finding Your Groove", progress: 0 });
  assert.deepEqual(result.events, []);
  assert.deepEqual(snapshot(null), result);
});

test("first completed workout earns First Spark; its first exercise observation is not a PR", () => {
  const result = snapshot([row("2026-09-01")]);
  assert.equal(result.workouts, 1);
  assert.equal(result.prs, 0);
  assert.equal(result.xp, 200);
  assert.equal(result.level.progress, 2 / 3);
  assert.deepEqual(result.events, [{ id: "badge:workout-1", kind: "badge", sessionId: "session:2026-09-01",
    date: "2026-09-01", title: "First Spark", detail: "Complete 1 workout.", badgeId: "workout-1" }]);
});

test("a session needs a persisted completion marker and meaningful non-warmup activity", () => {
  const result = snapshot([
    row("2026-09-01", { completed_at: null }),
    row("2026-09-02", { completed_at: "invalid" }),
    row("2026-09-03", { set_type: "warm_up" }),
    row("2026-09-04", { exercise_code: "WARMUP" }),
    row("2026-09-05", { set_number: 1000 }),
    row("2026-09-06", { weight_used: 100, reps: null }),
    row("2026-09-07", { reps: 0 }),
    row("2026-09-08", { weight_used: -1 }),
    row("2026-09-09", { weight_used: Infinity }),
    row("2026-09-10", { reps: NaN })
  ]);
  assert.equal(result.workouts, 0);
  const mixed = snapshot([
    row("2026-09-11", { set_type: "warm_up" }),
    row("2026-09-11", { id: "working", set_number: 2, completed_at: null, weight_used: 0, reps: 10 })
  ]);
  assert.equal(mixed.workouts, 1, "completion marker can be on another member of the saved session");
});

test("timed, recovery, and cardio sessions count without granting duration PRs", () => {
  const result = snapshot([
    row("2026-09-01", { exercise_name: "Hip stretch", set_type: "timed", duration_seconds: 30, weight_used: 0, reps: null }),
    row("2026-09-02", { exercise_name: "Hip stretch", set_type: "timed", duration_seconds: 45, weight_used: 0, reps: null }),
    row("2026-09-03", { exercise_code: "CARDIO", weight_used: 20, reps: 2 }),
    row("2026-09-04", { exercise_code: "CARDIO", weight_used: 30, reps: 3 }),
    row("2026-09-05", { exercise_code: "CARDIO", weight_used: 0, duration_seconds: 60 }),
    row("2026-09-06", { exercise_code: "CARDIO", weight_used: 0, reps: 3 }),
    row("2026-09-07", { set_type: "timed", duration_seconds: 0, weight_used: 0, reps: 30 })
  ]);
  assert.equal(result.workouts, 5);
  assert.equal(result.cardioWorkouts, 3);
  assert.equal(result.prs, 0);
  assert.equal(badge(result, "cardio-1").earnedOn, "2026-09-03");
  assert.equal(badge(result, "workout-5").earnedOn, "2026-09-05");
});

test("only genuine weight gains produce one PR per exercise per session; ties keep their date", () => {
  const rows = [row("2026-09-01", { weight_used: 17.1 }),
    row("2026-09-02", { weight_used: 17.3 }),
    row("2026-09-02", { id: "set2", set_number: 2, weight_used: 17.5 }),
    row("2026-09-02", { id: "set3", set_number: 3, weight_used: 17.5, reps: 10 }),
    row("2026-09-03", { weight_used: 17.5, reps: 12 }),
    row("2026-09-04", { weight_used: 15 })];
  const result = snapshot(rows);
  assert.equal(result.prs, 1);
  assert.deepEqual(prs(result), [{ id: "pr:session:2026-09-02:bench press", kind: "pr", sessionId: "session:2026-09-02",
    date: "2026-09-02", title: "New PR · Bench press", detail: "17.5 lb × 10 reps" }]);
  assert.equal(badge(result, "pr-1").earnedOn, "2026-09-02");
  assert.deepEqual(snapshot(rows.reverse()), result);
});

test("bodyweight reps establish their own baseline and never compete with weighted reps", () => {
  const result = snapshot([
    row("2026-09-01", { weight_used: 0, reps: 10 }),
    row("2026-09-02", { weight_used: null, reps: 12 }),
    row("2026-09-03", { weight_used: 20, reps: 20 }),
    row("2026-09-04", { weight_used: 0, reps: 12 }),
    row("2026-09-05", { weight_used: "", reps: 15 }),
    row("2026-09-05", { id: "weighted", weight_used: 25, reps: 8, set_number: 2 })
  ]);
  assert.equal(result.prs, 2, "both improvements in the final session still earn one PR");
  assert.equal(prs(result)[0].detail, "12 bodyweight reps");
  assert.equal(prs(result)[1].detail, "25 lb × 8 reps");
});

test("PR normalization combines spacing, case, and accents while preserving exercise variants", () => {
  const result = snapshot([
    row("2026-09-01", { exercise_name: " Café   press " }),
    row("2026-09-02", { exercise_name: "CAFE PRESS", weight_used: 55 }),
    row("2026-09-03", { exercise_name: "Incline cafe press", weight_used: 100 }),
    row("2026-09-04", { exercise_name: "Cafe-press", weight_used: 100 }),
    row("2026-09-05", { exercise_name: "", weight_used: 200 }),
    row("2026-09-06", { exercise_name: "", weight_used: 250 })
  ]);
  assert.equal(result.prs, 1);
  assert.equal(prs(result)[0].id, "pr:session:2026-09-02:cafe press");
});

test("warmups, timed sets, malformed values and incomplete sessions cannot inflate PR baselines", () => {
  const result = snapshot([
    row("2026-09-01", { weight_used: 10 }),
    row("2026-09-02", { weight_used: 500, set_type: "warm_up" }),
    row("2026-09-03", { weight_used: 500, set_number: 1001 }),
    row("2026-09-04", { weight_used: 500, exercise_code: "CARDIO" }),
    row("2026-09-05", { weight_used: 500, set_type: "timed", duration_seconds: 30 }),
    row("2026-09-06", { weight_used: 500, completed_at: null }),
    row("2026-09-07", { weight_used: 500, reps: 0 }),
    row("2026-09-08", { weight_used: 500, reps: Infinity }),
    row("2026-09-09", { weight_used: "invalid" }),
    row("2026-09-10", { weight_used: 12 })
  ]);
  assert.equal(result.prs, 1);
  assert.equal(prs(result)[0].detail, "12 lb × 8 reps");
});

test("session identity honors stable IDs and merges legacy members only when unambiguous", () => {
  assert.equal(sessionKey(row("2026-09-01", { session_id: " AbC ", workout_session_id: "other" })), "session:abc");
  assert.equal(sessionKey(row("2026-09-01", { session_id: null, workout_session_id: " Older " })), "session:older");
  assert.equal(sessionKey(row("2026-09-01", { session_id: null, workout_title: " Café  Strength " })), "legacy:2026-09-01::cafe strength");
  const entries = [row("2026-09-01", { session_id: "abc" }),
    row("2026-09-01", { id: "old", session_id: null, set_number: 2 })];
  assert.equal(snapshot(entries).workouts, 1);
  const ambiguous = [...entries, row("2026-09-01", { id: "other", session_id: "other" })];
  assert.equal(snapshot(ambiguous).workouts, 3, "an ambiguous legacy session is preserved rather than merged into an arbitrary workout");
});

test("stable set IDs keep the latest edit even when a newer invalid row removes prior eligibility", () => {
  const first = row("2026-09-01", { set_id: "same", id: "old", weight_used: 500, updated_at: "2026-09-02T00:00:00Z" });
  const edited = { ...first, id: "new", weight_used: 50, updated_at: "2026-09-03T00:00:00Z" };
  const later = row("2026-09-04", { weight_used: 55 });
  const result = snapshot([first, edited, later]);
  assert.equal(result.workouts, 2);
  assert.equal(result.prs, 1);
  assert.deepEqual(snapshot([later, edited, first]), result);
  assert.equal(snapshot([first, { ...edited, entry_date: "2027-01-01" }]).workouts, 0);
  assert.equal(snapshot([first, { ...edited, completed_at: null }]).workouts, 0);
});

test("idless fallback sets are deduplicated after legacy session merging", () => {
  const result = snapshot([
    row("2026-09-01", { id: null, session_id: null, weight_used: 500, updated_at: "2026-09-01T10:00:00Z" }),
    row("2026-09-01", { id: null, weight_used: 50, updated_at: "2026-09-01T11:00:00Z" }),
    row("2026-09-02", { weight_used: 55 })
  ]);
  assert.equal(result.workouts, 2);
  assert.equal(result.prs, 1);
});

test("same-day sessions are ordered by completion time and then stable session key", () => {
  const rows = [row("2026-09-01", { id: "later", session_id: "b", weight_used: 55, completed_at: "2026-09-01T20:00:00Z" }),
    row("2026-09-01", { id: "earlier", session_id: "a", weight_used: 50, completed_at: "2026-09-01T19:00:00Z" }),
    row("2026-09-01", { id: "tied", session_id: "c", weight_used: 60, completed_at: "2026-09-01T20:00:00Z" })];
  const result = snapshot(rows);
  assert.equal(result.workouts, 3);
  assert.equal(result.prs, 2);
  assert.deepEqual(prs(result).map(event => event.sessionId), ["session:b", "session:c"]);
  assert.deepEqual(snapshot(rows.reverse()), result);
});

test("invalid and future dates or explicit foreign clients never contribute", () => {
  const result = snapshot([
    row("2026-02-30"), row("2026-13-01"), row("2026-09-26"), row("2026-9-01"), row("0000-01-01"),
    row("2026-09-01", { client_email: "someone@example.com" }),
    row("2026-09-02", { client_email: " CLIENT@EXAMPLE.COM " }),
    row("2026-09-03", { client_email: null }),
    row("2026-09-04", { client_email: undefined })
  ]);
  assert.equal(result.workouts, 3);
  assert.equal(snapshot([row("2026-09-25")]).workouts, 1, "today remains eligible");
});

test("consecutive Monday weeks cross year and DST boundaries without requiring daily workouts", () => {
  const result = snapshot(["2025-12-28", "2025-12-29", "2026-01-04", "2026-01-05", "2026-01-12", "2026-02-02"]
    .map(date => row(date)));
  assert.equal(result.bestWeeks, 4);
  assert.equal(badge(result, "weeks-3").earnedOn, "2026-01-05");
  const daylight = snapshot(["2026-03-02", "2026-03-09", "2026-03-16"].map(date => row(date)));
  assert.equal(daylight.bestWeeks, 3);
  assert.equal(badge(daylight, "weeks-3").earnedOn, "2026-03-16");
});

test("comebacks require 14 days and earn once even after several qualifying returns", () => {
  const rows = ["2026-07-01", "2026-07-14", "2026-07-28", "2026-08-11"].map(date => row(date));
  rows.push(row("2026-07-28", { id: "second", session_id: "second" }));
  const result = snapshot(rows);
  assert.equal(result.comebacks, 2);
  assert.equal(badge(result, "comeback-1").earnedOn, "2026-07-28");
  assert.equal(result.events.filter(event => event.badgeId === "comeback-1").length, 1);
});

test("milestones retain their first crossing date, use clamped progress, and unlock every tier", () => {
  const rows = Array.from({ length: 250 }, (_, index) => row(dateAfter("2025-01-01", index), { weight_used: index + 10 }));
  for (let index = 0; index < 50; index += 1) {
    const date = dateAfter("2025-01-01", index);
    rows.push(row(date, { id: `${date}-cardio`, exercise_code: "CARDIO", exercise_name: "Run", set_number: 2 }));
    if (index < 25) {
      rows.push(row(date, { id: `${date}-mobility`, exercise_code: "M1", exercise_name: "Hamstring stretch", set_number: 3,
        weight_used: 0, reps: null, duration_seconds: 30, set_type: "timed" }));
      rows.push(row(date, { id: `${date}-yoga`, exercise_code: "Y1", exercise_name: "Tree pose", set_number: 4,
        weight_used: 0, reps: null, duration_seconds: 30, set_type: "timed" }));
    }
  }
  rows.push(row(dateAfter("2025-01-01", 263), { weight_used: 260 }));
  const result = snapshot(rows);
  assert.equal(result.workouts, 251);
  assert.equal(result.prs, 250);
  assert.equal(result.cardioWorkouts, 50);
  assert.equal(result.mobilityWorkouts, 25);
  assert.equal(result.yogaWorkouts, 25);
  assert.ok(result.badges.every(item => item.unlocked && item.current === item.target));
  assert.equal(badge(result, "workout-5").earnedOn, "2025-01-05");
  assert.equal(badge(result, "workout-250").earnedOn, dateAfter("2025-01-01", 249));
  assert.equal(badge(result, "pr-25").earnedOn, "2025-01-26");
  assert.equal(result.xp, 40000);
  assert.equal(badge(result, "mobility-25").earnedOn, "2025-01-25");
  assert.equal(badge(result, "yoga-10").earnedOn, "2025-01-10");
  assert.equal(badge(result, "cardio-50").earnedOn, "2025-02-19");
  assert.deepEqual(result.level, { number: 8, name: "FWB Legend", minimumXP: 12000, nextXP: null, nextName: null, progress: 1 });
  assert.equal(new Set(result.events.map(event => event.id)).size, result.events.length);
});

test("native Mobility seconds and generated recovery title tags earn recovery without weight PRs", () => {
  const result = snapshot([
    row("2026-09-01", { workout_title: "Mobility", exercise_name: "Custom movement", weight_used: 30, reps: null }),
    row("2026-09-02", { workout_title: "Mobility", exercise_name: "Custom movement", weight_used: 60, reps: null }),
    ...["Upper body recovery", "Lower body recovery", "Full body recovery"].map((title, index) =>
      row(`2026-09-0${index + 3}`, { workout_title: `Custom Workout · ${title} · id-${index}`,
        exercise_name: "Gentle movement", weight_used: 0, reps: 8 }))
  ]);
  assert.equal(result.workouts, 5);
  assert.equal(result.mobilityWorkouts, 5);
  assert.equal(result.cardioWorkouts, 0);
  assert.equal(result.prs, 0);
  assert.equal(badge(result, "mobility-1").earnedOn, "2026-09-01");
  assert.equal(badge(result, "mobility-10").category, "recovery");
});

test("all seeded recovery exercises qualify by name without relying on title text", () => {
  const names = ["Cat-Cow", "Side-Lying Open Book", "Shoulder Circles", "Cross-Body Shoulder Stretch",
    "Supine Chest Stretch", "Overhead Triceps Stretch", "Supine Figure-Four Stretch", "Supine Hamstring Stretch",
    "Half-Kneeling Hip Flexor Stretch", "Side-Lying Quad Stretch", "Seated Butterfly Stretch", "Supine Ankle Circles"];
  const result = snapshot(names.map((name, index) => row(dateAfter("2026-09-01", index), {
    exercise_name: name, weight_used: 0, reps: 8
  })));
  assert.equal(result.mobilityWorkouts, 12);
  assert.equal(result.yogaWorkouts, 0);
  assert.equal(result.prs, 0);
  assert.equal(badge(result, "mobility-10").earnedOn, "2026-09-10");
});

test("yoga styles and recognized poses qualify once per session", () => {
  const names = ["Vinyasa flow", "Hatha yoga", "Yin yoga", "Downward-facing dog", "Child’s pose", "Warrior II", "Tree pose"];
  const rows = names.map((name, index) => row(dateAfter("2026-09-01", index), {
    exercise_name: name, weight_used: 0, reps: null, duration_seconds: 30, set_type: "timed"
  }));
  rows.push({ ...rows[0], id: "other-pose", exercise_name: "Pigeon pose", set_number: 2 });
  const result = snapshot(rows);
  assert.equal(result.yogaWorkouts, 7);
  assert.equal(result.mobilityWorkouts, 0);
  assert.equal(result.prs, 0);
  assert.equal(badge(result, "yoga-1").title, "First Flow");
});

test("generic strength timing and incidental words cannot earn recovery or cardio badges", () => {
  const names = ["Plank", "Walking lunge", "Dumbbell row", "Yoga mat push-up", "Warrior row", "Stretch goal press"];
  const result = snapshot(names.map((name, index) => row(dateAfter("2026-09-01", index), {
    workout_title: "Stretch goal — yoga mat strength", exercise_name: name,
    weight_used: 0, reps: null, duration_seconds: 30, set_type: "timed"
  })));
  assert.equal(result.workouts, 6);
  assert.equal(result.mobilityWorkouts, 0);
  assert.equal(result.yogaWorkouts, 0);
  assert.equal(result.cardioWorkouts, 0);
});

test("duration wrappers recognize recovery instead of mislabeling it as cardio", () => {
  const result = snapshot([
    row("2026-09-01", { exercise_code: "CARDIO", workout_title: "Mobility", exercise_name: "Stretching", weight_used: 10, reps: null }),
    row("2026-09-02", { exercise_code: "CARDIO", exercise_name: "Hatha yoga", weight_used: 20, reps: null }),
    row("2026-09-03", { exercise_name: "Running", weight_used: 0, reps: null, duration_seconds: 600, set_type: "timed" }),
    row("2026-09-04", { exercise_name: "Running", weight_used: 0, reps: 10 })
  ]);
  assert.equal(result.mobilityWorkouts, 1);
  assert.equal(result.yogaWorkouts, 1);
  assert.equal(result.cardioWorkouts, 1, "named cardio requires a duration unless it uses the explicit CARDIO code");
  assert.equal(badge(result, "cardio-1").category, "cardio");
});

test("mixed completed work can earn each modality once; warmups, duplicates, and drafts cannot inflate it", () => {
  const rows = [
    row("2026-09-01", { id: "stretch", exercise_name: "Hip stretch", weight_used: 0, reps: 6 }),
    row("2026-09-01", { id: "yoga", exercise_name: "Tree pose", set_number: 2, weight_used: 0, reps: null, duration_seconds: 30 }),
    row("2026-09-01", { id: "cardio", exercise_code: "CARDIO", set_number: 3, weight_used: 20, reps: null }),
    row("2026-09-02", { exercise_name: "Hip stretch", set_type: "warm_up" }),
    row("2026-09-03", { exercise_name: "Yoga", completed_at: null })
  ];
  const result = snapshot([...rows, ...rows]);
  assert.equal(result.workouts, 1);
  assert.equal(result.mobilityWorkouts, 1);
  assert.equal(result.yogaWorkouts, 1);
  assert.equal(result.cardioWorkouts, 1);
  assert.equal(result.prs, 0);
  assert.equal(result.badges.filter(item => item.unlocked).length, 4);
});

test("historical edits and deleted evidence recalculate awards; evaluating never mutates input", () => {
  const first = Object.freeze(row("2026-09-01"));
  const second = Object.freeze(row("2026-09-02", { weight_used: 55 }));
  const rows = Object.freeze([first, second]);
  const result = snapshot(rows);
  assert.equal(result.prs, 1);
  assert.equal(snapshot([second]).prs, 0);
  assert.equal(snapshot([second]).events.length, 1);
  assert.deepEqual(snapshot(rows), result, "repeated evaluation has no remembered or duplicate awards");
});
