// Mobile integration fixture. Browser requests are restricted to local checked-in cover art.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, webkit } = require("playwright");
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");
const functions = [
  "customExerciseCode", "workoutDisplayTitle", "generatedCustomWorkoutDraft", "benjaminRoutineDraft",
  "useGeneratedClientWorkout", "customWorkoutCopyStatusMessage", "customWorkoutPanelDraft",
  "benjaminRoutineCoverMarkup", "benjaminRoutineCollectionMarkup", "benjaminRoutineSessionMarkup",
  "handleBenjaminRoutineChoice", "clientWorkoutListMarkup"
].map((name) => {
  const start = source.indexOf("function " + name + "(");
  assert.notEqual(start, -1, name);
  return source.slice(start, source.indexOf("\nfunction ", start + 1)).replace(/\nasync\s*$/, "");
}).join("\n");
const stubs = `
let currentProgram = { id:"fixture",workouts:[] };
const clientAvailablePrograms = [];
let clientPreviewProgramSelected = false, workoutElapsedTimerState = null, activeCustomWorkoutFormat = "single";
const customWorkoutTitle = "Custom workout", customWorkoutDraftVersion = 2, workingSetType = "working", warmUpSetType = "warmup";
const activeWorkoutLogSaves = new WeakMap(), customWorkoutGroupedLogQueues = new WeakMap();
const calls = { writes:0, started:0, guide:null };
let savedDefault = 0;
const todayDate = () => "2026-11-21";
const escapeHtml = value => String(value ?? "").replaceAll("&","&amp;").replaceAll('"',"&quot;").replaceAll("<","&lt;");
const savedWorkoutRestDefault = () => savedDefault;
const autoRestTimerEnabled = () => true;
const openExerciseMedia = (control, exercise) => { calls.guide = exercise; const dialog = document.querySelector("dialog"); dialog.showModal(); dialog.addEventListener("close", () => control.focus(), {once:true}); };
const clientWorkoutChoiceContent = ({title, titleId, description, descriptionId}) => '<strong id="' + titleId + '">' + title + '</strong><span id="' + descriptionId + '">' + description + '</span>';
const clientWorkoutChoiceDialogMarkup = () => "";
const activeCustomWorkoutDraft = () => JSON.parse(localStorage.getItem("fixture-draft"));
const storeCustomWorkoutDraft = value => { calls.writes++; localStorage.setItem("fixture-draft", JSON.stringify(value)); };
const clearCustomWorkoutDraft = () => localStorage.removeItem("fixture-draft");
const customWorkoutPanelHasEnteredExerciseContent = () => false;
const customWorkoutPanelHasAuxiliaryContent = () => false;
const clientCustomWorkoutPanelIndex = () => 0;
const cancelTrainingLogAutosaves = () => {};
const storeCustomWorkoutFormat = () => {};
const closeCustomExerciseSuggestions = () => {};
const closeRirDialog = () => {};
const closeRestTimer = () => {};
const resetRestTimer = () => {};
const setClientDashboardTab = () => {};
const activateClientWorkoutPanel = () => {};
const normalizeCustomWorkoutFormat = () => "single";
const workoutGymLocationForElement = () => "";
const serializeCustomExerciseDraft = () => null;
const replaceCustomWorkoutPanelFromDraft = () => {
  const panel = document.querySelector(".client-workout-panel-custom");
  const draft = activeCustomWorkoutDraft();
  panel.dataset.customWorkoutTitle = draft.workoutTitle;
  panel.innerHTML = '<h2 id="custom-workout-panel-title" tabindex="-1">' + customWorkoutCopyStatusMessage() + '</h2><button data-workout-start>Start</button>';
  panel.querySelector("button").onclick = () => { calls.started++; };
  return panel;
};
`;
async function check(engine, width, height) {
  const browser = await engine.launch(engine.name() === "chromium" && process.env.PLAYWRIGHT_CHANNEL
    ? {channel:process.env.PLAYWRIGHT_CHANNEL} : engine.name() === "webkit" && process.env.PLAYWRIGHT_WEBKIT_EXECUTABLE
      ? {executablePath:process.env.PLAYWRIGHT_WEBKIT_EXECUTABLE} : {});
  try {
    const page = await browser.newPage({ viewport:{width,height}, hasTouch:true, isMobile:true });
    const unexpected = [], pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.hostname === "fixture.test" && url.pathname === "/") {
        return route.fulfill({ contentType:"text/html", body:`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
          <style>body{background:#121316;color:#edf0f4;font:16px system-ui;margin:14px}</style>
          <div id="client-workout-tabs"></div><main class="client-workout-panel-custom"></main>
          <dialog><form method="dialog"><button>Close guide</button></form></dialog>` });
      }
      if (url.hostname === "fixture.test" && /^\/images\/workouts\/(?:benjamin-routine|at-home-routines)\/[a-z-]+\.jpg$/.test(url.pathname)) {
        return route.fulfill({path:path.join(root,url.pathname.slice(1)),contentType:"image/jpeg"});
      }
      unexpected.push(url.href);
      return route.abort();
    });
    await page.goto("https://fixture.test/");
    await page.addStyleTag({path:path.join(root,"css/workout-layout.css")});
    for (const asset of ["js/benjamin-routine.js","js/workout-layout.js"]) await page.addScriptTag({path:path.join(root,asset)});
    await page.addScriptTag({ content:stubs + "\n" + functions + `
      const picker = document.querySelector("#client-workout-tabs");
      picker.innerHTML = clientWorkoutListMarkup([]);
      picker.onclick = event => handleBenjaminRoutineChoice(event, picker);
      window.fixture = { calls, activeCustomWorkoutDraft, workoutDisplayTitle,
        persist() { storeCustomWorkoutDraft({...activeCustomWorkoutDraft(),...customWorkoutPanelDraft(document.querySelector("main"))}); },
        active(value) { workoutElapsedTimerState = value ? {workoutTitle:"An unrelated workout"} : null; },
        saving(value) { const panel = document.querySelector("main"); if (value) activeWorkoutLogSaves.set(panel, 1); else activeWorkoutLogSaves.delete(panel); },
        setRest(value) { savedDefault = value; } };
    `});
    await page.getByRole("button",{name:"Benjamin’s Routine"}).click();
    const view = page.locator("[data-benjamin-routine-view]");
    assert.equal(await view.locator("section").count(), 2);
    assert.deepEqual(await view.locator("h4").allTextContents(), ["Intermediate","Advanced"]);
    assert.equal(await view.locator("[data-benjamin-routine-session]").count(), 14);
    assert.ok(await page.locator(".workout-program-picker").isHidden());
    await view.locator("section").nth(1).getByRole("button",{name:/Full Body Day/}).click();
    await page.waitForFunction(() => document.querySelector(".benjamin-routine-view > img").naturalWidth > 0);
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    assert.ok(fits, "preview fits without horizontal overflow");
    assert.equal(await view.locator(".workout-prescription").first().textContent(), "4 × 6-8");
    assert.ok(await view.getByText("Automatic rest: Off",{exact:false}).isVisible());
    await view.getByRole("button",{name:"View Hip Thrust Machine guide"}).click();
    assert.equal(await page.evaluate(() => fixture.calls.guide.name), "Hip Thrust Machine");
    await page.getByRole("button",{name:"Close guide"}).click();
    assert.equal(await page.evaluate(() => document.activeElement.dataset.benjaminRoutineGuide), "");
    assert.equal(await page.evaluate(() => fixture.calls.writes), 0);
    await page.evaluate(() => fixture.active(true));
    await view.getByRole("button",{name:"Start workout"}).click();
    assert.match(await view.getByRole("status").textContent(), /Finish or discard/);
    assert.equal(await page.evaluate(() => fixture.calls.writes), 0);
    await page.evaluate(() => { fixture.active(false); fixture.saving(true); });
    await view.getByRole("button",{name:"Start workout"}).click();
    assert.match(await view.getByRole("status").textContent(), /still saving/);
    assert.equal(await page.evaluate(() => fixture.calls.writes), 0);
    await page.evaluate(() => fixture.saving(false));
    await view.getByRole("button",{name:"Start workout"}).click();
    const draft = await page.evaluate(() => fixture.activeCustomWorkoutDraft());
    assert.equal(await page.evaluate(() => fixture.calls.started), 1);
    assert.equal(draft.builtInRoutine.level, "Advanced");
    assert.equal(draft.generatedFrom, undefined);
    assert.deepEqual(draft.exercises.map(item => item.sets.length), [4,4,3,3,3]);
    assert.ok(draft.exercises.every(item => item.omitWarmup && item.sets.every(set => set.setType === "working" && !set.reps && !set.complete)));
    assert.equal(await page.evaluate(() => fixture.workoutDisplayTitle(fixture.activeCustomWorkoutDraft().workoutTitle)), "Full Body Day · Advanced");
    await page.evaluate(() => fixture.persist());
    assert.deepEqual(await page.evaluate(() => fixture.activeCustomWorkoutDraft().builtInRoutine), draft.builtInRoutine);
    const decline = dialog => dialog.dismiss();
    page.once("dialog", decline);
    await view.getByRole("button",{name:"Start workout"}).click();
    assert.equal(await page.evaluate(() => fixture.activeCustomWorkoutDraft().builtInRoutine.id),draft.builtInRoutine.id);
    await page.evaluate(() => fixture.setRest(120));
    await view.getByRole("button",{name:"Back to Benjamin’s Routine"}).click();
    assert.ok(await view.locator("section").nth(1).getByRole("button",{name:/Full Body Day/}).evaluate(button => button === document.activeElement));
    await view.locator("section").nth(0).getByRole("button",{name:/Lower Body/}).click();
    assert.ok(await view.getByText("Automatic rest: 120s",{exact:false}).isVisible());
    page.once("dialog", dialog => dialog.accept());
    await view.getByRole("button",{name:"Start workout"}).click();
    const second = await page.evaluate(() => fixture.activeCustomWorkoutDraft());
    assert.notEqual(second.builtInRoutine.id,draft.builtInRoutine.id);
    assert.notEqual(second.builtInRoutine.templateId,draft.builtInRoutine.templateId);
    await view.getByRole("button",{name:"Back to Benjamin’s Routine"}).click();
    await view.getByRole("button",{name:"Back to workout choices"}).click();
    assert.ok(await page.getByRole("button",{name:"Benjamin’s Routine"}).isVisible());
    await page.setViewportSize({width:320,height:740});
    await page.getByRole("button",{name:"Explore Routines"}).click();
    const cards = view.locator(".at-home-routine-card");
    const titles = ["Full Body Foundations","Lower Body & Core","Upper Body Strength","Full Body Strength"];
    assert.equal(await cards.count(),4);
    assert.deepEqual(await cards.locator("strong").allTextContents(),titles);
    assert.deepEqual(await cards.locator(".at-home-routine-meta").allTextContents(),
      ["Beginner · Bodyweight","Intermediate · Bodyweight","Intermediate · Dumbbells","Advanced · Dumbbells"]);
    await view.locator(".at-home-routine-grid").scrollIntoViewIfNeeded();
    await page.waitForFunction(() => [...document.querySelectorAll(".at-home-routine-card img")].every(img => img.complete && img.naturalWidth >= 900));
    const layout = await cards.evaluateAll(nodes => nodes.map(node => {
      const box=node.getBoundingClientRect(), image=node.querySelector("img").getBoundingClientRect();
      const meta=node.querySelector(".at-home-routine-meta"), title=node.querySelector("strong");
      return {left:box.left,top:box.top,right:box.right,width:box.width,imageWidth:image.width,
        labelFits:meta.scrollWidth <= meta.clientWidth && title.scrollWidth <= title.clientWidth};
    }));
    assert.equal(layout[0].top,layout[1].top);
    assert.equal(layout[2].top,layout[3].top);
    assert.ok(layout[0].top < layout[2].top && layout[0].right < layout[1].left);
    assert.ok(layout.every(box=>box.right<=320 && box.left>=0 && box.imageWidth>=box.width-2 && box.labelFits));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if(process.env.AT_HOME_SCREENSHOT && engine.name() === "chromium") {
      await view.screenshot({path:process.env.AT_HOME_SCREENSHOT});
    }
    const writesBefore = await page.evaluate(() => fixture.calls.writes);
    for (const title of titles) {
      await view.getByRole("button",{name:new RegExp(title)}).click();
      assert.equal(await view.locator("h3").textContent(),title);
      assert.match(await view.locator(".workout-prescription small").first().textContent(),/^(60|75|90)s rest$/);
      assert.ok(await view.getByRole("button",{name:"Start workout"}).isVisible());
      assert.equal(await page.evaluate(() => fixture.calls.writes),writesBefore);
      await view.getByRole("button",{name:"Back to Explore Routines"}).click();
      assert.equal(await page.evaluate(() => document.activeElement.querySelector("strong")?.textContent),title);
    }
    await view.getByRole("button",{name:/Lower Body & Core/}).click();
    await view.getByRole("button",{name:/View Side Plank guide/}).click();
    assert.equal(await page.evaluate(() => fixture.calls.guide.name),"Side Plank");
    await page.getByRole("button",{name:"Close guide"}).click();
    await page.evaluate(() => localStorage.removeItem("fixture-draft"));
    await view.getByRole("button",{name:"Start workout"}).click();
    const atHomeDraft = await page.evaluate(() => fixture.activeCustomWorkoutDraft());
    assert.equal(atHomeDraft.builtInRoutine.collection,"at-home");
    assert.equal(atHomeDraft.builtInRoutine.title,"Lower Body & Core");
    assert.equal(atHomeDraft.exercises.at(-1).rest,"60s rest");
    assert.ok(atHomeDraft.exercises.at(-1).sets.every(set=>set.timed && !set.complete));
    assert.ok(atHomeDraft.exercises.slice(0,-1).every(item=>item.sets.every(set=>!set.timed)));
    await view.getByRole("button",{name:"Back to Explore Routines"}).click();
    await view.getByRole("button",{name:"Back to workout choices"}).click();
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute("data-at-home-routine-open")),"");
    assert.deepEqual(unexpected, []);
    assert.deepEqual(pageErrors, []);
    console.log(engine.name(), width, "Benjamin’s Routine + 320px at-home routines fixtures passed");
  } finally { await browser.close(); }
}
(async () => { await check(chromium,393,873); await check(webkit,390,844); })().catch(error => { console.error(error); process.exitCode=1; });
