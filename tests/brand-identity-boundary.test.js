const assert = require("node:assert/strict");
const fs = require("node:fs");
const { createHash } = require("node:crypto");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("publishes the approved web palette with migration aliases", () => {
  const css = read("css/fwb-design-system.css");
  const values = {
    "brand-primary": "#ffd400",
    "brand-primary-ink": "#101900",
    ink: "#F2F0E8",
    "ink-deep": "#050806",
    canvas: "#050806",
    "surface-soft": "#112219",
    surface: "#0B1811",
    "text-muted": "#A8B9AC",
    border: "#263C2E",
    focus: "#ffd400",
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
  const website = JSON.parse(read("site.webmanifest"));

  assert.equal(client.id, "/client-dashboard.html");
  assert.equal(client.name, "GRUNTR");
  assert.equal(client.short_name, "GRUNTR");
  assert.equal(client.background_color, "#050806");
  assert.equal(client.theme_color, "#050806");
  assert.equal(coach.id, "/coach-app");
  assert.equal(coach.name, "GRUNTR Coach");
  assert.equal(coach.background_color, "#101113");
  assert.equal(coach.theme_color, "#101113");
  assert.ok(client.icons.every((icon) => icon.src.startsWith("/images/gruntr/client-22e30eae/")));
  assert.deepEqual(website.icons, client.icons.filter((icon) => icon.purpose === "any"));
  const exact = fs.readFileSync(path.join(root, "images/gruntr/client-22e30eae/icon-1024.png"));
  assert.equal(createHash("sha256").update(exact).digest("hex"), "4a05711ec176a7b062566730453d83b2a51eae4dbb9857e9bf49d1e6bbad61ee");
  assert.deepEqual(coach.icons, client.icons);
  assert.deepEqual(client.shortcuts.map(({ name }) => name), ["Start training", "View progress", "Message your coach"]);
  assert.deepEqual(coach.shortcuts.map(({ name }) => name), ["Coach home", "Coach inbox", "Manage clients", "Log a workout", "Exercise library"]);
});

test("client auth and onboarding stay inside the GRUNTR identity", () => {
  for (const file of ["client-login.html", "client-signup.html", "client-invite.html"]) {
    const html = read(file);
    assert.match(html, /rel="manifest" href="\/client\.webmanifest\?v=22e30eae"/);
    assert.match(html, /apple-mobile-web-app-title" content="GRUNTR"/);
    assert.match(html, /application-name" content="GRUNTR"/);
    assert.match(html, /rel="apple-touch-icon"[^>]*href="\/images\/gruntr\/client-22e30eae\/icon-180\.png"/);
    assert.match(html, /<a class="brand" href="index\.html#top" aria-label="GRUNTR">\s*<img src="\/images\/gruntr\/client-22e30eae\/icon-192\.png"[^>]*alt=""[^>]*>\s*<strong>GRUNTR<\/strong>/);
  }

  const login = read("client-login.html");
  assert.match(login, /<h1 id="access-title">Welcome back<\/h1>/);
  assert.match(login, /Train with intention\. Feel your progress\./);
  assert.doesNotMatch(login, /Training portal|<h2>Client access<\/h2>/);
  assert.doesNotMatch(read("js/client-portal.js"), /Use the email and password from your coach\./);
  assert.match(read("client-invite.html"), /Welcome to GRUNTR/);
});

test("installed entry pages expose the same product names and deep-ink browser chrome", () => {
  const clientDashboard = read("client-dashboard.html");
  assert.match(clientDashboard, /apple-mobile-web-app-title" content="GRUNTR"/);
  assert.match(clientDashboard, /application-name" content="GRUNTR"/);
  assert.match(clientDashboard, /<title>GRUNTR<\/title>/);
  assert.match(clientDashboard, /<p class="client-dashboard-nav-title"><img src="\/images\/gruntr\/client-22e30eae\/icon-192\.png"[^>]*> GRUNTR<\/p>/);
  assert.doesNotMatch(clientDashboard, /user-scalable=no|maximum-scale=1/);

  for (const file of ["coach-login.html", "coach-admin.html", "coach-workout-log.html"]) {
    const html = read(file);
    assert.match(html, /apple-mobile-web-app-title" content="GRUNTR Coach"/);
    assert.match(html, /application-name" content="GRUNTR Coach"/);
    assert.match(html, /theme-color" content="#101113"/);
  }

  assert.match(read("coach-admin.html"), /rel="manifest" href="\/coach\.webmanifest"/);
  assert.match(read("coach-admin.html"), /<h1>Your coaching workspace<\/h1>/);
  assert.match(read("coach-workout-log.html"), /<h1 id="coach-workout-page-title">Log a client workout<\/h1>/);
  assert.doesNotMatch(read("coach-workout-log.html"), /user-scalable=no|maximum-scale=1/);

  const publicManifest = JSON.parse(read("site.webmanifest"));
  assert.equal(publicManifest.name, "GRUNTR");
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

test("PWA manifests provide correctly sized product icons", () => {
  const sizes = ["180x180", "192x192", "512x512", "1024x1024"];
  for (const filename of ["site.webmanifest", "client.webmanifest", "coach.webmanifest"]) {
    const { icons } = JSON.parse(read(filename));
    assert.ok(sizes.every((size) => icons.some((icon) => icon.sizes === size && icon.purpose === "any")));
    for (const icon of icons) {
      const png = fs.readFileSync(path.join(root, icon.src));
      assert.equal(png.toString("ascii", 1, 4), "PNG");
      assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
    }
    if (filename === "client.webmanifest") {
      assert.ok(icons.some((icon) => icon.purpose === "maskable" && icon.sizes === "512x512"));
    }
  }
});

test("public sharing uses the GRUNTR logo and native products use the canonical monogram", () => {
  const publicHome = read("index.html");
  assert.match(publicHome, /property="og:image" content="https:\/\/benjaminbenz\.com\/images\/gruntr\/client-22e30eae\/icon-1024\.png"/);
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
