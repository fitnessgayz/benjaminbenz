const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const portal = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");

test("places Custom Workout before assigned workouts", () => {
  assert.match(portal, /const availableWorkouts = \[\{[\s\S]*?isCustom: true[\s\S]*?\}, \.\.\.scheduledWorkouts\];/);
});

test("keeps assigned workout numbering independent of tab position", () => {
  assert.match(portal, /const assignedWorkoutIndex = scheduledWorkouts\.indexOf\(workout\);/);
  assert.match(portal, /`Workout \$\{assignedWorkoutIndex \+ 1\}`/);
});

test("maps the selected tab back to the correct assigned workout", () => {
  assert.match(portal, /const selectedAssignedWorkoutIndex = activeWorkoutTabIndex - 1;/);
  assert.match(portal, /workouts\[selectedAssignedWorkoutIndex\]/);
});
