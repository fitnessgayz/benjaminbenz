const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dashboard = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "css/client-home-today.css"), "utf8");
const portal = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");

test("Home leads with today’s workout, weekly rhythm, and the coach note", () => {
  const home = dashboard.match(/data-client-dashboard-panel="home"[\s\S]*?data-client-dashboard-panel="workouts"/)?.[0] || "";
  const workoutIndex = home.indexOf('class="button client-home-workout-button"');
  const weeklyIndex = home.indexOf('id="client-weekly-activity"');
  const noteIndex = home.indexOf('id="client-home-note-title"');
  const moreIndex = home.indexOf('class="client-home-more"');

  assert.ok(workoutIndex >= 0);
  assert.ok(weeklyIndex > workoutIndex);
  assert.ok(noteIndex > weeklyIndex);
  assert.ok(moreIndex > noteIndex);
  assert.match(home, /data-client-summary-go-tab="workouts">Start workout/);
  assert.doesNotMatch(home, />Up next</);
  assert.doesNotMatch(home, /id="client-home-workout-(?:title|meta)"/);
  assert.match(portal, /activeWorkoutTabIndex - 1/);
});

test("Home exposes messaging as a global upper-right action", () => {
  const home = dashboard.match(/data-client-dashboard-panel="home"[\s\S]*?data-client-dashboard-panel="workouts"/)?.[0] || "";
  const heading = home.match(/<div class="panel-heading">[\s\S]*?<\/div>\s*<div class="client-home-checkin-backdrop"/)?.[0] || "";

  assert.match(heading, /class="client-home-message-button"/);
  assert.match(heading, /data-message-coach/);
  assert.match(heading, /aria-label="Message coach"/);
  assert.match(heading, /data-client-message-unread/);
  assert.match(styles, /\.dashboard-page \.client-home-message-button\s*\{[\s\S]*?width:\s*48px[\s\S]*?border-radius:\s*50%/);
});

test("secondary dashboard content is collapsed behind one native disclosure", () => {
  const home = dashboard.match(/data-client-dashboard-panel="home"[\s\S]*?data-client-dashboard-panel="workouts"/)?.[0] || "";
  const more = home.match(/<details class="client-home-more">[\s\S]*?<\/details>/)?.[0] || "";

  assert.match(more, /More from your dashboard/);
  assert.match(more, /id="dashboard-program-title"/);
  assert.match(more, /id="client-home-snapshot-title"/);
  assert.match(more, /data-client-home-checkin/);
  assert.match(more, /id="client-home-session-count"/);
  assert.match(more, /id="client-home-food-total"/);
  assert.doesNotMatch(home, /data-client-home-carousel/);
  assert.match(portal, /disclosure\?\.addEventListener\("toggle"/);
});

test("Today-first layout stays single-column and expands secondary cards responsively", () => {
  assert.match(styles, /\.dashboard-page \.client-home-grid\s*\{[\s\S]*?flex-direction:\s*column/);
  assert.match(styles, /\.dashboard-page \.client-home-today-workout\s*\{[\s\S]*?min-height:\s*0[\s\S]*?background:\s*transparent/);
  assert.match(styles, /\.dashboard-page \.client-home-workout-button\s*\{[\s\S]*?width:\s*100%[\s\S]*?min-height:\s*64px/);
  assert.match(styles, /\.dashboard-page \.client-home-more > summary\s*\{[\s\S]*?min-height:\s*64px/);
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*?\.dashboard-page \.client-home-more-grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
});
