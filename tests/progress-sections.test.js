const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dashboard = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");

test("places the stats entry before exercise progress", () => {
  const statsIndex = dashboard.indexOf('id="client-progress-entry-title"');
  const exerciseIndex = dashboard.indexOf('id="client-exercise-progress-title"');

  assert.notEqual(statsIndex, -1);
  assert.notEqual(exerciseIndex, -1);
  assert.ok(statsIndex < exerciseIndex);
});

test("every progress minimize button controls one matching section body", () => {
  const controls = [...dashboard.matchAll(/data-progress-section-toggle[^>]*aria-controls="([^"]+)"/g)]
    .map((match) => match[1]);
  const contentIds = [...dashboard.matchAll(/id="([^"]+)" data-progress-section-content/g)]
    .map((match) => match[1]);

  assert.deepEqual(controls, [
    "client-progress-entry-content",
    "client-progress-photo-content",
    "client-exercise-progress-content",
    "client-progress-gallery-content",
    "client-progress-history-content"
  ]);
  assert.deepEqual(contentIds, controls);
  assert.equal(new Set(controls).size, controls.length);
});

test("progress sections start expanded with accessible labels", () => {
  const toggles = dashboard.match(/<button class="progress-section-toggle"[\s\S]*?<\/button>/g) || [];

  assert.equal(toggles.length, 5);
  toggles.forEach((toggle) => {
    assert.match(toggle, /type="button"/);
    assert.match(toggle, /aria-expanded="true"/);
    assert.match(toggle, /data-progress-toggle-label>Minimize</);
    assert.match(toggle, /aria-hidden="true">−</);
  });
});
