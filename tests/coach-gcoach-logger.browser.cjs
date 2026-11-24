// Exercises the real Coach web logger against synthetic data; never writes to production.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, devices, webkit } = require("playwright");

const root = path.resolve(__dirname, "..");
const origin = "https://coach-logger.test";
const storage = "https://test-art.supabase.co";
const artPath = "/storage/v1/object/public/exercise-images/anatomy/2026-11-22/goblet-squat.webp";
const files = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".png": "image/png" };
const client = { client_email: "training@example.test", client_name: "Sample Client", active: true };

async function exerciseFlow(engine, options, name) {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage({ ...options, reducedMotion: "reduce" });
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(({ storage, artPath, client }) => {
      window.workouts = [];
      window.FWB_SUPABASE_CONFIG = { url: storage, anonKey: "fixture" };
      window.FWB_AUTH_SESSION = { storage: {} };
      window.supabase = { createClient: () => ({
        auth: { async getUser() { return { data: { user: { email: "benjaminbenz.fit@gmail.com" } } }; } },
        from(table) {
          const history = [{ id: 1, entry_date: "2026-11-19", workout_title: "Leg day", exercise_name: "Goblet Squat", set_number: 1, set_type: "working", weight_used: 50, reps: 8 }];
          let filters;
          const data = () => table === "client_programs" ? [client] : table === "exercise_library" ? [
            { name: "Goblet Squat", primary_muscle: "quadriceps", image_url: storage + artPath, instructions: "Hold the weight close and sit between your knees." },
            { name: "Bench Press", primary_muscle: "chest" }, { name: "Inactive Squat", is_active: false }
          ] : filters === "history" ? history : [];
          return {
            select() { return this; }, setHeader() { return this; }, order() { return this; }, eq() { return this; },
            lte() { filters = "history"; return this; }, async range() { return { data: data() }; },
            async upsert(rows) { window.workouts.push(...rows); return {}; },
            then(resolve, reject) { return Promise.resolve({ data: data() }).then(resolve, reject); }
          };
        }
      }) };
    }, { storage, artPath, client });
    const html = fs.readFileSync(path.join(root, "coach-workout-log.html"), "utf8")
      .replace(/<script src="(?:https:\/\/cdn[^\"]+|js\/(?:supabase-config|auth-session)\.js[^\"]*)"><\/script>/g, "");
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === storage && url.pathname === artPath) {
        return process.env.GCOACH_ART_FIXTURE
          ? route.fulfill({ path: process.env.GCOACH_ART_FIXTURE, contentType: "image/jpeg" })
          : route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160"><rect width="320" height="160" fill="white"/></svg>' });
      }
      if (url.origin !== origin) return route.abort();
      if (url.pathname === "/coach-workout-log.html") return route.fulfill({ contentType: "text/html", body: html });
      const file = path.join(root, decodeURIComponent(url.pathname));
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: "Unavailable" });
      return route.fulfill({ contentType: files[path.extname(file)] || "application/octet-stream", body: fs.readFileSync(file) });
    });
    await page.clock.setFixedTime(new Date("2026-11-24T20:00:00Z"));
    await page.goto(`${origin}/coach-workout-log.html`);
    await page.getByRole("heading", { name: "Log Workout" }).waitFor();
    await page.locator("#coach-workout-client-name").fill(client.client_name);
    assert.ok(await page.getByRole("button", { name: "Save workout without closing" }).isVisible());
    assert.ok((await page.locator("#coach-workout-client-name").boundingBox()).width > 140);
    const assertWidth = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name);
    await assertWidth();
    assert.equal(await page.getByRole("tab", { name: "Exercise Library" }).count(), 0);
    await page.getByRole("button", { name: /Add first exercise/ }).click();
    const library = page.getByRole("region", { name: "Add Exercise", exact: true });
    assert.ok(await library.isVisible());
    assert.equal(await page.getByRole("button", { name: "Finish Workout" }).count(), 0);
    await library.getByRole("searchbox").fill("squat quad");
    assert.equal(await library.getByRole("listitem").count(), 1);
    await library.getByRole("button", { name: "Add Goblet Squat" }).click();
    const card = page.locator("[data-coach-workout-group-card]");
    const image = card.getByRole("img", { name: "Goblet Squat exercise illustration" });
    await image.waitFor();
    assert.ok(await image.evaluate((node) => {
      const frame = node.parentElement.getBoundingClientRect();
      const artwork = node.getBoundingClientRect();
      return getComputedStyle(node).objectFit === "contain" && frame.height >= 130 && Math.abs(frame.height - artwork.height) < 2;
    }), `${name}: exercise art must fit its full frame`);
    await card.getByText("50 lb × 8", { exact: true }).waitFor();
    assert.equal(await page.locator("#coach-workout-client-name").inputValue(), client.client_name);
    await card.getByText("Guide", { exact: false }).click();
    assert.ok(await card.getByText("Hold the weight close and sit between your knees.").isVisible());
    await card.getByText("Guide", { exact: false }).click();
    await card.locator("[data-coach-grouped-history] summary").click();
    assert.ok(await card.getByText("Leg day", { exact: false }).isVisible());
    await card.locator("[data-coach-grouped-history] summary").click();
    await assertWidth();
    const weight = card.getByRole("spinbutton", { name: /Weight, set 1/ });
    await weight.fill("55");
    await card.getByRole("spinbutton", { name: /Reps, set 1/ }).fill("8");
    await page.locator("#coach-workout-add-exercise").click();
    await library.getByRole("button", { name: "Back to workout" }).click();
    assert.equal(await weight.inputValue(), "55");
    await page.locator("#coach-workout-add-exercise").click();
    await library.getByRole("button", { name: "Add Goblet Squat" }).click();
    assert.equal(await card.count(), 1);
    assert.equal(await weight.inputValue(), "55");
    assert.equal(await card.locator("[data-coach-gcoach-log]").getAttribute("data-logged"), "false");
    await card.locator("[data-coach-gcoach-log]").click();
    await card.locator("[data-coach-inline-rest]").waitFor();
    await page.waitForFunction(() => window.workouts.some((row) => row.exercise_name === "Goblet Squat" && row.weight_used === 55 && row.reps === 8));
    await page.evaluate(() => window.CoachRestTimer.stop());
    assert.equal(await card.locator("[data-coach-gcoach-log]").getAttribute("data-logged"), "true");
    await assertWidth();
    const scroller = page.getByRole("region", { name: "Workout details and exercises" });
    const footer = page.locator(".coach-workout-submit-panel");
    async function checkFooter() {
      const scroll = await scroller.boundingBox();
      const bar = await footer.boundingBox();
      const height = await page.evaluate(() => innerHeight);
      assert.ok(Math.abs(scroll.y + scroll.height - bar.y) <= 2, `${name}: footer must not overlay the scroll area`);
      assert.ok(Math.abs(bar.y + bar.height - height) <= 2, `${name}: footer stays at the viewport bottom (${bar.y + bar.height} vs ${height})`);
    }
    await checkFooter();
    await page.locator("#coach-workout-start-rest").click();
    assert.ok(await page.locator("#coach-rest-timer").isVisible());
    await checkFooter();
    await page.locator("#coach-rest-timer-skip").click();
    await scroller.evaluate((node) => node.scrollTo({ top: node.scrollHeight, behavior: "instant" }));
    await checkFooter();
    const add = await page.locator("#coach-workout-add-exercise").boundingBox();
    const bar = await footer.boundingBox();
    assert.ok(add.y + add.height <= bar.y + 1, `${name}: last action must be reachable above the footer (${add.y + add.height} vs ${bar.y})`);
    if (name === "iphone" && process.env.COACH_LOGGER_PREVIEW_DIR) {
      await page.evaluate(() => document.activeElement?.blur());
      await page.screenshot({ path: path.join(process.env.COACH_LOGGER_PREVIEW_DIR, "gruntr-coach-logger-corrected-sets-iphone.png"), scale: "css" });
      await scroller.evaluate((node) => node.scrollTo({ top: 0, behavior: "instant" }));
      await page.screenshot({ path: path.join(process.env.COACH_LOGGER_PREVIEW_DIR, "gruntr-coach-logger-corrected-iphone.png"), scale: "css" });
    }
    await page.getByRole("button", { name: "Finish Workout" }).click();
    await page.getByRole("status").filter({ hasText: "Workout finished and saved" }).waitFor();
    assert.deepEqual(errors, []);
    console.log(`${name}: library, workout draft, artwork, PR, history, set, rest and finish passed`);
  } finally {
    await browser.close();
  }
}

Promise.all([
  exerciseFlow(webkit, { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } }, "iphone"),
  exerciseFlow(chromium, { ...devices["Pixel 7"] }, "android"),
  exerciseFlow(chromium, { viewport: { width: 320, height: 720 } }, "320px"),
  exerciseFlow(chromium, { viewport: { width: 1280, height: 900 } }, "desktop")
]).catch((error) => { console.error(error); process.exitCode = 1; });
