const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

const html = fs.readFileSync(require.resolve("../coach-admin.html"), "utf8");
const script = fs.readFileSync(require.resolve("../js/coach-admin.js"), "utf8");
const styles = fs.readFileSync(require.resolve("../css/coach-clients.css"), "utf8");
const source = (name) => script.match(new RegExp(`^function ${name}\\([\\s\\S]*?\\n\\}`, "m"))[0];
const context = {};
vm.runInNewContext([
  source("coachClientMembership"), source("coachClientRosterPrograms"),
  source("normalizeSessionCount"), source("coachClientSessionValues"),
  source("normalizeEmail"), source("normalizeSessionDate"), source("toUtcIsoDateString"),
  source("sessionDatesFromProgram"), source("sessionPackageHistoryFromProgram"),
  source("coachSessionToday"), source("moveCoachSessionMonth"), source("countCoachFwbSessions")
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

test("session counts distinguish zero used from no package and clamp sessions left", () => {
  const counts = (used, total) => ({ ...context.coachClientSessionValues(used, total) });
  assert.deepEqual(counts(82, 100), { used: 82, total: 100, remaining: 18 });
  assert.deepEqual(counts(0, 4), { used: 0, total: 4, remaining: 4 });
  assert.deepEqual(counts(6, 4), { used: 6, total: 4, remaining: 0 });
  assert.deepEqual(counts(3, null), { used: 3, total: null, remaining: null });
  assert.deepEqual(counts(0, null), { used: null, total: null, remaining: null });
});

test("FWB totals use saved dates once per client and include past packages", () => {
  const clients = [
    { client_email: " A@example.test ", session_dates: ["11/5/2026", "2026-11-05", "2026-11-24", "2026-11-25"],
      session_package_history: [{ dates: ["2026-11-04", "2026-11-05", "2026-10-31"], archived_at: "2026-11-06" }] },
    { client_email: "a@example.test", session_dates: ["2026-11-05", "2026-11-08"] },
    { client_email: "b@example.test", client_archived: true, session_dates: ["2026-11-05"] },
    { client_email: "c@example.test", session_count_used: 99 },
    { client_email: "d@example.test", session_dates: ["2026-02-29", "2026-10-00"] },
    { session_dates: ["2026-11-07"] }
  ];
  const count = (month) => context.countCoachFwbSessions(clients, month, "2026-11-24");
  assert.equal(count("2026-11"), 4);
  assert.equal(count("2026-10"), 1);
  assert.equal(count("2026-02"), 0);
});

test("FWB month navigation and current day use Pacific calendar dates", () => {
  assert.equal(context.coachSessionToday(new Date("2026-12-01T07:59:59Z")), "2026-11-30");
  assert.equal(context.coachSessionToday(new Date("2026-12-01T08:00:00Z")), "2026-12-01");
  assert.equal(context.moveCoachSessionMonth("2026-01", -1), "2025-12");
  assert.equal(context.moveCoachSessionMonth("2025-12", 1), "2026-01");
});

test("Sessions is a main navigation view with the coach's snapshot above the clients", () => {
  assert.match(html, /data-admin-tab="session-counts" aria-label="Sessions"/);
  assert.match(html, /id="coach-client-session-counts" data-admin-panel="session-counts" aria-labelledby="coach-session-count-title"/);
  const counts = html.slice(html.indexOf('id="coach-client-session-counts"'), html.indexOf('data-admin-panel="home"'));
  assert.match(counts, /Alex Fitness[\s\S]*FWB sessions[\s\S]*Client session counts/);
  assert.match(counts, /Coach’s count · saved summary/);
  assert.match(counts, /aria-live="polite" aria-atomic="true"[^>]*><span data-coach-fwb-month-label>/);
  assert.match(source("handleCoachClientWorkspace"), /openCoachHomeClientSection\(program\.client_email, "sessions"\)/);
  assert.match(styles, /body\.coach-admin-page :is\(#clients, \.selected-client-panel, \[data-admin-panel="profile"\], #coach-client-session-counts\)[^}]*color-scheme:\s*light/s);
});
