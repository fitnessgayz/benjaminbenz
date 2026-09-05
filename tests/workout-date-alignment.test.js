const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const mobileStyles = fs.readFileSync(path.join(root, "css/custom-workout-mobile-fix.css"), "utf8");
const portal = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");

test("centers the workout date across the full field", () => {
  assert.match(mobileStyles, /\.workout-session-date-value,[\s\S]*?position: absolute;[\s\S]*?inset: 0;[\s\S]*?place-items: center;/);
  assert.match(mobileStyles, /\.workout-session-date-value,[\s\S]*?pointer-events: none;[\s\S]*?text-align: center;/);
});

test("hides only the unreliable native date text while keeping the picker interactive", () => {
  assert.match(mobileStyles, /workout-session-date-control input\[type="date"\][\s\S]*?z-index: 2;[\s\S]*?background: transparent !important;[\s\S]*?-webkit-text-fill-color: transparent !important;/);
  assert.match(mobileStyles, /::-webkit-calendar-picker-indicator[\s\S]*?position: absolute;[\s\S]*?right: 14px;/);
});

test("renders and updates the centered date label for both workout types", () => {
  const displayMarkupCount = (portal.match(/data-workout-date-value aria-hidden="true"/g) || []).length;

  assert.equal(displayMarkupCount, 2);
  assert.match(portal, /const display = panel\?\.querySelector\("\[data-workout-date-value\]"\);/);
  assert.match(portal, /display\.textContent = formatLogDate\(date\);/);
});
