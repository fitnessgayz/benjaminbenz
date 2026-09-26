const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { createStore, createAccountTransport, messageLength } = require("../js/coach-messages.js");
const client = { id: "client-user", email: "client@example.com" };
const row = (id, overrides = {}) => ({ id, client_email: client.email, sender_user_id: "coach-user", sender_role: "coach", body: `Message ${id}`, created_at: "2026-09-26T10:00:00Z", request_id: `request-${id}`, ...overrides });
const descending = (max, min) => Array.from({ length: max - min + 1 }, (_, index) => row(max - index));
function harness(handler, options = {}) {
  const calls = [];
  let uuid = 0;
  const store = createStore({ supabaseClient: { rpc: async (name, args) => { calls.push({ name, args }); return handler(name, args); } }, user: client, role: "client", uuid: () => `uuid-${++uuid}`, ...options });
  return { store, calls };
}

test("validates Unicode message length and trims before sending", async () => {
  assert.equal(messageLength("  😀\n😀  "), 3);
  const { store, calls } = harness(async (name, args) => ({ data: name === "messaging_send" ? [row(1, { body: args.p_body })] : [] }));
  await store.refreshThread(); calls.length = 0;
  store.setDraft(" \n ");
  await store.send();
  assert.equal(calls.length, 0);
  store.setDraft("x".repeat(4001));
  await store.send();
  assert.equal(calls.length, 0);
  store.setDraft("  Hello coach!  ");
  await store.send();
  assert.equal(calls[0].args.p_body, "Hello coach!");
  assert.equal(store.snapshot().current.draft, "");
  assert.equal("p_client_email" in calls[0].args, false);
  store.destroy();
});

test("uncertain send preserves draft and retries the identical request UUID", async () => {
  let attempt = 0;
  const { store, calls } = harness(async (name) => name === "messaging_send" ? ++attempt === 1 ? { error: new Error("network") } : { data: [row(1)] } : { data: [] });
  await store.refreshThread();
  store.setDraft("Did my workout today");
  await store.send();
  assert.equal(store.snapshot().current.draft, "Did my workout today");
  assert.match(store.snapshot().current.error, /could not be confirmed/);
  await store.send();
  const sends = calls.filter((call) => call.name === "messaging_send");
  assert.equal(sends[0].args.p_request_id, sends[1].args.p_request_id);
  assert.equal(store.snapshot().current.messages.length, 1);
  assert.equal(store.snapshot().current.draft, "");
  store.destroy();
});

test("uncertain drafts stay frozen until explicit edit; retry keeps the original payload", async () => {
  let attempt = 0;
  const { store, calls } = harness(async (name) => {
    if (name !== "messaging_send") return { data: [] };
    return ++attempt < 3 ? { error: new Error("network") } : { data: [row(1)] };
  });
  await store.refreshThread();
  store.setDraft("First"); await store.send();
  store.setDraft("Implicit edit ignored");
  assert.equal(store.snapshot().current.draft, "First");
  await store.send();
  store.editAsNewMessage(); store.setDraft("Explicit edit"); await store.send();
  const sends = calls.filter((call) => call.name === "messaging_send");
  assert.equal(sends[0].args.p_request_id, sends[1].args.p_request_id);
  assert.equal(sends[1].args.p_body, "First");
  assert.notEqual(sends[1].args.p_request_id, sends[2].args.p_request_id);
  assert.equal(sends[2].args.p_body, "Explicit edit");
  store.destroy();
});

test("definite RPC validation or authorization errors keep an editable draft", async () => {
  for (const code of ["42501", "22023", "P0002"]) {
    const { store } = harness(async (name) => name === "messaging_send" ? { error: { code } } : { data: [] });
    await store.refreshThread(); store.setDraft("Original"); await store.send();
    assert.equal(store.snapshot().current.pending, null);
    assert.equal(store.snapshot().current.draft, "Original");
    store.setDraft("Edited after rejection");
    assert.equal(store.snapshot().current.draft, "Edited after rejection");
    store.destroy();
  }
});

test("a fetched own request receipt resolves an ambiguous send without resending", async () => {
  let delivered = false;
  const { store, calls } = harness(async (name) => {
    if (name === "messaging_send") { delivered = true; return { error: new Error("network") }; }
    return { data: name === "messaging_history" && delivered ? [row(1, { request_id: "uuid-1", sender_user_id: client.id })] : [] };
  });
  await store.refreshThread(); store.setDraft("Hello"); await store.send();
  assert.ok(store.snapshot().current.pending);
  await store.refreshThread();
  assert.equal(store.snapshot().current.pending, null);
  assert.equal(store.snapshot().current.draft, "");
  assert.equal(calls.filter((call) => call.name === "messaging_send").length, 1);
  store.destroy();
});

test("refresh bridges every page after many replies, including the gap before an own send", async () => {
  let initial = true;
  const { store, calls } = harness(async (name, args) => {
    if (name === "messaging_send") return { data: [row(150, { sender_user_id: client.id })] };
    if (name !== "messaging_history") return { data: [] };
    if (initial) { initial = false; return { data: descending(20, 1) }; }
    const max = args.p_before_id ? args.p_before_id - 1 : 150;
    return { data: descending(max, Math.max(1, max - 49)) };
  });
  await store.refreshThread();
  store.setDraft("My reply"); await store.send();
  await store.refreshThread();
  assert.deepEqual(store.snapshot().current.messages.map((message) => message.id), Array.from({ length: 150 }, (_, i) => i + 1));
  assert.deepEqual(calls.filter((call) => call.name === "messaging_history").map((call) => call.args.p_before_id), [null, null, 101, 51]);
  store.destroy();
});

test("failed catch-up retains its cursor so retry cannot skip missing messages", async () => {
  let phase = "initial";
  let fail = true;
  const { store } = harness(async (name, args) => {
    if (name !== "messaging_history") return { data: [] };
    if (phase === "initial") return { data: descending(20, 1) };
    if (args.p_before_id && fail) { fail = false; return { error: new Error("offline") }; }
    const max = args.p_before_id ? args.p_before_id - 1 : 100;
    return { data: descending(max, Math.max(1, max - 49)) };
  });
  await store.refreshThread(); phase = "catchup";
  await store.refreshThread();
  assert.equal(store.snapshot().current.fetchedLatest, 20);
  assert.equal(store.snapshot().current.messages.length, 20);
  await store.refreshThread();
  assert.equal(store.snapshot().current.messages.length, 100);
  store.destroy();
});

test("older pagination merges ascending without discarding the latest messages", async () => {
  const { store, calls } = harness(async (name, args) => ({ data: name === "messaging_history" ? args.p_before_id ? descending(50, 1) : descending(100, 51) : [] }));
  await store.refreshThread(); await store.loadOlder();
  assert.equal(calls[1].args.p_before_id, 51);
  assert.deepEqual(store.snapshot().current.messages.map((message) => message.id), Array.from({ length: 100 }, (_, i) => i + 1));
  store.destroy();
});

test("switching clients retains isolated drafts and late responses stay with their original thread", async () => {
  let finishFirst;
  const { store } = harness(async (name, args) => {
    if (name !== "messaging_history") return { data: [] };
    if (args.p_client_email === "first@example.com") return new Promise((resolve) => { finishFirst = resolve; });
    return { data: [row(2, { client_email: "second@example.com" })] };
  }, { role: "coach", user: { id: "coach-user", email: "coach@example.com" } });
  const first = store.select("first@example.com"); store.setDraft("First client draft");
  await store.select("second@example.com"); store.setDraft("Second client draft");
  finishFirst({ data: [row(1, { client_email: "first@example.com" })] }); await first;
  assert.equal(store.snapshot().current.email, "second@example.com");
  assert.equal(store.snapshot().current.messages[0].id, 2);
  assert.equal(store.snapshot().current.draft, "Second client draft");
  const back = store.select("first@example.com");
  assert.equal(store.snapshot().current.draft, "First client draft");
  finishFirst({ data: [row(1)] }); await back;
  store.destroy();
});

test("destroy clears account state and ignores a late response", async () => {
  let finish;
  let changes = 0;
  const { store } = harness(async () => new Promise((resolve) => { finish = resolve; }), { onChange: () => { changes++; } });
  store.setDraft("private draft");
  const loading = store.refreshThread();
  store.destroy();
  const previousChanges = changes;
  finish({ data: [row(1)] }); await loading;
  assert.equal(changes, previousChanges);
  assert.equal(store.snapshot().current, null);
  assert.deepEqual(store.snapshot().inbox, []);
});

test("read cursor only accepts a known safe ID and advances monotonically", async () => {
  const { store, calls } = harness(async (name) => ({ data: name === "messaging_history" ? [row(2), row(1)] : [] }));
  await store.refreshThread();
  await store.markRead(-1); await store.markRead(3); await store.markRead(NaN);
  assert.equal(calls.filter((call) => call.name === "messaging_mark_read").length, 0);
  await store.markRead(2); await store.markRead(1);
  assert.equal(calls.filter((call) => call.name === "messaging_mark_read").length, 1);
  assert.equal(store.snapshot().current.readThrough, 2);
  store.destroy();
});

test("inbox loads all pages and coach cannot start an empty conversation", async () => {
  const { store, calls } = harness(async (name, args) => ({ data: name === "messaging_inbox" ? Array.from({ length: args.p_offset === 0 ? 100 : 2 }, (_, i) => ({ client_email: `${i + args.p_offset}@example.com` })) : [] }), { role: "coach" });
  await store.refreshInbox();
  assert.equal(store.snapshot().inbox.length, 102);
  await store.select("new@example.com"); store.setDraft("Hello"); await store.send();
  assert.equal(calls.filter((call) => call.name === "messaging_send").length, 0);
  store.destroy();
});

test("invalid history IDs and missing send receipts remain errors with the draft intact", async () => {
  const { store } = harness(async (name) => ({ data: name === "messaging_history" ? [row("1")] : [] }));
  await store.refreshThread();
  assert.equal(store.snapshot().current.loaded, false);
  store.setDraft("Keep me"); await store.send();
  assert.equal(store.snapshot().current.pending, null);
  const good = harness(async () => ({ data: [] })).store;
  await good.refreshThread(); good.setDraft("Keep me"); await good.send();
  assert.equal(store.snapshot().current.draft, "Keep me");
  assert.match(good.snapshot().current.error, /could not be confirmed/);
  store.destroy(); good.destroy();
});

test("client and coach entry points load the shared controller before their application code", () => {
  const root = path.resolve(__dirname, "..");
  for (const [htmlName, entry] of [["client-dashboard.html", "js/client-portal.js"], ["coach-admin.html", "js/coach-admin.js"]]) {
    const html = fs.readFileSync(path.join(root, htmlName), "utf8");
    assert.ok(html.indexOf("js/coach-messages.js") < html.indexOf(entry));
    assert.match(html, /css\/coach-messages\.css\?v=1/);
    assert.match(html, /messages=\d+/);
  }
  const clientSource = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");
  assert.match(clientSource, /button\.hidden = isCoachDashboardPreview/);
  const dashboardStart = clientSource.indexOf("async function loadDashboard()");
  const dashboardSource = clientSource.slice(dashboardStart, clientSource.indexOf("\nfunction ", dashboardStart));
  assert.ok(dashboardSource.indexOf("clientMessagesController?.destroy()") < dashboardSource.indexOf("supabaseClient.auth.getSession()"));
  const healthStart = clientSource.indexOf("function configureClientGoogleHealth()");
  const healthSource = clientSource.slice(healthStart, clientSource.indexOf("\nfunction ", healthStart + 1));
  assert.doesNotMatch(healthSource, /clientMessagesController/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, "js/coach-messages.js"), "utf8"), /innerHTML|localStorage|sessionStorage/);
});


test("a sent receipt cannot mark an intervening unfetched reply as read", async () => {
  let hasReply = false;
  const { store, calls } = harness(async (name) => {
    if (name === "messaging_history") return { data: hasReply ? [row(3, { sender_user_id: client.id }), row(2), row(1)] : [row(1)] };
    if (name === "messaging_send") { hasReply = true; return { data: [row(3, { sender_user_id: client.id })] }; }
    return { data: [] };
  });
  await store.refreshThread(); store.setDraft("My message"); await store.send();
  assert.equal(store.snapshot().current.fetchedLatest, 1);
  await store.markRead(3);
  assert.equal(calls.filter((call) => call.name === "messaging_mark_read").length, 0);
  await store.refreshThread(); await store.markRead(3);
  assert.equal(calls.filter((call) => call.name === "messaging_mark_read").length, 1);
  assert.deepEqual(store.snapshot().current.messages.map((message) => message.id), [1, 2, 3]);
  store.destroy();
});

test("RPC transport rejects a switched account before dispatch, including during session lookup", async () => {
  const requests = [];
  let resolveSession;
  const transport = createAccountTransport({
    supabaseClient: { auth: { getSession: () => new Promise((resolve) => { resolveSession = resolve; }) } }, user: client,
    config: { url: "https://example.supabase.co", anonKey: "public-key" }, fetchRequest: (...args) => requests.push(args)
  });
  const pending = transport.rpc("messaging_send", { p_body: "Private draft" });
  resolveSession({ data: { session: { user: { id: "other-user", email: "other@example.com" }, access_token: "other-token" } } });
  assert.equal((await pending).error.code, "42501");
  assert.equal(requests.length, 0);
});

test("RPC request keeps the captured token after auth changes and preserves server error codes", async () => {
  let session = { user: client, access_token: "original-token" };
  let captured;
  let finish;
  const transport = createAccountTransport({
    supabaseClient: { auth: { getSession: async () => ({ data: { session } }) } }, user: client,
    config: { url: "https://example.supabase.co/", anonKey: "public-key" },
    fetchRequest: (url, options) => { captured = { url, options }; return new Promise((resolve) => { finish = resolve; }); }
  });
  const pending = transport.rpc("messaging_send", { p_body: "Private draft" });
  await Promise.resolve();
  session = { user: { id: "other-user", email: "other@example.com" }, access_token: "other-token" };
  assert.equal(captured.options.headers.Authorization, "Bearer original-token");
  assert.equal(captured.url, "https://example.supabase.co/rest/v1/rpc/messaging_send");
  finish({ ok: false, text: async () => JSON.stringify({ code: "42501", message: "Denied" }) });
  assert.equal((await pending).error.code, "42501");
});
