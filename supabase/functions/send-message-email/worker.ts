// The database freezes the complete provider payload on first claim. Never add
// timestamps, names, HTML, reply-to fields, or environment values to a retry.
export type EmailDelivery = {
  id: string;
  lease_token: string;
  provider_payload: { from: string; to: string[]; subject: string; text: string };
  idempotency_key: string;
  attempts: number;
  first_attempt_at: string;
  retry_until: string;
  lease_expires_at: string;
};

export type EmailRpcClient = {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

export type EmailWorkerDependencies = {
  env: (name: string) => string | undefined;
  createAdmin: (url: string, key: string) => EmailRpcClient;
  fetch: typeof fetch;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  log?: (event: string) => void;
};

const providerURL = "https://api.resend.com/emails";
const providerTimeoutMS = 8_000;
const dispatchBudgetMS = 40_000;
const maxDeliveriesPerRun = 20;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

async function sameSecret(left: string, right: string) {
  // Hash both values before comparing so unequal token lengths do not short-cut
  // comparison. Neither tokens nor hashes are returned or written to logs.
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right))
  ]);
  const a = new Uint8Array(leftHash);
  const b = new Uint8Array(rightHash);
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDelivery(value: unknown): value is EmailDelivery {
  if (!isRecord(value) || typeof value.id !== "string" || !uuidPattern.test(value.id) ||
      typeof value.lease_token !== "string" || !uuidPattern.test(value.lease_token) ||
      value.idempotency_key !== `fwb-message-email/${value.id}` || !isRecord(value.provider_payload)) return false;
  const payload = value.provider_payload;
  if (Object.keys(payload).some((key) => !["from", "to", "subject", "text"].includes(key))) return false;
  if (typeof payload.from !== "string" || !payload.from || /[\r\n]/.test(payload.from) ||
      !Array.isArray(payload.to) || payload.to.length !== 1 || typeof payload.to[0] !== "string" ||
      !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(payload.to[0]) ||
      typeof payload.subject !== "string" || !payload.subject || /[\r\n]/.test(payload.subject) ||
      typeof payload.text !== "string" || !payload.text) return false;
  return Number.isInteger(value.attempts) && Number(value.attempts) > 0 &&
    [value.first_attempt_at, value.retry_until, value.lease_expires_at]
      .every((date) => typeof date === "string" && Number.isFinite(Date.parse(date)));
}

export function retryAfterSeconds(value: string | null, now: number) {
  if (!value) return 0;
  const numeric = Number(value);
  const seconds = Number.isFinite(numeric) ? numeric : (Date.parse(value) - now) / 1_000;
  return Number.isFinite(seconds) ? Math.min(3_600, Math.max(0, Math.ceil(seconds))) : 0;
}

export function providerFailure(status: number, body: unknown) {
  const name = isRecord(body) && typeof body.name === "string" ? body.name : "";
  // Persist only a bounded known code, never Resend's error message (which can
  // contain a recipient address, API key, or message content).
  const knownNames = new Set([
    "invalid_idempotency_key", "invalid_idempotent_request", "concurrent_idempotent_requests",
    "resource_locked", "validation_error", "missing_api_key", "restricted_api_key", "invalid_permission",
    "suspended_api_key", "invalid_parameter", "missing_required_field", "missing_required_parameter",
    "daily_quota_exceeded", "monthly_quota_exceeded", "rate_limit_exceeded", "application_error", "service_unavailable"
  ]);
  return {
    code: `resend_${status}_${knownNames.has(name) ? name : "error"}`,
    retryable: status === 408 || status === 425 || status === 429 || status >= 500 ||
      (status === 409 && (name === "concurrent_idempotent_requests" || name === "resource_locked")),
    stopBatch: status === 401 || status === 403 || status === 429 || status >= 500
  };
}

async function rpc(admin: EmailRpcClient, name: string, args?: Record<string, unknown>) {
  const result = await admin.rpc(name, args);
  if (result.error) throw new Error("queue_rpc_failed");
  return result.data;
}

async function retryDelivery(admin: EmailRpcClient, delivery: EmailDelivery, code: string, retryable: boolean, retryAfter = 0) {
  return (await rpc(admin, "messaging_retry_email_notification", {
    p_delivery_id: delivery.id,
    p_lease_token: delivery.lease_token,
    p_error_code: code,
    p_retryable: retryable,
    p_retry_after_seconds: retryAfter
  })) === true;
}

/** Private cron entry point. The caller never supplies recipients or email text. */
export function createMessageEmailHandler(dependencies: EmailWorkerDependencies) {
  const now = dependencies.now ?? Date.now;
  const sleep = dependencies.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const log = dependencies.log ?? (() => {});

  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return response({ error: "Use POST." }, 405);
    const suppliedToken = /^Bearer ([A-Za-z0-9._~-]{32,512})$/.exec(request.headers.get("Authorization") ?? "")?.[1];
    if (!suppliedToken) return response({ error: "Dispatch authorization required." }, 401);

    const supabaseURL = dependencies.env("SUPABASE_URL") ?? "";
    const serviceKey = dependencies.env("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseURL || !serviceKey) return response({ error: "Email delivery is not configured." }, 503);

    const admin = dependencies.createAdmin(supabaseURL, serviceKey);
    const stats = { claimed: 0, accepted: 0, sent: 0, retryScheduled: 0, failed: 0, skipped: 0, leaseLost: 0 };
    let stage = "authorize";
    try {
      const config = await rpc(admin, "messaging_email_worker_config");
      if (!isRecord(config) || typeof config.worker_token !== "string" || config.worker_token.length < 32) {
        return response({ error: "Email delivery is not configured." }, 503);
      }
      if (!(await sameSecret(suppliedToken, config.worker_token))) {
        return response({ error: "Dispatch authorization failed." }, 401);
      }
      if (config.enabled !== true) return response({ ok: true, enabled: false }, 202);

      const resendKey = dependencies.env("RESEND_API_KEY") ?? "";
      const fromEmail = dependencies.env("MESSAGE_NOTIFICATION_FROM") ||
        dependencies.env("PASSWORD_NOTIFICATION_FROM") || dependencies.env("CONTACT_MESSAGE_FROM") || "";
      if (!resendKey || !fromEmail || /[\r\n]/.test(fromEmail)) {
        return response({ error: "Email delivery is not configured." }, 503);
      }

      const startedAt = now();
      for (let count = 0; count < maxDeliveriesPerRun && now() - startedAt < dispatchBudgetMS; count += 1) {
        stage = "claim";
        // Claim one just before delivery, so a slow provider never consumes the
        // leases of a batch waiting in this process. SQL serializes overlapping runs.
        const claimed = await rpc(admin, "messaging_claim_email_notifications", { p_from_email: fromEmail, p_limit: 1 });
        if (!Array.isArray(claimed) || claimed.length > 1) throw new Error("invalid_claim_response");
        if (claimed.length === 0) break;
        const delivery = claimed[0];
        if (!isDelivery(delivery)) throw new Error("invalid_delivery");
        stats.claimed += 1;

        // Retention at Resend is 24h; SQL's 23h window plus this send-time check
        // prevents a worker from retrying an ambiguous acceptance after key expiry.
        if (now() + providerTimeoutMS >= Date.parse(delivery.retry_until)) {
          stage = "retry_deadline";
          if (await retryDelivery(admin, delivery, "idempotency_window_expired", false)) stats.failed += 1;
          else stats.leaseLost += 1;
          continue;
        }
        if (now() + providerTimeoutMS >= Date.parse(delivery.lease_expires_at)) {
          stage = "lease_deadline";
          if (await retryDelivery(admin, delivery, "lease_near_expiry", true)) stats.retryScheduled += 1;
          else stats.leaseLost += 1;
          continue;
        }

        stage = "validate";
        const authorized = await rpc(admin, "messaging_validate_email_notification", {
          p_delivery_id: delivery.id, p_lease_token: delivery.lease_token
        });
        if (authorized !== true) { stats.skipped += 1; continue; }

        // The validation RPC itself may have been slow. Recheck time after it,
        // immediately before the external side effect, with room for its timeout.
        const expiredWindow = now() + providerTimeoutMS >= Date.parse(delivery.retry_until);
        if (expiredWindow || now() + providerTimeoutMS >= Date.parse(delivery.lease_expires_at)) {
          stage = "deadline_after_validate";
          const updated = await retryDelivery(admin, delivery,
            expiredWindow ? "idempotency_window_expired" : "lease_near_expiry", !expiredWindow);
          if (!updated) stats.leaseLost += 1;
          else if (expiredWindow) stats.failed += 1;
          else stats.retryScheduled += 1;
          continue;
        }

        let providerResponse: Response;
        stage = "provider";
        try {
          providerResponse = await dependencies.fetch(providerURL, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${resendKey}`,
              "Content-Type": "application/json",
              "Idempotency-Key": delivery.idempotency_key
            },
            body: JSON.stringify(delivery.provider_payload),
            signal: AbortSignal.timeout(providerTimeoutMS)
          });
        } catch {
          stage = "retry_transport";
          if (await retryDelivery(admin, delivery, "resend_transport_error", true)) stats.retryScheduled += 1;
          else stats.leaseLost += 1;
          // Avoid spending every available lease on a provider outage.
          break;
        }

        const providerBody: unknown = await providerResponse.json().catch(() => null);
        if (!providerResponse.ok) {
          const failure = providerFailure(providerResponse.status, providerBody);
          stage = "retry_provider";
          const updated = await retryDelivery(admin, delivery, failure.code, failure.retryable,
            retryAfterSeconds(providerResponse.headers.get("Retry-After"), now()));
          if (!updated) stats.leaseLost += 1;
          else if (failure.retryable) stats.retryScheduled += 1;
          else stats.failed += 1;
          if (failure.stopBatch) break;
        } else if (!isRecord(providerBody) || typeof providerBody.id !== "string" || !uuidPattern.test(providerBody.id)) {
          // A 2xx with a missing/broken acknowledgement is still an uncertain send.
          stage = "retry_response";
          if (await retryDelivery(admin, delivery, "resend_invalid_response", true)) stats.retryScheduled += 1;
          else stats.leaseLost += 1;
          break;
        } else {
          stats.accepted += 1;
          stage = "acknowledge";
          const completed = await rpc(admin, "messaging_complete_email_notification", {
            p_delivery_id: delivery.id,
            p_lease_token: delivery.lease_token,
            p_provider_message_id: providerBody.id
          });
          if (completed === true) stats.sent += 1;
          else { stats.leaseLost += 1; break; }
          // If the RPC throws after provider acceptance, keep the lease intact.
          // A reclaim retries identical payload/key and gets the original provider ID.
        }
        await sleep(200);
      }
      return response({ ok: true, ...stats });
    } catch {
      // Stage labels are compile-time constants: no private payloads, recipient
      // addresses, secrets, or raw provider/database errors reach output or logs.
      log(`message_email_dispatch_failed:${stage}`);
      return response({ error: "Email delivery will retry safely.", ...stats }, 503);
    }
  };
}
