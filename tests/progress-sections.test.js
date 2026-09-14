const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dashboard = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");
const clientPortal = fs.readFileSync(path.join(root, "js", "client-portal.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "css", "style.css"), "utf8");

function sourceForFunction(name) {
  const start = clientPortal.indexOf(`function ${name}(`);
  const end = clientPortal.indexOf("\nfunction ", start + 1);

  assert.ok(start >= 0, `Expected ${name} to exist`);
  return clientPortal.slice(start, end >= 0 ? end : undefined);
}

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

test("keeps Stats and Measurements open with DEXA first", () => {
  const statsPanel = dashboard.match(/<section class="progress-panel client-stats-panel" data-client-dashboard-panel="stats"[\s\S]*?<section class="progress-panel client-questionnaire-panel"/)?.[0] || "";
  const dexaIndex = statsPanel.indexOf('id="client-dexa-title"');
  const summaryIndex = statsPanel.indexOf('id="progress-current"');
  const measurementsIndex = statsPanel.indexOf('id="client-progress-entry-title"');

  assert.match(statsPanel, /id="client-add-past-progress-button"[^>]*>Add measurements<\/button>/);
  assert.ok(dexaIndex >= 0);
  assert.ok(dexaIndex < summaryIndex);
  assert.ok(dexaIndex < measurementsIndex);
  assert.doesNotMatch(statsPanel, /data-progress-section-toggle/);
  assert.doesNotMatch(statsPanel, /data-progress-section-content/);
  assert.doesNotMatch(statsPanel, />Minimize</);
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

test("exercise comparisons use searchable cards containing up to ten exercises", () => {
  const exerciseSection = dashboard.match(/<section class="progress-exercise-section"[\s\S]*?<\/section>/)?.[0] || "";

  assert.match(dashboard, /id="client-exercise-progress-search"/);
  assert.match(dashboard, /data-client-exercise-progress-carousel/);
  assert.match(dashboard, /data-client-exercise-progress-previous/);
  assert.match(dashboard, /data-client-exercise-progress-next/);
  assert.match(clientPortal, /const clientExerciseProgressPageSize = 10/);
  assert.match(clientPortal, /class="progress-exercise-deck\$\{directionClass\}"/);
  assert.match(clientPortal, /pageRecords\.map\(clientExerciseProgressCardMarkup\)/);
  assert.match(clientPortal, /function handleClientExerciseProgressCarousel\(\)/);
  assert.match(clientPortal, /clientExerciseProgressSearch/);
  assert.match(clientPortal, /event\.target\.closest\("\[data-client-exercise-progress-carousel\]"\)/);
  assert.match(styles, /@keyframes progress-exercise-card-forward/);
  assert.match(styles, /@keyframes progress-exercise-card-backward/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(exerciseSection, /data-progress-section-toggle/);
  assert.doesNotMatch(exerciseSection, /data-progress-section-content/);
  assert.doesNotMatch(exerciseSection, />Minimize</);
});

test("exercise comparison pagination keeps ten records per card", () => {
  const paginateSource = sourceForFunction("paginateClientExerciseProgress");
  const paginate = Function(`const clientExerciseProgressPageSize = 10; ${paginateSource}; return paginateClientExerciseProgress;`)();
  const records = Array.from({ length: 23 }, (_, index) => ({ id: index + 1 }));
  const pages = paginate(records);

  assert.deepEqual(pages.map((page) => page.length), [10, 10, 3]);
  assert.deepEqual(pages.flat(), records);
});

test("does not initialize removed progress minimize behavior", () => {
  assert.doesNotMatch(dashboard, /data-progress-section-toggle/);
  assert.doesNotMatch(dashboard, /data-progress-section-content/);
  assert.doesNotMatch(clientPortal, /function setProgressSectionExpanded\(/);
  assert.doesNotMatch(clientPortal, /function handleProgressSectionToggles\(/);
  assert.doesNotMatch(clientPortal, /handleProgressSectionToggles\(\);/);
});

test("measurement history uses a keyboard-accessible animated card deck", () => {
  const renderHistory = sourceForFunction("renderClientProgressHistory");
  const moveHistory = sourceForFunction("moveClientProgressHistoryDeck");
  const handleHistory = sourceForFunction("handleClientProgressHistoryDeck");

  assert.match(renderHistory, /client-progress-history-deck-heading/);
  assert.match(renderHistory, /data-client-progress-history-card/);
  assert.match(renderHistory, /data-client-progress-history-previous/);
  assert.match(renderHistory, /data-client-progress-history-next/);
  assert.match(renderHistory, /aria-hidden=/);
  assert.match(moveHistory, /Math\.max\(0, Math\.min/);
  assert.match(handleHistory, /ArrowLeft/);
  assert.match(handleHistory, /ArrowRight/);
  assert.match(clientPortal, /handleClientProgressHistoryDeck\(\);/);
  assert.match(styles, /@keyframes client-progress-history-forward/);
  assert.match(styles, /@keyframes client-progress-history-backward/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?client-progress-history-deck/);
});

test("progress graph labels every plotted point with its value and unit", () => {
  const renderGraph = sourceForFunction("renderProgressGraph");

  assert.match(renderGraph, /class="progress-chart-value"/);
  assert.match(renderGraph, /values\[index\]/);
  assert.match(renderGraph, /metric\.suffix/);
  assert.match(styles, /\.progress-chart \.progress-chart-value/);
});
