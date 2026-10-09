const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "js/coach-admin.js"), "utf8");

function functionSource(name) {
  const start = source.indexOf(`async function ${name}(`) >= 0
    ? source.indexOf(`async function ${name}(`)
    : source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Expected ${name}`);
  const rest = source.slice(start);
  const next = rest.slice(1).search(/\n(?:async )?function /);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

const context = vm.createContext({});
vm.runInContext(["escapeHtml", "clientWorkoutScheduleRowsMarkup"].map(functionSource).join("\n"), context);

test("coach schedule shows source and completion without rendering client markup", () => {
  const html = context.clientWorkoutScheduleRowsMarkup([
    { title: "<img src=x>", planned_date: "2026-10-07", source_type: "generated", snapshot_json: '{"completedAt":null}' },
    { title: "Leg day", planned_date: "2026-10-08", source_type: "assigned", snapshot_json: '{"completedAt":123}' },
    { title: "Repeat upper body", planned_date: "2026-10-09", source_type: "history", snapshot_json: '{}' },
    { title: "My own workout", planned_date: "2026-10-10", source_type: "custom", snapshot_json: '{}' }
  ]);
  assert.match(html, /&lt;img src=x&gt;/);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /Generated plan/);
  assert.match(html, /Coach assigned/);
  assert.match(html, /From workout log/);
  assert.match(html, /Custom workout/);
  assert.match(html, /Completed/);
});

test("a late response for another client cannot replace the selected schedule", async () => {
  const list = { innerHTML: "", textContent: "" };
  const requests = [];
  let selectedEmail = "a@example.com";
  const query = () => ({
    select() { return this; },
    eq() { return this; },
    gte() { return this; },
    order() { return this; },
    limit() { return new Promise((resolve) => requests.push(resolve)); }
  });
  const context = vm.createContext({
    document: { getElementById: () => list },
    coachSupabase: { from: () => query() },
    selectedProgram: () => ({ client_email: selectedEmail }),
    clientWorkoutScheduleLoadToken: 0
  });
  vm.runInContext(["normalizeEmail", "escapeHtml", "clientWorkoutScheduleRowsMarkup", "loadClientWorkoutScheduleForEmail"]
    .map(functionSource).join("\n"), context);
  const first = context.loadClientWorkoutScheduleForEmail("a@example.com");
  selectedEmail = "b@example.com";
  const second = context.loadClientWorkoutScheduleForEmail("b@example.com");
  requests[1]({ data: [{ title: "B's workout", planned_date: "2026-10-10", source_type: "assigned", snapshot_json: "{}" }], error: null });
  await second;
  requests[0]({ data: [{ title: "A's workout", planned_date: "2026-10-10", source_type: "assigned", snapshot_json: "{}" }], error: null });
  await first;
  assert.match(list.innerHTML, /B&#039;s workout/);
  assert.doesNotMatch(list.innerHTML, /A&#039;s workout/);
});
