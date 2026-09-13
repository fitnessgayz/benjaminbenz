const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const dashboard = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "css/style.css"), "utf8");

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);

  assert.ok(start >= 0, `Expected ${startMarker}`);
  assert.ok(end > start, `Expected ${endMarker}`);
  return source.slice(start, end);
}

test("keeps food-entry fields in a logical order for paired mobile rows", () => {
  const form = sourceBetween(
    dashboard,
    'id="client-food-entry-form">',
    '<div class="nutrition-actions food-log-actions">'
  );
  const controls = [...form.matchAll(/(?:name|id)="(food_[^"]+|food-search-results|search-food-button)"/g)]
    .map((match) => match[1]);

  assert.deepEqual(controls, [
    "food_entry_date",
    "food_meal",
    "food_search",
    "search-food-button",
    "food-search-results",
    "food_name",
    "food_serving",
    "food_calories",
    "food_protein",
    "food_carbs",
    "food_fat",
    "food_notes"
  ]);
  assert.match(form, /class="food-result-field" hidden/);
  assert.match(form, /class="food-notes-field"/);
});

test("overrides broad one-column mobile rules with two contained columns", () => {
  const containmentStart = styles.indexOf("/* Mobile containment for portal workout, food, and progress forms. */");
  const compactStart = styles.indexOf("/* Compact the client food entry form into paired mobile fields. */");
  const compact = styles.slice(compactStart);

  assert.ok(compactStart > containmentStart, "food-entry override should follow broad mobile containment");
  assert.match(compact, /#client-food-entry-form\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\) !important/);
  assert.match(compact, /#client-food-entry-form > \*\s*\{[\s\S]*?grid-column:\s*auto !important/);
  assert.match(compact, /#client-food-entry-form > :is\(\.food-result-field, \.food-notes-field\)\s*\{[\s\S]*?grid-column:\s*1 \/ -1 !important/);
});

test("keeps paired controls readable and safe from mobile overflow", () => {
  const compact = styles.slice(
    styles.indexOf("/* Compact the client food entry form into paired mobile fields. */")
  );

  assert.match(compact, /#client-food-entry-form :is\(input, select, textarea\)\s*\{[\s\S]*?min-width:\s*0 !important/);
  assert.match(compact, /#client-food-entry-form :is\(input, select, textarea\)\s*\{[\s\S]*?min-height:\s*48px/);
  assert.match(compact, /#client-food-entry-form :is\(input, select, textarea\)\s*\{[\s\S]*?font-size:\s*16px !important/);
  assert.match(compact, /#client-food-entry-form textarea\s*\{[\s\S]*?min-height:\s*72px/);
  assert.match(compact, /#client-food-entry-form textarea\s*\{[\s\S]*?overflow:\s*auto !important/);
  assert.match(compact, /#client-food-entry-form #search-food-button\s*\{[\s\S]*?min-height:\s*48px !important/);
});
