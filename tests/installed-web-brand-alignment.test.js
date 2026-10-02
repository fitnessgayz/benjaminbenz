const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("installed apps keep distinct product identities and useful launch shortcuts", () => {
  const client = JSON.parse(read("client.webmanifest"));
  const coach = JSON.parse(read("coach.webmanifest"));

  assert.equal(client.name, "FWB Training");
  assert.equal(coach.name, "FWB Coach");
  assert.notEqual(client.id, coach.id);
  assert.notEqual(client.start_url, coach.start_url);
  assert.equal(client.background_color, "#050806");
  assert.equal(coach.background_color, "#050806");
  assert.equal(client.theme_color, "#050806");
  assert.equal(coach.theme_color, "#050806");
  assert.ok(client.shortcuts.length >= 3);
  assert.ok(coach.shortcuts.length >= 3);
});

test("auth, support, and privacy surfaces preserve install-to-launch identity", () => {
  const clientPages = [
    "client-login.html",
    "client-signup.html",
    "client-invite.html",
    "fwb-training-support.html",
    "fwb-training-privacy.html",
  ];
  const coachPages = [
    "coach-login.html",
    "coach-admin.html",
    "coach-workout-log.html",
    "coach-exercise-library.html",
    "fwb-coach-support.html",
    "fwb-coach-privacy.html",
  ];

  for (const file of clientPages) {
    const html = read(file);
    assert.match(html, /rel="manifest" href="\/client\.webmanifest"/);
    assert.match(html, /apple-mobile-web-app-title" content="FWB Training"/);
    assert.match(html, /application-name" content="FWB Training"/);
    assert.doesNotMatch(html, /user-scalable=no|maximum-scale=1/);
  }

  for (const file of coachPages) {
    const html = read(file);
    assert.match(html, /rel="manifest" href="\/coach\.webmanifest"/);
    assert.match(html, /apple-mobile-web-app-title" content="FWB Coach"/);
    assert.match(html, /application-name" content="FWB Coach"/);
    assert.doesNotMatch(html, /user-scalable=no|maximum-scale=1/);
  }
});

test("shared app styles use the approved palette beneath the color bridges", () => {
  const css = read("css/fwb-design-system.css");
  for (const [token, value] of Object.entries({
    "brand-primary": "#A3FF12",
    ink: "#F2F0E8",
    "ink-deep": "#050806",
    canvas: "#050806",
    "surface-soft": "#112219",
    surface: "#0B1811",
    "text-muted": "#A8B9AC",
    border: "#263C2E",
    focus: "#A3FF12",
  })) {
    assert.match(css, new RegExp(`--${token}: ${value};`, "i"));
  }
  assert.match(css, /:focus-visible[\s\S]*?var\(--focus\)/);

  for (const file of ["client-dashboard.html", "coach-admin.html"]) {
    const links = [...read(file).matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"[^>]*>/g)];
    assert.ok(links.some((link) => /fwb-design-system\.css\?v=web-app-brand-1/.test(link[1])));
    assert.match(links.at(-1)[1], /fwb-dark-theme\.css\?v=deep-forest-7/);
  }
});

test("user-facing application copy uses product names instead of admin labels", () => {
  const scripts = `${read("js/client-portal.js")}\n${read("js/coach-admin.js")}`;
  for (const retiredCopy of [
    "Use Coach Admin to make changes",
    "available in the iOS app and Coach Admin",
    "not set up as a coach admin",
    "Open Client View from the coach admin",
    "Coach admin is not connected yet",
    "deleted from coach admin",
  ]) {
    assert.doesNotMatch(scripts, new RegExp(retiredCopy, "i"));
  }
  assert.match(read("client-dashboard.html"), /Get FWB Training support/);
  assert.match(read("coach-admin.html"), /FWB Coach help and policies/);
});

test("health-support copy accurately describes read and write synchronization", () => {
  const support = read("fwb-training-support.html");
  assert.match(support, /save completed workouts to Apple Health and read selected workout/i);
  assert.doesNotMatch(support, /write-only/i);
  assert.match(support, /Sharing any selected category[\s\S]*?starts off/i);
});
