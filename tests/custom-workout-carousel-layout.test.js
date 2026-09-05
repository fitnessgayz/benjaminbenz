const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const mobileStyles = fs.readFileSync(path.join(root, "css/custom-workout-mobile-fix.css"), "utf8");
const portal = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");

test("keeps the workout round heading on one line", () => {
  assert.match(mobileStyles, /\.workout-group-progress-heading \{[\s\S]*?position: relative;[\s\S]*?display: block;/);
  assert.match(mobileStyles, /\.workout-group-progress-heading strong \{[\s\S]*?font-size: clamp\(24px, 7vw, 34px\);[\s\S]*?white-space: nowrap;/);
  assert.match(mobileStyles, /\.workout-group-progress-heading em \{[\s\S]*?position: absolute;[\s\S]*?top: 0;[\s\S]*?right: 0;/);
});

test("shows one full-width exercise without a card preview in either workout type", () => {
  assert.match(mobileStyles, /\.custom-workout-carousel\[data-carousel-enabled="true"\] \.custom-workout-list \{[\s\S]*?grid-auto-columns: 100%;[\s\S]*?gap: 12px !important;[\s\S]*?padding: 12px !important;[\s\S]*?scroll-padding-inline: 12px;/);
  assert.match(mobileStyles, /\.custom-workout-carousel\[data-carousel-enabled="true"\] \.custom-workout-card:not\(:first-child\) \{[\s\S]*?scroll-margin-inline-start: 0;/);
  assert.doesNotMatch(mobileStyles, /padding:\s*12px 44px 8px 12px/);
  assert.doesNotMatch(mobileStyles, /scroll-margin-inline-start:\s*44px/);
  assert.doesNotMatch(portal, /allowsAdjacentCardPeek|previousCardPeek/);
  assert.match(portal, /const targetLeft = cardOffset;/);
});
