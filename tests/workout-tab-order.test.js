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

test("activates the workout panel matching the selected tab", () => {
  assert.match(portal, /activeWorkoutTabIndex = nextIndex;/);
  assert.match(portal, /panels\.forEach\(\(panel, index\) => \{/);
  assert.match(portal, /const isActive = index === nextIndex;/);
});
