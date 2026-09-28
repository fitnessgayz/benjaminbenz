// Run: NODE_PATH=<runtime node_modules> node tests/mobile-bottom-navigation.browser.cjs
// Set MOBILE_NAV_BASELINE=1 to render the committed pre-change implementation.
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { webkit } = require("playwright");

const root = path.resolve(__dirname, "..");
const baseline = process.env.MOBILE_NAV_BASELINE === "1";
const baselineRef = process.env.MOBILE_NAV_BASE_REF || "81d9ad7";
const outputRoot = process.env.MOBILE_NAV_SCREENSHOT_DIR
  || path.join(root, "artifacts", "mobile-navigation");

function source(file) {
  if (!baseline) return fs.readFileSync(path.join(root, file), "utf8");
  return execFileSync("git", ["show", `${baselineRef}:${file}`], { cwd: root, encoding: "utf8" });
}

function navigationMarkup(html) {
  const start = html.indexOf('<button\n          class="client-dashboard-mobile-nav-toggle"');
  const end = html.indexOf('<span class="client-notification-unread-status"', start);
  assert.ok(start >= 0 && end > start, "Expected dashboard mobile navigation markup");
  return html.slice(start, end).replace('class="client-dashboard-tabs"', 'class="client-dashboard-tabs is-mobile-expanded"');
}

const styles = `${source("css/style.css")}\n${source("css/workout-exercise-list.css")}`;
const navigation = navigationMarkup(source("client-dashboard.html"));
const fixtureStyles = `
  html { background: #eef0ea; }
  body.client-dashboard-page { margin: 0; background: linear-gradient(150deg, #f8faf6 0%, #e7eee2 55%, #f3f3ee 100%); }
  .fixture-page { box-sizing: border-box; width: 100%; min-height: 1500px; padding: 24px 18px; }
  .fixture-brand { margin: 0 0 6px; color: #687067; font: 800 11px/1.2 Inter, sans-serif; letter-spacing: .14em; text-transform: uppercase; }
  .fixture-page h1 { margin: 0 0 22px; color: #171a17; font: 900 31px/1 Inter, sans-serif; }
  .fixture-card { margin: 0 0 14px; padding: 20px; border: 1px solid rgba(55, 65, 53, .12); border-radius: 20px; background: rgba(255,255,255,.78); box-shadow: 0 12px 30px rgba(42,50,39,.08); }
  .fixture-card strong { display: block; margin-bottom: 8px; color: #242824; font: 800 18px/1.2 Inter, sans-serif; }
  .fixture-card p { margin: 0; color: #5f675e; font: 500 14px/1.5 Inter, sans-serif; }
  .fixture-bottom-marker { margin-top: 990px; }
`;

const scenarios = [
  { width: 390, height: 844 },
  { width: 393, height: 852 },
];

(async () => {
  fs.mkdirSync(outputRoot, { recursive: true });
  const browser = await webkit.launch({ headless: true });
  try {
    for (const viewport of scenarios) {
      for (const displayMode of ["browser", "standalone"]) {
        const context = await browser.newContext({
          viewport,
          screen: viewport,
          isMobile: true,
          deviceScaleFactor: 2,
          hasTouch: true,
        });
        const page = await context.newPage();
        await page.setContent(`<!doctype html><html data-display-mode="${displayMode}"><head>
          <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
          <meta name="apple-mobile-web-app-capable" content="yes">
          <style>${styles}\n${fixtureStyles}</style>
        </head><body class="dashboard-page client-dashboard-page">
          <main class="fixture-page"><p class="fixture-brand">FWB Training</p><h1>Today</h1>
            <section class="fixture-card"><strong>Your next workout</strong><p>Full-body strength · 45 minutes</p></section>
            <section class="fixture-card"><strong>Weekly activity</strong><p>Three sessions completed this week.</p></section>
            <section class="fixture-card fixture-bottom-marker"><strong>End of page</strong><p>This content remains clear of the fixed navigation.</p></section>
          </main>${navigation}
        </body></html>`);
        await page.locator(".client-dashboard-mobile-nav-toggle").evaluate((node) => { node.hidden = true; });
        await page.evaluate(() => window.scrollTo(0, 620));

        const result = await page.evaluate(() => {
          const nav = document.querySelector(".client-dashboard-tabs");
          const rect = nav.getBoundingClientRect();
          const visibleTabs = [...nav.querySelectorAll("[data-client-dashboard-tab]")]
            .filter((tab) => getComputedStyle(tab).display !== "none");
          return {
            viewport: { width: innerWidth, height: innerHeight },
            documentWidth: document.documentElement.scrollWidth,
            scrollX,
            nav: { left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width },
            position: getComputedStyle(nav).position,
            overflowX: getComputedStyle(nav).overflowX,
            visibleTabs: visibleTabs.map((tab) => tab.dataset.clientDashboardTab),
            tabWidths: visibleTabs.map((tab) => tab.getBoundingClientRect().width),
            bodyPaddingBottom: parseFloat(getComputedStyle(document.body).paddingBottom),
          };
        });

        assert.equal(result.position, "fixed");
        if (!baseline) {
          assert.deepEqual(result.visibleTabs, ["home", "workouts", "logs", "progress", "stats"]);
          assert.equal(result.nav.left, 0);
          assert.equal(result.nav.right, viewport.width);
          assert.equal(result.nav.bottom, viewport.height);
          assert.equal(result.nav.width, viewport.width);
          assert.equal(result.documentWidth, viewport.width);
          assert.equal(result.scrollX, 0);
          assert.ok(result.tabWidths.every((width) => Math.abs(width - result.tabWidths[0]) < 0.5));
          assert.notEqual(result.overflowX, "auto");
          assert.ok(result.bodyPaddingBottom >= 100, "Page clearance must exceed the dock height");
        }

        const phase = baseline ? "before" : "after";
        await page.screenshot({
          path: path.join(outputRoot, `${phase}-${viewport.width}x${viewport.height}-${displayMode}.png`),
          fullPage: false,
        });
        process.stdout.write(`${phase} ${viewport.width}x${viewport.height} ${displayMode}: ${JSON.stringify(result)}\n`);
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
