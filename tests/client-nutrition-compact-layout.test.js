const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const dashboard = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");
const portal = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "css/style.css"), "utf8");

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);

  assert.ok(start >= 0, `Expected ${startMarker}`);
  assert.ok(end > start, `Expected ${endMarker}`);
  return source.slice(start, end);
}

test("keeps the nutrition target summary to four macro cards", () => {
  const renderTargets = sourceBetween(
    portal,
    "targets.innerHTML = `",
    "if (guide)"
  );
  const labels = [...renderTargets.matchAll(/editableNutritionTargetCard\("([^"]+)"/g)]
    .map((match) => match[1]);

  assert.deepEqual(labels, ["Calories", "Protein", "Carbs", "Fat"]);
});

test("keeps the starting-target form to eight fields for a two-by-four phone grid", () => {
  const setup = sourceBetween(
    dashboard,
    'id="client-nutrition-setup">',
    '<button class="button button-dark"'
  );
  const names = [...setup.matchAll(/name="(nutrition_[^"]+)"/g)]
    .map((match) => match[1]);

  assert.deepEqual(names, [
    "nutrition_goal",
    "nutrition_age",
    "nutrition_sex",
    "nutrition_height",
    "nutrition_weight",
    "nutrition_workouts",
    "nutrition_movement",
    "nutrition_intensity"
  ]);
});

test("overrides the old one-column mobile containment with compact grids", () => {
  const mobileContainment = styles.indexOf("/* Mobile containment for portal workout, food, and progress forms. */");
  const compactBlockStart = styles.indexOf("/* Compact nutrition targets and setup fields on client phones. */");
  const compactBlock = styles.slice(compactBlockStart);

  assert.ok(compactBlockStart > mobileContainment, "compact override should follow the broad mobile containment rules");
  assert.match(compactBlock, /#client-nutrition-targets\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\) !important/);
  assert.match(compactBlock, /#client-nutrition-setup\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\) !important/);
  assert.match(compactBlock, /#client-nutrition-targets > \.nutrition-macro-card\s*\{[\s\S]*?grid-column:\s*auto !important/);
  assert.match(compactBlock, /#client-nutrition-setup > label\s*\{[\s\S]*?grid-column:\s*auto !important/);
});

test("contains compact controls and retains an iOS-safe text size", () => {
  const compactBlock = styles.slice(
    styles.indexOf("/* Compact nutrition targets and setup fields on client phones. */")
  );

  assert.match(compactBlock, /#client-nutrition-setup :is\(input, select\)\s*\{[\s\S]*?min-width:\s*0 !important/);
  assert.match(compactBlock, /#client-nutrition-setup :is\(input, select\)\s*\{[\s\S]*?font-size:\s*16px !important/);
  assert.match(compactBlock, /text-overflow:\s*ellipsis/);
});
