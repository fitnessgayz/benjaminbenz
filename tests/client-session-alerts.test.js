const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../js/client-session-alerts.js"), "utf8");
const plain = value => JSON.parse(JSON.stringify(value));
const program = (overrides = {}) => ({ id: "a", client_email: "client@example.com", active: true,
  client_archived: false, updated_at: "2026-09-23T12:00:00Z", created_at: "2026-09-01T12:00:00Z",
  session_count_total: 10, session_count_used: 8, ...overrides });

function fixture() {
  let textWrites = 0, nextTimer = 1;
  const events = new Map(), documentEvents = new Map(), intervals = new Map(), timeouts = new Map();
  const listen = (map, type, callback) => { if (!map.has(type)) map.set(type, new Set()); map.get(type).add(callback); };
  const dispatch = (map, type) => { for (const callback of map.get(type) || []) callback(); };
  const field = () => {
    let value = "";
    return { get textContent() { return value; }, set textContent(next) { value = next; textWrites++; } };
  };
  const notices = Array.from({ length: 2 }, () => {
    const title = field(), message = field();
    return { hidden: true, dataset: {}, title, message,
      querySelector: selector => selector === "[data-session-alert-title]" ? title : selector === "[data-session-alert-message]" ? message : null };
  });
  const document = {
    hidden: false,
    querySelectorAll(selector) {
      assert.equal(selector, "[data-client-session-alert]", "Balance refresh must not query or edit workout inputs");
      return notices;
    },
    addEventListener: (type, callback) => listen(documentEvents, type, callback),
    removeEventListener: (type, callback) => documentEvents.get(type)?.delete(callback)
  };
  const window = {
    document, AbortController,
    addEventListener: (type, callback) => listen(events, type, callback),
    removeEventListener: (type, callback) => events.get(type)?.delete(callback),
    setInterval(callback, delay) { const id = nextTimer++; intervals.set(id, { callback, delay }); return id; },
    clearInterval: id => intervals.delete(id),
    setTimeout(callback, delay) { const id = nextTimer++; timeouts.set(id, { callback, delay }); return id; },
    clearTimeout: id => timeouts.delete(id)
  };
  const requests = [];
  const supabaseClient = {
    from(table) {
      let resolve, reject;
      const response = new Promise((yes, no) => { resolve = yes; reject = no; });
      const request = { table, calls: [], resolve, reject };
      requests.push(request);
      const builder = {};
      for (const name of ["select", "eq", "ilike", "or", "order", "limit"]) {
        builder[name] = (...args) => { request.calls.push([name, ...args]); return builder; };
      }
      builder.abortSignal = signal => { request.signal = signal; return response; };
      return builder;
    }
  };
  const context = vm.createContext({ window });
  vm.runInContext(source, context);
  const api = window.FWB_SESSION_BALANCE;
  return { api, document, notices, intervals, timeouts, events, documentEvents, requests,
    start(options = {}) { return api.createController({ document, supabaseClient, clientEmail: "client@example.com", ...options }); },
    focus: () => dispatch(events, "focus"), visible: () => dispatch(documentEvents, "visibilitychange"),
    get textWrites() { return textWrites; } };
}

test("session summaries warn at two through one and clamp exhausted or overused packages to zero", () => {
  const { api } = fixture();
  assert.equal(api.lowThreshold, 2);
  for (const [used, remaining, state] of [[6, 4, "ready"], [7, 3, "ready"], [8, 2, "low"], [9, 1, "low"], [10, 0, "out"], [12, 0, "out"]]) {
    assert.deepEqual(plain(api.summarize(program({ session_count_used: used }))), { used, total: 10, remaining, state });
  }
});

test("missing packages, inactive/archived programs and invalid balances produce no alert", () => {
  const { api } = fixture();
  const invalid = [null, undefined, {}, program({ active: false }), program({ client_archived: true }),
    ...[null, undefined, "", 0, -1, 1.5, "invalid", Infinity].map(session_count_total => program({ session_count_total })),
    ...[-1, 1.5, "invalid", Infinity].map(session_count_used => program({ session_count_used }))];
  for (const value of invalid) assert.equal(api.summarize(value), null);
});

test("latest program is case-insensitive exact-email scoped, active and ordered deterministically", () => {
  const { api } = fixture();
  const oldest = program({ id: "old", updated_at: "2026-09-01T00:00:00Z" });
  const selected = program({ id: "z", client_email: " Client@Example.com ", created_at: "2026-09-20T00:00:00Z" });
  const values = [oldest, program({ id: "other", client_email: "otherclient@example.com", updated_at: "2099" }),
    program({ id: "inactive", active: false, updated_at: "2099" }), program({ id: "archived", client_archived: true, updated_at: "2099" }),
    program({ id: "a", created_at: selected.created_at }), selected];
  const original = JSON.stringify(values);
  assert.equal(api.latestProgram(values, "CLIENT@example.com"), selected);
  assert.equal(api.latestProgram(values, ""), null);
  assert.equal(api.latestProgram(values, "client@different.com"), null);
  assert.equal(api.latestProgram(null, "client@example.com"), null);
  assert.equal(api.latestProgram([program({ active: false }), program({ client_archived: true })], "client@example.com"), null);
  assert.equal(JSON.stringify(values), original, "Selecting the program must not mutate shared dashboard data");
});

test("both alert slots render clear low/out messages without repeating text writes", () => {
  const h = fixture();
  h.api.render(h.document, program({ session_count_used: 9 }));
  for (const notice of h.notices) {
    assert.equal(notice.hidden, false); assert.equal(notice.dataset.state, "low");
    assert.equal(notice.title.textContent, "1 coaching session remaining");
    assert.match(notice.message.textContent, /Contact Benjamin/);
  }
  const writes = h.textWrites;
  h.api.render(h.document, program({ session_count_used: 9 }));
  assert.equal(h.textWrites, writes);
  h.api.render(h.document, program({ session_count_used: 10 }));
  for (const notice of h.notices) {
    assert.equal(notice.dataset.state, "out"); assert.equal(notice.title.textContent, "No sessions remaining");
    assert.match(notice.message.textContent, /renew/);
  }
  for (const value of [program({ session_count_used: 7 }), program({ session_count_used: 0 }), null, program({ active: false })]) {
    h.api.render(h.document, value);
    assert.ok(h.notices.every(notice => notice.hidden && notice.dataset.state === undefined));
  }
});

test("controller initializes from the latest matching program and publishes unchanged data once", async () => {
  const h = fixture(), updates = [];
  const current = Object.freeze(program());
  const controller = h.start({ programs: [program({ updated_at: "2026-01-01", session_count_used: 0 }), current], onUpdate: value => updates.push(value) });
  assert.equal(updates.length, 1); assert.equal(updates[0], current);
  assert.equal(h.notices[0].title.textContent, "2 coaching sessions remaining");
  const writes = h.textWrites, refresh = controller.refresh();
  await Promise.resolve();
  h.requests[0].resolve({ data: [{ ...current }], error: null }); await refresh;
  assert.equal(updates.length, 1); assert.equal(h.textWrites, writes);
  controller.destroy();
});

test("refresh reads only the requested client, active nonarchived program with abort and limit one", async () => {
  const h = fixture(), controller = h.start({ clientEmail: " Name_%\\@Example.com " });
  const refresh = controller.refresh(); await Promise.resolve(); const request = h.requests[0];
  assert.equal(request.table, "client_programs");
  assert.ok(request.calls.some(call => call[0] === "select" && call[1].includes("session_count_total")));
  for (const expected of [["eq", "active", true], ["ilike", "client_email", "name\\_\\%\\\\@example.com"],
    ["or", "client_archived.is.null,client_archived.eq.false"], ["limit", 1]]) {
    assert.ok(request.calls.some(call => JSON.stringify(call) === JSON.stringify(expected)), JSON.stringify(expected));
  }
  assert.deepEqual(plain(request.calls.filter(call => call[0] === "order")), [
    ["order", "updated_at", { ascending: false, nullsFirst: false }],
    ["order", "created_at", { ascending: false, nullsFirst: false }],
    ["order", "id", { ascending: false }]
  ]);
  assert.equal(request.signal.aborted, false);
  assert.deepEqual([...h.timeouts.values()].map(timer => timer.delay), [15000]);
  request.resolve({ data: [program()], error: null }); await refresh;
  assert.ok(h.notices.every(notice => notice.hidden), "A backend row for a different exact email must not leak its balance");
  assert.equal(h.timeouts.size, 0); controller.destroy();
});

test("focus, returning visibility and 60-second polling refresh without concurrent duplicate reads", async () => {
  const h = fixture(), controller = h.start();
  assert.deepEqual([...h.intervals.values()].map(timer => timer.delay), [60000]);
  h.focus(); h.focus(); h.visible();
  await Promise.resolve();
  assert.equal(h.requests.length, 1);
  const first = controller.refresh(); h.requests[0].resolve({ data: [program()], error: null }); await first;
  h.document.hidden = true; h.focus(); h.visible(); [...h.intervals.values()][0].callback(); await controller.refresh();
  assert.equal(h.requests.length, 1);
  h.document.hidden = false; h.visible();
  await Promise.resolve();
  const second = controller.refresh(); h.requests[1].resolve({ data: [program()], error: null }); await second;
  [...h.intervals.values()][0].callback();
  await Promise.resolve();
  assert.equal(h.requests.length, 3);
  const third = controller.refresh(); h.requests[2].resolve({ data: [program()], error: null }); await third;
  controller.destroy();
  assert.equal(h.intervals.size, 0); h.focus(); h.visible(); await controller.refresh(); assert.equal(h.requests.length, 3);
  assert.equal(h.events.get("focus").size, 0); assert.equal(h.documentEvents.get("visibilitychange").size, 0);
});

test("renewing an exhausted package clears both notices and confirmed no-active-program also clears", async () => {
  const h = fixture(), controller = h.start({ programs: [program({ session_count_used: 10 })] });
  assert.equal(h.notices[0].dataset.state, "out");
  let refresh = controller.refresh();
  await Promise.resolve();
  h.requests[0].resolve({ data: [program({ session_count_total: 20 })], error: null }); await refresh;
  assert.ok(h.notices.every(notice => notice.hidden));
  refresh = controller.refresh(); await Promise.resolve(); h.requests[1].resolve({ data: [program()], error: null }); await refresh;
  assert.equal(h.notices[0].hidden, false);
  refresh = controller.refresh(); await Promise.resolve(); h.requests[2].resolve({ data: [], error: null }); await refresh;
  assert.ok(h.notices.every(notice => notice.hidden)); controller.destroy();
});

test("offline errors and timed-out reads retain the last confirmed balance", async () => {
  const h = fixture(), updates = [], controller = h.start({ programs: [program()], onUpdate: value => updates.push(value) });
  let refresh = controller.refresh(); await Promise.resolve(); h.requests[0].resolve({ data: null, error: new Error("Offline") }); await refresh;
  refresh = controller.refresh(); await Promise.resolve(); h.requests[1].reject(new Error("Network unavailable")); await refresh;
  refresh = controller.refresh(); await Promise.resolve(); [...h.timeouts.values()][0].callback();
  assert.equal(h.requests[2].signal.aborted, true);
  h.requests[2].reject(new Error("Aborted")); await refresh;
  assert.equal(updates.length, 1); assert.equal(h.notices[0].title.textContent, "2 coaching sessions remaining");
  assert.equal(h.notices[0].hidden, false); assert.equal(h.timeouts.size, 0); controller.destroy();
});

test("destroyed controller aborts its request and cannot overwrite the next client's balance", async () => {
  const h = fixture(), oldUpdates = [], old = h.start({ programs: [program()], onUpdate: value => oldUpdates.push(value) });
  const pending = old.refresh(); await Promise.resolve(); old.destroy(); assert.equal(h.requests[0].signal.aborted, true);
  const current = h.start({ clientEmail: "new@example.com", programs: [program({ client_email: "new@example.com", session_count_used: 10 })] });
  h.requests[0].resolve({ data: [program({ session_count_used: 0 })], error: null }); await pending;
  assert.equal(h.notices[0].dataset.state, "out"); assert.equal(oldUpdates.length, 1);
  current.destroy();
});

test("a synchronously failing query builder does not prevent later retries or erase confirmed data", async () => {
  const h = fixture(); let attempts = 0;
  const controller = h.start({ programs: [program()], supabaseClient: {
    from() { attempts++; throw new Error("Connection not ready"); }
  } });
  await controller.refresh(); await controller.refresh();
  assert.equal(attempts, 2); assert.equal(h.timeouts.size, 0);
  assert.equal(h.notices[0].hidden, false); assert.equal(h.notices[0].title.textContent, "2 coaching sessions remaining");
  controller.destroy();
});

test("missing client email or connection skips network polling", async () => {
  for (const options of [{ clientEmail: " " }, { supabaseClient: null }]) {
    const h = fixture(), controller = h.start(options);
    h.focus(); h.visible(); [...h.intervals.values()][0].callback(); await controller.refresh();
    assert.equal(h.requests.length, 0); assert.equal(h.timeouts.size, 0);
    controller.destroy();
  }
});
