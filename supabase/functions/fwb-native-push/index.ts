import { createClient } from "npm:@supabase/supabase-js@2.116.0";

type PushJob = {
  queue_id: number;
  notification_id: string;
  device_id: string;
  user_id: string;
  device_token: string;
  environment: "sandbox" | "production";
  bundle_identifier: string;
  notification_kind: string;
  notification_title: string;
  notification_created_at: string;
  notification_read_at: string | null;
  attempts: number;
};

let cachedProviderToken: { value: string; expiresAt: number } | null = null;

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

function base64url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function text64(value: string) {
  return base64url(new TextEncoder().encode(value));
}

function privateKeyBytes(pem: string) {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\\n/g, "")
    .replace(/\s/g, "");
  const binary = atob(body);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function providerToken(teamID: string, keyID: string, privateKey: string) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedProviderToken && cachedProviderToken.expiresAt > now + 60) {
    return cachedProviderToken.value;
  }

  const header = text64(JSON.stringify({ alg: "ES256", kid: keyID }));
  const claims = text64(JSON.stringify({ iss: teamID, iat: now }));
  const unsigned = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyBytes(privateKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(unsigned)
  );
  const value = `${unsigned}.${base64url(new Uint8Array(signature))}`;
  cachedProviderToken = { value, expiresAt: now + 50 * 60 };
  return value;
}

function safeTitle(kind: string, storedTitle: string) {
  const titles: Record<string, string> = {
    client_message: "New client message",
    coach_reply: "New message from your coach",
    workout_completed: "Client workout completed",
    check_in_submitted: "Client check-in submitted",
    general: "FWB Training notification"
  };
  return (titles[kind] || storedTitle || "FWB Training notification").replace(/\s+/g, " ").trim().slice(0, 120);
}

function safeBody(kind: string) {
  if (kind === "client_message") return "Open FWB Training to read and reply.";
  if (kind === "coach_reply") return "Open FWB Training to read your coach's message.";
  return "Open FWB Training to view your update.";
}

function retryDelay(attempts: number) {
  return Math.min(60, Math.max(2, 2 ** Math.max(attempts, 1))) * 60_000;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const [{ data: config, error: configError }, teamID, keyID, privateKey] = await Promise.all([
    admin.rpc("fwb_push_config"),
    Promise.resolve(Deno.env.get("APNS_TEAM_ID") || ""),
    Promise.resolve(Deno.env.get("APNS_KEY_ID") || ""),
    Promise.resolve(Deno.env.get("APNS_PRIVATE_KEY") || "")
  ]);
  const requestToken = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (configError || !config?.fwb_push_worker_token || requestToken !== config.fwb_push_worker_token) {
    return json({ error: "Unauthorized" }, 401);
  }
  if (!teamID || !keyID || !privateKey) {
    return json({ error: "APNs delivery is not configured" }, 503);
  }

  let token: string;
  try {
    token = await providerToken(teamID, keyID, privateKey);
  } catch {
    return json({ error: "APNs credentials are invalid" }, 503);
  }

  const { data, error } = await admin.rpc("fwb_claim_native_push_jobs", { p_limit: 50 });
  if (error) return json({ error: "Could not claim native push jobs" }, 500);

  let delivered = 0;
  let disabled = 0;
  for (const job of (data || []) as PushJob[]) {
    const finish = async (lastError: string | null) => {
      await admin.from("fwb_native_push_queue").update({
        delivered_at: new Date().toISOString(),
        locked_at: null,
        last_error: lastError
      }).eq("id", job.queue_id);
    };

    if (job.notification_read_at || Date.now() - Date.parse(job.notification_created_at) > 86_400_000) {
      await finish("Skipped: read or expired");
      continue;
    }

    const { data: settings } = await admin.from("fwb_notification_settings")
      .select("push_enabled,categories")
      .eq("user_id", job.user_id)
      .maybeSingle();
    if (settings?.push_enabled === false || settings?.categories?.[job.notification_kind] === false) {
      await finish("Skipped: disabled");
      continue;
    }

    const host = job.environment === "production" ? "api.push.apple.com" : "api.sandbox.push.apple.com";
    let response: Response;
    try {
      response = await fetch(`https://${host}/3/device/${job.device_token}`, {
        method: "POST",
        headers: {
          authorization: `bearer ${token}`,
          "apns-topic": job.bundle_identifier,
          "apns-push-type": "alert",
          "apns-priority": "10",
          "apns-expiration": String(Math.floor(Date.now() / 1000) + 900),
          "content-type": "application/json"
        },
        body: JSON.stringify({
          aps: {
            alert: {
              title: safeTitle(job.notification_kind, job.notification_title),
              body: safeBody(job.notification_kind)
            },
            sound: "default",
            badge: 1
          },
          kind: job.notification_kind,
          notification_id: job.notification_id
        })
      });
    } catch {
      await admin.from("fwb_native_push_queue").update({
        locked_at: null,
        available_at: new Date(Date.now() + retryDelay(job.attempts)).toISOString(),
        last_error: "APNs request failed"
      }).eq("id", job.queue_id);
      continue;
    }

    if (response.ok) {
      delivered += 1;
      await finish(null);
      continue;
    }

    const result = await response.json().catch(() => ({}));
    const reason = String(result.reason || `APNs ${response.status}`).slice(0, 450);
    if (response.status === 410 || ["BadDeviceToken", "DeviceTokenNotForTopic", "Unregistered"].includes(reason)) {
      disabled += 1;
      await admin.from("client_notification_devices").update({ is_active: false }).eq("id", job.device_id);
      await finish(reason);
      continue;
    }

    await admin.from("fwb_native_push_queue").update({
      locked_at: null,
      available_at: new Date(Date.now() + retryDelay(job.attempts)).toISOString(),
      last_error: reason
    }).eq("id", job.queue_id);
  }

  return json({ claimed: (data || []).length, delivered, disabled });
});
