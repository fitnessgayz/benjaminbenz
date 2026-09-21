const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const portal = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");
const admin = fs.readFileSync(path.join(root, "js/coach-admin.js"), "utf8");

function sourceFunction(source, name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(match, `${name} must exist`);
  const start = match.index;
  const next = source.slice(start + match[0].length).search(/\n(?:async\s+)?function\s+[A-Za-z0-9_$]+\s*\(/);
  assert.ok(next >= 0, `${name} must have a following declaration`);
  return source.slice(start, start + match[0].length + next);
}

function evaluate(source, names, context = {}) {
  vm.createContext(context);
  vm.runInContext(names.map((name) => sourceFunction(source, name)).join("\n"), context);
  return context;
}

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const plain = (value) => JSON.parse(JSON.stringify(value));
const firstSession = "AA000000-0000-4000-8000-000000000001";
const secondSession = "BB000000-0000-4000-8000-000000000002";
const baseLog = {
  client_email: "client@example.test",
  entry_date: "2026-09-21",
  workout_title: "Full Body",
  exercise_code: "A1",
  exercise_name: "Squat",
  set_number: 1,
  weight_used: 100,
  reps: 8
};

test("coach and client attachment keys distinguish sessions and use the same legacy fallback", () => {
  const client = evaluate(portal, ["clientWorkoutHistorySessionKey"]);
  const coach = evaluate(admin, ["coachWorkoutHistorySessionKey"]);
  const cases = [
    [{ ...baseLog, session_id: ` ${firstSession} `, workout_session_id: secondSession }, `session:${firstSession.toLowerCase()}`],
    [{ ...baseLog, workout_session_id: secondSession }, `session:${secondSession.toLowerCase()}`],
    [{ ...baseLog, session_id: "", workout_session_id: secondSession }, `session:${secondSession.toLowerCase()}`],
    [{ ...baseLog, workout_title: " FULL Body " }, "legacy:2026-09-21::full body"],
    [{ entry_date: "2026-09-21" }, "legacy:2026-09-21::workout"]
  ];
  for (const [record, expected] of cases) {
    assert.equal(client.clientWorkoutHistorySessionKey(record), expected);
    assert.equal(coach.coachWorkoutHistorySessionKey(record), expected);
  }
  assert.notEqual(cases[0][1], cases[1][1], "Same-name workouts on the same date need separate attachment targets");
});

test("client attachment choices deduplicate sets without merging same-day sessions", () => {
  const context = evaluate(portal, ["clientWorkoutHistorySessionKey", "clientAppleWorkoutSessions"], {
    trainingLogs: [
      { ...baseLog, session_id: firstSession, completed_at: "2026-09-21T08:30:00Z", created_at: "2026-09-21T08:00:00Z" },
      { ...baseLog, session_id: firstSession, set_number: 2 },
      { ...baseLog, workout_session_id: secondSession, created_at: "2026-09-21T17:00:00Z" },
      { ...baseLog, entry_date: "2026-09-20" }
    ]
  });
  assert.deepEqual(plain(context.clientAppleWorkoutSessions()), [
    { history_key: `session:${firstSession.toLowerCase()}`, entry_date: "2026-09-21", workout_title: "Full Body", completed_at: "2026-09-21T08:30:00Z" },
    { history_key: `session:${secondSession.toLowerCase()}`, entry_date: "2026-09-21", workout_title: "Full Body", completed_at: "2026-09-21T17:00:00Z" },
    { history_key: "legacy:2026-09-20::full body", entry_date: "2026-09-20", workout_title: "Full Body", completed_at: "" }
  ]);
});

test("coach summaries separate sessions and clients while retaining all sets", () => {
  const context = evaluate(admin, ["coachWorkoutHistorySessionKey", "summarizeTrainingLogs"], { normalizeEmail });
  const summaries = plain(context.summarizeTrainingLogs([
    { ...baseLog, session_id: firstSession },
    { ...baseLog, session_id: firstSession, set_number: 2 },
    { ...baseLog, workout_session_id: secondSession },
    { ...baseLog, client_email: "other@example.test", session_id: firstSession }
  ]));
  assert.equal(summaries.length, 3);
  assert.equal(summaries.find((entry) => entry.client_email === baseLog.client_email && entry.history_key === `session:${firstSession.toLowerCase()}`).set_count, 2);
  assert.equal(summaries.find((entry) => entry.history_key === `session:${secondSession.toLowerCase()}`).set_count, 1);
  assert.equal(summaries.find((entry) => entry.client_email === "other@example.test").set_count, 1);
});

test("coach detailed logs request each workout's own Apple attachment markup", () => {
  const history = { innerHTML: "" };
  const keys = [];
  const context = evaluate(admin, ["coachWorkoutHistorySessionKey", "renderTrainingLogs"], {
    document: { getElementById: () => history },
    window: { FWBAppleWorkout: { markup: (key) => { keys.push(key); return `<aside>${key}</aside>`; } } },
    trainingLogs: [
      { ...baseLog, session_id: firstSession },
      { ...baseLog, session_id: firstSession, set_number: 2 },
      { ...baseLog, session_id: secondSession }
    ],
    trainingLogDateFilter: "",
    trainingLogSearchFilter: "",
    trainingLogMatchesSearch: () => true,
    warmupExerciseCode: "WARMUP",
    cardioExerciseCode: "CARDIO",
    escapeHtml: String,
    formatAdminDate: String,
    exerciseNoteSummary: () => "",
    isWarmUpWorkoutSet: () => false,
    workoutSetLabel: (row) => `Set ${row.set_number}`
  });
  context.renderTrainingLogs();
  assert.deepEqual(keys.sort(), [`session:${firstSession.toLowerCase()}`, `session:${secondSession.toLowerCase()}`].sort());
  assert.equal((history.innerHTML.match(/class="training-log-workout-group"/g) || []).length, 2);
  assert.equal((history.innerHTML.match(/<aside>/g) || []).length, 2);
});

test("completion share summary takes attachment identity from saved rows, including the legacy fallback", () => {
  const context = evaluate(portal, ["workoutFeedbackSessionId", "clientWorkoutHistorySessionKey", "workoutCompletionShareSummary"], {
    window: {},
    warmupExerciseCode: "WARMUP",
    todayDate: () => "2026-09-21",
    workoutElapsedTimeLabel: () => "00:42",
    completedWorkoutCountForWeek: () => 2,
    workoutDifficultyLabel: () => "Moderate"
  });
  const completion = { workout_duration_seconds: 42, completed_at: "2026-09-21T12:00:00Z" };
  const summary = context.workoutCompletionShareSummary([
    { ...baseLog, exercise_code: "WARMUP" },
    { ...baseLog, session_id: firstSession, workout_session_id: secondSession }
  ], completion, 3);
  assert.equal(summary.historyKey, `session:${firstSession.toLowerCase()}`);
  assert.equal(summary.title, "Full Body");
  assert.equal(summary.entryDate, "2026-09-21");
  assert.equal(summary.durationSeconds, 42);
  assert.equal(summary.exerciseCount, 1);
  assert.equal(context.workoutCompletionShareSummary([{ ...baseLog, workout_session_id: secondSession }]).historyKey, `session:${secondSession.toLowerCase()}`);
  assert.equal(context.workoutCompletionShareSummary([baseLog]).historyKey, "legacy:2026-09-21::full body");
  assert.equal(context.workoutCompletionShareSummary([]).historyKey, "", "An unsaved workout must not acquire an invented attachment key");
});

test("completion attachment action keeps the selected session when dismissing the share sheet", async () => {
  const events = {};
  const calls = [];
  let savedCallback;
  const context = evaluate(portal, ["handleWorkoutCompletionSharePrompt"], {
    document: { addEventListener: (name, handler) => { events[name] = handler; } },
    pendingWorkoutCompletionShare: { historyKey: `session:${secondSession.toLowerCase()}` },
    isCoachDashboardPreview: false,
    window: { FWBAppleWorkout: { open: (key, options) => {
      calls.push(["open", key]);
      savedCallback = options.onSaved;
      return true;
    } } },
    openWorkoutHistoryShare: (key) => calls.push(["reopen", key]),
    closeWorkoutCompletionSharePrompt: (options) => {
      calls.push(["close", plain(options)]);
      context.pendingWorkoutCompletionShare = null;
    },
    setClientDashboardTab: (tab) => calls.push(["tab", tab])
  });
  context.handleWorkoutCompletionSharePrompt();
  const event = { target: { closest: (selector) => selector === "[data-workout-share-apple]" ? {} : null, matches: () => false } };
  await events.click(event);
  assert.deepEqual(calls, [["open", `session:${secondSession.toLowerCase()}`], ["close", { restoreFocus: false }], ["tab", "logs"]]);
  savedCallback({ history_key: `session:${firstSession.toLowerCase()}` });
  assert.deepEqual(calls.at(-1), ["reopen", `session:${firstSession.toLowerCase()}`], "Return to the workout the user actually linked");

  calls.length = 0;
  context.pendingWorkoutCompletionShare = { historyKey: `session:${firstSession.toLowerCase()}` };
  context.isCoachDashboardPreview = true;
  await events.click(event);
  assert.deepEqual(calls, [], "Coach preview must not open a client attachment editor");
  context.isCoachDashboardPreview = false;
  context.pendingWorkoutCompletionShare = { historyKey: "" };
  await events.click(event);
  assert.deepEqual(calls, [], "Missing persisted workout identity must not open an attachment editor");
});

test("completion sheet hides Apple entry for coach preview, missing identity, or unavailable module", async () => {
  const nodes = new Map();
  const overlay = { hidden: true, querySelector: (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, { focus() {} });
    return nodes.get(selector);
  } };
  const context = evaluate(portal, ["openWorkoutCompletionSharePrompt"], {
    ensureWorkoutCompletionSharePrompt: () => overlay,
    document: { body: { classList: { add() {} } } },
    window: { FWBAppleWorkout: {} },
    isCoachDashboardPreview: false,
    formatLogDate: (date) => date || "",
    escapeHtml: String,
    randomWorkoutCompletionMessage: () => "Well done",
    workoutCompletionShareImage: async () => null
  });
  const summary = { historyKey: `session:${firstSession.toLowerCase()}`, title: "Full Body", exerciseNames: [], exerciseCount: 0 };
  const appleButton = () => nodes.get("[data-workout-share-apple]");
  context.openWorkoutCompletionSharePrompt(summary);
  assert.equal(appleButton().hidden, false);
  context.isCoachDashboardPreview = true;
  context.openWorkoutCompletionSharePrompt(summary);
  assert.equal(appleButton().hidden, true);
  context.isCoachDashboardPreview = false;
  context.openWorkoutCompletionSharePrompt({ ...summary, historyKey: "" });
  assert.equal(appleButton().hidden, true);
  delete context.window.FWBAppleWorkout;
  context.openWorkoutCompletionSharePrompt(summary);
  assert.equal(appleButton().hidden, true);
  await Promise.resolve();
});

test("client and coach integrations configure the correct account and read-only mode", () => {
  const configurations = [];
  let attached = 0;
  const module = { configure: (options) => configurations.push(options), attach: () => attached++ };
  const client = evaluate(portal, ["configureClientAppleWorkouts"], {
    window: { FWBAppleWorkout: module },
    supabaseClient: {},
    activeDashboardUser: { id: "signed-in-user" },
    activeClientEmail: " Client@Example.Test ",
    normalizeClientEmail: normalizeEmail,
    isCoachDashboardPreview: false,
    clientAppleWorkoutSessions: () => ["client-sessions"],
    renderClientTrainingLogs: () => "refreshed"
  });
  client.configureClientAppleWorkouts();
  assert.equal(configurations[0].clientEmail, "client@example.test");
  assert.equal(configurations[0].readOnly, false);
  assert.equal(configurations[0].automaticReading, true, "Selecting a screenshot must automatically populate the review form");
  assert.deepEqual(configurations[0].getWorkouts(), ["client-sessions"]);
  assert.equal(configurations[0].onSaved(), "refreshed");
  client.isCoachDashboardPreview = true;
  client.configureClientAppleWorkouts();
  assert.equal(configurations[1].readOnly, true);

  const coach = evaluate(admin, ["configureCoachAppleWorkouts"], {
    window: { FWBAppleWorkout: module }, coachSupabase: {}, normalizeEmail
  });
  coach.configureCoachAppleWorkouts(" Other@Example.Test ");
  assert.equal(configurations[2].clientEmail, "other@example.test");
  assert.equal(configurations[2].readOnly, true);
  assert.deepEqual(plain(configurations[2].getWorkouts()), []);
  assert.equal(attached, 3);
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function coachLoaderFixture() {
  const queries = new Map();
  const rendered = [];
  const configured = [];
  const statuses = [];
  const supabase = { from: (table) => {
    assert.equal(table, "client_workout_logs");
    let email;
    const chain = {
      select: () => chain,
      ilike: (column, value) => { assert.equal(column, "client_email"); email = value; return chain; },
      order: () => chain,
      limit: () => {
        const pending = deferred();
        queries.set(email, pending);
        return pending.promise;
      }
    };
    return chain;
  } };
  const context = evaluate(admin, ["loadTrainingLogsForEmail"], {
    coachTrainingLogLoadVersion: 0,
    coachSupabase: supabase,
    trainingLogs: [],
    activeAdminTab: "progress",
    configureCoachAppleWorkouts: (email) => configured.push(email),
    normalizeEmail,
    withRequestTimeout: (promise) => promise,
    window: { FWBAppleWorkout: { load: async () => [] } },
    trainingLogStatus: (status) => statuses.push(status),
    workoutAnalysisStatus() {},
    renderWorkoutAnalysisPanel() {},
    renderTrainingLogs: () => rendered.push(plain(context.trainingLogs)),
    renderSelectedClientTrainingLogs: () => rendered.push(plain(context.trainingLogs))
  });
  return { context, queries, rendered, configured, statuses };
}

test("late coach log responses cannot replace the newly selected client's attachment context", async () => {
  const { context, queries, rendered, configured } = coachLoaderFixture();
  const first = context.loadTrainingLogsForEmail("first@example.test");
  const second = context.loadTrainingLogsForEmail("second@example.test");
  const secondRows = [{ ...baseLog, client_email: "second@example.test", session_id: secondSession }];
  queries.get("second@example.test").resolve({ data: secondRows, error: null });
  await second;
  const renderCount = rendered.length;
  queries.get("first@example.test").resolve({ data: [{ ...baseLog, client_email: "first@example.test", session_id: firstSession }], error: null });
  await first;
  assert.deepEqual(plain(context.trainingLogs), secondRows);
  assert.equal(rendered.length, renderCount, "Stale rows must not trigger rendering against the new attachment cache");
  assert.deepEqual(configured, ["first@example.test", "second@example.test"]);
});

test("a stale coach request failure cannot clear newer client logs", async () => {
  const { context, queries, rendered, statuses } = coachLoaderFixture();
  const first = context.loadTrainingLogsForEmail("first@example.test");
  const second = context.loadTrainingLogsForEmail("second@example.test");
  const secondRows = [{ ...baseLog, client_email: "second@example.test", session_id: secondSession }];
  queries.get("second@example.test").resolve({ data: secondRows, error: null });
  await second;
  const renderCount = rendered.length;
  queries.get("first@example.test").reject(new Error("Old client request failed"));
  await first;
  assert.deepEqual(plain(context.trainingLogs), secondRows);
  assert.equal(rendered.length, renderCount);
  assert.equal(statuses.includes("Old client request failed"), false);
});

test("clearing the selected coach client invalidates in-flight logs", async () => {
  const { context, queries, configured } = coachLoaderFixture();
  const pending = context.loadTrainingLogsForEmail("first@example.test");
  await context.loadTrainingLogsForEmail("");
  queries.get("first@example.test").resolve({ data: [baseLog], error: null });
  await pending;
  assert.deepEqual(plain(context.trainingLogs), []);
  assert.equal(configured.at(-1), "");
});
