const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("publishes the approved web palette with migration aliases", () => {
  const css = read("css/fwb-design-system.css");
  const values = {
    "brand-primary": "#A3FF12",
    "brand-primary-ink": "#101900",
    ink: "#F2F0E8",
    "ink-deep": "#050806",
    canvas: "#050806",
    "surface-soft": "#112219",
    surface: "#0B1811",
    "text-muted": "#A8B9AC",
    border: "#263C2E",
    focus: "#A3FF12",
  };

  for (const [name, value] of Object.entries(values)) {
    assert.match(css, new RegExp(`--${name}: ${value};`, "i"));
  }
  assert.match(css, /--lime: var\(--brand-primary\)/);
  assert.match(css, /--black: var\(--ink-deep\)/);
  assert.match(css, /--paper: var\(--surface\)/);
  assert.match(css, /background: var\(--canvas\)/);
});

test("client and coach manifests use approved installed identities", () => {
  const client = JSON.parse(read("client.webmanifest"));
  const coach = JSON.parse(read("coach.webmanifest"));

  assert.equal(client.id, "/client-dashboard.html");
  assert.equal(client.name, "FWB Training");
  assert.equal(client.short_name, "FWB Training");
  assert.equal(client.background_color, "#050806");
  assert.equal(client.theme_color, "#050806");
  assert.equal(coach.name, "FWB Coach");
  assert.equal(coach.background_color, "#030D1C");
  assert.equal(coach.theme_color, "#030D1C");
  assert.deepEqual(client.icons.map((icon) => icon.src), coach.icons.map((icon) => icon.src));
  assert.deepEqual(client.shortcuts.map(({ name }) => name), ["Start training", "View progress", "Message your coach"]);
  assert.deepEqual(coach.shortcuts.map(({ name }) => name), ["Coach home", "Coach inbox", "Manage clients", "Log a workout", "Exercise library"]);
});

test("client auth and onboarding stay inside the FWB Training identity", () => {
  for (const file of ["client-login.html", "client-signup.html", "client-invite.html"]) {
    const html = read(file);
    assert.match(html, /rel="manifest" href="\/client\.webmanifest"/);
    assert.match(html, /apple-mobile-web-app-title" content="FWB Training"/);
    assert.match(html, /application-name" content="FWB Training"/);
  }

  const login = read("client-login.html");
  assert.match(login, /<h1 id="access-title">Welcome back<\/h1>/);
  assert.match(login, /Train with intention\. Feel your progress\./);
  assert.doesNotMatch(login, /Training portal|<h2>Client access<\/h2>/);
  assert.doesNotMatch(read("js/client-portal.js"), /Use the email and password from your coach\./);
  assert.match(read("client-invite.html"), /Welcome to FWB Training/);
});

test("installed entry pages expose the same product names and deep-ink browser chrome", () => {
  const clientDashboard = read("client-dashboard.html");
  assert.match(clientDashboard, /apple-mobile-web-app-title" content="FWB Training"/);
  assert.match(clientDashboard, /application-name" content="FWB Training"/);
  assert.match(clientDashboard, /<title>FWB Training \| Fitness with Benjamin<\/title>/);
  assert.match(clientDashboard, /<p class="client-dashboard-nav-title">FWB Training<\/p>/);
  assert.doesNotMatch(clientDashboard, /user-scalable=no|maximum-scale=1/);

  for (const file of ["coach-login.html", "coach-admin.html", "coach-workout-log.html"]) {
    const html = read(file);
    assert.match(html, /apple-mobile-web-app-title" content="FWB Coach"/);
    assert.match(html, /application-name" content="FWB Coach"/);
    assert.match(html, /theme-color" content="#030D1C"/);
  }

  assert.match(read("coach-admin.html"), /rel="manifest" href="\/coach\.webmanifest"/);
  assert.match(read("coach-admin.html"), /<h1>Your coaching workspace<\/h1>/);
  assert.match(read("coach-workout-log.html"), /<h1 id="coach-workout-page-title">Log a client workout<\/h1>/);
  assert.doesNotMatch(read("coach-workout-log.html"), /user-scalable=no|maximum-scale=1/);

  const publicManifest = JSON.parse(read("site.webmanifest"));
  assert.equal(publicManifest.name, "Fitness with Benjamin");
  assert.equal(publicManifest.background_color, "#050806");
  assert.equal(publicManifest.theme_color, "#050806");
});

test("AI-facing pages use FWB Training Assistant without claiming the coach product name", () => {
  const pages = [
    "ai-coach.html",
    "ai-coach-support.html",
    "ai-coach-privacy.html",
    "ai-coach-terms.html",
    "oauth-consent.html",
    "mcp-server/public/ai-coach.html",
    "mcp-server/public/ai-coach-support.html",
    "mcp-server/public/ai-coach-privacy.html",
    "mcp-server/public/ai-coach-terms.html",
    "mcp-server/web/oauth-consent.html",
  ];

  for (const file of pages) {
    const html = read(file);
    assert.match(html, /FWB Training Assistant/);
    assert.doesNotMatch(html, /<title>FWB Coach(?: |<)/);
    assert.doesNotMatch(html, /<h1>FWB Coach(?: |<|\?)/);
  }
});

test("PWA manifests use the versioned electric-gold icon set at every declared size", () => {
  const manifests = ["site.webmanifest", "client.webmanifest", "coach.webmanifest"]
    .map((file) => JSON.parse(read(file)));
  const sizes = [180, 192, 512, 1024];
  for (const size of sizes) {
    const filename = `fwb-brand-icon-gold-${size}-v5.png`;
    const png = fs.readFileSync(path.join(root, filename));
    assert.equal(png.toString("ascii", 1, 4), "PNG");
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);

    for (const manifest of manifests) {
      assert.ok(manifest.icons.some((icon) => icon.src === `/${filename}` && icon.sizes === `${size}x${size}`));
    }
  }
});

test("public and native products use the canonical version 5 monogram", () => {
  const publicHome = read("index.html");
  assert.match(publicHome, /fwb-brand-icon-gold-1024-v5\.png/);
  assert.match(read("css/style.css"), /fwb-brand-icon-gold-192-v5\.png/);

  const nativeIcons = [
    "FWB-iOS-App/FWBCoach/Assets.xcassets/AppIcon.appiconset/AppIcon-1024-edited.png",
    "FWBCoach/FWBCoach/Assets.xcassets/AppIcon.appiconset/FWBCoach-1024.png",
    "FWB-iOS-App/FWBCoach/Assets.xcassets/BrandMark.imageset/BrandMark.png",
  ];
  const canonical = fs.readFileSync(path.join(root, "fwb-brand-icon-gold-1024-v5.png"));
  for (const file of nativeIcons) {
    const png = fs.readFileSync(path.join(root, file));
    assert.equal(png.toString("ascii", 1, 4), "PNG");
    assert.equal(png.readUInt32BE(16), 1024);
    assert.equal(png.readUInt32BE(20), 1024);
    assert.deepEqual(png, canonical);
  }
});
