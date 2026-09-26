const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const engine = require("../js/client-achievements.js");
const ui = require("../js/client-achievements-ui.js");

const portal = fs.readFileSync(path.join(__dirname, "../js/client-portal.js"), "utf8");
const dashboard = fs.readFileSync(path.join(__dirname, "../client-dashboard.html"), "utf8");
const achievementStyles = fs.readFileSync(path.join(__dirname, "../css/client-achievements.css"), "utf8");
const today = "2026-09-25";
const row = (values = {}) => ({
  client_email: "client@example.com", entry_date: today, workout_title: "Strength",
  session_id: "first", exercise_name: "Squat", exercise_code: "A1", set_number: 1,
  reps: 8, weight_used: 100, completed_at: `${today}T12:00:00Z`, ...values
});
const evaluate = (records) => engine.evaluate(records, { today, clientEmail: "client@example.com" });

function functionSource(name) {
  const start = portal.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start >= 0, name);
  const rest = portal.slice(start);
  const end = rest.slice(1).search(/\n(?:async )?function /);
  return end < 0 ? rest : rest.slice(0, end + 1);
}

test("trophy room shows the full collection, distinct tiers, earned dates and locked progress", () => {
  const snapshot = evaluate([row()]);
  const html = ui.roomMarkup(snapshot);
  assert.equal((html.match(/<li class="achievement-badge /g) || []).length, 24);
  assert.match(html, /1 \/ 24 earned/);
  assert.match(html, /Earned Sep 25, 2026/);
  assert.match(html, /To unlock/);
  assert.match(html, /1 \/ 5/);
  for (const tier of ["bronze", "silver", "gold", "platinum"]) assert.match(html, new RegExp(`achievement-tier-${tier}`));
  assert.match(html, /Rest days are part of the plan/);
});

test("record filtering only shows PR badges and exposes an accessible selected button", () => {
  const html = ui.roomMarkup(evaluate([]), "records");
  assert.equal((html.match(/<li class="achievement-badge /g) || []).length, 4);
  assert.match(html, /data-achievement-filter="records" aria-pressed="true"/);
  assert.match(html, /Personal Best/);
  assert.doesNotMatch(html, /<h4>First Spark/);
  assert.equal((ui.roomMarkup(evaluate([]), '"onclick="bad').match(/<li class="achievement-badge /g) || []).length, 24);
});

test("Cardio and Recovery filters expose the new endurance, mobility, and yoga medals", () => {
  const cardio = ui.roomMarkup(evaluate([]), "cardio");
  const recovery = ui.roomMarkup(evaluate([]), "recovery");
  assert.equal((cardio.match(/<li class="achievement-badge /g) || []).length, 3);
  assert.equal((recovery.match(/<li class="achievement-badge /g) || []).length, 6);
  assert.match(cardio, /Endurance Engine/);
  assert.match(recovery, /Stretch Start/);
  assert.match(recovery, /Rooted &amp; Rising/);
  assert.match(recovery, /data-achievement-filter="recovery" aria-pressed="true"/);
});

test("every badge has its own local fitness medal and unexpected IDs cannot create image paths", () => {
  const art = new Set();
  for (const badge of evaluate([]).badges) {
    const file = path.join(__dirname, `../images/achievements/${badge.id}.svg`);
    const svg = fs.readFileSync(file, "utf8");
    assert.match(svg, /viewBox="0 0 128 128"/);
    assert.doesNotMatch(svg, /<script|<foreignObject|https?:\/\/(?!www\.w3\.org)/);
    art.add(svg);
    assert.match(ui.badgeMarkup(badge), new RegExp(`src="images/achievements/${badge.id}\\.svg`));
  }
  assert.equal(art.size, 24);
  const invalid = ui.badgeMarkup({ ...evaluate([]).badges[0], id: '../../private/" onerror="bad' });
  assert.doesNotMatch(invalid, /<img|onerror|private/);
});

test("home links to Progress and displays the next reachable badge and XP", () => {
  const html = ui.homeMarkup(evaluate([row()]));
  assert.match(html, /data-client-summary-go-tab="progress"/);
  assert.match(html, /200 XP/);
  assert.match(html, /100 XP to Finding Your Groove/);
  assert.match(html, /Next badge/);
  assert.match(html, /1 \/ 3/);
});

test("Progress has an upper-right badge button that opens the full collection dialog", () => {
  assert.doesNotMatch(dashboard, /client-achievements-nav-launcher|data-profile-badge-image|data-profile-badge-placeholder/);
  assert.match(dashboard, /class="client-achievements-progress-button"[\s\S]*data-achievements-dialog-open[\s\S]*aria-label="Open your badges"/);
  assert.match(dashboard, /<dialog class="client-achievements-dialog"[\s\S]*data-client-achievements-room/);
  assert.match(achievementStyles, /\.progress-panel-actions/);
  assert.match(achievementStyles, /\.client-achievements-progress-button/);
});

test("unknown history shows loading or a retry state instead of fabricated zero wins", () => {
  assert.match(ui.stateMarkup("loading", true), /Loading your wins/);
  const html = ui.stateMarkup("error", false);
  assert.match(html, /Couldn’t load your wins/);
  assert.match(html, /data-achievement-retry/);
  assert.doesNotMatch(html, /0 XP|Getting Started|First Spark/);
});

test("only a newly finished session celebrates its new badges and records", () => {
  const beforeRows = [row({ entry_date: "2026-09-24", completed_at: "2026-09-24T12:00:00Z" })];
  const second = row({ session_id: "second", weight_used: 105 });
  const before = evaluate(beforeRows);
  const after = evaluate([...beforeRows, second]);
  const celebration = ui.celebrationForSession(before, after, [engine.sessionKey(second)]);
  assert.equal(celebration.level.number, 2);
  assert.equal(celebration.xp, 250);
  assert.ok(celebration.events.some((event) => event.kind === "pr"));
  assert.ok(celebration.events.some((event) => event.badgeId === "pr-1"));
  assert.ok(celebration.events.every((event) => event.sessionId === "session:second"));
  assert.ok(celebration.events.every((event) => event.badgeId !== "workout-1"));
  assert.equal(ui.celebrationForSession(after, after, [engine.sessionKey(second)]), null);
  assert.equal(ui.celebrationForSession(null, after, [engine.sessionKey(second)]), null);
  assert.equal(ui.celebrationForSession(before, after, ["session:unrelated"]), null);
});

test("reopening the same finish does not repeat celebrations and different accounts remain independent", () => {
  const storageValues = new Map();
  const storage = { getItem: key => storageValues.get(key), setItem: (key, value) => storageValues.set(key, value) };
  const celebration = { events: [], level: { number: 2 }, sessionIds: ["session:dedupe"], xp: 100 };
  assert.equal(ui.takeCelebration(celebration, "First@Example.com ", storage), celebration);
  assert.equal(ui.takeCelebration(celebration, "first@example.com", storage), null);
  assert.equal(ui.takeCelebration(celebration, "second@example.com", storage), celebration);
  assert.equal(ui.takeCelebration(celebration, "", storage), null);
});

test("a completed workout can level up without a new badge or PR", () => {
  const first = row({ entry_date: "2026-09-24", completed_at: "2026-09-24T12:00:00Z" });
  const second = row({ session_id: "level-only" });
  const before = evaluate([first]);
  const after = evaluate([first, second]);
  assert.equal(ui.celebrationForSession(before, after, ["session:level-only"]), null);
  const celebration = ui.celebrationForSession(before, after, ["session:level-only"], { completedSession: true });
  assert.equal(celebration.level.number, 2);
  assert.deepEqual(celebration.events, []);
  assert.equal(celebration.xp, 100);
});

test("denied local storage still allows a single celebration during this visit", () => {
  const denied = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } };
  const celebration = { events: [], level: { number: 2 }, sessionIds: ["session:denied-storage"], xp: 100 };
  assert.equal(ui.takeCelebration(celebration, "client@example.com", denied), celebration);
  assert.equal(ui.takeCelebration(celebration, "client@example.com", denied), null);
});

test("client-controlled exercise names remain plain text inside celebrations", () => {
  const html = ui.celebrationMarkup({ events: [{ kind: "pr", title: '<img src=x onerror="bad()">', detail: "A&B" }], xp: 50 });
  assert.doesNotMatch(html, /<img src=x/);
  assert.equal((html.match(/<img /g) || []).length, 1, "Only the trusted local medal image renders");
  assert.match(html, /&lt;img/);
  assert.match(html, /A&amp;B/);
  assert.equal(ui.celebrationMarkup(null), "");
});

test("controller filters in place, restores filter focus, and routes a retry", () => {
  let click;
  let focused = false;
  let retries = 0;
  const home = { innerHTML: "" };
  const room = { innerHTML: "" };
  const document = {
    querySelector(selector) {
      if (selector === "[data-client-achievements-home]") return home;
      if (selector === "[data-client-achievements-room]") return room;
      return { focus() { focused = true; } };
    },
    addEventListener(type, handler) { assert.equal(type, "click"); click = handler; }
  };
  const controller = ui.createController(document, () => { retries += 1; });
  controller.render(evaluate([]), "ready");
  click({ target: { closest: selector => selector === "[data-achievement-filter]" ? { dataset: { achievementFilter: "records" } } : null } });
  assert.match(room.innerHTML, /data-achievement-filter="records" aria-pressed="true"/);
  assert.equal(focused, true);
  controller.render(null, "error");
  click({ target: { closest: selector => selector === "[data-achievement-retry]" ? {} : null } });
  assert.equal(retries, 1);
  assert.match(home.innerHTML, /Couldn’t load your wins/);
});

test("controller opens and closes the badge dialog from the Progress button", () => {
  let click;
  const dialog = {
    open: false,
    showModal() { this.open = true; },
    close() { this.open = false; }
  };
  const document = {
    querySelector(selector) {
      if (selector === "[data-achievements-dialog]") return dialog;
      return null;
    },
    addEventListener(_type, handler) { click = handler; }
  };
  ui.createController(document);
  click({ target: { closest: selector => selector === "[data-achievements-dialog-open]" ? {} : null } });
  assert.equal(dialog.open, true);
  click({ target: { closest: selector => selector === "[data-achievements-dialog-close]" ? {} : null } });
  assert.equal(dialog.open, false);
});

test("portal never evaluates failed or incomplete history as a fresh account", () => {
  const context = vm.createContext({
    window: { FWB_ACHIEVEMENTS: engine }, clientAchievementHistoryStatus: "loading",
    trainingLogs: [row()], todayDate: () => today, activeClientEmail: "client@example.com"
  });
  vm.runInContext(functionSource("clientAchievementSnapshot"), context);
  assert.equal(context.clientAchievementSnapshot(), null);
  context.clientAchievementHistoryStatus = "error";
  assert.equal(context.clientAchievementSnapshot(), null);
  context.clientAchievementHistoryStatus = "ready";
  assert.equal(context.clientAchievementSnapshot().workouts, 1);
});

test("retry uses full history, rejects account changes, and leaves failure visible", async () => {
  const rendered = [];
  const populated = [];
  let finish;
  const context = vm.createContext({
    clientAchievementRetryInFlight: false, clientAchievementHistoryStatus: "error", activeClientEmail: "client@example.com",
    trainingLogs: [],
    supabaseClient: {}, renderClientAchievements: () => rendered.push(context.clientAchievementHistoryStatus),
    renderClientTrainingLogs: () => populated.push(context.trainingLogs),
    loadClientWorkoutLogHistory: () => new Promise(resolve => { finish = resolve; })
  });
  vm.runInContext(functionSource("retryClientAchievements"), context);
  const stale = context.retryClientAchievements();
  context.activeClientEmail = "other@example.com";
  finish({ data: [row()], error: null });
  await stale;
  assert.deepEqual(populated, []);
  context.activeClientEmail = "client@example.com";
  const failure = context.retryClientAchievements();
  finish({ data: null, error: new Error("offline") });
  await failure;
  assert.equal(context.clientAchievementHistoryStatus, "error");
  assert.equal(rendered.at(-1), "error");
  const success = context.retryClientAchievements();
  finish({ data: [row()], error: null });
  await success;
  assert.equal(context.clientAchievementHistoryStatus, "ready");
  assert.equal(populated[0].length, 1);
});

test("completion adds wins to the existing sheet and historic share clears them", () => {
  const nodes = new Map();
  const overlay = { querySelector: selector => {
    if (!nodes.has(selector)) nodes.set(selector, { focus() {} });
    return nodes.get(selector);
  } };
  const context = vm.createContext({
    window: { FWB_ACHIEVEMENTS_UI: ui }, document: { body: { classList: { add() {} } } },
    ensureWorkoutCompletionSharePrompt: () => overlay, formatLogDate: value => value,
    escapeHtml: value => value, isCoachDashboardPreview: false, workoutCompletionShareImage: async () => null
  });
  vm.runInContext(functionSource("openWorkoutCompletionSharePrompt"), context);
  const summary = { title: "Strength", entryDate: today, weeklyWorkoutCount: 1 };
  const celebration = ui.celebrationForSession(evaluate([]), evaluate([row()]), ["session:first"]);
  context.openWorkoutCompletionSharePrompt(summary, null, celebration);
  assert.equal(nodes.get("[data-workout-achievements]").hidden, false);
  assert.match(nodes.get("[data-workout-achievements]").innerHTML, /First Spark/);
  context.openWorkoutCompletionSharePrompt(summary);
  assert.equal(nodes.get("[data-workout-achievements]").hidden, true);
});

for (const activity of ["strength", "cardio"]) test(`${activity} feedback retry preserves new awards and celebrates only once`, async () => {
  let handler;
  let feedbackAttempts = 0;
  let snapshot = evaluate([]);
  const opened = [];
  const log = { dataset: { workoutTitle: "Strength" } };
  const button = { dataset: {} };
  const section = {
    dataset: {}, classList: { contains: value => activity === "cardio" && value === "client-workout-panel-cardio" },
    querySelectorAll(selector) { return selector === "[data-exercise-log]" ? [log] : []; },
    querySelector() { return null; }
  };
  const savedRow = row({ session_id: `feedback-retry-${activity}`, ...(activity === "cardio" ? { exercise_code: "CARDIO", exercise_name: "Running", weight_used: 30 } : {}) });
  const context = vm.createContext({
    window: { FWB_ACHIEVEMENTS: engine, FWB_ACHIEVEMENTS_UI: ui },
    document: { addEventListener: (_name, action) => { handler = action; } },
    activeClientEmail: "client@example.com", isCoachDashboardPreview: false,
    clientAchievementSnapshot: () => snapshot, todayDate: () => today,
    workoutSectionForButton: () => section, workoutFinishIssues: () => [], showWorkoutFinishIssues: () => true,
    cancelTrainingLogAutosaves() {}, workoutElapsedTimerState: {}, pauseWorkoutTimersForCompletion: () => ({}),
    workoutCompletionFields: () => ({ completed_at: savedRow.completed_at }),
    cardioWorkoutCompletionFields: () => ({ completed_at: savedRow.completed_at, workout_duration_seconds: 1800 }),
    requestWorkoutDifficulty: async () => ({ difficulty: "moderate" }), workoutHistoryDifficultyLabel: () => "Moderate",
    async saveTrainingLogRows() { snapshot = evaluate([savedRow]); return { saved: true, rows: [savedRow] }; },
    finishWorkoutElapsedTimer() {}, renderClientTrainingLogs() {},
    saveWorkoutDifficultyFeedback: async () => ({ saved: ++feedbackAttempts > 1 }),
    pendingGroupedCustomWorkoutRestart: null, workoutCompletionShareSummary: () => ({ title: "Strength" }),
    openWorkoutCompletionSharePrompt: (...args) => opened.push(args)
  });
  for (const name of ["clientWorkoutAchievementCelebration", "handleTrainingLogSave"]) vm.runInContext(functionSource(name), context);
  await context.handleTrainingLogSave();
  const event = { target: { closest: selector => selector === "[data-workout-finish]" ? button : null } };
  await handler(event);
  assert.equal(opened.length, 0);
  assert.equal(section.workoutAchievementBeforeFeedback.workouts, 0);
  assert.equal(snapshot.workouts, 1);
  await handler(event);
  assert.equal(opened.length, 1);
  assert.deepEqual(opened[0][2].events.map(event => event.badgeId), activity === "cardio" ? ["workout-1", "cardio-1"] : ["workout-1"]);
  assert.equal(section.workoutAchievementBeforeFeedback, undefined);
  await handler(event);
  assert.equal(opened[1][2], null);
});
