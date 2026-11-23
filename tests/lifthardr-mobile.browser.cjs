const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, webkit } = require("playwright");

const root = path.join(__dirname, "..");
const portal = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");
const dashboard = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8")
  .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "");
const mime = { ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp" };
const origin = "https://lifthardr.fixture.test";
const exerciseAssets = "/supabase/storage-assets/exercise-images/approved/2026-11-12";
const exerciseStill = `${exerciseAssets}/webp-768/hip-thrust-machine-benjamin.webp`;
const exerciseMotion = `${exerciseAssets}/motion-webp/hip-thrust-machine-benjamin.webp`;
const publicStorage = "/storage/v1/object/public/";
const inlineStill = `${publicStorage}exercise-images/anatomy/2026-11-21/hip-thrust-machine.webp`;
const inlineMotion = `${publicStorage}exercise-images/approved/2026-11-21/motion-webp/hip-thrust-machine-anatomy.webp`;

function production(name) {
  const start = portal.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}`);
  const tail = portal.slice(start);
  const end = tail.slice(1).search(/\n(?:async )?function /);
  return end < 0 ? tail : tail.slice(0, end + 1);
}

const router = [
  "syncClientDashboardMobileNavigationIcon", "syncClientDashboardMobileNavigationMount",
  "setClientDashboardMobileNavigationExpanded", "clientDashboardMobileTabPressAction",
  "clientDashboardNavigationTab", "setClientDashboardTab", "handleClientDashboardTabs"
].map(production).join("\n");

async function checkPickerNames(page) {
  await page.addScriptTag({ path: path.join(root, "js/client-exercise-library.js") });
  const picker = [
    "isBrandedExerciseImage", "customWorkoutExerciseAddConfig", "renderCustomWorkoutPickerResults",
    "addCustomWorkoutPickedExercises", "openCustomWorkoutExerciseDialog",
    ...Array.from(portal.matchAll(/^function (customWorkoutPicker\w+)\(/gm), match => match[1])
  ].map(production).join("\n");
  await page.addScriptTag({ content: `
    const trainingLogs = [], muscleMeta = {}, currentProgram = null, exerciseNameMatcher = null;
    const escapeHtml = String;
    const normalizeCustomWorkoutFormat = value => value;
    const exerciseSuggestionRecords = () => [
      { name: "Incline Dumbbell Press", libraryEntry: { primary_muscle: "chest", equipment: "dumbbell" } },
      { name: "Cable Row", libraryEntry: { primary_muscle: "back", equipment: "cable" } }
    ];
    const exerciseSuggestionMuscleLabel = entry => entry.primary_muscle;
    const customExerciseSuggestionMatches = () => [];
    const trustedExerciseImageUrl = () => "";
    const notifyCoachAboutCustomExercises = () => {};
    const startCustomWorkoutOnEntry = () => {};
    const openCustomWorkoutExerciseEditor = () => {};
    function addCustomWorkoutPickedExercise(panel, name) {
      const card = document.createElement("article");
      card.dataset.fixtureSavedName = name;
      panel.append(card);
      return card;
    }
    ${picker}
    const panel = document.createElement("section");
    panel.id = "fixture-workout";
    panel.className = "client-workout-panel-custom";
    panel.dataset.customWorkoutFormat = "single";
    panel.innerHTML = '<button type="button" id="fixture-add-exercise">Add an exercise</button>';
    document.body.append(panel);
  ` });
  for (const choice of ["click", "keyboard"]) {
    await page.evaluate(() => openCustomWorkoutExerciseDialog(document.getElementById("fixture-add-exercise")));
    const picker = page.getByRole("dialog", { name: "Add exercise" });
    const search = picker.getByRole("textbox", { name: "Search exercises" });
    await search.fill("Incline Bench Press (Dumbbell)");
    await picker.getByText("Search results · 1", { exact: true }).waitFor({ state: "attached" });
    const result = picker.getByRole("option", { name: /Incline Bench Press \(Dumbbell\)/ });
    await result.waitFor();
    assert.equal(await result.getAttribute("data-custom-exercise-suggestion"), "Incline Dumbbell Press");
    assert.equal(await picker.locator("[data-workout-picker-queue-typed]").count(), 0);
    if (choice === "click") await result.click();
    else await search.press("Enter");
    await picker.locator('[data-custom-exercise-suggestion="Cable Row"]').click();
    const pickerSummary = picker.locator("[data-workout-picker-selected-list]");
    assert.equal(await pickerSummary.locator(".is-filled").count(), 2);
    assert.equal(await page.getByRole("button", { name: "Add to workout", exact: true }).count(), 0);
    await picker.locator("[data-workout-picker-remove]").first().click();
    assert.equal(await picker.getByRole("option", { name: /Incline Bench Press \(Dumbbell\)/ }).getAttribute("aria-selected"), "false");
    await picker.getByRole("option", { name: /Incline Bench Press \(Dumbbell\)/ }).click();
    await picker.getByRole("button", { name: "Add 2 exercises", exact: true }).click();
    await page.getByRole("button", { name: "Add to workout", exact: true }).click();
    await picker.waitFor({ state: "detached" });
    const savedNames = await page.locator("#fixture-workout [data-fixture-saved-name]")
      .evaluateAll(cards => cards.map(card => card.dataset.fixtureSavedName));
    assert.deepEqual(savedNames.slice(-2), ["Cable Row", "Incline Dumbbell Press"]);
  }
}

async function checkInlineMotion(page) {
  const requests = [];
  page.on("request", request => {
    if (request.url() === origin + inlineMotion) requests.push(request);
  });
  const methods = [
    "approvedExerciseForName", "trustedExerciseImageUrl", "trustedExerciseMotionUrl", "responsiveExerciseImageUrls",
    "exerciseMedia", "isBrandedExerciseImage", "exerciseMediaButtonMarkup", "stopInlineExerciseMotion",
    "stopInlineExerciseMotions", "toggleInlineExerciseMotion", "exerciseImageMarkup", "ensureExerciseMediaDialog",
    "renderExerciseMediaDialog", "openExerciseMedia", "customWorkoutGroupedSectionsMarkup", "handleWorkoutInteractions"
  ].map(production).join("\n");
  await page.addScriptTag({ content: `
    (() => {
      window.FWB_SUPABASE_CONFIG = { url: location.origin };
      const exerciseName = "Hip Thrust Machine", still = location.origin + ${JSON.stringify(inlineStill)};
      const motion = location.origin + ${JSON.stringify(inlineMotion)};
      const exerciseNameMatcher = null, isCoachDashboardPreview = false;
      const exerciseLibraryEntries = [
        { name: exerciseName, image_url: still, motion_url: motion, instructions: "Use both poses as a reference." },
        { name: "Unapproved animation", image_url: still, motion_url: "https://unapproved.fixture.test/hip-thrust.webp" },
        { name: "Missing animation", image_url: still, motion_url: motion.replace("hip-thrust-machine-anatomy", "missing") }
      ];
      const log = { dataset: {}, querySelector: () => null };
      const customWorkoutGroupedLogElements = () => [log], currentExerciseLabel = () => exerciseName;
      const customWorkoutGroupedRows = () => [], exerciseLibraryMetaLabel = () => "", exerciseVideoUrl = () => "";
      const selectedWorkoutExerciseRestSeconds = () => null, workoutExerciseRestOptions = [0];
      const workingSetType = "working", warmUpSetType = "warm_up", escapeHtml = String;
      ${methods}
      const grouped = document.createElement("section");
      grouped.dataset.customWorkoutGrouped = "true";
      grouped.innerHTML = customWorkoutGroupedSectionsMarkup({ dataset: {}, closest: () => null });
      const straight = document.createElement("section");
      straight.innerHTML = exerciseImageMarkup({ name: "Unapproved animation" }, { inlineMotion: true })
        + exerciseImageMarkup({ name: "Missing animation" }, { inlineMotion: true });
      document.querySelector("#client-workout-panels").append(grouped, straight);
      window.stopInlineExerciseMotions = stopInlineExerciseMotions;
      handleWorkoutInteractions();
      setClientDashboardTab("workouts", { fromHistory: true });
    })();
  ` });
  const grouped = page.locator(".ios-log-exercise-image");
  const still = grouped.locator("[data-exercise-media-open] img");
  await still.evaluate(image => image.decode());
  assert.equal(await still.getAttribute("src"), origin + inlineStill);
  const size = await grouped.boundingBox();
  const play = grouped.getByRole("button", { name: "Play animation for Hip Thrust Machine" });
  assert.equal((await play.boundingBox()).height, 44);
  assert.equal(requests.length, 0, "animation stays unloaded until Play");
  await play.click();
  const animation = grouped.locator(".exercise-inline-motion-image");
  await animation.waitFor();
  assert.equal(await animation.getAttribute("src"), origin + inlineMotion);
  await animation.evaluate(image => image.decode());
  const playingSize = await grouped.boundingBox();
  assert.deepEqual([playingSize.width, playingSize.height], [size.width, size.height]);
  await grouped.getByRole("button", { name: "Pause animation for Hip Thrust Machine" }).click();
  assert.equal(await animation.count(), 0);
  assert.equal(await still.isVisible(), true);
  await play.click();
  await animation.waitFor();
  await page.evaluate(() => setClientDashboardTab("home", { fromHistory: true }));
  assert.equal(await animation.count(), 0);
  await page.evaluate(() => setClientDashboardTab("workouts", { fromHistory: true }));

  await grouped.getByRole("button", { name: "Open Hip Thrust Machine exercise card and instructions" }).click();
  const guide = page.getByRole("dialog", { name: "Hip Thrust Machine" });
  assert.equal(await guide.isVisible(), true);
  await guide.getByRole("button", { name: "Close exercise guide" }).click();
  assert.equal(await page.getByRole("button", { name: "Play animation for Unapproved animation" }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Open Unapproved animation exercise card and instructions" }).isVisible(), true);
  await page.getByRole("button", { name: "Play animation for Missing animation" }).click();
  await page.getByText("The animation couldn’t load.", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Open Missing animation exercise card and instructions" }).isVisible(), true);
}

async function check(engine, label, width) {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === "/client-dashboard.html") return route.fulfill({ contentType: "text/html", body: dashboard });
      const localPath = url.pathname.startsWith(publicStorage)
        ? url.pathname.replace(publicStorage, "/supabase/storage-assets/")
        : url.pathname;
      const filename = path.join(root, localPath);
      const contentType = mime[path.extname(filename)];
      if (!contentType || !fs.existsSync(filename)) return route.abort();
      return route.fulfill({ contentType, path: filename });
    });
    await page.goto(`${origin}/client-dashboard.html`);
    await page.addScriptTag({ path: path.join(root, "js/lifthardr-profile.js") });
    await page.addScriptTag({ path: path.join(root, "js/client-community.js") });
    await page.addScriptTag({ content: `
      let activeClientDashboardTab = "home", clientWorkoutPickerIsOpen = true, savedWorkoutScrollY = null;
      let clientWebNotificationController = null, clientProfilePhotoController = null;
      let clientAppleHealthController = null, clientGoogleHealthController = null;
      let lastClientDashboardMobileTabPress = "";
      function flushScheduledClientTrainingLogsRender() {}
      function applyWorkoutElapsedTimerPosition() {}
      function maybeShowClientHomeCheckinPrompt() {}
      function setClientSettingsView(name) { document.body.dataset.settingsView = name; }
      ${router}
      document.getElementById("dashboard-loading").hidden = true;
      document.getElementById("dashboard-content").hidden = false;
      document.body.classList.remove("is-loading");
      syncClientDashboardMobileNavigationMount();
      setClientDashboardMobileNavigationExpanded(true);
      handleClientDashboardTabs();
      FWB_LIFTHARDR_PROFILE.render({
        name: "Preview client", status: "ready", today: "2026-11-20",
        logs: [{ entry_date: "2026-11-19", workout_title: "Training", workout_duration_seconds: 1200, reps: 8, weight_used: 100 }],
        achievements: { badges: [{ unlocked: true, title: "First Spark", id: "workout-1", earnedOn: "2026-11-19" }] },
        sessionKey: row => row.workout_title, isWorkingSet: () => true
      });
    ` });
    assert.equal(await page.title(), "GRUNTR");
    const homeHeading = page.getByRole("heading", { name: "GRUNTR Home" });
    assert.equal(await homeHeading.isVisible(), true);
    const logo = homeHeading.locator("img");
    assert.equal(await logo.getAttribute("src"), "/images/gruntr/icon-192.png");
    await logo.evaluate((image) => image.decode());
    assert.equal(await logo.evaluate((image) => image.naturalWidth), 192);
    const dock = page.locator(".client-dashboard-tabs");
    assert.equal(await dock.evaluate(node => node.parentElement.tagName), "BODY");
    assert.deepEqual(await dock.locator("[data-client-dashboard-tab]").evaluateAll(nodes => nodes.map(node => node.getAttribute("aria-label"))),
      ["Home", "Workout", "Social", "Profile"]);
    const chrome = await dock.evaluate(node => {
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return { left: box.left, right: box.right, bottom: box.bottom, position: style.position, color: style.backgroundColor };
    });
    assert.equal(chrome.position, "fixed");
    assert.ok(chrome.left > 0 && chrome.right < width && chrome.bottom < 844);
    assert.match(chrome.color, /rgba\(36, 40, 46, 0\.93\)/);
    await dock.getByRole("button", { name: "Profile", exact: true }).click();
    const profile = page.locator('[data-client-dashboard-panel="profile"]');
    assert.equal(await profile.isVisible(), true);
    assert.equal(await profile.locator("[data-lifthardr-profile-name]").textContent(), "Preview client");
    const snapshotSummary = profile.locator("summary").filter({ hasText: "Training Snapshot" });
    assert.match(await snapshotSummary.textContent(), /20 min/);
    await snapshotSummary.click();
    await profile.getByRole("button", { name: "Volume", exact: true }).click();
    assert.match(await profile.locator("[data-lifthardr-profile-week-value]").textContent(), /800 lb/);
    await profile.getByRole("button", { name: /Badges earned/i }).click();
    assert.match(await profile.locator("[data-lifthardr-profile-badges]").textContent(), /First Spark/);
    await profile.getByRole("button", { name: "Done", exact: true }).click();
    await profile.getByRole("button", { name: "Settings", exact: true }).click();
    assert.equal(await page.locator('[data-client-dashboard-panel="notifications"]').isVisible(), true);
    assert.equal(await dock.getByRole("button", { name: "Profile", exact: true }).getAttribute("aria-current"), "page");
    await page.locator('[data-client-dashboard-panel="notifications"] [data-client-profile-back]').click();
    assert.equal(await profile.isVisible(), true);
    await profile.getByRole("button", { name: "0 Squad members", exact: true }).click();
    const social = page.locator('[data-client-dashboard-panel="community"]');
    assert.equal(await social.getByRole("heading", { name: "Manage Squad", exact: true }).isVisible(), true);
    await social.getByRole("button", { name: "Back to Social", exact: true }).click();
    assert.equal(await social.getByRole("button", { name: "Manage Squad", exact: true }).isVisible(), true);
    await dock.getByRole("button", { name: "Home", exact: true }).click();
    await page.getByRole("button", { name: "Open notifications" }).click();
    assert.equal(await page.locator("body").getAttribute("data-settings-view"), "notifications");
    await page.addScriptTag({ path: path.join(root, "js/client-exercise-history-detail.js") });
    await page.evaluate(({ imageUrl, motionUrl }) => {
      window.FWB_CLIENT_EXERCISE_HISTORY_DETAIL.open("Hip Thrust Machine", null, {
        imageUrl, motionUrl, instructions: "Use the start and end positions as reference."
      });
    }, { imageUrl: exerciseStill, motionUrl: exerciseMotion });
    const guideDialog = page.getByRole("dialog", { name: "Hip Thrust Machine" });
    await guideDialog.getByRole("button", { name: "How to" }).click();
    const still = guideDialog.getByAltText("Hip Thrust Machine start and end positions");
    await still.waitFor({ state: "visible" });
    await guideDialog.getByRole("button", { name: "Play animation" }).click();
    const animation = guideDialog.getByAltText("Hip Thrust Machine exercise demonstration");
    assert.equal(await animation.getAttribute("src"), `${origin}${exerciseMotion}`);
    await animation.evaluate(image => image.decode());
    assert.equal(await still.isVisible(), false);
    await guideDialog.getByRole("button", { name: "Pause animation" }).click();
    assert.equal(await animation.count(), 0);
    assert.equal(await still.isVisible(), true);
    await guideDialog.getByRole("button", { name: "Close exercise details" }).click();

    await page.evaluate(imageUrl => {
      window.FWB_CLIENT_EXERCISE_HISTORY_DETAIL.open("Hip Thrust Machine", null, {
        imageUrl, motionUrl: "/missing-motion.webp"
      });
    }, exerciseStill);
    await guideDialog.getByRole("button", { name: "How to" }).click();
    await guideDialog.getByRole("button", { name: "Play animation" }).click();
    await guideDialog.getByText("The animation couldn’t load.").waitFor();
    assert.equal(await still.isVisible(), true);
    await guideDialog.getByRole("button", { name: "Close exercise details" }).click();
    await checkPickerNames(page);
    const screenshot = process.env.LIFTHARDR_SCREENSHOT_DIR;
    if (screenshot) {
      await dock.getByRole("button", { name: "Profile", exact: true }).click();
      await page.screenshot({ path: path.join(screenshot, `lifthardr-profile-${label}.png`) });
    }
    await checkInlineMotion(page);
    console.log(`${label} ${width}px: dock, profile, Squad, notifications, exercise guide, picker names, and inline motion passed`);
  } finally {
    await browser.close();
  }
}

(async () => {
  await check(chromium, "android-chromium", 360);
  await check(webkit, "iphone-webkit", 390);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
