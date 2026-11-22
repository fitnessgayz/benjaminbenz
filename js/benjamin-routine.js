(function attachBenjaminRoutine(root) {
  "use strict";

  // ExploreTrainingCatalog.benjaminSessions in iOS ClientViews.swift @ ef3f452.
  // IDs use the native namespace fwb-explore-routine-v1, independent of each logged session ID.
  const templates = [
    ["full-body", "Full Body Day", "Legs, chest and back",
      "13f34136-b5fb-52ce-860e-e72ae002d365", "5e279ae1-10fa-5fe5-ba41-a508a0cf56aa", [
        ["Hip Thrust Machine", 3, "8-12"],
        ["Linear Hack Squat", 3, "8-12"],
        ["One Dumbbell Bulgarian Split Squat", 3, "8-12"],
        ["Machine Chest Press", 3, "8-12"],
        ["Lat Pulldown", 3, "8-12"]
      ]],
    ["chest-triceps", "Chest & Triceps", "Presses, flyes and triceps",
      "34248b3e-5ec8-54f5-bedc-f04d137d8f29", "d65576c9-ea76-579a-8906-01f62e0153aa", [
        ["Incline Dumbbell Press", 3, "8-12"],
        ["Machine Chest Press", 3, "8-12"],
        ["Decline Cable Fly", 2, "12-15"],
        ["Overhead Dumbbell Triceps Extension", 2, "10-15"],
        ["Cable Triceps Pushdown", 2, "10-15"]
      ]],
    ["back-biceps", "Back & Biceps", "Pulldowns, rows and curls",
      "af418593-0ad4-58ac-bbba-16a5b0d4365a", "601d91b0-4ad0-5e1a-ab93-a49fcf39a174", [
        ["Lat Pulldown", 3, "8-12"],
        ["Chest-Supported Dumbbell Row", 3, "8-12"],
        ["T-Bar Row", 3, "8-12"],
        ["Preacher Curl", 2, "10-15"],
        ["Incline Dumbbell Curl", 2, "10-15"]
      ]],
    ["push-day", "Push Day", "Chest, shoulders and triceps",
      "11a4ca42-166b-5bf3-aa0f-6c52f0879cb1", "2cb36d34-1123-5b7f-8124-e19ef44ec9e6", [
        ["Dumbbell Bench Press", 3, "8-12"],
        ["Seated Dumbbell Shoulder Press", 3, "8-12"],
        ["Cable Lateral Raise", 3, "12-15"],
        ["Cable Chest Fly", 3, "12-15"],
        ["Rope Triceps Pressdown", 3, "10-15"]
      ]],
    ["pull-day", "Pull Day", "Lats, upper back and rear delts",
      "bcfd018a-06b6-59e6-8af8-11f2a1ecb6f7", "52620c33-c64c-5fa6-9344-36b22619fa72", [
        ["Neutral-Grip Lat Pulldown", 3, "8-12"],
        ["Seated Cable Row", 3, "8-12"],
        ["Straight-Arm Cable Pulldown", 3, "10-15"],
        ["Cable Reverse Fly", 3, "12-15"],
        ["Face Pull", 2, "12-15"]
      ]],
    ["glutes", "Glute Focus", "Thrusts, abduction and hip extension",
      "dde3ef11-61e4-5c81-b482-69103ef35616", "9c2e9bae-c75d-56e3-8836-c5e4c040a95f", [
        ["Hip Thrust Machine", 4, "8-12"],
        ["Hip Abduction Machine", 3, "12-15"],
        ["Cable Glute Kickback", 3, "12-15"],
        ["Back Extension (Glute Focus) Machine", 3, "10-15"]
      ]],
    ["lower-body", "Lower Body", "Quads, hamstrings and glutes",
      "2e6a6556-2d1a-59f1-91a6-9bd3fa4a638e", "7903b653-db3e-53ef-af9b-12f0ed8f0a29", [
        ["Leg Extension", 3, "10-15"],
        ["Belt Squat", 3, "8-12"],
        ["Dumbbell Reverse Lunge", 3, "8-12"],
        ["Single Leg Dumbbell RDL", 3, "8-12"],
        ["Seated Leg Curl", 3, "10-15"]
      ]]
  ];
  const levels = Object.freeze(["Intermediate", "Advanced"]);
  const sessions = Object.freeze(levels.flatMap((level) => templates.map(
    ([slug, title, focus, intermediateId, advancedId, targets]) => {
      const advanced = level === "Advanced";
      return Object.freeze({
        slug, title, focus, level, id: advanced ? advancedId : intermediateId,
        cover: `images/workouts/benjamin-routine/${slug}.jpg`,
        format: "single", warmUpCount: 0,
        exercises: Object.freeze(targets.map(([name, baseSets, baseReps], index) => {
          const sets = advanced && index < 2 ? Math.min(baseSets + 1, 4) : baseSets;
          const reps = advanced && index === 0 && slug !== "lower-body" ? "6-8" : baseReps;
          // Native has no exercise-specific rest or progression for these routines.
          return Object.freeze({ code: "ABCDE"[index], name, sets, prescription: `${reps} reps x ${sets} sets` });
        }))
      });
    }
  )));
  // Same four local templates and stable identifiers as native Explore.
  const atHome = Object.freeze([
    ["foundations", "ce53c45b-8852-596c-8942-a9b8b7f73111", "Full Body Foundations", "Beginner", "Bodyweight", "at-home-routines/full-body.jpg", 60, [
      ["Bodyweight Squat", 2, "8-12 reps"],
      ["Push-Up", 2, "5-8 reps"],
      ["Glute Bridge", 2, "10-12 reps"],
      ["Dead Bug", 2, "6-8 reps each side"],
    ]],
    ["lower-core", "cd4e1998-5d31-5f19-a1c7-59ce470010bd", "Lower Body & Core", "Intermediate", "Bodyweight", "at-home-routines/abs-butt.jpg", 60, [
      ["Reverse Lunge", 3, "8-10 reps each side"],
      ["Single-Leg Glute Bridge", 3, "8-12 reps each side"],
      ["Bodyweight Squat", 3, "12-15 reps"],
      ["Dead Bug", 3, "8-10 reps each side"],
      ["Side Plank", 2, "20-30 sec/side"],
    ]],
    ["upper-strength", "b6f78ddd-d1d3-5a98-ae63-7050f61ce5ff", "Upper Body Strength", "Intermediate", "Dumbbells", "benjamin-routine/push-day.jpg", 75, [
      ["Dumbbell Floor Press", 3, "8-12 reps"],
      ["One-Arm Dumbbell Row", 3, "8-12 reps each side"],
      ["Standing Dumbbell Shoulder Press", 3, "8-12 reps"],
      ["Dumbbell Reverse Fly", 2, "10-15 reps"],
      ["Hammer Curl", 2, "10-15 reps"],
    ]],
    ["full-strength", "88aef37c-78fd-5f5c-9800-2b862b514837", "Full Body Strength", "Advanced", "Dumbbells", "at-home-routines/upper-lower.jpg", 90, [
      ["Goblet Squat", 4, "8-12 reps"],
      ["Dumbbell Romanian Deadlift", 4, "8-12 reps"],
      ["Dumbbell Floor Press", 4, "6-10 reps"],
      ["One-Arm Dumbbell Row", 4, "8-12 reps each side"],
      ["Dumbbell Reverse Lunge", 3, "8-10 reps each side"],
      ["Front Plank", 3, "30-45 sec"],
    ]],
  ].map(([slug, id, title, level, focus, cover, rest, movements]) => Object.freeze({
    slug, id, title, level, focus, collection: "at-home", cover: `images/workouts/${cover}`,
    format: "single", warmUpCount: 0,
    exercises: Object.freeze(movements.map(([name, sets, target]) => Object.freeze({
      name, sets, prescription: `${target} x ${sets} sets`, rest: `${rest}s rest`, timed: / sec/.test(target)
    })))
  })));

  const api = Object.freeze({ levels, sessions, atHome, collectionCover: sessions[0].cover,
    find: (id) => sessions.find((session) => session.id === id) ?? atHome.find((session) => session.id === id) });
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FWB_BENJAMIN_ROUTINE = api;
}(typeof globalThis === "undefined" ? this : globalThis));
