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

test("keeps the active exercise full width with visible picker entry points", () => {
  assert.match(mobileStyles, /\.custom-workout-carousel\[data-carousel-enabled="true"\] \.custom-workout-list \{[\s\S]*?grid-auto-columns: 100%;[\s\S]*?gap: 12px !important;[\s\S]*?padding: 12px !important;[\s\S]*?scroll-padding-inline: 12px;/);
  assert.match(mobileStyles, /\.custom-workout-carousel\[data-carousel-enabled="true"\] \.custom-workout-card:not\(:first-child\) \{[\s\S]*?scroll-margin-inline-start: 0;/);
  assert.match(mobileStyles, /--custom-workout-deck-peek: 108px;/);
  assert.match(mobileStyles, /\.custom-workout-exercise-deck \{[\s\S]*?padding: 12px 12px calc\(var\(--custom-workout-deck-peek\) \+ 12px\);[\s\S]*?overflow: hidden;[\s\S]*?perspective: 1000px;[\s\S]*?scroll-margin-bottom: calc\(var\(--client-bottom-dock-clearance, 94px\) \+ 16px\);/);
  assert.match(portal, /data-custom-workout-launcher-add data-pick-custom-exercise/);
  assert.match(portal, /data-custom-workout-footer-add data-pick-custom-exercise/);
  assert.match(portal, /data-workout-group-next-card/);
  assert.match(portal, /carousel\.dataset\.customWorkoutDeck = deckEnabled \? "true" : "false"/);
  assert.match(portal, /const targetLeft = cardOffset;/);
});

test("applies the lifted deck to custom and assigned grouped workouts without overflow", () => {
  assert.match(mobileStyles, /:is\(\.client-workout-panel-custom, \.client-workout-panel-assigned\) \.custom-workout-carousel\[data-custom-workout-deck="true"\]/);
  assert.match(mobileStyles, /\.custom-workout-list \{[\s\S]*?width: 100%;[\s\S]*?overflow-x: hidden !important;/);
  assert.match(mobileStyles, /\.custom-workout-card:not\(\.is-carousel-active\) \{[\s\S]*?display: none !important;/);
  assert.match(mobileStyles, /\.custom-workout-carousel\[data-group-workout-deck="true"\][\s\S]*?border-left: 4px solid var\(--blue, #2878ff\);/);
  assert.match(mobileStyles, /\.custom-workout-carousel\[data-group-workout-deck="true"\]:is\(\.is-superset-complete, \.is-circuit-complete\)[\s\S]*?border-color: #b88a00;[\s\S]*?background: #fff9e9;/);
});

test("keeps drag-follow motion clipped to the full-width deck", () => {
  assert.match(
    mobileStyles,
    /\.custom-workout-carousel\[data-custom-workout-deck="true"\] \{[\s\S]*?min-width:\s*0;[\s\S]*?overflow:\s*hidden;/,
  );
  assert.match(
    mobileStyles,
    /\.custom-workout-carousel\[data-custom-workout-deck="true"\] \.custom-workout-list \{[\s\S]*?width:\s*100%;[\s\S]*?overflow-x:\s*hidden !important;/,
  );
  assert.match(
    mobileStyles,
    /\.custom-workout-carousel\[data-custom-workout-deck="true"\] \.custom-workout-card\.is-carousel-active \{[\s\S]*?transform:\s*translate3d\(var\(--custom-workout-deck-drag-x\), 0, 0\) rotate\(var\(--custom-workout-deck-drag-rotate\)\);[\s\S]*?opacity:\s*var\(--custom-workout-deck-drag-opacity\);/,
  );
});
