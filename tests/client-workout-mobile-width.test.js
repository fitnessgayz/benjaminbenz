const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const dashboard = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "css/client-workout-mobile-width.css"), "utf8");

test("loads the mobile workout width overrides after the workout styles", () => {
  const progressionIndex = dashboard.indexOf("css/workout-progression.css");
  const widthIndex = dashboard.indexOf("css/client-workout-mobile-width.css");

  assert.ok(progressionIndex >= 0);
  assert.ok(widthIndex > progressionIndex);
});

test("uses the full mobile viewport with only compact workout gutters", () => {
  assert.match(styles, /\.dashboard-shell\s*\{[\s\S]*?width:\s*100% !important;[\s\S]*?max-width:\s*none !important;[\s\S]*?margin-inline:\s*0 !important;/);
  assert.match(styles, /#client-workouts-panel\s*\{\s*padding-inline:\s*8px !important;/);
  assert.match(styles, /@media \(max-width:\s*430px\)[\s\S]*?#client-workouts-panel\s*\{\s*padding-inline:\s*6px !important;/);
  assert.match(styles, /\[data-custom-workout-grouped="true"\]/);
});

test("lets phone exercise groups reclaim the workout panel inset", () => {
  assert.match(
    styles,
    /@media \(max-width:\s*430px\)[\s\S]*?#client-workout-panels \.workout-format-group\s*\{[\s\S]*?width:\s*calc\(100% \+ 20px\) !important;[\s\S]*?margin-right:\s*-10px !important;[\s\S]*?margin-left:\s*-10px !important;/
  );
});
