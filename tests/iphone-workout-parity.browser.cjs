// Mobile DOM fixture: no account, Supabase, external requests or production writes.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, webkit } = require("playwright");
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");
function fn(name) {
  const start = source.indexOf("function " + name + "(");
  assert.notEqual(start, -1, name);
  const end = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, end).replace(/\nasync\s*$/, "");
}
const functions = [
  "normalizedWorkoutRestChoice", "savedWorkoutRestDefault", "workoutRestSecondsForLogs",
  "workoutRestOptionsMarkup", "workoutCarouselRestSeconds", "workoutPreviewRestLabel",
  "readWorkoutElapsedTimerState", "workoutElapsedTimerIsStale", "cancelActiveWorkout",
  "finishWorkoutLater", "ensureExerciseMediaDialog", "renderExerciseMediaDialog",
  "openExerciseMedia", "openCustomWorkoutExerciseDialog", "configureAutoRestTimerPreference",
  "syncAutoRestTimerPreference"
].map(fn).join("\n");
const controls = `<input type="checkbox" data-auto-rest-timer checked><select data-default-workout-rest></select>
<div id="client-workout-tabs"></div><main id="panel" class="client-workout-panel client-workout-panel-custom">
<button id="picker">Add exercise</button><button data-workout-start data-workout-title="Fixture">Start</button>
<input data-workout-date value="2026-11-21"><div data-exercise-log data-exercise-code="CW01" data-exercise-rest="75 sec"></div>
<button id="finish" data-workout-finish-later>Finish later</button>
<select data-workout-rest-override><option value="">Default</option><option value="90">90 sec</option></select></main>
<button id="preview">View Incline Dumbbell Curl guide</button>`;
const stubs = `
const workoutRestOptions = Object.freeze([0,30,45,60,90,120,180,240,300]);
const autoRestTimerPreferenceStorageKey = "fixture-auto", workoutRestDefaultStorageKey = "fixture-default", workoutElapsedTimerStorageKey = "fixture-timer";
const workoutElapsedTimerMaximumMilliseconds = 86400000;
let workoutRestDefaultFallback = null, autoRestTimerPreferenceFallback = true, workoutElapsedTimerState = null, customWorkoutGroupedRestAction = null;
let clientPreviewProgramSelected = true, currentProgram = {workouts:[]};
let draft = {workoutTitle:"Fixture", date:"2026-11-21"};
const activeWorkoutLogSaves = new WeakMap(), customWorkoutGroupedLogQueues = new WeakMap();
const calls = { added: [], savedHistory: ["already-synced"], discarded: 0, paused: 0 };
const todayDate = () => "2026-11-21";
const escapeHtml = String;
const autoRestTimerEnabled = () => localStorage.getItem("fixture-auto") !== "false";
const approvedExerciseForName = name => name === "Incline Dumbbell Curl" ? { name, default_rest_seconds:60 } : null;
const trustedExerciseImageUrl = value => value || "";
const trustedExerciseMotionUrl = value => value || "";
const exerciseVideoUrl = () => "";
const isBrandedExerciseImage = () => false;
const exerciseMedia = () => ({ imageUrl: "/storage/v1/object/public/exercise-images/anatomy/2026-11-21/incline-dumbbell-curl.webp", instructions:"Curl and lower slowly" });
const WorkoutLayout = {label: String};
const normalizeCustomWorkoutFormat = () => "single";
const customWorkoutExerciseAddConfig = () => ({label:"Add exercise", count:1});
const customWorkoutCarousels = () => [];
const notifyCoachAboutCustomExercises = () => {};
const openCustomWorkoutExerciseEditor = () => {};
const renderCustomWorkoutPickerResults = dialog => {
  const menu = dialog.querySelector("[data-custom-exercise-suggestions]");
  menu.hidden = false;
  menu.innerHTML = ["Incline Dumbbell Curl","Barbell Curl"].map(name =>
    '<button type="button" data-custom-exercise-suggestion="' + name + '" aria-selected="' + dialog._pickerSelectedNames.includes(name) + '">' + name + '</button>'
  ).join("");
};
const addCustomWorkoutPickedExercises = (_panel, names) => { calls.added.push(...names); return _panel; };
const cancelTrainingLogAutosaves = () => {};
const workoutProgressionContext = () => ({});
const readCustomWorkoutDraft = () => draft;
const clearCustomWorkoutDraft = () => { draft = null; calls.discarded++; };
const persistWorkoutProgressionPending = () => {};
const persistCustomWorkoutDraftFromPanel = () => {};
const pauseWorkoutTimersForCompletion = () => { workoutElapsedTimerState.running=false; calls.paused++; persistWorkoutElapsedTimerState(); };
const persistWorkoutElapsedTimerState = () => {
  if (workoutElapsedTimerState) localStorage.setItem("fixture-timer", JSON.stringify(workoutElapsedTimerState));
};
const closeRestTimer = () => {};
const resetRestTimer = () => {};
const setRestTimerDuration = () => {};
const finishWorkoutElapsedTimer = () => { workoutElapsedTimerState=null; localStorage.removeItem("fixture-timer"); };
const renderClientWorkoutTabs = () => {};
const setClientDashboardTab = () => {};
const showClientWorkoutPicker = () => {};
const renderWorkoutResumeActions = () => {};
`;
async function check(engine, width, height) {
  const browser = await engine.launch(engine.name() === "chromium" && process.env.PLAYWRIGHT_CHANNEL
    ? { channel: process.env.PLAYWRIGHT_CHANNEL } : engine.name() === "webkit" && process.env.PLAYWRIGHT_WEBKIT_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_WEBKIT_EXECUTABLE } : {});
  try {
    const page = await browser.newPage({ viewport:{width,height}, hasTouch:true, isMobile:true });
    const unexpected = [];
    await page.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.hostname === "fixture.test" && url.pathname === "/") return route.fulfill({ contentType:"text/html", body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">' + controls });
      if (url.hostname === "fixture.test" && url.pathname.startsWith("/storage/v1/object/public/exercise-images/anatomy/"))
        return route.fulfill({ path: path.join(root, "supabase/storage-assets/exercise-images/anatomy/2026-11-21", path.basename(url.pathname)), contentType:"image/webp" });
      unexpected.push(url.href);
      return route.abort();
    });
    await page.goto("https://fixture.test/");
    await page.addStyleTag({path:path.join(root,"css/workout-layout.css")});
    await page.addScriptTag({ content: stubs + "\n" + functions + `
      document.querySelector("#preview").onclick = event => openExerciseMedia(event.currentTarget,{name:"Incline Dumbbell Curl",prescription:"3 × 12",rest:"75 sec"});
      document.querySelector("#picker").onclick = event => openCustomWorkoutExerciseDialog(event.currentTarget);
      document.querySelector("#finish").onclick = event => finishWorkoutLater(event.currentTarget);
      document.addEventListener("click", event => { if(event.target.closest("[data-exercise-media-close]")) event.target.closest("dialog").close(); });
      configureAutoRestTimerPreference();
      window.fixture = {
        calls,
        load: () => (workoutElapsedTimerState=readWorkoutElapsedTimerState()),
        start(override) {workoutElapsedTimerState={clientEmail:"fixture@example.test", workoutTitle:"Fixture",workoutDate:"2026-11-21",startedAt:Date.now(),running:true,restTimerOverrides:override}; persistWorkoutElapsedTimerState();},
        rest: () => workoutRestSecondsForLogs([document.querySelector("[data-exercise-log]")]),
        discard: () => cancelActiveWorkout(),
        setSaving(active) {const panel=document.querySelector("#panel"); if(active) activeWorkoutLogSaves.set(panel, 1); else activeWorkoutLogSaves.delete(panel); }
      };
    `});
    await page.getByRole("button",{name:"View Incline Dumbbell Curl guide"}).tap();
    const guide=page.getByRole("dialog",{name:"Incline Dumbbell Curl"});
    await guide.getByText("3 × 12 · Rest 75 sec",{exact:false}).waitFor();
    await page.waitForFunction(() => document.querySelector("[data-exercise-media-stage] img")?.naturalWidth > 0);
    await guide.getByRole("button",{name:"Close exercise guide"}).tap();
    assert.equal(await guide.isVisible(),false);
    assert.equal(await page.evaluate(() => localStorage.getItem("fixture-timer")),null,"guide does not start logging");
    await page.locator("#picker").tap();
    await page.locator('[data-picker-chip="biceps"]').tap();
    await page.getByRole("button",{name:"Incline Dumbbell Curl",exact:true}).tap();
    await page.getByRole("button",{name:"Barbell Curl",exact:true}).tap();
    assert.equal(await page.locator('[data-picker-chip="biceps"]').getAttribute("aria-pressed"),"true");
    assert.deepEqual(await page.evaluate(() => fixture.calls.added),[]);
    await page.getByRole("button",{name:"Add 2 exercises",exact:true}).tap();
    await page.getByRole("button",{name:"Keep choosing"}).tap();
    await page.getByRole("button",{name:"Add 2 exercises",exact:true}).tap();
    await page.getByRole("button",{name:"Add to workout",exact:true}).tap();
    assert.deepEqual(await page.evaluate(() => fixture.calls.added),["Incline Dumbbell Curl","Barbell Curl"]);
    await page.locator("[data-default-workout-rest]").selectOption("0");
    assert.equal(await page.evaluate(() => fixture.rest()),0);
    await page.evaluate(() => fixture.start({CW01:45}));
    await page.locator("[data-workout-rest-override]").selectOption("90");
    await page.locator("#finish").tap();
    let restored = await page.evaluate(() => fixture.load());
    assert.equal(restored.running,false);
    assert.equal(restored.restTimerOverride,90);
    assert.equal(restored.restTimerOverrides.CW01,45);
    assert.equal(await page.evaluate(() => fixture.rest()),45);
    await page.evaluate(() => fixture.setSaving(true));
    page.once("dialog", d=>{assert.equal(d.type(), "alert"); return d.dismiss();});
    await page.evaluate(() => fixture.discard());
    assert.equal(await page.evaluate(() => fixture.calls.discarded),0);
    await page.evaluate(() => fixture.setSaving(false));
    page.once("dialog", d=>d.dismiss());
    await page.evaluate(() => fixture.discard());
    assert.equal(await page.evaluate(() => fixture.calls.discarded),0);
    page.once("dialog", d=>d.accept());
    await page.evaluate(() => fixture.discard());
    assert.equal(await page.evaluate(() => fixture.calls.discarded),1);
    assert.deepEqual(await page.evaluate(() => fixture.calls.savedHistory),["already-synced"]);
    assert.equal(await page.evaluate(() => fixture.rest()),0);
    assert.deepEqual(unexpected,[]);
    console.log(engine.name() + " " + width + "×" + height + ": passed");
  } finally { await browser.close(); }
}
(async () => {
  await check(chromium, 393, 873);
  await check(webkit, 390, 844);
})().catch(error => { console.error(error); process.exitCode = 1; });
