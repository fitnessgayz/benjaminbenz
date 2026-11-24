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
const trainingLogs = [{ exercise_name: "Movement 01" }], muscleMeta = {};
const exerciseNameMatcher = { normalizeName: (value) => value.trim().toLowerCase() };
function escapeHtml(value) { return String(value ?? ""); }
function customWorkoutExerciseAddConfig(format) {
  return { count: format === "circuit" ? 3 : format === "superset" ? 2 : 1, label: "Add exercise", hint: "" };
}
function normalizeCustomWorkoutFormat(format) { return format || "single"; }
function customWorkoutCarousels() { return []; }
function exerciseSuggestionRecords() {
  return [...Array.from({ length: 24 }, (_, index) => ({
    name: "Movement " + String(index + 1).padStart(2, "0"),
    libraryEntry: { equipment: "dumbbell", primary_muscle: "chest" }
  })), {
    name: "Dumbbell Rear-Foot-Elevated Split Squat With Contralateral Hold",
    libraryEntry: { equipment: "dumbbell", primary_muscle: "quads" }
  }];
}
function exerciseSuggestionMuscleLabel(entry) { return entry.primary_muscle; }
function customExerciseSuggestionMatches() { return []; }
function trustedExerciseImageUrl() { return ""; }
function openClientExerciseLibrary(input, onSelect) {
  window.FWB_CLIENT_EXERCISE_LIBRARY.open({ records: exerciseSuggestionRecords(), initialQuery: input.value, onSelect });
}
function addCustomWorkoutPickedExercises(panel, names) {
  const output = document.createElement("output");
  output.dataset.addedExercises = "";
  output.textContent = names.join(", ");
  panel.append(output);
  return output;
}
function renderCustomWorkoutInlineCardio(panel) {
  const cardio = document.createElement("div");
  cardio.dataset.cardioLog = "";
  cardio.innerHTML = '<input data-cardio-type aria-label="Cardio type">';
  panel.append(cardio);
  return cardio;
}
function notifyCoachAboutCustomExercises() {}
function startCustomWorkoutOnEntry() {}
function persistCustomWorkoutDraftFromPanel() {}
function openCustomWorkoutExerciseEditor() {}
const realViewport = window.visualViewport;
const testViewport = new EventTarget();
let viewportOverride;
Object.defineProperties(testViewport, {
  height: { get: () => viewportOverride?.height ?? realViewport.height },
  offsetTop: { get: () => viewportOverride?.top ?? realViewport.offsetTop }
});
Object.defineProperty(window, "visualViewport", { value: testViewport });
window.setPickerVisibleViewport = (override) => {
  viewportOverride = override;
  testViewport.dispatchEvent(new Event("resize"));
  testViewport.dispatchEvent(new Event("scroll"));
};
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
  assert.ok(layout.height >= 32 && layout.scrollHeight > layout.height,
    `${description} has scrollable overflow: ${JSON.stringify(layout)}`);
  assert.ok(layout.top >= layout.modalTop && layout.bottom <= layout.modalBottom, description + " stays within its dialog");
  await scrollList(page, list, engine);
  await page.waitForFunction((id) => document.getElementById(id).scrollTop > 0,
    await list.getAttribute("id"), { timeout: 2500 });
}

async function mountPicker(page) {
  await page.setContent(`<!doctype html><html><head>
    <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${styles}</style></head>
    <body class="dashboard-page client-dashboard-page"><section id="panel" class="client-workout-panel-custom">
      <input id="workout-draft" aria-label="Workout notes"><button id="trigger">Add exercises</button>
    </section></body></html>`);
  await page.addScriptTag({ path: path.join(root, "js/client-exercise-library.js") });
  await page.addScriptTag({ content: fixture });
}

async function assertFullScreen(dialog, { width, height, top = 0 }) {
  const bounds = await dialog.boundingBox();
  for (const [edge, expected] of Object.entries({ x: 0, y: top, width, height })) {
    assert.ok(Math.abs(bounds[edge] - expected) <= 1, `${edge}: ${bounds[edge]} should be ${expected}`);
  }
  assert.equal(await dialog.evaluate((element) => getComputedStyle(element).borderRadius), "0px");
}

async function measureResultRow(row) {
  return row.evaluate((element) => {
    const { height } = element.getBoundingClientRect();
    const thumbnail = element.querySelector(".custom-picker-image").getBoundingClientRect();
    const add = element.querySelector(".custom-picker-add").getBoundingClientRect();
    return { height, thumbnail: [thumbnail.width, thumbnail.height], add: [add.width, add.height] };
  });
}

async function assertCompactRow(list) {
  const row = list.getByRole("option", { name: "Movement 01 Chest" });
  const size = await measureResultRow(row);
  assert.deepEqual(size, { height: 54, thumbnail: [40, 40], add: [44, 44] });
  return size.height;
}

async function assertPickerActions(page, viewport) {
  const trigger = page.locator("#trigger");
  const draft = page.locator("#workout-draft");
  const dialog = page.locator(".custom-workout-exercise-dialog");
  const search = dialog.locator("#custom-workout-picker-search");
  const list = dialog.getByRole("listbox");
  const cancel = dialog.getByRole("button", { name: "Close exercise picker" });
  await draft.fill("Keep this draft");
  const workoutScroll = await page.evaluate(() => {
    const panel = document.getElementById("panel");
    Object.assign(panel.style, { marginTop: "360px", minHeight: "130vh" });
    window.scrollTo({ top: 300, behavior: "instant" });
    return window.scrollY;
  });
  assert.ok(workoutScroll > 0);
  await trigger.click();
  await assertFullScreen(dialog, viewport);
  assert.ok(await cancel.evaluate((button) => button === document.activeElement), "The picker opens before the keyboard");
  await dialog.getByRole("button", { name: "Recent" }).click();
  assert.equal(await list.getByRole("option").count(), 1);
  await dialog.getByRole("button", { name: "All", exact: true }).click();
  const equipment = dialog.getByLabel("Filter by equipment");
  const muscle = dialog.getByLabel("Filter by muscle");
  await equipment.selectOption("barbell");
  assert.equal(await list.getByRole("option").count(), 0);
  await equipment.selectOption("dumbbell");
  await muscle.selectOption("back");
  assert.equal(await list.getByRole("option").count(), 0);
  await muscle.selectOption("chest");
  await search.fill("Movement 24");
  await list.getByRole("option", { name: "Movement 24 Chest" }).click();
  await dialog.getByRole("button", { name: "Add exercise", exact: true }).click();
  await page.getByRole("button", { name: "Keep choosing" }).click();
  await cancel.click();
  await dialog.waitFor({ state: "detached" });
  assert.ok(await trigger.evaluate((button) => button === document.activeElement), "Cancel restores focus to the workout");
  assert.equal(await draft.inputValue(), "Keep this draft");
  assert.equal(await page.evaluate(() => window.scrollY), workoutScroll);
  assert.equal(await page.locator("[data-added-exercises]").count(), 0);

  await trigger.click();
  const row = list.getByRole("option", { name: "Movement 01 Chest" });
  const addTarget = row.locator(".custom-picker-add");
  assert.equal(await addTarget.textContent(), "+");
  await addTarget.click();
  assert.equal(await row.getAttribute("aria-selected"), "true");
  assert.equal(await addTarget.textContent(), "Selected");
  const selectedSize = await measureResultRow(row);
  assert.equal(selectedSize.height, 54);
  assert.ok(selectedSize.add.every((size) => size >= 44));
  await dialog.getByRole("button", { name: "Add exercise", exact: true }).click();
  await page.getByRole("button", { name: "Add to workout" }).click();
  await dialog.waitFor({ state: "detached" });
  assert.equal(await page.locator("[data-added-exercises]").textContent(), "Movement 01");
  assert.equal(await draft.inputValue(), "Keep this draft");

  await trigger.click();
  await search.fill("Movement");
  await page.evaluate(() => window.setPickerVisibleViewport({ height: 210, top: 24 }));
  await assertFullScreen(dialog, { width: viewport.width, height: 210, top: 24 });
  const cardio = dialog.getByRole("button", { name: "Add cardio" });
  const browse = dialog.getByRole("button", { name: "Browse full library" });
  await browse.scrollIntoViewIfNeeded();
  assert.ok(await browse.evaluate((button) => {
    const { x, y, width, height } = button.getBoundingClientRect();
    return button.contains(document.elementFromPoint(x + width / 2, y + height / 2));
  }), "The library shortcut can be reached while typing in a short viewport");
  await browse.click();
  await page.getByRole("button", { name: "Close exercise library" }).click();
  await cardio.click();
  await dialog.waitFor({ state: "detached" });
  assert.ok(await page.getByLabel("Cardio type").evaluate((input) => input === document.activeElement));
  assert.equal(await draft.inputValue(), "Keep this draft");
}

(async () => {
  const browserName = process.env.PLAYWRIGHT_BROWSER || "chromium";
  const engine = { chromium, webkit }[browserName];
  assert.ok(engine, `Unsupported browser ${browserName}`);
  const browser = await engine.launch({ headless: true });
  try {
    for (const viewport of [{ width: 360, height: 780 }, { width: 390, height: 844 }]) {
      const { width } = viewport;
      // Playwright's WebKit runner supports wheel input only in a desktop context.
      const page = await browser.newPage({
        viewport, isMobile: engine === chromium, hasTouch: engine === chromium
      });
      await mountPicker(page);

      for (const format of ["single", "superset", "circuit"]) {
        await page.locator("#panel").evaluate((panel, value) => { panel.dataset.customWorkoutFormat = value; }, format);
        await page.locator("#trigger").click();
        const dialog = page.locator(".custom-workout-exercise-dialog");
        const search = dialog.locator("#custom-workout-picker-search");
        await assertFullScreen(dialog, viewport);
        const list = dialog.locator("#custom-workout-picker-options");
        const restingRowHeight = await assertCompactRow(list);
        if (format === "single" && width === 360) {
          const longRow = list.getByRole("option", { name: /Rear-Foot-Elevated Split Squat/ });
          assert.ok(await longRow.locator("strong").evaluate((title) => {
            const lineHeight = parseFloat(getComputedStyle(title).lineHeight);
            return title.getBoundingClientRect().height >= lineHeight * 2 - 1 && title.scrollWidth <= title.clientWidth;
          }), "Long exercise names wrap on narrow phones");
          assert.equal(await longRow.locator("small").textContent(), "Quads");
          assert.ok((await measureResultRow(longRow)).height > restingRowHeight);
        }
        await assertListScrolls(page, list, "dialog", engine, format + " picker");

        await search.fill("Movement");
        await page.evaluate(() => window.setPickerVisibleViewport({ height: 375, top: 0 }));
        await assertFullScreen(dialog, { width, height: 375 });
        await list.getByRole("option", { name: /Add .Movement. as custom/ }).waitFor();
        const keyboardRowHeight = await assertCompactRow(list);
        if (format === "single") {
          process.stdout.write(`${browserName} ${width}px picker row: ${restingRowHeight}px resting, ${keyboardRowHeight}px with keyboard\n`);
        }
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
        await page.evaluate(() => window.setPickerVisibleViewport(null));
      }

      await page.locator("#trigger").click();
      await page.locator("#custom-workout-picker-search").evaluate((input) => input.blur());
      await page.getByRole("button", { name: "Browse full library" }).click();
      const library = page.locator("dialog.client-exercise-library");
      await assertListScrolls(page, library.locator("#client-exercise-library-results"), "dialog", engine, "Full library");
      await page.close();
      process.stdout.write(`${browserName} ${width}×${viewport.height}: straight sets, superset, circuit, keyboard, and full library scroll\n`);
    }

    const viewport = engine === chromium ? { width: 412, height: 915 } : { width: 956, height: 440 };
    const mobile = await browser.newPage({ viewport, isMobile: true, hasTouch: true });
    mobile.setDefaultTimeout(5000);
    await mountPicker(mobile);
    if (engine === chromium) {
      const session = await mobile.context().newCDPSession(mobile);
      await session.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 42, bottom: 32, left: 20, right: 16 } });
      await mobile.locator("#trigger").click();
      const dialog = mobile.locator(".custom-workout-exercise-dialog");
      assert.equal(await dialog.evaluate((element) => getComputedStyle(element).padding), "52px 30px 42px 34px");
      await dialog.getByRole("button", { name: "Close exercise picker" }).click();
      await dialog.waitFor({ state: "detached" });
    }
    await assertPickerActions(mobile, viewport);
    await mobile.close();
    process.stdout.write(`${browserName} ${viewport.width}×${viewport.height}: full-screen actions, focus, and draft preservation\n`);

    const desktop = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    await mountPicker(desktop);
    await desktop.locator("#trigger").click();
    const dialog = desktop.locator(".custom-workout-exercise-dialog");
    const bounds = await dialog.boundingBox();
    assert.deepEqual(bounds, { x: 360, y: 6, width: 560, height: 848 });
    assert.deepEqual(await measureResultRow(dialog.getByRole("option", { name: "Movement 01 Chest" })), {
      height: 70, thumbnail: [56, 56], add: [30, 30]
    });
    assert.ok(await dialog.getByLabel("Search exercises").evaluate((input) => input === document.activeElement));
    await desktop.close();
    process.stdout.write(`${browserName} 1280×860: existing desktop layout and search focus\n`);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
