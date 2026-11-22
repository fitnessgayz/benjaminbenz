// NODE_PATH=/Users/benjamingonzales/.local/lib/node_modules node tests/client-exercise-picker-scroll.browser.cjs
// PLAYWRIGHT_BROWSER=webkit runs the same checks with Safari's engine.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, webkit } = require("playwright");

const root = path.resolve(__dirname, "..");
const dashboard = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");
const portal = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");
const styles = [...dashboard.matchAll(/<link[^>]+href="(?:\/)?(css\/[^"?]+)[^>]*>/g)]
  .map((match) => fs.readFileSync(path.join(root, match[1]), "utf8")).join("\n");
const pickerFunctions = [
  "customWorkoutPickerMatches",
  "customWorkoutPickerArmFamily",
  "customWorkoutPickerDisplayName",
  "customWorkoutPickerRecordForName",
  "renderCustomWorkoutPickerResults",
  "openCustomWorkoutExerciseDialog"
].map((name) => {
  const start = portal.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}`);
  const next = portal.slice(start + 1).search(/\n(?:async )?function [\w$]+\(/);
  assert.ok(next >= 0, `Missing function boundary after ${name}`);
  return portal.slice(start, start + next + 1);
}).join("\n");

const fixture = `
const trainingLogs = [], muscleMeta = {};
const exerciseNameMatcher = { normalizeName: (value) => value.trim().toLowerCase() };
function escapeHtml(value) { return String(value ?? ""); }
function customWorkoutExerciseAddConfig(format) {
  return { count: format === "circuit" ? 3 : format === "superset" ? 2 : 1, label: "Add exercise", hint: "" };
}
function normalizeCustomWorkoutFormat(format) { return format || "single"; }
function customWorkoutCarousels() { return []; }
function exerciseSuggestionRecords() {
  return Array.from({ length: 24 }, (_, index) => ({
    name: "Movement " + String(index + 1).padStart(2, "0"),
    libraryEntry: { equipment: "dumbbell", primary_muscle: "chest" }
  }));
}
function exerciseSuggestionMuscleLabel(entry) { return entry.primary_muscle; }
function customExerciseSuggestionMatches() { return []; }
function trustedExerciseImageUrl() { return ""; }
function openClientExerciseLibrary(input) {
  window.FWB_CLIENT_EXERCISE_LIBRARY.open({ records: exerciseSuggestionRecords(), initialQuery: input.value });
}
${pickerFunctions}
document.getElementById("trigger").addEventListener("click", (event) => openCustomWorkoutExerciseDialog(event.target));
`;

async function scrollList(page, list, engine) {
  const bounds = await list.boundingBox();
  const x = Math.round(bounds.x + bounds.width / 2);
  const y = Math.round(bounds.y + bounds.height * 0.8);
  if (engine === chromium) {
    const session = await page.context().newCDPSession(page);
    await session.send("Input.synthesizeScrollGesture", {
      x, y, yDistance: -Math.round(bounds.height * 0.55), gestureSourceType: "touch"
    });
    await session.detach();
  } else {
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, 160);
  }
}

async function assertListScrolls(page, list, container, engine, description) {
  const layout = await list.evaluate((element, parent) => {
    const bounds = element.getBoundingClientRect();
    const modal = element.closest(parent).getBoundingClientRect();
    return { height: element.clientHeight, scrollHeight: element.scrollHeight,
      top: bounds.top, bottom: bounds.bottom, modalTop: modal.top, modalBottom: modal.bottom };
  }, container);
  assert.ok(layout.height >= 32 && layout.scrollHeight > layout.height, description + " has scrollable overflow");
  assert.ok(layout.top >= layout.modalTop && layout.bottom <= layout.modalBottom, description + " stays within its dialog");
  await scrollList(page, list, engine);
  await page.waitForFunction((id) => document.getElementById(id).scrollTop > 0,
    await list.getAttribute("id"), { timeout: 2500 });
}

(async () => {
  const browserName = process.env.PLAYWRIGHT_BROWSER || "chromium";
  const engine = { chromium, webkit }[browserName];
  assert.ok(engine, `Unsupported browser ${browserName}`);
  const browser = await engine.launch({ headless: true });
  try {
    for (const width of [360, 390]) {
      // Playwright's WebKit runner supports wheel input only in a desktop context.
      const page = await browser.newPage({
        viewport: { width, height: 780 }, isMobile: engine === chromium, hasTouch: engine === chromium
      });
      await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style></head>
        <body class="dashboard-page client-dashboard-page"><section id="panel" class="client-workout-panel-custom"><button id="trigger">Add exercises</button></section></body></html>`);
      await page.addScriptTag({ path: path.join(root, "js/client-exercise-library.js") });
      await page.addScriptTag({ content: fixture });

      for (const format of ["single", "superset", "circuit"]) {
        await page.locator("#panel").evaluate((panel, value) => { panel.dataset.customWorkoutFormat = value; }, format);
        await page.locator("#trigger").click();
        const dialog = page.locator(".custom-workout-exercise-dialog");
        const search = dialog.locator("#custom-workout-picker-search");
        await search.evaluate((input) => input.blur());
        const list = dialog.locator("#custom-workout-picker-options");
        await assertListScrolls(page, list, "dialog", engine, format + " picker");

        await search.fill("Movement");
        await dialog.evaluate((element) => {
          element.style.setProperty("--picker-viewport-height", "375px");
          element.classList.add("is-keyboard-open");
        });
        await list.getByRole("option", { name: /Add .Movement. as custom/ }).waitFor();
        await list.evaluate((element) => { element.scrollTop = 0; });
        await assertListScrolls(page, list, "dialog", engine, format + " picker with keyboard");
        const shortcut = await dialog.locator(".custom-picker-quick-suggestions").boundingBox();
        const results = await list.boundingBox();
        assert.ok(results.y + results.height <= shortcut.y + 1, "Quick suggestions leave the results visible");

        if (format === "circuit" && width === 390) {
          for (let index = 0; index < 8; index += 1) {
            await list.locator("[data-custom-exercise-suggestion]").nth(index).click();
            const keepChoosing = page.getByRole("button", { name: "Keep choosing" });
            if (await keepChoosing.isVisible()) await keepChoosing.click();
          }
          await search.fill("Movement");
          await list.getByRole("option", { name: /Add .Movement. as custom/ }).waitFor();
          const tray = dialog.locator("[data-workout-picker-selected-list]");
          assert.ok(await tray.evaluate((element) => element.scrollHeight > element.clientHeight),
            "A long selection stays inside its scrollable tray");
          await list.evaluate((element) => { element.scrollTop = 0; });
          await assertListScrolls(page, list, "dialog", engine, "circuit picker with eight exercises selected");
        }

        await dialog.getByRole("button", { name: "Close exercise picker" }).click();
        await dialog.waitFor({ state: "detached" });
      }

      await page.locator("#trigger").click();
      await page.locator("#custom-workout-picker-search").evaluate((input) => input.blur());
      await page.getByRole("button", { name: "Browse full library" }).click();
      const library = page.locator("dialog.client-exercise-library");
      await assertListScrolls(page, library.locator("#client-exercise-library-results"), "dialog", engine, "Full library");
      await page.close();
      process.stdout.write(`${browserName} ${width}px: straight sets, superset, circuit, keyboard, and full library scroll\n`);
    }
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
