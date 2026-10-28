const test = require("node:test");
const assert = require("node:assert/strict");

const { recommendations } = require("../js/client-gym-history.js");
const { normalize, moveShown } = require("../js/client-mobile-tabs.js");
const { requestDetails } = require("../js/client-access-request.js");
const { muscleIconSvg, muscleFor } = require("../js/client-exercise-library.js");

test("exercise history offers the latest working sets from up to three distinct gyms", () => {
  const row = (date, gym, weight, set = 1, type = "working") => ({
    entry_date: date, gym_name: gym, weight_used: weight, reps: 10,
    set_number: set, set_type: type, workout_title: "Custom workout"
  });
  const logs = [
    row("2026-10-20", "Downtown", 70),
    row("2026-10-25", "Uptown", 110),
    row("2026-10-25", "Uptown", 115, 2),
    row("2026-10-26", "Home", 35),
    row("2026-10-27", "Downtown", 80),
    row("2026-10-27", "Downtown", 40, 1001, "warm_up"),
    row("2026-10-28", "Home", 999),
    row("2026-10-24", "Fourth Gym", 45)
  ];
  const choices = recommendations(logs, "2026-10-28", "Uptown");
  assert.deepEqual(choices.map((choice) => choice.gym), ["Uptown", "Downtown", "Home"]);
  assert.deepEqual(choices.map((choice) => choice.sets.map((set) => set.weight_used)), [[110, 115], [80], [35]]);
});

test("bottom tab settings keep Settings visible and repair repeated or unknown tabs", () => {
  const layout = normalize({ order: ["progress", "progress", "unknown", "home"], hidden: ["home", "notifications"] });
  assert.deepEqual(layout.order, ["progress", "home", "workouts", "logs", "notifications"]);
  assert.deepEqual(layout.hidden, ["home"]);
});

test("reordering skips hidden tabs", () => {
  const order = ["home", "workouts", "logs", "progress", "notifications"];
  assert.deepEqual(moveShown(order, ["logs"], "workouts", 1),
    ["home", "progress", "logs", "workouts", "notifications"]);
  assert.deepEqual(moveShown(order, ["logs"], "progress", 1), order);
});

test("sign-up request validates contact details before sending", () => {
  const form = { elements: {
    name: { value: " Alex Smith " }, email: { value: " ALEX@example.com " },
    phone: { value: " " }, goals: { value: " Build strength " }, website: { value: "" }
  } };
  assert.deepEqual(requestDetails(form), {
    name: "Alex Smith", email: "alex@example.com", phone: "", goals: "Build strength", website: ""
  });
  form.elements.email.value = "invalid";
  assert.equal(requestDetails(form), null);
});

test("exercise search highlights each target muscle in blue", () => {
  assert.equal(muscleFor("front_delts"), "Shoulders");
  const triceps = muscleIconSvg("Triceps");
  const glutes = muscleIconSvg("Glutes");
  const hamstrings = muscleIconSvg("Hamstrings");
  assert.match(triceps, /#25aaff/);
  assert.notEqual(triceps, glutes);
  assert.notEqual(glutes, hamstrings);
});
