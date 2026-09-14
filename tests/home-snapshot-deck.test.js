const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dashboard = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "css", "style.css"), "utf8");
const portal = fs.readFileSync(path.join(root, "js", "client-portal.js"), "utf8");

test("home uses one editorial card deck for the three requested snapshots", () => {
  const homePanel = dashboard.match(/data-client-dashboard-panel="home"[\s\S]*?data-client-dashboard-panel="workouts"/)?.[0] || "";

  assert.match(homePanel, /id="client-home-snapshot-title">Today at a glance/);
  assert.match(homePanel, /data-client-home-snapshot-deck/);
  assert.equal((homePanel.match(/data-client-home-snapshot-card/g) || []).length, 3);
  assert.match(homePanel, />Stats \+ measurements</);
  assert.match(homePanel, />Calories \+ macros</);
  assert.match(homePanel, />Training report</);
});

test("snapshot cards show live progress, target, and weekly training fields", () => {
  [
    "client-home-snapshot-bodyweight",
    "client-home-snapshot-bodyfat",
    "client-home-snapshot-lean-mass",
    "client-home-snapshot-waist",
    "client-home-snapshot-rmr",
    "client-home-snapshot-calories",
    "client-home-snapshot-protein",
    "client-home-snapshot-carbs",
    "client-home-snapshot-fat",
    "client-home-snapshot-workouts",
    "client-home-snapshot-working-sets",
    "client-home-snapshot-volume",
    "client-home-snapshot-personal-bests"
  ].forEach((id) => assert.match(dashboard, new RegExp(`id="${id}"`)));

  assert.match(portal, /function renderClientHomeSnapshots/);
  assert.match(portal, /function clientHomeTrainingSnapshot/);
  assert.match(portal, /function latestClientRmrEntry/);
  assert.match(portal, /renderClientHomeSnapshots\(nutrition, latestProgress\)/);
});

test("deck supports native swiping, dots, and keyboard navigation without undersized controls", () => {
  assert.equal((dashboard.match(/data-client-home-snapshot-dot=/g) || []).length, 3);
  assert.match(styles, /\.client-home-snapshot-deck\s*\{[\s\S]*?overflow-x:\s*auto;/);
  assert.match(styles, /\.client-home-snapshot-deck\s*\{[\s\S]*?scroll-snap-type:\s*x mandatory;/);
  assert.match(styles, /\.client-home-snapshot-card\s*\{[\s\S]*?scroll-snap-align:\s*start;/);
  assert.match(styles, /\.dashboard-page \.client-home-snapshot-controls button\s*\{[\s\S]*?min-height:\s*44px\s*!important;/);
  assert.match(portal, /function handleClientHomeSnapshotDeck/);
  assert.match(portal, /\["ArrowLeft", "ArrowRight"\]/);
  assert.match(portal, /handleClientHomeSnapshotDeck\(\);/);
});
