const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");
const css = fs.readFileSync(path.join(root, "css/style.css"), "utf8");
const portal = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");

test("client Settings presents an iOS-style menu before the detailed controls", () => {
  const settingsStart = html.indexOf('data-client-dashboard-panel="notifications"');
  const settingsEnd = html.indexOf('<dialog class="fwb-message-dialog"', settingsStart);
  const settings = html.slice(settingsStart, settingsEnd);

  assert.ok(settingsStart >= 0 && settingsEnd > settingsStart);
  assert.match(settings, /data-client-settings-view="menu"/);
  assert.match(settings, /data-profile-photo/);
  assert.ok(settings.indexOf("data-profile-photo") > settings.indexOf('data-client-settings-view="menu"'));
  assert.match(css, /\.client-settings-menu \.profile-photo-card\s*\{[^}]*order: -1;/s);
  [
    "Messages",
    "PAR-Q",
    "Sessions",
    "Login &amp; security",
    "Notifications",
    "Health apps",
    "Recent updates",
    "Privacy policy",
    "Help &amp; support"
  ].forEach((label) => assert.match(settings, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
  ["nutrition", "stats", "workouts"].forEach((destination) => {
    assert.doesNotMatch(settings, new RegExp(`data-client-settings-destination="${destination}"`));
  });

  for (const view of ["security", "notifications", "health-apps", "recent-updates"]) {
    assert.match(settings, new RegExp(`data-client-settings-view="${view}" hidden`));
  }
  assert.match(settings, /data-client-settings-view="notifications"[\s\S]*?data-web-notification-preference="achievements"[\s\S]*?<\/section>\s*<section class="client-settings-view client-settings-detail" id="client-settings-recent-updates"/);
  assert.match(settings, /data-client-settings-view="recent-updates"[\s\S]*?data-web-notification-list/);
  assert.match(settings, /data-client-settings-view="health-apps"[\s\S]*?data-apple-health-summary[\s\S]*?data-google-health-settings/);
  assert.match(settings, /data-client-settings-back aria-label="Back to Settings"/);
});

test("account actions live in Settings and focused views replace the long page", () => {
  const homeStart = html.indexOf('data-client-dashboard-panel="home"');
  const settingsStart = html.indexOf('data-client-dashboard-panel="notifications"');
  const home = html.slice(homeStart, settingsStart);
  const settings = html.slice(settingsStart, html.indexOf('<dialog class="fwb-message-dialog"', settingsStart));

  assert.doesNotMatch(home, /client-dashboard-reset-password-button/);
  assert.match(settings, /client-dashboard-reset-password-button/);
  assert.match(portal, /function setClientSettingsView\(viewName = "menu"/);
  assert.match(portal, /views\.forEach\(\(view\) => \{\s*view\.hidden = view !== nextView;/);
  assert.match(portal, /data-client-settings-open/);
  assert.match(portal, /data-client-settings-back/);
  assert.match(css, /\.client-settings-shortcuts\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(css, /\.client-settings-view\[hidden\]\s*\{\s*display: none !important;/);
});
