const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dashboard = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");
const clientPortal = fs.readFileSync(path.join(root, "js", "client-portal.js"), "utf8");

test("separates training progress from stats and measurements", () => {
  const progressPanel = dashboard.match(/<section class="progress-panel" data-client-dashboard-panel="progress"[\s\S]*?<\/section>\s*<section class="progress-panel client-stats-panel"/)?.[0] || "";
  const statsPanel = dashboard.match(/<section class="progress-panel client-stats-panel" data-client-dashboard-panel="stats"[\s\S]*?<section class="progress-panel client-questionnaire-panel"/)?.[0] || "";

  assert.match(progressPanel, /id="client-monthly-report-card"/);
  assert.match(progressPanel, /id="client-exercise-progress-title"/);
  assert.doesNotMatch(progressPanel, /id="progress-current"/);
  assert.match(statsPanel, /id="client-stats-title">Stats &amp; measurements/);
  assert.match(statsPanel, /id="progress-current"/);
  assert.match(statsPanel, /id="client-progress-entry-title"/);
  assert.doesNotMatch(statsPanel, /id="client-monthly-report-card"/);
});

test("places the latest monthly report first in Progress", () => {
  const reportIndex = dashboard.indexOf('id="client-monthly-report-card"');
  const introIndex = dashboard.indexOf('class="client-progress-intro"');
  const statsIndex = dashboard.indexOf('id="client-progress-entry-title"');

  assert.notEqual(reportIndex, -1);
  assert.ok(reportIndex < introIndex);
  assert.ok(reportIndex < statsIndex);
  assert.match(dashboard, /id="client-monthly-report-link"/);
  assert.match(dashboard, /Same private report shared in your monthly email\./);
});

test("monthly report has an in-app viewer and a shareable deep link", () => {
  assert.match(dashboard, /<dialog class="client-monthly-report-dialog" id="client-monthly-report-dialog"/);
  assert.match(dashboard, /data-print-monthly-report/);
  assert.match(clientPortal, /function monthlyProgressReportUrl\(monthKey, tabName = "progress"\)/);
  assert.match(clientPortal, /url\.searchParams\.set\("tab", tabName\)/);
  assert.match(clientPortal, /url\.searchParams\.set\("report", monthKey\)/);
  assert.match(clientPortal, /client-login\.html\?return_to=/);
});

test("exercise comparisons use a searchable single-card carousel", () => {
  assert.match(dashboard, /id="client-exercise-progress-search"/);
  assert.match(dashboard, /data-client-exercise-progress-carousel/);
  assert.match(dashboard, /data-client-exercise-progress-previous/);
  assert.match(dashboard, /data-client-exercise-progress-next/);
  assert.match(clientPortal, /function handleClientExerciseProgressCarousel\(\)/);
  assert.match(clientPortal, /clientExerciseProgressSearch/);
});

test("every progress minimize button controls one matching section body", () => {
  const controls = [...dashboard.matchAll(/data-progress-section-toggle[^>]*aria-controls="([^"]+)"/g)]
    .map((match) => match[1]);
  const contentIds = [...dashboard.matchAll(/id="([^"]+)" data-progress-section-content/g)]
    .map((match) => match[1]);

  assert.deepEqual(controls, [
    "client-exercise-progress-content",
    "client-progress-entry-content",
    "client-progress-photo-content",
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
