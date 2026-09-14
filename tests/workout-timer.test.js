const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.resolve(__dirname, "..");
const dashboardSource = fs.readFileSync(path.join(projectRoot, "client-dashboard.html"), "utf8");
const portalSource = fs.readFileSync(path.join(projectRoot, "js/client-portal.js"), "utf8");
const styleSource = fs.readFileSync(path.join(projectRoot, "css/style.css"), "utf8");

function sourceForFunction(name) {
  const start = portalSource.indexOf(`function ${name}(`);
  const end = portalSource.indexOf("\nfunction ", start + 1);

  assert.ok(start >= 0, `Expected ${name} to exist`);
  return portalSource.slice(start, end >= 0 ? end : undefined);
}

test("workout timer exposes a dedicated drag handle", () => {
  assert.match(portalSource, /data-workout-elapsed-drag/);
  assert.match(portalSource, /aria-label="Move workout timer"/);
  assert.match(styleSource, /\.workout-elapsed-drag-handle\s*\{[^}]*touch-action:\s*none/s);
});

test("workout timer drag position is snapped, constrained, and persisted", () => {
  assert.match(portalSource, /workoutElapsedTimerPositionStorageKey/);
  assert.match(portalSource, /Math\.min\(bounds\.maxLeft, Math\.max\(bounds\.minLeft/);
  assert.match(portalSource, /edge:\s*rect\.left \+ \(rect\.width \/ 2\) < viewportMidpoint \? "left" : "right"/);
  assert.match(portalSource, /persistWorkoutElapsedTimerPosition\(\)/);
  assert.match(portalSource, /window\.addEventListener\("resize", \(\) => applyWorkoutElapsedTimerPosition\(\)\)/);
});

test("workout timer starts above navigation and can be hidden without clearing elapsed time", () => {
  assert.match(portalSource, /workoutElapsedTimerPosition = \{ edge: "right", topRatio: 1 \}/);
  assert.match(portalSource, /navigationIsBottomDock/);
  assert.match(portalSource, /window\.matchMedia\?\.\("\(max-width: 900px\)"\)\?\.matches/);
  assert.match(portalSource, /navigationRect\.top - rect\.height - gap/);
  assert.match(portalSource, /navigationRect\.right \+ gap/);
  assert.match(portalSource, /data-workout-elapsed-close/);
  assert.match(portalSource, /workoutElapsedTimerState\.dismissed = true/);
  assert.match(portalSource, /button\.textContent = "Show workout timer"/);
  assert.match(styleSource, /rgba\(255, 255, 255, \.82\)/);
  assert.match(styleSource, /backdrop-filter:\s*blur\(18px\) saturate\(135%\)/);
});

test("expanded workout timer uses compact icon controls without overflow", () => {
  assert.match(portalSource, /workoutElapsedTimerControlIcon/);
  assert.match(portalSource, /data-workout-elapsed-toggle[^>]*aria-label="Pause workout timer"/);
  assert.match(portalSource, /data-workout-elapsed-reset[^>]*aria-label="Reset workout timer"/);
  assert.match(styleSource, /grid-template-columns:\s*20px 40px minmax\(0, 1fr\) 40px 40px 36px/);
  assert.match(styleSource, /max-width:\s*calc\(100% - 16px\)/);
  assert.match(styleSource, /\.workout-elapsed-timer button svg/);
});

test("orphaned and day-old timer state expires by wall-clock age", () => {
  const source = sourceForFunction("workoutElapsedTimerIsStale");
  const maximumAge = 24 * 60 * 60 * 1000;
  const isStale = Function(
    "workoutElapsedTimerMaximumMilliseconds",
    `${source}; return workoutElapsedTimerIsStale;`
  )(maximumAge);
  const now = 2_000_000_000_000;

  assert.equal(isStale(null, now, maximumAge), true);
  assert.equal(isStale({ startedAt: 0, updatedAt: 0 }, now, maximumAge), true);
  assert.equal(isStale({ updatedAt: now - maximumAge }, now, maximumAge), false);
  assert.equal(isStale({ updatedAt: now - maximumAge - 1 }, now, maximumAge), true);
  assert.equal(isStale({ startedAt: now - 1_000 }, now, maximumAge), false);

  assert.match(sourceForFunction("readWorkoutElapsedTimerState"), /workoutElapsedTimerIsStale\(state\)/);
  assert.match(sourceForFunction("persistWorkoutElapsedTimerState"), /workoutElapsedTimerState\.updatedAt = Date\.now\(\)/);
});

test("active workouts expose resume actions on Home and Workouts", () => {
  assert.equal((dashboardSource.match(/data-workout-resume-card/g) || []).length, 2);
  assert.equal((dashboardSource.match(/data-resume-active-workout/g) || []).length, 2);
  assert.match(dashboardSource, /client-home-resume-card/);
  assert.match(dashboardSource, /client-workouts-resume-card/);
  assert.match(styleSource, /\.client-home-resume-card\s*\{[^}]*grid-column:\s*1 \/ -1/s);
  assert.match(styleSource, /\.client-workout-resume-card\[hidden\]\s*\{[^}]*display:\s*none !important/s);
  assert.match(styleSource, /@media \(max-width: 620px\)[\s\S]*\.client-workout-resume-card\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
});

test("resume state preserves the workout date and exact workout panel", () => {
  const readStateSource = sourceForFunction("readWorkoutElapsedTimerState");
  const startSource = sourceForFunction("startWorkoutElapsedTimer");
  const resumeSource = sourceForFunction("resumeActiveWorkout");
  const storedValue = JSON.stringify({
    workoutTitle: "Lower Body",
    workoutDate: "2026-09-14",
    panelIndex: null,
    updatedAt: Date.now(),
    running: false
  });
  const readState = Function(
    "window",
    "workoutElapsedTimerStorageKey",
    "workoutElapsedTimerMaximumMilliseconds",
    "workoutElapsedTimerIsStale",
    `${readStateSource}; return readWorkoutElapsedTimerState;`
  )(
    { localStorage: { getItem: () => storedValue, removeItem: () => {} } },
    "timer-key",
    24 * 60 * 60 * 1000,
    () => false
  );
  const parsedState = readState();

  assert.match(readStateSource, /workoutDate:/);
  assert.match(readStateSource, /panelIndex:/);
  assert.equal(parsedState.workoutDate, "2026-09-14");
  assert.equal(parsedState.panelIndex, null);
  assert.match(startSource, /context\.workoutDate/);
  assert.match(startSource, /context\.panelIndex/);
  assert.match(resumeSource, /setClientDashboardTab\("workouts"\)/);
  assert.match(resumeSource, /dataset\.workoutTitle/);
  assert.match(resumeSource, /syncWorkoutPanelDate\(panel, workoutElapsedTimerState\.workoutDate\)/);
  assert.match(resumeSource, /activateClientWorkoutPanel\(panelIndex, \{ focus: true, scroll: true \}\)/);
  assert.doesNotMatch(resumeSource, /startWorkoutElapsedTimer/);
});

test("resume cards mirror running, paused, title, and elapsed timer state", () => {
  const renderSource = sourceForFunction("renderWorkoutResumeActions");
  const timerRenderSource = sourceForFunction("renderWorkoutElapsedTimer");

  assert.match(timerRenderSource, /renderWorkoutResumeActions\(\)/);
  assert.match(renderSource, /Workout in progress/);
  assert.match(renderSource, /Workout paused/);
  assert.match(renderSource, /workoutElapsedTimerState\.workoutTitle/);
  assert.match(renderSource, /workoutElapsedTimeLabel\(workoutElapsedMilliseconds\(\)\)/);
  assert.match(portalSource, /resumeActiveWorkoutButton[\s\S]*resumeActiveWorkout\(\)/);
});
