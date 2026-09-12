const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const portal = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");
const dashboard = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "css/style.css"), "utf8");

function sourceForFunction(name) {
  const start = portal.indexOf(`function ${name}(`);
  const end = portal.indexOf("\nfunction ", start + 1);

  assert.ok(start >= 0, `Expected ${name} to exist`);
  return portal.slice(start, end >= 0 ? end : undefined);
}

test("places the Custom Workout card first and assigned workouts behind it", () => {
  const source = sourceForFunction("clientWorkoutPickerItems");
  const pickerItems = Function(
    "customWorkoutTitle",
    `${source}; return clientWorkoutPickerItems;`
  )("Custom workout");
  const items = pickerItems([
    { title: "Workout A", focus: "Lower" },
    { title: "Workout B", focus: "Upper" }
  ]);

  assert.equal(items.length, 3);
  assert.deepEqual(items.map((item) => item.title), ["Custom workout", "Workout A", "Workout B"]);
  assert.deepEqual(items.map((item) => item.panelIndex), [0, 1, 2]);
  assert.deepEqual(items.map((item) => item.assignedWorkoutIndex), [-1, 0, 1]);
  assert.equal(items.filter((item) => item.isCustom).length, 1);
  assert.equal(items[0].isCustom, true);
  assert.equal(pickerItems([])[0].isCustom, true);
});

test("wraps arrow navigation and protects vertical scrolling", () => {
  const indexSource = sourceForFunction("clientWorkoutPickerIndex");
  const swipeSource = sourceForFunction("clientWorkoutPickerSwipeStep");
  const normalizeIndex = Function(`${indexSource}; return clientWorkoutPickerIndex;`)();
  const swipeStep = Function(`${swipeSource}; return clientWorkoutPickerSwipeStep;`)();

  assert.equal(normalizeIndex(-1, 4), 3);
  assert.equal(normalizeIndex(4, 4), 0);
  assert.equal(normalizeIndex(2, 4), 2);
  assert.equal(normalizeIndex(9, 0), 0);
  assert.equal(swipeStep(-60, 8, 360), 1);
  assert.equal(swipeStep(60, 8, 360), -1);
  assert.equal(swipeStep(24, 2, 360), 0);
  assert.equal(swipeStep(-80, 100, 360), 0);
});

test("renders a compact accessible 3D deck with descriptions and direct controls", () => {
  const markupSource = sourceForFunction("clientWorkoutPickerMarkup");
  const cardSource = sourceForFunction("clientWorkoutPickerCardMarkup");
  const renderSource = sourceForFunction("renderClientWorkoutTabs");
  const syncSource = sourceForFunction("syncClientWorkoutPicker");
  const handlerSource = sourceForFunction("handleClientWorkoutTabs");

  assert.match(markupSource, /client-workout-picker-controls[\s\S]*?client-workout-picker-deck/);
  assert.match(markupSource, /aria-roledescription="carousel"/);
  assert.match(markupSource, /data-client-workout-picker-previous/);
  assert.match(markupSource, /data-client-workout-picker-next/);
  assert.match(markupSource, /data-client-workout-picker-dot/);
  assert.match(cardSource, /aria-roledescription="slide"/);
  assert.match(cardSource, /client-workout-picker-description/);
  assert.match(cardSource, /client-workout-picker-facts/);
  assert.match(cardSource, /client-workout-picker-preview/);
  assert.match(cardSource, /data-client-workout-picker-choose/);
  assert.match(cardSource, /Build custom workout/);
  assert.match(cardSource, /workout\.isCustom \? `[\s\S]*?data-client-workout-copy-history/);
  assert.match(markupSource, /workout\.pickerLabel \|\| "workout"/);
  assert.match(renderSource, /workout\.assignedWorkoutIndex \+ 1/);
  assert.match(syncSource, /setAttribute\("aria-hidden", isCurrent \? "false" : "true"\)/);
  assert.match(syncSource, /toggleAttribute\("inert", !isCurrent\)/);
  assert.match(syncSource, /setAttribute\("aria-current", "true"\)/);
  assert.match(handlerSource, /data-client-workout-picker-previous/);
  assert.match(handlerSource, /data-client-workout-picker-next/);
  assert.match(handlerSource, /data-client-workout-picker-dot/);
  assert.match(handlerSource, /event\.target !== deck/);
  assert.match(handlerSource, /pointermove/);
  assert.match(handlerSource, /horizontalDistance > verticalDistance \* 1\.15/);
  assert.match(handlerSource, /\{ passive: false \}/);
});

test("opens Saved Logs from the Custom Workout copy link", () => {
  const handlerSource = sourceForFunction("handleClientWorkoutTabs");
  const openHistorySource = sourceForFunction("openClientWorkoutCopyHistory");

  assert.match(handlerSource, /data-client-workout-copy-history/);
  assert.match(handlerSource, /openClientWorkoutCopyHistory\(\)/);
  assert.match(openHistorySource, /setClientDashboardTab\("logs"\)/);
  assert.match(openHistorySource, /client-logs-title/);
  assert.match(openHistorySource, /scrollIntoView/);
  assert.match(openHistorySource, /focus\(\{ preventScroll: true \}\)/);
  assert.match(dashboard, /id="client-logs-title" tabindex="-1"/);
});

test("opens the existing workout logger and provides a back-to-choices control", () => {
  const activateSource = sourceForFunction("activateClientWorkoutPanel");
  const handlerSource = sourceForFunction("handleClientWorkoutTabs");

  assert.match(handlerSource, /data-client-workout-picker-choose/);
  assert.match(handlerSource, /activateClientWorkoutPanel/);
  assert.match(handlerSource, /data-client-workout-picker-back/);
  assert.match(activateSource, /document\.querySelectorAll\("\.client-workout-panel"\)/);
  assert.match(activateSource, /panel\.hidden = !isActive/);
  assert.match(activateSource, /syncCustomWorkoutCarousel|syncAssignedWorkoutCarousels/);
  assert.match(activateSource, /summary\.focus\(\{ preventScroll: true \}\)/);
  assert.match(activateSource, /scrollIntoView/);
  assert.match(dashboard, /data-client-workout-picker-back/);
  assert.match(dashboard, /id="client-workout-panels"/);
});

test("keeps the deck compact and clear of the fixed mobile dock", () => {
  assert.match(styles, /--client-bottom-dock-clearance:\s*calc\(94px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(styles, /\.client-workout-picker-deck \{[\s\S]*?touch-action:\s*pan-y;/);
  assert.match(styles, /\.client-workout-picker-card \{[\s\S]*?height:\s*366px;/);
  assert.match(styles, /@media \(max-width: 420px\)[\s\S]*?\.client-workout-picker-card \{[\s\S]*?height:\s*350px;/);
  assert.match(styles, /@media \(max-width: 420px\)[\s\S]*?\.client-workout-picker-status \{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(styles, /@media \(max-width: 420px\)[\s\S]*?\.client-workout-picker-controls \{[\s\S]*?width:\s*100%;[\s\S]*?justify-content:\s*space-between/);
  assert.match(styles, /scroll-margin-bottom:\s*var\(--client-bottom-dock-clearance\)/);
  assert.match(dashboard, /css\/style\.css\?v=custom-workout-first-1/);
  assert.match(dashboard, /js\/client-portal\.js\?v=exercise-title-swipe-1/);
});

test("shows a workout day separately from its training target", () => {
  const source = sourceForFunction("clientWorkoutSelectorDetails");
  const selectorDetails = Function(
    "customWorkoutTitle",
    `${source}; return clientWorkoutSelectorDetails;`
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
