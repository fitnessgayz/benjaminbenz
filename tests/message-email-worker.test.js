const test = require("node:test");
const assert = require("node:assert/strict");
const { createMessageEmailHandler, providerFailure, retryAfterSeconds } = require("../supabase/functions/send-message-email/worker.ts");

const workerToken = "test-only-worker-token-00000000000000000000000000000000";
const providerID = "aaaa0000-0000-4000-8000-000000000001";
const currentTime = Date.parse("2026-09-26T12:00:00Z");
const iso = (offset) => new Date(currentTime + offset).toISOString();

function delivery(overrides = {}) {
  return {
    id: "bbbb0000-0000-4000-8000-000000000001",
    lease_token: "cccc0000-0000-4000-8000-000000000001",
    provider_payload: {
      from: "FWB Training <notifications@example.com>",
      to: ["client@example.com"],
      subject: "New message from your coach",
      text: "You have a new message in FWB Training.\n\nOpen your private conversation:\nhttps://benjaminbenz.com/client-dashboard.html?messages=1\n\nReply in FWB Training."
    },
    idempotency_key: "fwb-message-email/bbbb0000-0000-4000-8000-000000000001",
    attempts: 1,
    first_attempt_at: iso(0),
    retry_until: iso(23 * 3_600_000),
    lease_expires_at: iso(120_000),
    ...overrides
  };
}

function harness(options = {}) {
  const calls = [];
  const sends = [];
  const logs = [];
  const sleeps = [];
  const claimed = [...(options.rows ?? [delivery()])];
  const env = {
    SUPABASE_URL: "https://test-project.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "fake-service-key",
    RESEND_API_KEY: "fake-resend-key",
    PASSWORD_NOTIFICATION_FROM: "FWB Training <notifications@example.com>",
    ...options.env
  };
  const admin = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (options.rpc) {
        const custom = await options.rpc(name, args);
        if (custom !== undefined) return custom;
      }
      if (name === "messaging_email_worker_config") return { data: { worker_token: workerToken, enabled: true }, error: null };
      if (name === "messaging_claim_email_notifications") return { data: claimed.length ? [claimed.shift()] : [], error: null };
      return { data: true, error: null };
    }
  };
  const handler = createMessageEmailHandler({
    env: (name) => env[name],
    createAdmin: () => admin,
    now: options.now ?? (() => currentTime),
    sleep: async (milliseconds) => sleeps.push(milliseconds),
    log: (event) => logs.push(event),
    fetch: async (url, init) => {
      sends.push({ url, init });
      return options.fetch ? options.fetch(url, init) : Response.json({ id: providerID });
    }
  });
  async function invoke({ method = "POST", token = workerToken, body = {}, headers = {} } = {}) {
    const request = new Request("https://test-project.invalid/functions/v1/send-message-email", {
      method,
      headers: { Authorization: token ? `Bearer ${token}` : "", "Content-Type": "application/json", ...headers },
      ...(["GET", "HEAD"].includes(method) ? {} : { body: JSON.stringify(body) })
    });
    const result = await handler(request);
    return { status: result.status, body: await result.json(), headers: result.headers };
  }
  return { invoke, calls, sends, logs, sleeps, env };
}

test("private endpoint rejects missing, invalid, and ordinary bearer tokens before claiming deliveries", async () => {
  for (const token of [null, "short", "ordinary-user-jwt-not-the-dedicated-worker-secret-00000"]) {
    const h = harness();
    const result = await h.invoke({ token });
    assert.equal(result.status, 401);
    assert.equal(h.sends.length, 0);
    assert.equal(h.calls.filter((call) => call.name.includes("claim")).length, 0);
    assert.equal(result.headers.get("Access-Control-Allow-Origin"), null);
  }
  const h = harness();
  assert.equal((await h.invoke({ method: "GET" })).status, 405);
  assert.equal((await h.invoke({ method: "OPTIONS" })).status, 405);
  assert.equal(h.calls.length, 0);
});

test("disabled dispatch and missing provider config never lease or send a delivery", async () => {
  const disabled = harness({ rpc: (name) => name === "messaging_email_worker_config"
    ? { data: { worker_token: workerToken, enabled: false }, error: null } : undefined });
  assert.equal((await disabled.invoke()).status, 202);
  assert.equal(disabled.calls.length, 1);
  assert.equal(disabled.sends.length, 0);
  const missingKey = harness({ env: { RESEND_API_KEY: "" } });
  assert.equal((await missingKey.invoke()).status, 503);
  assert.equal(missingKey.calls.length, 1);
  assert.equal(missingKey.sends.length, 0);
});

test("only the frozen server recipient and payload are sent, regardless of caller body", async () => {
  const frozen = delivery();
  const h = harness({ rows: [frozen] });
  const result = await h.invoke({ body: {
    to: "attacker@example.com", from: "spoofed@example.com", message: "PRIVATE workout and health details", limit: 9999
  } });
  assert.equal(result.status, 200);
  assert.equal(result.body.sent, 1);
  assert.equal(result.body.accepted, 1);
  assert.equal(h.sends.length, 1);
  assert.equal(h.sends[0].url, "https://api.resend.com/emails");
  assert.equal(h.sends[0].init.headers["Idempotency-Key"], frozen.idempotency_key);
  assert.deepEqual(JSON.parse(h.sends[0].init.body), frozen.provider_payload);
  assert.doesNotMatch(h.sends[0].init.body, /PRIVATE|attacker|spoofed/);
  assert.deepEqual(h.calls.map((call) => call.name), [
    "messaging_email_worker_config", "messaging_claim_email_notifications", "messaging_validate_email_notification",
    "messaging_complete_email_notification", "messaging_claim_email_notifications"
  ]);
  assert.deepEqual(h.calls[3].args, { p_delivery_id: frozen.id, p_lease_token: frozen.lease_token, p_provider_message_id: providerID });
  assert.equal(result.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(h.sleeps, [200]);
});

test("coach notifications also use the exact generic server payload and coach inbox link", async () => {
  const row = delivery({ provider_payload: {
    from: "FWB Training <notifications@example.com>", to: ["coach@example.com"], subject: "New client message",
    text: "A client sent a message. Read it privately:\nhttps://benjaminbenz.com/coach-admin.html?tab=inbox"
  } });
  const h = harness({ rows: [row] });
  await h.invoke();
  assert.deepEqual(JSON.parse(h.sends[0].init.body), row.provider_payload);
  assert.doesNotMatch(h.sends[0].init.body, /client@example/);
});

test("recipient revoked or changed after claim prevents a provider send", async () => {
  const h = harness({ rpc: (name) => name === "messaging_validate_email_notification" ? { data: false, error: null } : undefined });
  const result = await h.invoke();
  assert.equal(result.body.skipped, 1);
  assert.equal(h.sends.length, 0);
  assert.equal(h.calls.filter((call) => call.name.includes("complete")).length, 0);
});

test("transport failure schedules an idempotent retry with no private error text", async () => {
  const h = harness({ fetch: async () => { throw new Error("PRIVATE client@example.com fake-resend-key"); } });
  const result = await h.invoke();
  assert.equal(result.body.retryScheduled, 1);
  const retry = h.calls.find((call) => call.name === "messaging_retry_email_notification");
  assert.equal(retry.args.p_error_code, "resend_transport_error");
  assert.equal(retry.args.p_retryable, true);
  assert.doesNotMatch(JSON.stringify([result, h.calls, h.logs]), /PRIVATE|fake-resend-key/);
});

test("provider acceptance then acknowledgement failure can reclaim and resend the identical key and payload", async () => {
  const original = delivery();
  const first = harness({ rows: [original], rpc: (name) => name === "messaging_complete_email_notification"
    ? { data: null, error: new Error("PRIVATE database failure client@example.com") } : undefined });
  const firstResult = await first.invoke();
  assert.equal(firstResult.status, 503);
  assert.equal(firstResult.body.accepted, 1);
  assert.equal(firstResult.body.sent, 0);
  assert.equal(first.calls.filter((call) => call.name.includes("retry_email")).length, 0);
  assert.deepEqual(first.logs, ["message_email_dispatch_failed:acknowledge"]);
  assert.doesNotMatch(JSON.stringify([firstResult, first.logs]), /PRIVATE|client@example/);

  const retry = harness({ rows: [delivery({ ...original, attempts: 2, lease_token: "cccc0000-0000-4000-8000-000000000002" })],
    env: { PASSWORD_NOTIFICATION_FROM: "Changed sender <changed@example.com>" } });
  const retried = await retry.invoke();
  assert.equal(retried.body.sent, 1);
  assert.equal(retry.sends[0].init.headers["Idempotency-Key"], first.sends[0].init.headers["Idempotency-Key"]);
  assert.equal(retry.sends[0].init.body, first.sends[0].init.body);
});

test("successful response without an email ID remains uncertain and retryable", async () => {
  const h = harness({ fetch: async () => Response.json({ accepted: true }) });
  const result = await h.invoke();
  assert.equal(result.body.retryScheduled, 1);
  assert.equal(result.body.sent, 0);
  assert.equal(h.calls.find((call) => call.name.includes("retry_email")).args.p_error_code, "resend_invalid_response");
});

test("rate limits preserve Retry-After, back off, and stop the current batch", async () => {
  const h = harness({ rows: [delivery(), delivery()], fetch: async () => Response.json(
    { name: "rate_limit_exceeded", message: "PRIVATE details" }, { status: 429, headers: { "Retry-After": "180" } }
  ) });
  const result = await h.invoke();
  assert.equal(result.body.retryScheduled, 1);
  assert.equal(h.sends.length, 1);
  const retry = h.calls.find((call) => call.name.includes("retry_email"));
  assert.equal(retry.args.p_retry_after_seconds, 180);
  assert.equal(retry.args.p_retryable, true);
  assert.equal(retry.args.p_error_code, "resend_429_rate_limit_exceeded");
  assert.doesNotMatch(JSON.stringify([h.calls, result]), /PRIVATE/);
});

test("provider concurrency retries while payload conflicts and validation failures become terminal", async () => {
  for (const [status, name, retryable] of [
    [409, "concurrent_idempotent_requests", true], [409, "resource_locked", true],
    [409, "invalid_idempotent_request", false], [422, "validation_error", false],
    [401, "missing_api_key", false], [500, "application_error", true], [503, "service_unavailable", true]
  ]) {
    const h = harness({ fetch: async () => Response.json({ name, message: "PRIVATE provider detail" }, { status }) });
    const result = await h.invoke();
    const retry = h.calls.find((call) => call.name.includes("retry_email"));
    assert.equal(retry.args.p_retryable, retryable, `${status} ${name}`);
    assert.equal(result.body[retryable ? "retryScheduled" : "failed"], 1);
    assert.doesNotMatch(JSON.stringify([h.calls, result, h.logs]), /PRIVATE/);
  }
});

test("idempotency expiry and nearly expired leases never contact the provider", async () => {
  for (const [overrides, expectedCode, retryable] of [
    [{ retry_until: iso(5_000) }, "idempotency_window_expired", false],
    [{ lease_expires_at: iso(5_000) }, "lease_near_expiry", true]
  ]) {
    const h = harness({ rows: [delivery(overrides)] });
    await h.invoke();
    assert.equal(h.sends.length, 0);
    const retry = h.calls.find((call) => call.name.includes("retry_email"));
    assert.equal(retry.args.p_error_code, expectedCode);
    assert.equal(retry.args.p_retryable, retryable);
  }
});

test("a stale completion lease is never reported as sent", async () => {
  const h = harness({ rpc: (name) => name === "messaging_complete_email_notification" ? { data: false, error: null } : undefined });
  const result = await h.invoke();
  assert.equal(result.body.sent, 0);
  assert.equal(result.body.accepted, 1);
  assert.equal(result.body.leaseLost, 1);
  assert.equal(h.calls.filter((call) => call.name.includes("claim_email")).length, 1);
});

test("slow recipient validation cannot send after its lease loses safety margin", async () => {
  let clock = currentTime;
  const h = harness({ now: () => clock, rpc: (name) => {
    if (name === "messaging_validate_email_notification") clock += 115_000;
  } });
  const result = await h.invoke();
  assert.equal(h.sends.length, 0);
  assert.equal(result.body.retryScheduled, 1);
  assert.equal(h.calls.find((call) => call.name.includes("retry_email")).args.p_error_code, "lease_near_expiry");
});

test("malformed or expanded recipient payloads fail closed", async () => {
  for (const row of [
    delivery({ provider_payload: { ...delivery().provider_payload, to: ["client@example.com", "extra@example.com"] } }),
    delivery({ provider_payload: { ...delivery().provider_payload, bcc: ["extra@example.com"] } }),
    delivery({ idempotency_key: "new-key-that-could-duplicate" }),
    delivery({ lease_expires_at: "not-a-date" })
  ]) {
    const h = harness({ rows: [row] });
    assert.equal((await h.invoke()).status, 503);
    assert.equal(h.sends.length, 0);
  }
});

test("provider error sanitization and Retry-After parsing are bounded", () => {
  assert.equal(providerFailure(400, { name: "recipient-private@example.com", message: "PRIVATE" }).code, "resend_400_error");
  assert.equal(retryAfterSeconds("120", currentTime), 120);
  assert.equal(retryAfterSeconds("Sat, 26 Sep 2026 12:03:00 GMT", currentTime), 180);
  assert.equal(retryAfterSeconds("999999", currentTime), 3600);
  assert.equal(retryAfterSeconds("-1", currentTime), 0);
  assert.equal(retryAfterSeconds("not-a-date", currentTime), 0);
});
