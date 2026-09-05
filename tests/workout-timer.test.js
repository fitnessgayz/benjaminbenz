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
