const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "../js/client-portal.js"), "utf8");
const start = source.indexOf("function syncWorkoutStartButtons(");
const end = source.indexOf("\nfunction ", start + 1);
const syncSource = source.slice(start, end);

function buttonLabel(timerState) {
  const panel = { querySelector: () => ({ value: "2026-11-06" }) };
  const button = {
    dataset: { workoutTitle: "Custom Workout" },
    classList: { toggle() {} },
    closest(selector) {
      if (selector === ".client-workout-panel") return panel;
      if (selector === ".client-workout-panel-custom") return panel;
      if (selector === ".client-workout-panel-custom:not(.has-custom-exercises)") return panel;
      return null;
    }
  };
  Function("document", "workoutElapsedTimerState", "todayDate",
    `${syncSource}; syncWorkoutStartButtons();`)(
    { querySelectorAll: () => [button] }, timerState, () => "2026-11-06"
  );
  return button.textContent;
}

test("custom workout action reads Start, Finish, then Start after reset", () => {
  assert.equal(buttonLabel(null), "Start workout");
  assert.equal(buttonLabel({ workoutTitle: "Custom Workout", workoutDate: "2026-11-06", running: true }), "Finish workout");
  assert.equal(buttonLabel(null), "Start workout");
});
