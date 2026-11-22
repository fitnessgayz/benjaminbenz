const assert = require("node:assert/strict");
const fs = require("node:fs");
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

  assert.equal(client.id, "/client-dashboard.html");
  assert.equal(client.name, "GRUNTR");
  assert.equal(client.short_name, "GRUNTR");
  assert.equal(client.background_color, "#050806");
  assert.equal(client.theme_color, "#050806");
  assert.equal(coach.name, "FWB Coach");
  assert.equal(coach.background_color, "#030D1C");
  assert.equal(coach.theme_color, "#030D1C");
  assert.equal(client.start_url, "/client-dashboard.html");
  assert.equal(client.scope, "/");
  assert.equal(client.display, "standalone");
  assert.ok(client.icons.every(icon => !coach.icons.some(coachIcon => coachIcon.src === icon.src)));
  assert.deepEqual(client.shortcuts.map(({ name }) => name), ["Start training", "View progress", "Message your coach"]);
  assert.deepEqual(coach.shortcuts.map(({ name }) => name), ["Coach home", "Coach inbox", "Manage clients", "Log a workout", "Exercise library"]);
});

test("client auth and onboarding stay inside the GRUNTR identity", () => {
  for (const file of ["client-login.html", "client-signup.html", "client-invite.html"]) {
    const html = read(file);
    assert.match(html, /rel="manifest" href="\/client\.webmanifest"/);
    assert.match(html, /apple-mobile-web-app-title" content="GRUNTR"/);
    assert.match(html, /application-name" content="GRUNTR"/);
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
  assert.match(clientDashboard, /<title>GRUNTR \| Fitness with Benjamin<\/title>/);
  assert.match(clientDashboard, /<p class="client-dashboard-nav-title">GRUNTR<\/p>/);
  assert.doesNotMatch(clientDashboard, /user-scalable=no|maximum-scale=1/);

  for (const file of ["coach-login.html", "coach-admin.html", "coach-workout-log.html"]) {
    const html = read(file);
    assert.match(html, /apple-mobile-web-app-title" content="FWB Coach"/);
    assert.match(html, /application-name" content="FWB Coach"/);
    assert.match(html, /theme-color" content="#030D1C"/);
  }

  assert.match(read("coach-admin.html"), /rel="manifest" href="\/coach\.webmanifest"/);
  assert.match(read("coach-admin.html"), /<h1>Your coaching workspace<\/h1>/);
  assert.match(read("coach-workout-log.html"), /<h1 id="coach-workout-page-title">Log Workout<\/h1>/);
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
  const manifests = ["site.webmanifest", "coach.webmanifest"]
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

test("GRUNTR icon files preserve opaque original framing across app and install entry routes", () => {
  const client = JSON.parse(read("client.webmanifest"));
  const dir = "/images/gruntr/icons/v1/";
  assert.deepEqual(client.icons.filter(i=>i.purpose==="any").map(i=>i.sizes),["180x180","192x192","512x512","1024x1024"]);
  assert.deepEqual(client.icons.filter(i=>i.purpose==="maskable").map(i=>i.sizes),["192x192","512x512"]);
  function assertPNG(src,size) {
    const png=fs.readFileSync(path.join(root,src));
    assert.equal(png.toString("ascii",1,4),"PNG");
    assert.equal(png.readUInt32BE(16),size);
    assert.equal(png.readUInt32BE(20),size);
    assert.equal(png[25],2); // opaque RGB, no unexpected transparent corners
  }
  for (const icon of client.icons) assertPNG(icon.src,parseInt(icon.sizes,10));
  for (const size of [16,32,120,152,167,180]) assertPNG(dir+`gruntr-${size}.png`,size);
  const ico = fs.readFileSync(path.join(root,dir+"gruntr.ico"));
  assert.equal(ico.readUInt16LE(2),1);
  assert.equal(ico.readUInt16LE(4),3);
  assert.deepEqual([ico[6],ico[22],ico[38]],[16,32,48]);
  for (const file of ["client-dashboard.html","client-login.html","client-invite.html","client-signup.html",
    "client-access-request.html","fwb-training-privacy.html","fwb-training-support.html"]) {
    const html=read(file);
    assert.match(html,/<title>[^<]*GRUNTR/);
    assert.match(html,/application-name" content="GRUNTR"/);
    assert.ok(html.includes(`rel="apple-touch-icon" sizes="180x180" href="${dir}gruntr-180.png"`),file);
    assert.ok(html.includes(`rel="icon" type="image/png" sizes="16x16" href="${dir}gruntr-16.png"`),file);
    assert.doesNotMatch(html, /rel="(?:[^"]*icon[^"]*)"[^>]*href="\/(?:fwb-|favicon\.|apple-touch-icon-)/i);
  }
  assert.ok(read("js/client-portal.js").includes('document.title = `${programTitle} | GRUNTR`'));
  for (const file of ["js/client-portal.js","js/client-unfinished-workout-reminder.js","timer-notifications-sw.js"]) {
    assert.ok(read(file).includes(dir+"gruntr-192.png"));
    assert.doesNotMatch(read(file), /fwb-brand-icon-gold-192-v5/);
  }
});
