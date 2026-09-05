const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const mobileStyles = fs.readFileSync(path.join(root, "css/custom-workout-mobile-fix.css"), "utf8");

test("centers the workout date across the full field", () => {
  assert.match(mobileStyles, /workout-session-date-control input\[type="date"\][\s\S]*?padding-inline: 44px !important;[\s\S]*?text-align: center !important;/);
  assert.match(mobileStyles, /::-webkit-date-and-time-value[\s\S]*?text-align: center;/);
  assert.match(mobileStyles, /::-webkit-datetime-edit[\s\S]*?justify-content: center;/);
});

test("keeps the calendar picker independent from date centering", () => {
  assert.match(mobileStyles, /::-webkit-calendar-picker-indicator[\s\S]*?position: absolute;[\s\S]*?right: 14px;/);
});
