const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const next = require("../js/client-next-workout");
const portal = fs.readFileSync(require.resolve("../js/client-portal.js"), "utf8");
const touch = fs.readFileSync(require.resolve("../client-dashboard.html"), "utf8");
const homeStyles = fs.readFileSync(require.resolve("../css/client-home-approved.css"), "utf8");
const dockStyles = fs.readFileSync(require.resolve("../css/client-mobile-tab-gold.css"), "utf8");
const lightStyles = fs.readFileSync(require.resolve("../css/client-light-theme.css"), "utf8");
const mobileWorkoutStyles = fs.readFileSync(require.resolve("../css/custom-workout-mobile-fix.css"), "utf8");

test("scheduled workouts resolve typed routes, independent of titles or input list order", () => {
  const today = "2026-11-25";
  for (const [source, section] of [["assigned", "personal"], ["generated", "trainer"], ["custom", "routines"], ["history", "routines"]]) {
    assert.deepEqual(next.recommendation({ today, scheduled: [
      { id: "z", title: "Later routine", planned_date: "2026-12-01", source_type: "assigned" },
      { id: "a", title: "Old workout", planned_date: "2026-11-24", source_type: "assigned" },
      { id: "b", title: "Same title across sources", planned_date: "2026-11-26", source_type: source }
    ] }), { title: "Same title across sources", date: "2026-11-26", section });
  }
});

test("empty or unknown scheduled types fall back safely; assigned rotation wraps", () => {
  const today = "2026-11-25";
  const scheduled = [{ title: "Ignore", planned_date: today, source_type: "other" }];
  assert.deepEqual(next.recommendation({ today, scheduled }), { title: "", date: "", section: "routines" });
  const workouts = [{ title: "Lower", exercises: [1] }, { title: "Empty", exercises: [] }, { title: "Upper", exercises: [1] }];
  assert.deepEqual(next.recommendation({ today, workouts, lastTitle: " UPPER", scheduled }), { title: "Lower", date: "", section: "personal" });
  assert.deepEqual(next.recommendation({ today, workouts, lastTitle: "Lower" }), { title: "Upper", date: "", section: "personal" });
});

test("Home CTA reuses exact resume, otherwise navigates only to the source section and preserves exercise panels", async () => {
  const a = portal.indexOf("function handleClientSummaryActions");
  const b = portal.indexOf("\nfunction ", a + 1);
  const capture = [];
  const picker = { innerHTML: "preview" };
  const context = {
    capture, picker, currentProgram: { workouts: [1] },
    workoutElapsedTimerState: null, clientPreviewProgramSelected: true,
    document: {
      addEventListener(name, fn) { if (name === "click") this.listener = fn; },
      getElementById(id) { return id === "client-workout-tabs" ? picker : null; }
    },
    selectClientWorkoutHubSection(section) { capture.push(section); },
    setClientDashboardTab(tab) { capture.push(tab); },
    showClientWorkoutPicker() { capture.push("picker"); },
    resumeActiveWorkout() { capture.push("resume"); },
    clientWorkoutListMarkup() { return "hub"; },
    clientWorkoutPickerItems(workouts) { return workouts; }
  };
  vm.runInNewContext(portal.slice(a, b) + "\nhandleClientSummaryActions();", context);
  const click = section => context.document.listener({
    target: { closest: selector => selector === "[data-client-home-start-next]" ? { dataset: { clientHomeNextSection: section } } : null }
  });
  await click("trainer");
  assert.deepEqual(capture.splice(0), ["trainer", "workouts", "picker"]);
  assert.equal(picker.innerHTML, "hub");
  assert.equal(context.clientPreviewProgramSelected, false);
  await click("unknown");
  assert.deepEqual(capture.splice(0), ["routines", "workouts", "picker"]);
  context.workoutElapsedTimerState = {};
  await click("personal");
  assert.deepEqual(capture, ["resume"]);
});

function luminance(hex) {
  return [0.2126, 0.7152, 0.0722].reduce((l, k, i) => {
    const s = parseInt(hex.slice(i * 2, i * 2 + 2), 16) / 255;
    return l + k * (s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4);
  }, 0);
}
function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
test("specific light Week label and dock colors meet text contrast; marker and safe-area affordances exist", () => {
  assert.match(homeStyles, /data-client-home-week-label\][^{]*\{\s*color: #465563/);
  assert.ok(contrast("465563", "ffffff") >= 4.5);
  assert.ok(contrast("856700", "eef2f5") >= 3);
  assert.ok(contrast("176595", "eef2f5") >= 3);
  assert.ok(contrast("e6ebf0", "24282e") >= 4.5);
  assert.ok(contrast("ffd400", "24282e") >= 4.5);
  assert.match(dockStyles, /inset-inline: max\(12px, env\(safe-area-inset-left\)\) max\(12px, env\(safe-area-inset-right\)\)/);
  assert.doesNotMatch(portal, /disableClientDashboardZoom|addEventListener\("gesture(start|change|end)"/);
  assert.doesNotMatch(touch, /maximum-scale|user-scalable=no/);
});

test("light form and forced-white mobile carousel placeholders use an opaque shared token", () => {
  const shared = lightStyles.match(/body\.client-dashboard-page\s*\{\s*--client-input-placeholder-on-light:\s*#([0-9a-f]{6});/i);
  const generic = lightStyles.match(/:root\[data-client-theme="light"\] body\.client-dashboard-page :is\(input, textarea\)::placeholder\s*\{([^}]+)\}/);
  const carousel = mobileWorkoutStyles.match(/data-carousel-enabled="true"\] \.custom-workout-card :is\(input, textarea\)::placeholder\s*\{([^}]+)\}/);
  assert.ok(shared && generic && carousel);
  assert.match(generic[1], /color: var\(--client-input-placeholder-on-light\);\s*opacity: 1;/);
  const fallback = carousel[1].match(/color: var\(--client-input-placeholder-on-light, #([0-9a-f]{6})\) !important;\s*opacity: 1;/i);
  assert.ok(fallback);
  assert.equal(fallback[1], shared[1]);
  assert.ok(contrast(shared[1], "ffffff") >= 4.5);
  assert.doesNotMatch(lightStyles, /#778678/i);
  assert.doesNotMatch(mobileWorkoutStyles, /#858982/i);
});
