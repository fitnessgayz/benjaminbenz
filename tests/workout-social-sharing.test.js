const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const portal = fs.readFileSync(path.join(__dirname, "../js/client-portal.js"), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));

function sourceFunction(name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(portal);
  assert.ok(match, `${name} must exist`);
  const start = match.index;
  const next = portal.slice(start + match[0].length).search(/\n(?:async\s+)?function\s+[A-Za-z0-9_$]+\s*\(/);
  assert.ok(next >= 0, `${name} must have a following declaration`);
  return portal.slice(start, start + match[0].length + next);
}

function evaluate(names, context = {}) {
  vm.createContext(context);
  vm.runInContext(names.map(sourceFunction).join("\n"), context);
  return context;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));
const baseLog = {
  entry_date: "2026-09-14", workout_title: "Full Body", session_id: "past-session",
  exercise_code: "A1", exercise_name: "Squat", set_number: 1, weight_used: 100, reps: 8
};

function summaryFixture() {
  const apple = new Map();
  const weekDates = [];
  const context = evaluate([
    "clientWorkoutHistorySessionKey", "workoutFeedbackSessionId", "workoutCompletionShareSummary",
    "workoutHistoryShareSummary", "openWorkoutHistoryShare"
  ], {
    trainingLogs: [],
    warmupExerciseCode: "WARMUP",
    todayDate: () => "2026-09-21",
    workoutElapsedTimeLabel: (milliseconds) => `${milliseconds / 1000} seconds`,
    completedWorkoutCountForWeek: (date) => { weekDates.push(date); return 3; },
    workoutDifficultyLabel: (value) => value ? `Difficulty ${value}` : "",
    workoutDifficultyForLog: (row) => row.rating || null,
    window: { FWBAppleWorkout: { getShareStats: (key) => apple.get(key) || null } },
    isCoachDashboardPreview: false
  });
  return { context, apple, weekDates };
}

test("sharing a past workout uses its exact session, full exercise list, saved duration and historical week", () => {
  const { context, apple, weekDates } = summaryFixture();
  context.trainingLogs = [
    { ...baseLog, exercise_code: "WARMUP", exercise_name: "Warm up", workout_duration_seconds: null },
    { ...baseLog, workout_duration_seconds: 1200 },
    { ...baseLog, set_number: 2, workout_duration_seconds: 1800, completed_at: "2026-09-14T10:00:00Z", rating: 4 },
    { ...baseLog, exercise_code: "CARDIO", exercise_name: "Cycling", workout_duration_seconds: 1800 },
    { ...baseLog, session_id: "second-past-session", exercise_name: "Another session", workout_duration_seconds: 5000 },
    { ...baseLog, session_id: "current-session", entry_date: "2026-09-21", exercise_name: "Today's exercise", workout_duration_seconds: 7000 }
  ];
  apple.set("session:past-session", { duration_seconds: 1900, active_calories: 0, total_calories: 200, average_heart_rate: null });
  const summary = context.workoutHistoryShareSummary("session:past-session");
  assert.equal(summary.historyKey, "session:past-session");
  assert.equal(summary.entryDate, "2026-09-14");
  assert.equal(summary.durationSeconds, 1800, "The logged workout time remains distinct from Apple time");
  assert.deepEqual(plain(summary.exerciseNames), ["Squat", "Cycling"]);
  assert.equal(summary.exerciseCount, 2);
  assert.equal(summary.isComplete, true);
  assert.equal(summary.difficultyLabel, "Difficulty 4");
  assert.deepEqual(weekDates, ["2026-09-14"]);
  assert.equal(summary.appleWorkout.duration_seconds, 1900);
  assert.equal(summary.appleWorkout.active_calories, 0);
  assert.equal(summary.appleWorkout.average_heart_rate, null);
});

test("reopening a saved workout picks up updated Apple stats and preserves unfinished state", () => {
  const { context, apple } = summaryFixture();
  context.trainingLogs = [{ ...baseLog, workout_duration_seconds: null }];
  let summary = context.workoutHistoryShareSummary("session:past-session");
  assert.equal(summary.isComplete, false);
  assert.equal(summary.durationSeconds, 0);
  assert.equal(summary.durationLabel, "—");
  assert.equal(summary.appleWorkout, null);
  apple.set("session:past-session", { duration_seconds: null, active_calories: 0, total_calories: null, average_heart_rate: null });
  summary = context.workoutHistoryShareSummary("session:past-session");
  assert.equal(summary.appleWorkout.active_calories, 0);
  apple.set("session:past-session", { duration_seconds: 2000, active_calories: 240, total_calories: 300, average_heart_rate: 126 });
  summary = context.workoutHistoryShareSummary("session:past-session");
  assert.equal(summary.appleWorkout.active_calories, 240);
  assert.equal(summary.isComplete, false, "Adding Apple metrics does not complete the saved FWB workout");
});

test("history sharing supports legacy workout keys, declines unknown sessions, and blocks coach preview", () => {
  const { context } = summaryFixture();
  const opened = [];
  const focus = {};
  context.openWorkoutCompletionSharePrompt = (summary, returnFocus) => opened.push({ summary, returnFocus });
  context.trainingLogs = [{ ...baseLog, session_id: undefined, workout_session_id: undefined }];
  assert.equal(context.workoutHistoryShareSummary("session:missing"), null);
  assert.equal(context.openWorkoutHistoryShare("session:missing", focus), false);
  assert.equal(context.openWorkoutHistoryShare("legacy:2026-09-14::full body", focus), true);
  assert.equal(opened[0].summary.historyKey, "legacy:2026-09-14::full body");
  assert.equal(opened[0].returnFocus, focus);
  context.isCoachDashboardPreview = true;
  assert.equal(context.openWorkoutHistoryShare("legacy:2026-09-14::full body", focus), false);
  assert.equal(opened.length, 1);
});

function shareSheetFixture(image) {
  const nodes = new Map();
  const focused = [];
  const overlay = {
    hidden: true,
    querySelector: (selector) => {
      if (!nodes.has(selector)) nodes.set(selector, {
        disabled: false,
        focus: () => focused.push(selector),
        closest: () => overlay
      });
      return nodes.get(selector);
    }
  };
  const shares = [];
  const context = evaluate([
    "openWorkoutCompletionSharePrompt", "closeWorkoutCompletionSharePrompt", "shareCompletedWorkout"
  ], {
    ensureWorkoutCompletionSharePrompt: () => overlay,
    document: { querySelector: () => overlay, body: { classList: { add() {}, remove() {} } } },
    window: { location: { origin: "https://benjaminbenz.com" }, FWBAppleWorkout: {} },
    navigator: {
      canShare: ({ files }) => files.length === 1,
      share: (data) => { shares.push(data); return Promise.resolve(); }
    },
    isCoachDashboardPreview: false,
    formatLogDate: (value) => `Date ${value}`,
    escapeHtml: String,
    randomWorkoutCompletionMessage: () => "Well done",
    workoutCompletionShareImage: image,
    workoutCompletionShareText: (summary) => `Saved ${summary.entryDate}`
  });
  return { context, nodes, focused, shares, overlay };
}

const summary = (overrides = {}) => ({
  title: "Full Body", historyKey: "session:past-session", entryDate: "2026-09-14",
  durationLabel: "30:00", exerciseNames: ["Squat"], exerciseCount: 1,
  weeklyWorkoutCount: 3, isComplete: true, ...overrides
});

test("native sharing waits for the image and sends the prepared file on the next direct click", async () => {
  const preparing = deferred();
  const { context, nodes, shares, overlay, focused } = shareSheetFixture(() => preparing.promise);
  context.openWorkoutCompletionSharePrompt(summary());
  const button = nodes.get("[data-workout-share]");
  assert.equal(button.disabled, true);
  assert.equal(button.textContent, "Preparing image…");
  assert.deepEqual(focused, ["[data-workout-share-dismiss]"], "A disabled Share action must not receive initial focus");
  await context.shareCompletedWorkout(button);
  assert.equal(shares.length, 0, "A fast tap must not silently share without its image");
  const file = { name: "workout.png", type: "image/png" };
  preparing.resolve(file);
  await flush();
  assert.equal(button.disabled, false);
  const sharing = context.shareCompletedWorkout(button);
  assert.equal(shares.length, 1, "Native share must run directly during the click, before asynchronous work");
  assert.equal(shares[0].files[0], file);
  assert.equal(Object.hasOwn(shares[0], "url"), false);
  await sharing;
  assert.equal(overlay.hidden, true);
});

test("an older image result cannot replace a newer preview or reenable its share button", async () => {
  const first = deferred();
  const second = deferred();
  let sequence = 0;
  const { context, nodes } = shareSheetFixture(() => (sequence++ === 0 ? first.promise : second.promise));
  context.openWorkoutCompletionSharePrompt(summary());
  context.openWorkoutCompletionSharePrompt(summary({ historyKey: "session:new", title: "New session" }));
  first.resolve({ name: "old.png" });
  await flush();
  assert.equal(context.pendingWorkoutCompletionShareFile, null);
  assert.equal(nodes.get("[data-workout-share]").disabled, true);
  assert.equal(nodes.get("[data-workout-share-workout-title]").textContent, "New session");
  const currentFile = { name: "new.png" };
  second.resolve(currentFile);
  await flush();
  assert.equal(context.pendingWorkoutCompletionShareFile, currentFile);
  assert.equal(nodes.get("[data-workout-share]").disabled, false);
});

test("image failures explicitly fall back to text and sharing an unfinished workout uses saved wording", async () => {
  const { context, nodes, shares } = shareSheetFixture(() => Promise.reject(new Error("Canvas unavailable")));
  context.openWorkoutCompletionSharePrompt(summary({ isComplete: false }));
  await flush();
  assert.equal(nodes.get("[data-workout-share-state]").textContent, "Workout saved");
  assert.match(nodes.get("[data-workout-share-status]").textContent, /share the workout details as text/);
  const button = nodes.get("[data-workout-share]");
  assert.equal(button.disabled, false);
  await context.shareCompletedWorkout(button);
  assert.equal(shares[0].title, "Workout saved");
  assert.equal(shares[0].text, "Saved 2026-09-14");
  assert.equal(Object.hasOwn(shares[0], "files"), false);
});

test("the preview uses the card renderer's historical labels and Apple metrics", async () => {
  const { context, nodes } = shareSheetFixture(async () => null);
  context.window.FWBWorkoutShareCard = { metrics: () => ({
    durationLabel: "35:00", timeLabel: "Apple workout time", weekLabel: "That week",
    appleMetrics: [{ label: "Active calories", value: "0 kcal" }, { label: "Average heart rate", value: "126 bpm" }]
  }) };
  context.openWorkoutCompletionSharePrompt(summary({ appleWorkout: { active_calories: 0 } }));
  assert.equal(nodes.get("[data-workout-share-date]").textContent, "Date 2026-09-14");
  assert.equal(nodes.get("[data-workout-share-duration]").textContent, "35:00");
  assert.equal(nodes.get("[data-workout-share-time-label]").textContent, "Apple workout time");
  assert.equal(nodes.get("[data-workout-share-week-label]").textContent, "That week");
  assert.equal(nodes.get("[data-workout-share-apple-stats]").hidden, false);
  assert.match(nodes.get("[data-workout-share-apple-metrics]").innerHTML, /0 kcal/);
  assert.equal(nodes.get("[data-workout-share-apple]").textContent, "Edit Apple Workout");
  await flush();
});

test("Logs Share action routes the exact card key and preserves its return-focus control", async () => {
  const events = {};
  const calls = [];
  const button = { dataset: { shareWorkoutHistory: "session:second-same-day" } };
  const context = evaluate(["handleWorkoutCompletionSharePrompt"], {
    document: { addEventListener: (name, handler) => { events[name] = handler; } },
    openWorkoutHistoryShare: (...args) => calls.push(args)
  });
  context.handleWorkoutCompletionSharePrompt();
  await events.click({ target: {
    closest: (selector) => selector === "[data-share-workout-history]" ? button : null
  } });
  assert.deepEqual(calls, [["session:second-same-day", button]]);
});

test("failed Apple opening leaves the share preview intact and offers a recovery message", async () => {
  const events = {};
  const status = {};
  const actions = [];
  const context = evaluate(["handleWorkoutCompletionSharePrompt"], {
    document: { addEventListener: (name, handler) => { events[name] = handler; }, querySelector: () => status },
    pendingWorkoutCompletionShare: summary(),
    isCoachDashboardPreview: false,
    window: { FWBAppleWorkout: { open: () => false } },
    closeWorkoutCompletionSharePrompt: () => actions.push("close"),
    setClientDashboardTab: () => actions.push("tab")
  });
  context.handleWorkoutCompletionSharePrompt();
  await events.click({ target: {
    closest: (selector) => selector === "[data-workout-share-apple]" ? {} : null
  } });
  assert.deepEqual(actions, []);
  assert.equal(context.pendingWorkoutCompletionShare.historyKey, "session:past-session");
  assert.match(status.textContent, /Add Apple Workout in Logs/);
});
