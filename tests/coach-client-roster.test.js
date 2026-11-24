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
  source("normalizeSessionCount"), source("coachClientSessionValues")
].join("\n"), context);

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

test("session count is a separate view that keeps the coach's snapshot above the clients", () => {
  assert.match(html, /data-coach-clients-view="session-counts" aria-controls="coach-client-session-counts"/);
  const counts = html.slice(html.indexOf('id="coach-client-session-counts"'), html.indexOf('data-admin-panel="home"'));
  assert.ok(counts.indexOf("Alex Fitness") < counts.indexOf("Client session counts"));
  assert.match(counts, /Coach’s count · saved summary/);
  assert.match(source("handleCoachClientWorkspace"), /openCoachHomeClientSection\(program\.client_email, "sessions"\)/);
  assert.match(styles, /body\.coach-admin-page :is\(#clients, \.selected-client-panel, \[data-admin-panel="profile"\]\)[^}]*color-scheme:\s*light/s);
});
