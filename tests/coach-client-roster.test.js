const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

const html = fs.readFileSync(require.resolve("../coach-admin.html"), "utf8");
const script = fs.readFileSync(require.resolve("../js/coach-admin.js"), "utf8");
const source = (name) => script.match(new RegExp(`^(?:async )?function ${name}\\([\\s\\S]*?\\n\\}`, "m"))[0];
const context = {};
vm.runInNewContext([
  source("coachClientMembership"), source("coachClientRosterPrograms"),
  source("normalizeSessionCount"), source("coachClientSessionValues"),
  source("coachSessionToday"), source("moveCoachSessionMonth"), source("formatCoachAlexStartTime")
].join("\n"), context);

test("Clients opens on Personal training, followed by App only and All clients", () => {
  const tabs = [...html.matchAll(/<button[^>]*data-coach-clients-view="([^"]+)"[^>]*aria-selected="([^"]+)"/g)];
  assert.deepEqual(tabs.map((tab) => [tab[1], tab[2]]), [
    ["personal_training", "true"],
    ["app_access_only", "false"],
    ["all", "false"]
  ]);
  assert.match(script, /let coachClientsView = "personal_training";/);
  assert.match(source("openCoachHomeShortcut"), /coachClientsView = "personal_training";/);
});

test("membership tabs separate personal training and app-only accounts without hiding online clients", () => {
  const roster = [
    { id: "personal", membership_type: "personal_training" },
    { id: "app", membership_type: "app_access_only" },
    { id: "online", membership_type: "online_training" },
    { id: "beta", membership_type: "personal_training", account_type: "beta_tester" },
    { id: "legacy" },
    { id: "inactive", membership_type: "personal_training", active: false }
  ];
  const ids = (view, archived = false) => Array.from(context.coachClientRosterPrograms(view, roster, archived), ({ id }) => id);
  assert.deepEqual(ids("personal_training"), ["personal"]);
  assert.deepEqual(ids("app_access_only"), ["app", "beta", "legacy"]);
  assert.deepEqual(ids("all"), ["personal", "app", "online", "beta", "legacy"]);
  assert.deepEqual(ids("personal_training", true), ["personal", "inactive"]);
});

test("Sessions shows active personal-training clients, even before their first package", () => {
  const node = () => ({
    children: [],
    dataset: {},
    append(child) { this.children.push(child); },
    setAttribute() {},
    replaceChildren(...children) { this.children = children; }
  });
  const rows = node();
  const empty = node();
  const counts = { querySelector: (selector) => selector === "[data-coach-client-count-rows]" ? rows : empty };
  const fixture = {
    ...context,
    document: { getElementById: () => counts, createElement: node },
    activeClientPrograms: () => [
      { id: "training", membership_type: "personal_training", session_count_used: 3, session_count_total: 4 },
      { id: "new-training", membership_type: "personal_training" },
      { id: "app", membership_type: "app_access_only", session_count_total: 8 },
      { id: "online", membership_type: "online_training", session_count_total: 8 },
      { id: "beta", account_type: "beta_tester", membership_type: "personal_training", session_count_total: 8 },
      { id: "legacy", session_count_total: 8 },
      { id: "inactive", membership_type: "personal_training", active: false }
    ]
  };
  vm.runInNewContext(source("renderCoachSessionCounts"), fixture);
  fixture.renderCoachSessionCounts();

  assert.deepEqual(rows.children.map((row) => row.children[0].children[0].dataset.coachCountClient), ["training", "new-training"]);
  assert.deepEqual(rows.children[0].children.slice(1).map((cell) => cell.textContent), [3, 4, 1]);
  assert.deepEqual(rows.children[1].children.slice(1).map((cell) => cell.textContent), ["—", "—", "—"]);
  assert.equal(empty.hidden, true);
  fixture.activeClientPrograms = () => [{ id: "app", membership_type: "app_access_only" }];
  fixture.renderCoachSessionCounts();
  assert.equal(rows.children.length, 0);
  assert.equal(empty.hidden, false);
});

test("session counts distinguish zero used from no package and clamp sessions left", () => {
  const counts = (used, total) => ({ ...context.coachClientSessionValues(used, total) });
  assert.deepEqual(counts(82, 100), { used: 82, total: 100, remaining: 18 });
  assert.deepEqual(counts(0, 4), { used: 0, total: 4, remaining: 4 });
  assert.deepEqual(counts(6, 4), { used: 6, total: 4, remaining: 0 });
  assert.deepEqual(counts(3, null), { used: 3, total: null, remaining: null });
  assert.deepEqual(counts(0, null), { used: null, total: null, remaining: null });
});

test("FWB view uses the scheduled snapshot, distinguishes no sync from zero and ignores stale responses", async () => {
  const selectors = new Map();
  const pending = new Map();
  const counts = { querySelector(selector) {
    if (!selectors.has(selector)) selectors.set(selector, { textContent: "", setAttribute() {} });
    return selectors.get(selector);
  } };
  const fixture = {
    coachFwbSessionRequest: 0, coachFwbSessionMonth: "",
    document: { getElementById: (id) => id === "coach-client-session-counts" ? counts : { hidden: false } },
    coachSupabase: { from(table) {
      assert.equal(table, "coach_fwb_monthly_session_totals");
      return { select(fields) {
        assert.equal(fields, "completed_count,cancelled_count,refreshed_at");
        return { eq(column, month) {
          assert.equal(column, "month_start");
          return { maybeSingle: () => new Promise((resolve) => pending.set(month, resolve)) };
        } };
      } };
    } }
  };
  vm.runInNewContext(source("refreshCoachFwbMonthlySessions"), fixture);
  const refresh = () => fixture.refreshCoachFwbMonthlySessions("2026-11-24");
  const current = refresh();
  fixture.coachFwbSessionMonth = "2026-10";
  const previous = refresh();
  const total = selectors.get("[data-coach-fwb-total]");
  const sync = selectors.get("[data-coach-fwb-sync]");
  const status = selectors.get("[data-coach-fwb-status]");
  const checked = (completed, cancelled) => ({ data: { completed_count: completed, cancelled_count: cancelled, refreshed_at: "2026-11-25T01:00:00Z" } });
  pending.get("2026-10-01")(checked(8, 2));
  await previous;
  pending.get("2026-11-01")(checked(12, 1));
  await current;
  assert.equal(total.textContent, "10 sessions");
  assert.equal(status.textContent, "8 completed · 2 cancelled");
  assert.equal(sync.textContent, "Last synced Nov 24, 2026");

  const empty = refresh();
  pending.get("2026-10-01")({ data: null });
  await empty;
  assert.equal(total.textContent, "—");
  assert.equal(sync.textContent, "No sync for this month yet");
  const zero = refresh();
  pending.get("2026-10-01")(checked(0, 0));
  await zero;
  assert.equal(total.textContent, "0 sessions");
  const failure = refresh();
  pending.get("2026-10-01")({ data: null, error: { message: "Network" } });
  await failure;
  assert.equal(sync.textContent, "Could not load the monthly total");
});

test("FWB month navigation and current day use Pacific calendar dates", () => {
  assert.equal(context.coachSessionToday(new Date("2026-12-01T07:59:59Z")), "2026-11-30");
  assert.equal(context.coachSessionToday(new Date("2026-12-01T08:00:00Z")), "2026-12-01");
  assert.equal(context.moveCoachSessionMonth("2026-01", -1), "2025-12");
  assert.equal(context.moveCoachSessionMonth("2025-12", 1), "2026-01");
});

test("Sessions keeps FWB totals and the Alex Fitness history in separate tabs", () => {
  assert.match(html, /data-admin-tab="session-counts" aria-label="Sessions"/);
  assert.match(html, /id="coach-client-session-counts" data-admin-panel="session-counts" aria-labelledby="coach-session-count-title"/);
  const counts = html.slice(html.indexOf('id="coach-client-session-counts"'), html.indexOf('data-admin-panel="home"'));
  assert.match(counts, /role="tablist" aria-label="Session views"[\s\S]*data-coach-session-view="fwb"[\s\S]*data-coach-session-view="alex"/);
  assert.match(counts, /id="coach-sessions-fwb" role="tabpanel"[\s\S]*Client session counts[\s\S]*id="coach-sessions-alex" role="tabpanel"[\s\S]*Completed Alex Fitness sessions/);
  assert.match(source("refreshCoachAlexHistory"), /from\("coach_alex_fitness_history"\)/);
  assert.match(source("refreshSelectedCoachSessions"), /refreshCoachAlexHistory\(\)[\s\S]*refreshCoachFwbMonthlySessions\(\)/);
  assert.match(counts, /aria-live="polite" aria-atomic="true"[^>]*><span data-coach-fwb-month-label>/);
  assert.match(source("handleCoachClientWorkspace"), /openCoachHomeClientSection\(program\.client_email, "sessions"\)/);
});

test("Alex Fitness shows only the selected pack and preserves source session numbers", () => {
  const node = () => ({
    children: [], dataset: {}, textContent: "",
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    setAttribute(key, value) { this[key] = value; },
    contains() { return false; },
    classList: { toggle() {} }
  });
  const selectors = new Map();
  const lookup = (selector) => {
    if (!selectors.has(selector)) selectors.set(selector, { ...node(), querySelector: lookup });
    return selectors.get(selector);
  };
  const picker = lookup("[data-coach-alex-packs]");
  const panel = { querySelector: lookup, querySelectorAll: () => picker.children };
  const fixture = {
    ...context,
    document: { createElement: node },
    coachAlexPacks: new Map(), coachAlexPack: null, coachAlexPage: 0, coachAlexHistoryPageSize: 25,
    formatSessionDate: (date) => date
  };
  vm.runInNewContext([
    source("renderCoachAlexPacks"), source("renderCoachAlexHistory")
  ].join("\n"), fixture);
  const sessions = [
    { package_number: 5, session_number: 34, session_date: "2026-11-24", start_time: "06:15:00" },
    { package_number: 1, session_number: 92, session_date: "2025-03-14", start_time: null },
    { package_number: 5, session_number: 33, session_date: "2026-11-21", start_time: "07:00:00" },
    { package_number: 1, session_number: 90, session_date: "2025-03-11", start_time: null }
  ];
  const title = lookup("[data-coach-alex-pack-title]");
  const numbers = () => lookup("[data-coach-alex-rows]").children.map((row) => row.children[2].textContent);
  fixture.renderCoachAlexPacks(panel, sessions);
  assert.deepEqual(picker.children.map((button) => button.children.map((child) => child.textContent)), [
    ["Pack 5", "2 recorded"], ["Pack 1", "2 recorded"]
  ]);
  assert.equal(picker.children[0]["aria-pressed"], "true");
  assert.equal(title.textContent, "Pack 5 history");
  assert.deepEqual(numbers(), ["#34", "#33"]);

  fixture.coachAlexPack = 1;
  fixture.renderCoachAlexPacks(panel, sessions);
  assert.equal(picker.children[1]["aria-pressed"], "true");
  assert.equal(title.textContent, "Pack 1 history");
  assert.deepEqual(numbers(), ["#92", "#90"]);

  fixture.renderCoachAlexPacks(panel, []);
  assert.equal(picker.hidden, true);
  assert.equal(lookup("[data-coach-alex-pack-history]").hidden, true);
  assert.equal(numbers().length, 0);
});

test("Alex Fitness shows the recorded Pacific wall-clock time or an explicit missing time", () => {
  assert.equal(context.formatCoachAlexStartTime("06:15:00"), "6:15 AM");
  assert.equal(context.formatCoachAlexStartTime("12:00:00"), "12:00 PM");
  assert.equal(context.formatCoachAlexStartTime("17:05:00"), "5:05 PM");
  assert.equal(context.formatCoachAlexStartTime("00:00:00"), "12:00 AM");
  assert.equal(context.formatCoachAlexStartTime(null), "Time not recorded");
});
