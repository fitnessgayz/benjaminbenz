const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.resolve(__dirname, "..");
const portalSource = fs.readFileSync(path.join(projectRoot, "js/client-portal.js"), "utf8");
const styleSource = fs.readFileSync(path.join(projectRoot, "css/style.css"), "utf8");

test("workout timer exposes a dedicated drag handle", () => {
  assert.match(portalSource, /data-workout-elapsed-drag/);
  assert.match(portalSource, /aria-label="Move workout timer"/);
  assert.match(styleSource, /\.workout-elapsed-drag-handle\s*\{[^}]*touch-action:\s*none/s);
});

test("workout timer drag position is snapped, constrained, and persisted", () => {
  assert.match(portalSource, /workoutElapsedTimerPositionStorageKey/);
  assert.match(portalSource, /Math\.min\(bounds\.maxLeft, Math\.max\(bounds\.gap/);
  assert.match(portalSource, /edge:\s*rect\.left \+ \(rect\.width \/ 2\) < viewportMidpoint \? "left" : "right"/);
  assert.match(portalSource, /persistWorkoutElapsedTimerPosition\(\)/);
  assert.match(portalSource, /window\.addEventListener\("resize", \(\) => applyWorkoutElapsedTimerPosition\(\)\)/);
});

test("workout timer starts above navigation and can be hidden without clearing elapsed time", () => {
  assert.match(portalSource, /workoutElapsedTimerPosition = \{ edge: "right", topRatio: 1 \}/);
  assert.match(portalSource, /navigationRect\.top - rect\.height - gap/);
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
