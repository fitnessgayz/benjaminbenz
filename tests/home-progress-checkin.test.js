const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dashboard = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");
const portal = fs.readFileSync(path.join(root, "js", "client-portal.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "css", "style.css"), "utf8");

test("places the same monthly progress report above the Home check-in", () => {
  const homePanel = dashboard.match(/data-client-dashboard-panel="home"[\s\S]*?data-client-dashboard-panel="workouts"/)?.[0] || "";
  const reportIndex = homePanel.indexOf('id="client-home-monthly-report-card"');
  const checkinIndex = homePanel.indexOf("data-client-home-checkin>");

  assert.notEqual(reportIndex, -1);
  assert.notEqual(checkinIndex, -1);
  assert.ok(reportIndex < checkinIndex);
  assert.match(homePanel, /id="client-home-monthly-report-link"[\s\S]*?data-monthly-report-link/);
  assert.match(portal, /document\.getElementById\("client-home-monthly-report-card"\)/);
  assert.match(portal, /document\.getElementById\("client-home-monthly-report-link"\)/);
});

test("Home mood check-in starts collapsed and keeps its existing save form", () => {
  assert.match(dashboard, /data-client-home-checkin-toggle[^>]*aria-expanded="false"[^>]*aria-controls="client-home-checkin-content"/);
  assert.match(dashboard, /id="client-home-checkin-content"[^>]*data-client-home-checkin-content hidden/);
  assert.match(dashboard, /<form class="client-home-mood-form" id="client-home-mood-form">/);
  assert.match(portal, /function setClientHomeCheckinExpanded\(expanded\)/);
  assert.match(portal, /content\.hidden = !isExpanded/);
  assert.match(portal, /event\.target\.closest\("#client-home-mood-form"\)/);
  assert.match(styles, /\.dashboard-page \.client-home-checkin-toggle\s*\{[\s\S]*?min-height:\s*44px;/);
});

test("first-login check-in prompt is remembered per client across devices", () => {
  assert.match(portal, /const clientHomeCheckinPromptMetadataKey = "home_checkin_prompt_seen_v1"/);
  assert.match(portal, /user\?\.user_metadata\?\.\[clientHomeCheckinPromptMetadataKey\] === true/);
  assert.match(portal, /window\.localStorage\.setItem\(clientHomeCheckinPromptStorageKey\(\), "true"\)/);
  assert.match(portal, /supabaseClient\.auth\.updateUser\(\{[\s\S]*?clientHomeCheckinPromptMetadataKey/);
  assert.match(portal, /isCoachPortalEmail\(activeDashboardUser\.email\)/);
  assert.match(portal, /card\.setAttribute\("aria-modal", "true"\)/);
  assert.match(portal, /maybeShowClientHomeCheckinPrompt\(\)/);
});

test("monthly report returns focus to the Home or Progress link that opened it", () => {
  assert.match(portal, /function monthlyProgressReportUrl\(monthKey, tabName = "progress"\)/);
  assert.match(portal, /url\.searchParams\.set\("tab", tabName\)/);
  assert.match(portal, /monthlyReportReturnTab = activeClientDashboardTab \|\| "progress"/);
  assert.match(portal, /monthlyReportReturnFocus = returnFocus \|\| document\.activeElement/);
  assert.match(portal, /monthlyReportReturnFocus\?\.focus\?\.\(\)/);
});
