const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../js/client-portal.js"), "utf8");
const dashboard = fs.readFileSync(path.join(__dirname, "../client-dashboard.html"), "utf8");
const first = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const second = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const newId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const rowA = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const rowB = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
const plain = (value) => JSON.parse(JSON.stringify(value));

function functionSource(name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(match, name);
  const next = source.slice(match.index + match[0].length).search(/\n(?:async\s+)?function\s+[A-Za-z0-9_$]+\s*\(/);
  return source.slice(match.index, match.index + match[0].length + next);
}

function fixture(options = {}) {
  const calls = [], messages = [], confirmations = [], refreshed = [];
  const storage = options.storage || new Map();
  const buttons = [{ disabled: false }, { disabled: false }];
  const context = {
    activeClientEmail: "client@example.com", activeDashboardUser: { email: "CLIENT@example.com" },
    isCoachDashboardPreview: false, clientWorkoutHistoryDeleteInFlight: false,
    clientWorkoutSessionIdentities: new Map(), deletedClientWorkoutSessionIds: new Set(), deletedClientWorkoutContexts: new Set(),
    trainingLogs: [
      { id: rowA, client_email: "client@example.com", entry_date: "2026-09-25", workout_title: "Strength", session_id: first, exercise_code: "A1", set_number: 1 },
      { id: rowB, client_email: "client@example.com", entry_date: "2026-09-25", workout_title: "Strength", session_id: first, exercise_code: "A2", set_number: 1 },
      { id: newId, client_email: "client@example.com", entry_date: "2026-09-25", workout_title: "Strength", session_id: second, exercise_code: "A3", set_number: 1 }
    ],
    workoutSessionFeedback: [{ session_id: first, client_email: "client@example.com" }, { session_id: second, client_email: "client@example.com" }],
    window: { confirm: (message) => { confirmations.push(message); return options.confirm !== false; }, clearTimeout() {}, crypto: { randomUUID: () => newId },
      localStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) } },
    document: { querySelectorAll: (selector) => selector === "[data-delete-workout-history]" ? buttons : [], getElementById: () => ({ focus() {} }) },
    trainingLogAutosaveTimers: new WeakMap(), workoutElapsedTimerState: null,
    activeCustomWorkoutDraft: () => null,
    syncCustomWorkoutCarousels() {}, syncAssignedWorkoutCarousels() {},
    renderClientTrainingLogs: () => refreshed.push("logs"), renderMonthlyProgressReport: () => refreshed.push("progress"), renderClientHomeSummary: () => refreshed.push("home"),
    updateExerciseLogField() {}, formatLogDate: (value) => value,
    withTimeout: (request) => request,
    setClientWorkoutCopyStatus: (message) => messages.push(message),
    supabaseClient: { rpc: async (name, params) => { calls.push({ name, params: plain(params) }); return options.response ? options.response() : { data: { deleted_count: 2, session_id: first }, error: null }; } }
  };
  vm.createContext(context);
  vm.runInContext([
    "normalizeClientEmail", "workoutDisplayTitle", "clientWorkoutHistorySessionKey", "workoutFeedbackSessionId",
    "clientWorkoutLogContextKey", "clientWorkoutHistoryDeleteTarget", "storedClientWorkoutSessionIdentity",
    "rememberClientWorkoutSessionIdentity", "restartDeletedClientWorkoutContext", "workoutLogRowsWithSessionIdentity",
    "clientWorkoutHistoryDeleteLogElements", "clearDeletedClientWorkoutState", "deleteClientWorkoutHistory",
    "upsertLocalTrainingLog", "upsertLocalWorkoutSessionFeedback", "saveTrainingLogRows"
  ].map(functionSource).join("\n"), context);
  return { context, calls, messages, confirmations, refreshed, buttons, storage };
}

test("targets the complete selected session and owning client regardless of date/title overlap", () => {
  const f = fixture();
  f.context.trainingLogs.push({ ...f.context.trainingLogs[0], id: "other", client_email: "other@example.com" });
  const target = f.context.clientWorkoutHistoryDeleteTarget(`session:${first}`);
  assert.deepEqual(plain(target.params), { p_session_id: first });
  assert.deepEqual(plain(target.rows.map((row) => row.id)), [rowA, rowB]);
  assert.equal(f.context.clientWorkoutHistoryDeleteTarget("missing"), null);
});

test("legacy display groups resolve through exact saved row IDs and reject missing identities", () => {
  const f = fixture();
  f.context.trainingLogs = f.context.trainingLogs.slice(0, 2).map(({ session_id, ...row }) => row);
  const target = f.context.clientWorkoutHistoryDeleteTarget("legacy:2026-09-25::strength");
  assert.deepEqual(plain(target.params), { p_log_ids: [rowA, rowB] });
  f.context.trainingLogs[0].id = null;
  assert.equal(f.context.clientWorkoutHistoryDeleteTarget("legacy:2026-09-25::strength"), null);
});

test("saves preserve their real identity after reload and only explicit restart rotates a deleted context", () => {
  const f = fixture();
  const row = { client_email: "client@example.com", entry_date: "2026-09-25", workout_title: "Strength" };
  assert.equal(f.context.workoutLogRowsWithSessionIdentity([row])[0].session_id, first);
  const restored = fixture({ storage: f.storage });
  restored.context.trainingLogs = [];
  assert.equal(restored.context.workoutLogRowsWithSessionIdentity([row])[0].session_id, first, "a restored cached draft must send its deleted original ID even when remote history is empty");
  restored.context.clearDeletedClientWorkoutState({ rows: [row] }, first);
  const nextLaunch = fixture({ storage: f.storage });
  nextLaunch.context.trainingLogs = [];
  assert.equal(nextLaunch.context.workoutLogRowsWithSessionIdentity([row])[0].session_id, first);
  nextLaunch.context.restartDeletedClientWorkoutContext(row);
  const saved = nextLaunch.context.workoutLogRowsWithSessionIdentity([row, { ...row, exercise_code: "A2" }]);
  assert.deepEqual(plain(saved.map((value) => value.session_id)), [newId, newId]);
});

test("older cached drafts with no stored identity retain implicit legacy identity instead of bypassing deletion", () => {
  const f = fixture();
  f.context.trainingLogs = [];
  const row = { client_email: "client@example.com", entry_date: "2026-09-25", workout_title: "Old workout" };
  assert.deepEqual(plain(f.context.workoutLogRowsWithSessionIdentity([row])), [row]);
  f.context.clearDeletedClientWorkoutState({ rows: [row] }, null);
  const restored = fixture({ storage: f.storage });
  restored.context.trainingLogs = [];
  assert.deepEqual(plain(restored.context.workoutLogRowsWithSessionIdentity([row])), [row]);
  restored.context.restartDeletedClientWorkoutContext(row);
  assert.equal(restored.context.workoutLogRowsWithSessionIdentity([row])[0].session_id, newId);
});

test("stored workout identities are client-isolated and unavailable storage cannot invent fresh session IDs", () => {
  const f = fixture();
  const row = { client_email: "client@example.com", entry_date: "2026-09-25", workout_title: "Strength" };
  f.context.rememberClientWorkoutSessionIdentity(row, first);
  const restored = fixture({ storage: f.storage });
  restored.context.trainingLogs = [];
  const other = { ...row, client_email: "other@example.com" };
  assert.deepEqual(plain(restored.context.workoutLogRowsWithSessionIdentity([other])), [other]);
  restored.context.window.localStorage.getItem = () => { throw new Error("Storage blocked"); };
  assert.deepEqual(plain(restored.context.workoutLogRowsWithSessionIdentity([row])), [row]);
});

test("canceling the destructive confirmation performs no writes", async () => {
  const f = fixture({ confirm: false });
  assert.equal(await f.context.deleteClientWorkoutHistory(`session:${first}`), false);
  assert.equal(f.calls.length, 0);
  assert.equal(f.context.trainingLogs.length, 3);
  assert.match(f.confirmations[0], /Strength.*2026-09-25.*cannot be undone.*plans are kept/);
});

test("confirmed deletion removes only chosen logs and ratings and refreshes history and totals", async () => {
  const f = fixture();
  assert.equal(await f.context.deleteClientWorkoutHistory(`session:${first}`), true);
  assert.deepEqual(f.calls, [{ name: "delete_client_workout_session", params: { p_session_id: first } }]);
  assert.deepEqual(plain(f.context.trainingLogs.map((row) => row.session_id)), [second]);
  assert.deepEqual(plain(f.context.workoutSessionFeedback.map((row) => row.session_id)), [second]);
  assert.deepEqual(f.refreshed, ["logs", "progress", "home"]);
  assert.equal(f.messages.at(-1), "Workout deleted.");
  assert.ok(f.buttons.every((button) => !button.disabled));
});

test("network failure preserves history and allows a deliberate retry", async () => {
  let attempt = 0;
  const f = fixture({ response: () => ++attempt === 1 ? Promise.reject(new Error("offline")) : { data: { deleted_count: 0, session_id: first }, error: null } });
  assert.equal(await f.context.deleteClientWorkoutHistory(`session:${first}`), false);
  assert.equal(f.context.trainingLogs.length, 3);
  assert.match(f.messages.at(-1), /Could not confirm deletion.*Try again/);
  assert.equal(await f.context.deleteClientWorkoutHistory(`session:${first}`), true);
  assert.equal(f.context.trainingLogs.length, 1);
});

test("coach preview and account mismatch cannot invoke client deletion", async () => {
  const f = fixture();
  f.context.isCoachDashboardPreview = true;
  assert.equal(await f.context.deleteClientWorkoutHistory(`session:${first}`), false);
  f.context.isCoachDashboardPreview = false;
  f.context.activeDashboardUser.email = "someone@example.com";
  assert.equal(await f.context.deleteClientWorkoutHistory(`session:${first}`), false);
  assert.equal(f.calls.length, 0);
  assert.equal(f.confirmations.length, 0);
});

test("pending deletion blocks duplicate requests and account switches do not mutate the next client", async () => {
  let finish;
  const f = fixture({ response: () => new Promise((resolve) => { finish = resolve; }) });
  const pending = f.context.deleteClientWorkoutHistory(`session:${first}`);
  assert.ok(f.buttons.every((button) => button.disabled));
  assert.equal(await f.context.deleteClientWorkoutHistory(`session:${first}`), false);
  f.context.activeClientEmail = "next@example.com";
  finish({ data: { deleted_count: 2, session_id: first }, error: null });
  assert.equal(await pending, false);
  assert.equal(f.calls.length, 1);
  assert.equal(f.context.trainingLogs.length, 3);
});

test("malformed server responses never remove local workout history", async () => {
  const f = fixture({ response: () => ({ data: { deleted_count: 2, session_id: second }, error: null }) });
  assert.equal(await f.context.deleteClientWorkoutHistory(`session:${first}`), false);
  assert.equal(f.context.trainingLogs.length, 3);
});

test("late save responses cannot add deleted sets or ratings back into the page", async () => {
  const f = fixture();
  const oldRow = { ...f.context.trainingLogs[0] };
  await f.context.deleteClientWorkoutHistory(`session:${first}`);
  f.context.upsertLocalTrainingLog(oldRow);
  f.context.upsertLocalWorkoutSessionFeedback({ client_email: "client@example.com", session_id: first });
  assert.equal(f.context.trainingLogs.length, 1);
  assert.equal(f.context.workoutSessionFeedback.length, 1);
});

test("late save and feedback records from another account cannot affect current state or durable identities", () => {
  const f = fixture();
  const oldRow = { ...f.context.trainingLogs[0], client_email: "previous@example.com" };
  f.context.upsertLocalTrainingLog(oldRow);
  f.context.upsertLocalWorkoutSessionFeedback({ client_email: "previous@example.com", session_id: newId });
  assert.equal(f.context.trainingLogs.length, 3);
  assert.equal(f.context.workoutSessionFeedback.length, 2);
  assert.equal(f.storage.size, 0);
});

test("an in-flight workout save cannot update the new account after a switch", async () => {
  const f = fixture();
  let finish;
  f.context.rowsForTrainingLog = () => [{ ...f.context.trainingLogs[0] }];
  f.context.supabaseClient.from = () => ({ upsert: (rows) => ({ select: () => new Promise((resolve) => { finish = () => resolve({ data: rows, error: null }); }) }) });
  const pending = f.context.saveTrainingLogRows(null, [{}], {}, { skipRemovedSetDelete: true, skipLogRefresh: true });
  await Promise.resolve();
  f.context.activeClientEmail = "next@example.com";
  finish();
  assert.equal((await pending).saved, false);
  assert.equal(f.refreshed.length, 0);
  assert.equal(f.context.trainingLogs.length, 3);
});

test("switching accounts during removed-set reconciliation never starts an upsert for the new client", async () => {
  const f = fixture();
  let finish;
  f.context.deleteRemovedTrainingLogRows = () => new Promise((resolve) => { finish = () => resolve({ deletedCount: 0, error: null }); });
  f.context.rowsForTrainingLog = () => { throw new Error("Must not read old form for a different client"); };
  const pending = f.context.saveTrainingLogRows(null, [{}], {});
  f.context.activeClientEmail = "next@example.com";
  finish();
  assert.equal((await pending).saved, false);
  assert.equal(f.refreshed.length, 0);
});

test("desktop and mobile workout history both expose deletion and release assets are refreshed", () => {
  const render = functionSource("renderClientTrainingLogs");
  assert.equal(render.split("${deleteButtonMarkup}").length - 1, 2);
  assert.match(render, /deleteButtonMarkup = !isCoachDashboardPreview/);
  assert.match(render, /data-delete-workout-history=.*Delete workout/);
  assert.match(source, /handleClientWorkoutHistoryDelete\(\);/);
  assert.match(dashboard, /css\/style\.css\?[^"\n]*workout-delete=1/);
  assert.match(dashboard, /js\/client-portal\.js\?[^"\n]*workout-delete=1/);
});
