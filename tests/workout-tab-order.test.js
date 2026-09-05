const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const portal = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");
const dashboard = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "css/style.css"), "utf8");

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
  assert.match(portal, /syncClientWorkoutSelectionSummary\(tab\);/);
});

test("renders the approved compact icon workout selector", () => {
  assert.match(portal, /class="client-workout-tab-icon"/);
  assert.match(portal, /class="client-workout-tab-copy"/);
  assert.match(portal, /data-client-workout-selection-target=/);
  assert.match(dashboard, /id="client-workout-selection-summary"[\s\S]*?data-client-workout-selection-title/);
  assert.match(styles, /\.client-workout-tabs \{[\s\S]*?display: grid;[\s\S]*?minmax\(132px, 1fr\)/);
  assert.match(styles, /\.client-workout-tab \{[\s\S]*?min-height: 62px;[\s\S]*?grid-template-columns: 36px minmax\(0, 1fr\)/);
  assert.match(styles, /\.client-workout-selection-summary \{[\s\S]*?background: #171a16;/);
  assert.match(dashboard, /css\/style\.css\?v=workout-selector-icons-1/);
  assert.match(dashboard, /js\/client-portal\.js\?v=workout-selector-icons-1/);
});

test("shows a workout day separately from its training target", () => {
  const start = portal.indexOf("function clientWorkoutSelectorDetails");
  const end = portal.indexOf("function clientWorkoutTabIconMarkup", start);
  const detailsSource = portal.slice(start, end);
  const selectorDetails = Function(
    "customWorkoutTitle",
    `${detailsSource}; return clientWorkoutSelectorDetails;`
  )("Custom workout");

  assert.deepEqual(
    selectorDetails({ title: "Saturday — Shoulders + biceps + legs", focus: "Strength" }, "Workout 1"),
    {
      label: "Workout 1",
      day: "Saturday",
      target: "Shoulders + biceps + legs",
      tabLabel: "01",
      tabCaption: "Saturday"
    }
  );
  assert.deepEqual(
    selectorDetails({ title: "Monday", focus: "Full body strength" }, "Workout 2"),
    {
      label: "Workout 2",
      day: "Monday",
      target: "Full body strength",
      tabLabel: "02",
      tabCaption: "Monday"
    }
  );
  assert.deepEqual(
    selectorDetails({ title: "Custom workout", focus: "Build your own", isCustom: true }, "Custom"),
    {
      label: "Custom",
      day: "Build your own",
      target: "Custom workout",
      tabLabel: "Custom",
      tabCaption: "Build your own"
    }
  );
});
