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
  assert.match(statsPanel, /id="client-stats-title" tabindex="-1">Stats &amp; measurements/);
  assert.doesNotMatch(statsPanel, /id="progress-current"/);
  assert.match(statsPanel, /id="client-progress-entry-title"/);
  assert.match(statsPanel, /id="client-current-rmr"/);
  assert.match(clientPortal, /clientProgressRmr\(rmrEntry\)/);
  assert.doesNotMatch(statsPanel, /id="client-monthly-report-card"/);
});

test("keeps Stats and Measurements open with DEXA first and removes the redundant current snapshot", () => {
  const statsPanel = dashboard.match(/<section class="progress-panel client-stats-panel" data-client-dashboard-panel="stats"[\s\S]*?<section class="progress-panel client-questionnaire-panel"/)?.[0] || "";
  const dexaIndex = statsPanel.indexOf('id="client-dexa-title"');
  const measurementsIndex = statsPanel.indexOf('id="client-progress-entry-title"');

  assert.match(statsPanel, /id="client-add-past-progress-button"[^>]*>Add measurements<\/button>/);
  assert.ok(dexaIndex >= 0);
  assert.ok(dexaIndex < measurementsIndex);
  assert.equal(statsPanel.indexOf('id="progress-current"'), -1);
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

test("personal bests use a searchable, vertically scrolling list", () => {
  const exerciseSection = dashboard.match(/<section class="progress-exercise-section"[\s\S]*?<\/section>/)?.[0] || "";
  const render = sourceForFunction("renderClientExerciseProgress");

  assert.match(dashboard, /id="client-exercise-progress-search"/);
  assert.match(exerciseSection, /id="client-exercise-progress-count"/);
  assert.match(exerciseSection, /id="client-exercise-progress"/);
  assert.doesNotMatch(exerciseSection, /data-client-exercise-progress-carousel|data-client-exercise-progress-previous|data-client-exercise-progress-next/);
  assert.match(dashboard, /css\/client-personal-bests-list\.css/);
  assert.match(dashboard, /js\/client-personal-bests-list\.js/);
  assert.match(render, /FWB_CLIENT_PERSONAL_BESTS_LIST\.render/);
  assert.match(clientPortal, /clientExerciseProgressSearch/);
  assert.doesNotMatch(exerciseSection, /data-progress-section-toggle/);
  assert.doesNotMatch(exerciseSection, /data-progress-section-content/);
  assert.doesNotMatch(exerciseSection, />Minimize</);
});

test("personal bests no longer register paging or swipe controls", () => {
  assert.doesNotMatch(clientPortal, /function paginateClientExerciseProgress\(|function moveClientExerciseProgress\(|function handleClientExerciseProgressCarousel\(/);
  assert.doesNotMatch(clientPortal, /clientExerciseProgressPageSize|clientExerciseProgressIndex|clientExerciseProgressDirection/);
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
