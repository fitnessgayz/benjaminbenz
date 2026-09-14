const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dashboard = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");
const homepage = fs.readFileSync(path.join(root, "index.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "css", "style.css"), "utf8");
const portal = fs.readFileSync(path.join(root, "js", "client-portal.js"), "utf8");
const site = fs.readFileSync(path.join(root, "js", "script.js"), "utf8");

test("mobile history reserves room for every visible background card", () => {
  assert.match(styles, /\.training-log-history-deck \{[\s\S]*?width:\s*calc\(100% - 26px\)/);
  assert.match(styles, /\.training-log-history-deck \{[\s\S]*?overflow:\s*visible/);
  assert.match(styles, /\.training-log-history-card\.is-deck-behind-3/);
});

test("stacked dashboard decks follow the pointer and settle in the swipe direction", () => {
  assert.match(portal, /function applyPhysicalDeckDrag/);
  assert.match(portal, /--deck-drag-x/);
  assert.match(portal, /function animatePhysicalDeckChange/);
  assert.match(styles, /\.client-workout-picker-deck\.is-dragging/);
  assert.match(styles, /\.training-log-history-deck\.is-dragging/);
  assert.match(styles, /\.client-progress-history-deck\.is-dragging/);
  assert.match(styles, /\.progress-exercise-deck\.is-dragging/);
});

test("home and public card decks add depth while respecting reduced motion", () => {
  assert.match(portal, /function updateClientHomeSnapshotMotion/);
  assert.match(styles, /--snapshot-rotate/);
  assert.match(site, /deck\.classList\.add\("is-dragging"\)/);
  assert.match(styles, /coaching-deck-arrive-forward/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.client-home-snapshot-card/);
});

test("live pages cache-bust every updated deck asset", () => {
  assert.match(dashboard, /css\/style\.css\?v=physical-card-decks-1/);
  assert.match(dashboard, /css\/custom-workout-mobile-fix\.css\?v=physical-card-decks-1/);
  assert.match(dashboard, /js\/script\.js\?v=physical-card-decks-1/);
  assert.match(dashboard, /js\/client-portal\.js\?v=physical-card-decks-1/);
  assert.match(homepage, /css\/style\.css\?v=physical-card-decks-1/);
  assert.match(homepage, /js\/script\.js\?v=physical-card-decks-1/);
});
