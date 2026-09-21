const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { metrics, text, dateLabel, weekLabel, durationLabel, content, fitText, drawCard } = require("../js/workout-share-card.js");

const now = new Date(2026, 8, 21, 12);
const example = (values = {}) => ({
  title: "Upper-body strength", entryDate: "2026-09-21", durationSeconds: 2800,
  durationLabel: "46:40", exerciseCount: 6,
  exerciseNames: ["Chest press", "Lat pulldown", "Dumbbell row", "Shoulder press", "Biceps curl", "Triceps extension"],
  weeklyWorkoutCount: 3, difficultyLabel: "Completed", ...values
});

function fakeCanvas() {
  const texts = [];
  const boxes = [];
  const context = {
    font: "800 24px Inter", textAlign: "left", textBaseline: "top", fillStyle: "", strokeStyle: "", lineWidth: 1,
    measureText(value) { return { width: Array.from(String(value)).length * Number(this.font.match(/([\d.]+)px/)[1]) * .56 }; },
    fillText(value, x, y) {
      const size = Number(this.font.match(/([\d.]+)px/)[1]);
      const width = this.measureText(value).width;
      const left = this.textAlign === "right" ? x - width : this.textAlign === "center" ? x - width / 2 : x;
      const top = this.textBaseline === "middle" ? y - size / 2 : y;
      texts.push({ value: String(value), x, y, left, top, right: left + width, bottom: top + size, size });
    },
    fillRect(x, y, width, height) { boxes.push({ x, y, width, height }); },
    strokeRect(x, y, width, height) { boxes.push({ x, y, width, height }); }
  };
  return { context, texts, boxes };
}

test("Apple duration overrides app time and reviewed metrics include their units", () => {
  assert.deepEqual(metrics(example({ appleWorkout: { duration_seconds: 2538, active_calories: 320, total_calories: 392, average_heart_rate: 121 } }), now), {
    durationLabel: "42:18", timeLabel: "Apple workout time", weekLabel: "This week",
    appleMetrics: [
      { label: "Active calories", value: "320 kcal" },
      { label: "Total calories", value: "392 kcal" },
      { label: "Avg heart rate", value: "121 bpm" }
    ]
  });
});

test("missing Apple values are omitted, zero is retained, and app duration remains the fallback", () => {
  const result = metrics(example({ appleWorkout: { duration_seconds: null, active_calories: 0, total_calories: "", average_heart_rate: undefined } }), now);
  assert.equal(result.durationLabel, "46:40");
  assert.equal(result.timeLabel, "Workout time");
  assert.deepEqual(result.appleMetrics, [{ label: "Active calories", value: "0 kcal" }]);
  assert.equal(metrics(example({ appleWorkout: { duration_seconds: 0 } }), now).durationLabel, "0:00");
  assert.equal(metrics({ entryDate: "2026-09-21", durationSeconds: 0 }, now).durationLabel, "—");
  assert.equal(metrics({ durationLabel: "24:50" }, now).durationLabel, "24:50");
});

test("invalid metrics cannot turn into fabricated numbers or private display text", () => {
  const result = metrics(example({ durationSeconds: NaN, durationLabel: "private-url", appleWorkout: { duration_seconds: Infinity, active_calories: -1, total_calories: false, average_heart_rate: "unknown" } }), now);
  assert.equal(result.durationLabel, "—");
  assert.deepEqual(result.appleMetrics, []);
  assert.equal(durationLabel(3661), "1:01:01");
  assert.equal(durationLabel(61), "1:01");
  assert.equal(durationLabel(null), "—");
});

test("Monday-based week labels include Sunday correctly and survive a year boundary", () => {
  assert.equal(weekLabel("2026-09-20", now), "That week");
  assert.equal(weekLabel("2026-09-21", now), "This week");
  assert.equal(weekLabel("2026-09-27", now), "This week");
  assert.equal(weekLabel("2026-09-28", now), "That week");
  assert.equal(weekLabel("2025-12-29", new Date(2026, 0, 1, 12)), "This week");
  assert.equal(weekLabel("2026-01-04", new Date(2026, 0, 1, 12)), "This week");
  assert.equal(weekLabel("invalid", now), "That week");
});

test("date labels validate calendar dates without UTC-to-local date shifts", () => {
  assert.equal(dateLabel("2026-09-21"), "Sep 21, 2026");
  assert.equal(dateLabel("2024-02-29"), "Feb 29, 2024");
  assert.equal(dateLabel("2026-02-29"), "Date not recorded");
  assert.equal(dateLabel(null), "Date not recorded");
});

test("share text handles singular counts and an older saved session without claiming completion", () => {
  const result = text(example({ isComplete: false, entryDate: "2026-09-14", exerciseCount: 1, exerciseNames: ["Squat"], weeklyWorkoutCount: 1 }), now);
  assert.match(result, /^Workout saved\n/);
  assert.match(result, /Sep 14, 2026/);
  assert.match(result, /\n1 exercise\n1 workout that week\n/);
  assert.match(result, /Exercises logged:/);
  assert.doesNotMatch(result, /complete|today|this week|1 exercises|1 workouts/i);
});

test("text and canvas receive identical public metrics and exclude private attachment fields", () => {
  const summary = example({
    email: "private@example.com", historyKey: "private-history-key", screenshot_url: "https://secret.example/image.png",
    appleWorkout: { duration_seconds: 2400, active_calories: 0, total_calories: 400.5, average_heart_rate: 130, storage_path: "private/image.png", owner_user_id: "private-user" }
  });
  const result = text(summary, now);
  const h = fakeCanvas();
  drawCard(h.context, summary, now);
  const drawn = h.texts.map((item) => item.value).join("\n");
  for (const expected of ["40:00", "Sep 21, 2026", "0 kcal", "400.5 kcal", "130 bpm"]) {
    assert.ok(result.includes(expected), expected);
    assert.ok(drawn.includes(expected), expected);
  }
  assert.match(drawn, /APPLE WORKOUT TIME/);
  for (const output of [result, drawn]) assert.doesNotMatch(output, /private@|private-history|secret\.example|private\/image|private-user/);
});

test("six names and a remainder count are shared rather than overflowing the canvas", () => {
  const names = Array.from({ length: 9 }, (_, index) => `Exercise ${index + 1}`);
  const summary = example({ exerciseNames: names, exerciseCount: 9 });
  const data = content(summary, now);
  assert.equal(data.exerciseNames.length, 6);
  assert.equal(data.moreExercises, 3);
  const result = text(summary, now);
  assert.match(result, /\+ 3 more exercises/);
  assert.doesNotMatch(result, /• Exercise 7/);
  const h = fakeCanvas();
  drawCard(h.context, summary, now);
  assert.ok(h.texts.some((item) => item.value === "+ 3 more exercises"));
});

test("long titles, names, and metric values stay inside their reserved canvas regions", () => {
  const summary = example({
    title: "Very long strength and conditioning session for the entire upper and lower body ".repeat(8),
    exerciseNames: Array.from({ length: 8 }, (_, index) => `${index + 1} ${"LongUnbrokenExerciseName".repeat(8)} alternating variation`),
    exerciseCount: 8, weeklyWorkoutCount: 999999,
    difficultyLabel: "A challenging but steady workout with a long description ".repeat(6),
    appleWorkout: { duration_seconds: 604800, active_calories: 100000, total_calories: 100000, average_heart_rate: 300 }
  });
  const h = fakeCanvas();
  const layout = drawCard(h.context, summary, now);
  assert.equal(h.texts.some((item) => item.value.startsWith("Effort:")), false);
  assert.doesNotMatch(text(summary, now), /Effort:/);
  assert.ok(layout.title.truncated);
  assert.ok(layout.title.height <= 160);
  assert.ok(layout.contentBottom < layout.footerTop - 28, `body ended at ${layout.contentBottom}`);
  for (const item of h.texts) {
    assert.ok(item.left >= 63.99, `left overflow: ${JSON.stringify(item)}`);
    assert.ok(item.right <= 1016.01, `right overflow: ${JSON.stringify(item)}`);
    assert.ok(item.top >= 0 && item.bottom < 1350, `vertical overflow: ${JSON.stringify(item)}`);
  }
  for (const box of h.boxes) assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 1080.01 && box.y + box.height <= 1350.01);
});

test("line fitting breaks unbroken names and truncates visibly instead of squeezing or clipping", () => {
  const h = fakeCanvas();
  const fitted = fitText(h.context, "W".repeat(400), 200, { maxSize: 40, minSize: 20, maxLines: 2, maxHeight: 50 });
  assert.equal(fitted.lines.length, 2);
  assert.equal(fitted.truncated, true);
  assert.ok(fitted.lines.at(-1).endsWith("…"));
  for (const line of fitted.lines) assert.ok(h.context.measureText(line).width <= 200);
});

function imageHarness({ noContext = false, nullBlob = false, throwBlob = false, noFile = false } = {}) {
  const h = fakeCanvas();
  const canvas = {
    getContext() { return noContext ? null : h.context; },
    toBlob(callback, type) {
      if (throwBlob) throw new Error("Canvas error");
      callback(nullBlob ? null : { type });
    }
  };
  class FakeFile { constructor(parts, name, options) { this.parts = parts; this.name = name; this.type = options.type; } }
  const context = vm.createContext({
    window: {}, document: { createElement: () => canvas, fonts: { load: async () => [] } },
    File: noFile ? undefined : FakeFile, module: { exports: {} }, setTimeout, clearTimeout
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/workout-share-card.js"), "utf8"), context);
  return { api: context.window.FWBWorkoutShareCard, canvas, ...h };
}

test("image exports a 1080×1350 PNG File with a saved-state filename and exact public API", async () => {
  const h = imageHarness();
  assert.deepEqual(Object.keys(h.api), ["image", "text", "metrics"]);
  const file = await h.api.image(example({ isComplete: false }));
  assert.equal(file.name, "fwb-workout-saved.png");
  assert.equal(file.type, "image/png");
  assert.equal(h.canvas.width, 1080);
  assert.equal(h.canvas.height, 1350);
  assert.ok(h.texts.some((item) => item.value === "WORKOUT SAVED"));
  assert.ok(h.texts.some((item) => item.value === "EXERCISES LOGGED"));
  assert.equal(h.texts.some((item) => item.value === "WORKOUT COMPLETE"), false);
});

test("unsupported or failed canvas exports resolve null so text sharing remains available", async () => {
  for (const settings of [{ noContext: true }, { nullBlob: true }, { throwBlob: true }, { noFile: true }]) {
    assert.equal(await imageHarness(settings).api.image(example()), null);
  }
});
