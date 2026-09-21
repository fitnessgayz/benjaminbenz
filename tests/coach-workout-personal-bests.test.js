const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/coach-workout-log.js"), "utf8");
function sourceForFunction(name) {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start >= 0, `Expected ${name} to exist`);
  const tail = source.slice(start);
  const end = tail.search(/\n(?:async )?function /);
  return end < 0 ? tail : tail.slice(0, end);
}

function workoutLog(weight, overrides = {}) {
  return {
    id: "log-1", client_email: "first@example.com", entry_date: "2026-09-10",
    workout_title: "Workout A", workout_session_id: "session-1",
    exercise_code: "A1", exercise_name: "Cable fly", set_number: 1,
    set_type: "working", weight_used: weight, reps: 8,
    ...overrides
  };
}

function fixture(rows = [], options = {}) {
  let active = { clientEmail: "first@example.com", entryDate: "2026-09-21" };
  const requests = [];
  const refreshes = [];
  const context = vm.createContext({
    coachWorkoutWarmUpSetNumberBase: 1000,
    coachWorkoutWarmUpSetType: "warm_up", coachWorkoutWorkingSetType: "working",
    coachWorkoutPreviousHistory: new Map(), coachWorkoutPersonalBests: new Map(),
    coachWorkoutPreviousHistoryStatus: "idle", coachWorkoutPreviousHistoryRequest: 0,
    currentCoachWorkoutContext: () => active,
    refreshCoachWorkoutPreviousHistoryCards: () => refreshes.push({
      status: context.coachWorkoutPreviousHistoryStatus,
      previous: context.coachWorkoutPreviousHistory.size,
      bests: context.coachWorkoutPersonalBests.size
    })
  });
  context.coachWorkoutSupabase = options.noClient ? null : {
    from(table) {
      const request = { table, filters: [], orders: [] };
      return {
        select(columns) { request.columns = columns; return this; },
        eq(column, value) { request.filters.push(["eq", column, value]); return this; },
        lte(column, value) { request.filters.push(["lte", column, value]); return this; },
        order(column, settings) { request.orders.push([column, settings]); return this; },
        range(from, to) {
          request.range = [from, to];
          requests.push(request);
          const selected = rows.filter((row) => request.filters.every(([operator, column, value]) => (
            operator === "eq" ? row[column] === value : row[column] <= value
          ))).sort((left, right) => {
            for (const [column, settings] of request.orders) {
              const comparison = String(left[column]).localeCompare(String(right[column]));
              if (comparison) return settings.ascending ? comparison : -comparison;
            }
            return 0;
          }).slice(from, to + 1);
          return options.respond ? options.respond(request, requests.length - 1, selected)
            : Promise.resolve({ data: selected, error: null });
        }
      };
    }
  };
  vm.runInContext([
    "normalizeCoachWorkoutEmail", "normalizeCoachWorkoutContext", "coachWorkoutContextId",
    "coachWorkoutContextsMatch", "coachWorkoutSetType", "normalizeCoachWorkoutHistoryName",
    "coachWorkoutHistorySessionKey", "coachWorkoutHistoryTimestamp", "buildCoachWorkoutPreviousHistory",
    "buildCoachWorkoutPersonalBests", "loadCoachWorkoutPreviousHistory"
  ].map(sourceForFunction).join("\n"), context);
  return {
    context, requests, refreshes,
    setActive(next) { active = next; },
    load: (next) => context.loadCoachWorkoutPreviousHistory(next || active),
    best: (name = "cable fly") => context.coachWorkoutPersonalBests.get(name),
    previous: (name = "cable fly") => context.coachWorkoutPreviousHistory.get(name)
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

test("PR retains the heaviest working row with reps/date while previous history stays on the latest session", async () => {
  const rows = [
    workoutLog(75, { entry_date: "2026-08-01", reps: 6, workout_session_id: "old" }),
    workoutLog(25, { entry_date: "2026-09-20", reps: 12, workout_session_id: "latest" })
  ];
  const f = fixture(rows);
  await f.load();
  assert.equal(f.best(), rows[0]);
  assert.equal(f.best().reps, 6);
  assert.equal(f.best().entry_date, "2026-08-01");
  assert.equal(f.previous().entryDate, "2026-09-20");
  assert.equal(f.previous().rows[0].weight_used, 25);
});

test("PR groups normalized names across programs, keeps different exercises separate and resolves ties to earliest date", () => {
  const f = fixture();
  const older = workoutLog(60, { entry_date: "2026-07-01", exercise_name: "  CABLE   FLY ", workout_title: "Other program" });
  const rows = [workoutLog(60), older, workoutLog(80, { exercise_name: "Cable reverse fly" })];
  for (const input of [rows, rows.slice().reverse()]) {
    const bests = f.context.buildCoachWorkoutPersonalBests(input);
    assert.equal(bests.size, 2);
    assert.equal(bests.get("cable fly"), older);
    assert.equal(bests.get("cable reverse fly").weight_used, 80);
  }
});

test("PR ignores warm-ups, cardio, invalid weights and missing names/dates but accepts zero", () => {
  const f = fixture();
  const invalid = [
    workoutLog(900, { set_type: "warm_up" }),
    workoutLog(800, { set_type: null, set_number: 1001 }),
    workoutLog(700, { exercise_code: "WARMUP" }),
    workoutLog(600, { exercise_code: "cardio" }),
    workoutLog(500, { entry_date: "" }), workoutLog(400, { exercise_name: " " }),
    ...[null, undefined, "", " ", "NaN", Infinity, -1].map((weight) => workoutLog(weight))
  ];
  assert.equal(f.context.buildCoachWorkoutPersonalBests(invalid).size, 0);
  const zero = workoutLog(0);
  assert.equal(f.context.buildCoachWorkoutPersonalBests([...invalid, zero]).get("cable fly"), zero);
  assert.equal(f.context.buildCoachWorkoutPersonalBests(null).size, 0);
});

test("loader scopes by client and selected date, includes same-day PR and excludes it from previous history", async () => {
  const f = fixture([
    workoutLog(25, { entry_date: "2026-09-20" }),
    workoutLog(80, { entry_date: "2026-09-21" }),
    workoutLog(900, { entry_date: "2026-09-22" }),
    workoutLog(1000, { client_email: "second@example.com" })
  ]);
  await f.load({ clientEmail: " FIRST@EXAMPLE.COM ", entryDate: "2026-09-21" });
  assert.equal(f.best().weight_used, 80);
  assert.equal(f.previous().entryDate, "2026-09-20");
  assert.equal(f.requests[0].table, "client_workout_logs");
  assert.ok(f.requests[0].columns.split(",").includes("exercise_code"));
  assert.deepEqual(f.requests[0].filters, [["eq", "client_email", "first@example.com"], ["lte", "entry_date", "2026-09-21"]]);
  f.setActive({ clientEmail: "second@example.com", entryDate: "2026-09-21" });
  const next = f.load();
  assert.equal(f.context.coachWorkoutPersonalBests.size, 0, "Old client PR clears synchronously");
  await next;
  assert.equal(f.best().weight_used, 1000);
  f.setActive({ clientEmail: "first@example.com", entryDate: "2026-09-20" });
  await f.load();
  assert.equal(f.best().weight_used, 25);
  assert.equal(f.previous(), undefined);
});

test("pagination finds PRs beyond the first 1,000 rows using a unique stable ordering", async () => {
  const rows = Array.from({ length: 1005 }, (_, index) => workoutLog(20, {
    id: `log-${String(index).padStart(5, "0")}`, entry_date: "2026-09-20"
  }));
  rows.push(workoutLog(100, { id: "old-record", entry_date: "2026-01-01" }));
  const f = fixture(rows);
  const result = await f.load();
  assert.equal(result.rows, 1006);
  assert.equal(f.best().weight_used, 100);
  assert.deepEqual(f.requests.map((request) => request.range), [[0, 999], [1000, 1999]]);
  for (const request of f.requests) {
    assert.deepEqual(request.orders.map(([column, settings]) => [column, settings.ascending]), [["entry_date", false], ["id", false]]);
  }
  assert.deepEqual(f.refreshes.map((state) => state.status), ["loading", "ready"]);
});

test("loading clears both maps immediately and does not expose partially fetched PRs", async () => {
  const pending = deferred();
  const secondPageRequested = deferred();
  const firstPage = Array.from({ length: 1000 }, (_, index) => workoutLog(30, { id: String(index) }));
  const f = fixture([], { respond: (_, index) => {
    if (index === 0) return Promise.resolve({ data: firstPage });
    secondPageRequested.resolve();
    return pending.promise;
  } });
  f.context.coachWorkoutPersonalBests.set("cable fly", workoutLog(500));
  f.context.coachWorkoutPreviousHistory.set("cable fly", { rows: [] });
  const loading = f.load();
  assert.equal(f.context.coachWorkoutPersonalBests.size, 0);
  assert.equal(f.context.coachWorkoutPreviousHistory.size, 0);
  assert.equal(f.context.coachWorkoutPreviousHistoryStatus, "loading");
  await secondPageRequested.promise;
  assert.equal(f.requests.length, 2);
  assert.equal(f.best(), undefined);
  pending.resolve({ data: [workoutLog(80)] });
  await loading;
  assert.equal(f.best().weight_used, 80);
});

test("stale client and same-context requests cannot overwrite a newer successful response", async () => {
  for (const changeClient of [false, true]) {
    const old = deferred();
    const f = fixture([], { respond: (_, index) => index === 0 ? old.promise : Promise.resolve({ data: [workoutLog(70)] }) });
    const first = f.load();
    if (changeClient) f.setActive({ clientEmail: "second@example.com", entryDate: "2026-09-21" });
    await f.load();
    old.resolve({ data: [workoutLog(999)] });
    const result = await first;
    assert.equal(result.stale, true);
    assert.equal(f.best().weight_used, 70);
    assert.equal(f.context.coachWorkoutPreviousHistoryStatus, "ready");
  }
});

test("changing date before the response without another load keeps stale results cleared", async () => {
  const pending = deferred();
  const f = fixture([], { respond: () => pending.promise });
  const loading = f.load();
  f.setActive({ clientEmail: "first@example.com", entryDate: "2026-09-22" });
  pending.resolve({ data: [workoutLog(100)] });
  assert.equal((await loading).stale, true);
  assert.equal(f.context.coachWorkoutPersonalBests.size, 0);
  assert.equal(f.context.coachWorkoutPreviousHistory.size, 0);
  assert.equal(f.context.coachWorkoutPreviousHistoryStatus, "idle");
});

test("returned errors and thrown query failures clear both maps and mark the current request as error", async () => {
  for (const respond of [
    () => Promise.resolve({ error: new Error("Query error") }),
    () => Promise.reject(new Error("Network error")),
    () => { throw new Error("Query construction error"); }
  ]) {
    const f = fixture([], { respond });
    f.context.coachWorkoutPersonalBests.set("cable fly", workoutLog(500));
    const result = await f.load();
    assert.ok(result.error);
    assert.equal(f.context.coachWorkoutPersonalBests.size, 0);
    assert.equal(f.context.coachWorkoutPreviousHistory.size, 0);
    assert.equal(f.context.coachWorkoutPreviousHistoryStatus, "error");
  }
});

test("a failed later page discards the incomplete PR scan", async () => {
  const firstPage = Array.from({ length: 1000 }, (_, index) => workoutLog(30, { id: String(index) }));
  const f = fixture([], { respond: (_, index) => Promise.resolve(index === 0 ? { data: firstPage } : { error: new Error("Second page failed") }) });
  assert.ok((await f.load()).error);
  assert.equal(f.context.coachWorkoutPersonalBests.size, 0);
  assert.equal(f.context.coachWorkoutPreviousHistoryStatus, "error");
});

test("an older rejected request cannot clear a newer client's records", async () => {
  const old = deferred();
  const f = fixture([], { respond: (_, index) => index === 0 ? old.promise : Promise.resolve({ data: [workoutLog(75)] }) });
  const first = f.load();
  f.setActive({ clientEmail: "second@example.com", entryDate: "2026-09-21" });
  await f.load();
  old.reject(new Error("Stale network failure"));
  assert.equal((await first).stale, true);
  assert.equal(f.best().weight_used, 75);
  assert.equal(f.context.coachWorkoutPreviousHistoryStatus, "ready");
});

test("missing client/date or Supabase connection clears cached records and skips querying", async () => {
  for (const [context, options] of [
    [{ clientEmail: "", entryDate: "2026-09-21" }, {}],
    [{ clientEmail: "first@example.com", entryDate: "" }, {}],
    [{ clientEmail: "first@example.com", entryDate: "2026-09-21" }, { noClient: true }]
  ]) {
    const f = fixture([], options);
    f.context.coachWorkoutPersonalBests.set("cable fly", workoutLog(500));
    const result = await f.load(context);
    assert.equal(result.skipped, true);
    assert.equal(f.requests.length, 0);
    assert.equal(f.context.coachWorkoutPersonalBests.size, 0);
    assert.equal(f.context.coachWorkoutPreviousHistoryStatus, "idle");
  }
});
