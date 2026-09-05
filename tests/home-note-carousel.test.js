const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dashboard = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "css/style.css"), "utf8");
const portal = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");

test("moves the program overview into the home coach-note carousel", () => {
  assert.doesNotMatch(dashboard, /<section class="dashboard-hero"/);
  assert.match(dashboard, /data-client-home-carousel/);

  const programIndex = dashboard.indexOf('id="dashboard-program-title"');
  const noteIndex = dashboard.indexOf('id="client-home-note-title"');
  const workoutIndex = dashboard.indexOf('id="client-home-workout-title"');

  assert.ok(programIndex >= 0);
  assert.ok(noteIndex > programIndex);
  assert.ok(workoutIndex > noteIndex);
});

test("carousel exposes accessible arrows, dots, and two slides", () => {
  assert.equal((dashboard.match(/data-client-home-carousel-slide/g) || []).length, 2);
  assert.match(dashboard, /data-client-home-carousel-previous aria-label="Previous slide"/);
  assert.match(dashboard, /data-client-home-carousel-next aria-label="Next slide"/);
  assert.equal((dashboard.match(/data-client-home-carousel-dot="[01]"/g) || []).length, 2);
  assert.match(dashboard, /aria-roledescription="carousel"/);
});

test("carousel uses light grey and supports buttons, keyboard, and touch swipes", () => {
  assert.match(styles, /\.client-home-card-note\s*\{[\s\S]*?background:\s*#e8e8e3;/);
  assert.match(portal, /function setClientHomeCarouselSlide/);
  assert.match(portal, /function handleClientHomeCarousel/);
  assert.match(portal, /"touchstart"/);
  assert.match(portal, /"ArrowLeft", "ArrowRight"/);
  assert.match(portal, /handleClientHomeCarousel\(\);/);
});
