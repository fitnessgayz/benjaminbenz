const test = require("node:test");
const assert = require("node:assert/strict");
const builder = require("../js/fitness-plan-builder.js");

const answers = {
  training_frequency: "4", training_minutes: "45", training_experience: "beginner",
  training_equipment: "dumbbell", avoid_movements: "squats, overhead press"
};

test("builds a week from approved exercises while excluding named movements", () => {
  const library = [
    { name: "Goblet squat", movement_pattern: "squat" },
    { name: "Overhead press", movement_pattern: "vertical press" },
    { name: "Dumbbell row", movement_pattern: "row" }
  ];
  const calls = [];
  const generator = { generate(options) {
    calls.push(options);
    return { title: `${options.focus} workout`, minutes: options.minutes, exercises: options.library };
  } };
  const plan = builder.build(answers, library, generator, new Date("2026-10-10T12:00:00"));
  assert.equal(plan.workouts.length, 4);
  assert.deepEqual(plan.workouts.map((day) => day.date), ["2026-10-10", "2026-10-12", "2026-10-14", "2026-10-15"]);
  assert.deepEqual(calls.map((call) => call.focus), ["upper_body", "lower_body", "upper_body", "lower_body"]);
  assert.ok(calls.every((call) => call.intensity === "easy" && call.minutes === 45));
  assert.ok(calls.every((call) => call.library.length === 1 && call.library[0].name === "Dumbbell row"));
  assert.equal(library.length, 3, "the approved library stays intact");
});

test("a stated weak area shapes the final training day", () => {
  const calls = [];
  builder.build({ ...answers, training_frequency: "3", strengthen_weaknesses: "glutes" },
    [{ name: "Glute bridge" }], { generate(options) { calls.push(options); return { title: options.focus, minutes: 45, exercises: [] }; } });
  assert.deepEqual(calls.map((call) => call.focus), ["full_body", "upper_body", "glutes"]);
});

test("limited equipment falls back to available focused sessions", () => {
  const calls = [];
  const plan = builder.build({ ...answers, training_frequency: "2", training_equipment: "bodyweight" },
    [{ name: "Push-up", movement_pattern: "press" }], { generate(options) {
      calls.push(options.focus);
      if (options.focus === "full_body") throw new Error("full body is unavailable");
      return { title: options.focus, minutes: 45, exercises: [] };
    } });
  assert.deepEqual(calls, ["full_body", "upper_body", "full_body", "upper_body"]);
  assert.deepEqual(plan.workouts.map((day) => day.workout.title), ["upper_body", "upper_body"]);
});

test("current pain sends the client to coach review before app generation", () => {
  assert.throws(() => builder.build({ ...answers, pain_or_injuries: "Current knee pain" }, [{ name: "Row" }], { generate() { throw new Error("should not run"); } }), /Benjamin for review/);
});

test("coach review is limited to active personal or online training clients", () => {
  assert.equal(builder.canRequestCoachReview({ active: true, account_type: "beta_tester", membership_type: "app_access_only" }), false);
  assert.equal(builder.canRequestCoachReview({ active: true, account_type: "client", membership_type: "app_access_only" }), false);
  assert.equal(builder.canRequestCoachReview({ active: true, account_type: "client", membership_type: "personal_training" }), true);
  assert.equal(builder.canRequestCoachReview({ active: true, account_type: "client", membership_type: "online_training" }), true);
  assert.equal(builder.canRequestCoachReview({ active: false, account_type: "client", membership_type: "online_training" }), false);
});
