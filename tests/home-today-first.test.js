const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dashboard = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "css/client-home-community.css"), "utf8");
const portal = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");
const home = dashboard.match(/data-client-dashboard-panel="home"[\s\S]*?data-client-dashboard-panel="workouts"/)?.[0] || "";

test("Home keeps the primary actions and removes the More disclosure", () => {
  assert.match(home, /id="client-weekly-activity"/);
  assert.match(home, /id="client-home-planner-title"/);
  assert.match(home, /id="client-home-community-title"/);
  assert.doesNotMatch(home, /client-home-glance-title|client-home-note-title/);
  assert.match(home, /data-client-summary-go-tab="workouts">Start workout/);
  assert.doesNotMatch(home, /More from your dashboard|client-home-more|client-home-snapshot-deck/);
  assert.doesNotMatch(home, /data-client-achievements-home|client-home-mood-form/);
});

test("Home keeps the avatar and notifications in its compact header", () => {
  assert.match(home, /class="client-home-topbar"[\s\S]*?data-client-settings-avatar[\s\S]*?id="client-home-title"[\s\S]*?data-client-home-notifications/);
  assert.match(styles, /\.client-home-topbar/);
});

test("Workouts still opens its program overview and coach notes", () => {
  assert.match(dashboard, /id="client-program-info-dialog"[\s\S]*?id="dashboard-program-title"/);
  assert.doesNotMatch(home, /id="client-home-note-title"/);
  assert.match(portal, /const noteCard = document\.createElement\("article"\)/);
  assert.match(portal, /noteTitle\.textContent = String\(currentProgram\?\.coach_note_title/);
});

test("Home remains a single column on mobile", () => {
  assert.match(styles, /\.client-home-grid\s*\{[\s\S]*?flex-direction:\s*column/);
  assert.match(styles, /\.client-home-glance-list\s*\{[\s\S]*?display:\s*grid/);
});
