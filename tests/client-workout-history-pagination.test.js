const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const portal = fs.readFileSync(path.join(__dirname, "../js/client-portal.js"), "utf8");
const helperStart = portal.indexOf("async function loadClientWorkoutLogHistory(");
assert.ok(helperStart >= 0, "Expected paginated workout history loader");
const helper = portal.slice(helperStart, portal.indexOf("\nasync function loadDashboard(", helperStart));

function fixture(rows, { failPage, rejectPage } = {}) {
  const calls = [];
  const timeouts = [];
  const error = new Error("History page unavailable");
  const supabaseClient = {
    from(table) {
      const call = { table, orders: [] };
      calls.push(call);
      const query = {
        select(columns) { call.columns = columns; return this; },
        ilike(column, value) { call.filter = { column, value }; return this; },
        order(column, options) { call.orders.push({ column, ...options }); return this; },
        range(from, to) {
          call.range = [from, to];
          if (calls.length === rejectPage) return Promise.reject(error);
          if (calls.length === failPage) return Promise.resolve({ data: null, error });
          const ordered = rows.filter((row) => row.client_email.toLowerCase() === call.filter.value.toLowerCase())
            .sort((left, right) => {
              for (const { column, ascending } of call.orders) {
                const comparison = String(left[column]).localeCompare(String(right[column]));
                if (comparison) return ascending ? comparison : -comparison;
              }
              return 0;
            });
          return Promise.resolve({ data: ordered.slice(from, to + 1), error: null });
        }
      };
      return query;
    }
  };
  const load = Function("supabaseClient", "withTimeout", "activeClientEmail", `${helper}\nreturn loadClientWorkoutLogHistory;`)(
    supabaseClient,
    (promise, message) => { timeouts.push(message); return promise; },
    "client@example.com"
  );
  return { load, calls, timeouts, error };
}

function history(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: String(index).padStart(5, "0"),
    client_email: "client@example.com",
    entry_date: index < 650 ? "2026-09-18" : "2026-09-19",
    exercise_name: "Bench press",
    weight_used: index === count - 1 ? 250 : 100
  })).reverse();
}

test("loads all workout history beyond 500 rows with stable date and id ordering and client filtering", async () => {
  const f = fixture([...history(1201), { id: "other", client_email: "someone@example.com", entry_date: "2026-09-19", weight_used: 999 }]);
  const result = await f.load("CLIENT@example.com");

  assert.equal(result.error, null);
  assert.equal(result.data.length, 1201);
  assert.equal(result.data.at(-1).weight_used, 250);
  assert.equal(new Set(result.data.map((row) => row.id)).size, 1201);
  assert.deepEqual(f.calls.map((call) => call.range), [[0, 499], [500, 999], [1000, 1499]]);
  for (const call of f.calls) {
    assert.equal(call.table, "client_workout_logs");
    assert.equal(call.columns, "*");
    assert.deepEqual(call.filter, { column: "client_email", value: "CLIENT@example.com" });
    assert.deepEqual(call.orders, [{ column: "entry_date", ascending: true }, { column: "id", ascending: true }]);
  }
  assert.deepEqual(f.timeouts, Array(3).fill("Training log request timed out."));
});

test("checks the next page after an exact page boundary and stops on the empty page", async () => {
  const f = fixture(history(1000));
  const result = await f.load();

  assert.equal(result.data.length, 1000);
  assert.deepEqual(f.calls.map((call) => call.range), [[0, 499], [500, 999], [1000, 1499]]);
});

test("returns an empty complete history when no workouts exist", async () => {
  const f = fixture([]);
  assert.deepEqual(await f.load(), { data: [], error: null });
  assert.equal(f.calls.length, 1);
});

test("a later page error discards partial history", async () => {
  const f = fixture(history(1201), { failPage: 2 });
  assert.deepEqual(await f.load(), { data: null, error: f.error });
  assert.equal(f.calls.length, 2);
});

test("a later page timeout or rejected query discards partial history", async () => {
  const f = fixture(history(1201), { rejectPage: 2 });
  assert.deepEqual(await f.load(), { data: null, error: f.error });
  assert.equal(f.calls.length, 2);
});
