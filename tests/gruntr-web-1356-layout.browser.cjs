// Run with NODE_PATH=<Playwright modules>; use PLAYWRIGHT_BROWSER=webkit for Safari engine.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const engines = require("playwright");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");
const styles = [...html.matchAll(/<link[^>]+href="\/?(css\/[^"?]+)[^>]*>/g)]
  .map(match => fs.readFileSync(path.join(root, match[1]), "utf8")).join("\n");
const fixture = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
  .replace(/<link\b[^>]*rel="stylesheet"[^>]*>/gi, "")
  .replace("</head>", `<style>${styles}</style></head>`);
function luminance(rgb) {
  const channels = rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map(channel => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(a, b) {
  const [bright, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (bright + 0.05) / (dark + 0.05);
}
(async () => {
  const engine = engines[process.env.PLAYWRIGHT_BROWSER || "chromium"];
  assert.ok(engine, "Choose an installed Playwright engine");
  const options = { headless: true };
  if (process.env.TEST_CHROMIUM_PATH) options.executablePath = process.env.TEST_CHROMIUM_PATH;
  const browser = await engine.launch(options);
  try {
    for (const width of [320, 375, 390, 430, 900, 1280]) {
      for (const theme of ["light", "dark"]) {
        const page = await browser.newPage({ viewport: { width, height: 760 } });
        await page.route("**/*", route => route.abort());
        await page.setContent(fixture);
        const resolved = await page.evaluate(async selected => {
          document.documentElement.dataset.clientTheme = selected;
          document.body.classList.remove("is-loading");
          document.getElementById("dashboard-loading").hidden = true;
          document.getElementById("dashboard-content").hidden = false;
          const planner = document.querySelector(".client-home-planner");
          const label = planner.querySelector("[data-client-home-week-label]");
          let surface = planner;
          while (surface.parentElement && getComputedStyle(surface).backgroundColor === "rgba(0, 0, 0, 0)") {
            surface = surface.parentElement;
          }
          const nav = document.querySelector(".client-dashboard-tabs");
          const box = nav.getBoundingClientRect();
          const buttons = [...nav.querySelectorAll("[data-client-dashboard-tab]")].map(tab => {
            const bounds = tab.getBoundingClientRect();
            return { x: bounds.x, right: bounds.right, height: bounds.height, label: tab.innerText.trim(), color: getComputedStyle(tab.querySelector(".client-dashboard-tab-label")).color };
          });
          const clearance = parseFloat(getComputedStyle(document.body).paddingBottom);
          const loggerFixture = document.createElement("div");
          loggerFixture.innerHTML = '<div class="custom-workout-carousel" data-carousel-enabled="true"><div class="custom-workout-card"><input placeholder="Exercise title"><textarea placeholder="Add a note"></textarea></div></div>';
          document.body.appendChild(loggerFixture);
          const placeholder = input => {
            const style = getComputedStyle(input, "::placeholder");
            return { color: style.color, opacity: style.opacity, background: getComputedStyle(input).backgroundColor };
          };
          const searchPlaceholder = placeholder(document.getElementById("client-training-log-search-filter"));
          const carouselPlaceholders = [...loggerFixture.querySelectorAll("input, textarea")].map(placeholder);
          loggerFixture.remove();
          return { theme: selected, pageWidth: document.documentElement.scrollWidth,
            weekBackground: getComputedStyle(surface).backgroundColor,
            weekLabel: getComputedStyle(label).color,
            nav: { left: box.left, right: box.right, height: box.height, bottom: box.bottom, position: getComputedStyle(nav).position, background: getComputedStyle(nav).backgroundColor },
            buttons, clearance, searchPlaceholder, carouselPlaceholders, viewportHeight: innerHeight };
        }, theme);
        assert.equal(resolved.pageWidth, width, `${width}px ${theme} viewport overflow`);
        assert.ok(contrast(resolved.weekLabel, resolved.weekBackground) >= 4.5, `Week label: ${JSON.stringify(resolved)}`);
        if (theme === "light") {
          assert.equal(resolved.searchPlaceholder.opacity, "1");
          assert.ok(contrast(resolved.searchPlaceholder.color, resolved.searchPlaceholder.background) >= 4.5, `Light workout log search: ${JSON.stringify(resolved.searchPlaceholder)}`);
        }
        if (width <= 760) {
          for (const placeholder of resolved.carouselPlaceholders) {
            assert.equal(placeholder.opacity, "1");
            // Light mode may use the existing tinted surface rather than pure white.
            assert.match(placeholder.background, /^rgb\(/, "Expected an opaque rendered input surface");
            assert.ok(contrast(placeholder.color, placeholder.background) >= 4.5, `Mobile carousel ${theme}: ${JSON.stringify(placeholder)}`);
          }
        }
        if (width <= 900) {
          assert.equal(resolved.nav.position, "fixed");
          assert.ok(resolved.nav.left >= 12 && resolved.nav.right <= width - 12);
          assert.ok(resolved.nav.bottom < resolved.viewportHeight);
          assert.ok(resolved.clearance >= resolved.nav.height + 9);
          assert.deepEqual(resolved.buttons.map(b => b.label), ["Home", "Workout", "Social", "Profile"]);
          for (const b of resolved.buttons) {
            assert.ok(b.x >= resolved.nav.left && b.right <= resolved.nav.right && b.height >= 44);
            assert.ok(contrast(b.color, resolved.nav.background) >= 4.5);
          }
        }
        console.log(`GRUNTR ${width}px ${theme}: no overflow, readable Week label, placeholders and navigation`);
        await page.close();
      }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
