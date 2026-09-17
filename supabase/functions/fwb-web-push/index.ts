import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import webpush from "npm:web-push@3.6.7";

const productionOrigins = new Set([
  "https://benjaminbenz.com",
  "https://www.benjaminbenz.com"
]);
const coachEmail = "benjaminbenz.fit@gmail.com";

function allowedOrigin(request: Request) {
  const origin = request.headers.get("Origin") || "https://benjaminbenz.com";

  try {
    const url = new URL(origin);
    if (productionOrigins.has(origin) || url.hostname === "127.0.0.1" || url.hostname === "localhost") {
      return origin;
    }
  } catch {
    // Use the production origin below.
  }

  return "https://benjaminbenz.com";
}

function corsHeaders(request: Request) {
  return {
    "Access-Control-Allow-Origin": allowedOrigin(request),
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}

function jsonResponse(request: Request, value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

export function allowedEndpoint(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443") &&
      (
        ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"].includes(url.hostname) ||
        /^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname)
      );
  } catch {
    return false;
  }
}

export function quietNow(settings: Record<string, unknown>, now = new Date()) {
  if (!settings.quiet_enabled || settings.quiet_start === settings.quiet_end) {
    return false;
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: String(settings.timezone || "America/Los_Angeles"),
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);
  const time = `${parts.find((part) => part.type === "hour")?.value}:${parts.find((part) => part.type === "minute")?.value}`;
  const start = String(settings.quiet_start || "").slice(0, 5);
  const end = String(settings.quiet_end || "").slice(0, 5);

  return start < end ? time >= start && time < end : time >= start || time < end;
}

function safePushTitle(category: string) {
  const titles: Record<string, string> = {
    workout_completed: "Client workout completed",
    check_in_submitted: "Client check-in submitted",
    client_message: "New client message",
    low_sessions: "Session balance update",
    inactivity: "Client activity reminder",
    coach_reply: "New coaching update",
    program_update: "Training plan update",
    workout_reminder: "Workout reminder",
    weekly_check_in: "Weekly check-in reminder",
    general: "FWB notification"
  };

  return titles[category] || "FWB notification";
}

async function requireMutation(
  operation: PromiseLike<{ error: { message?: string } | null }>,
  message: string
) {
  const { error } = await operation;
  if (error) {
    throw new Error(message);
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return jsonResponse(request, { error: "Method not allowed" }, 405);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  try {
    const { data: config, error: configError } = await admin.rpc("fwb_push_config");
    if (
      configError ||
      !config?.fwb_vapid_public ||
      !config?.fwb_vapid_private ||
      !config?.fwb_push_worker_token
    ) {
      return jsonResponse(request, { error: "Push delivery is not configured" }, 503);
    }

    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "";
    const input = await request.json().catch(() => ({}));

    if (input.action === "public-key" || input.action === "test") {
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data.user) {
        return jsonResponse(request, { error: "Unauthorized" }, 401);
      }

      if (input.action === "public-key") {
        return jsonResponse(request, { publicKey: config.fwb_vapid_public });
      }

      const { count } = await admin
        .from("fwb_web_push_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", data.user.id);
      if (!count) {
        return jsonResponse(request, { error: "Enable browser alerts on this device first." }, 409);
      }

      const minuteKey = Math.floor(Date.now() / 60000);
      const { error: insertError } = await admin.from("client_notifications").insert({
        user_id: data.user.id,
        kind: "general",
        title: "FWB test alert",
        body: "Browser alerts are working on this device.",
        web_category: "general",
        web_url: data.user.email?.toLowerCase() === coachEmail
          ? "/coach-admin.html?tab=notifications"
          : "/client-dashboard.html?tab=home",
        web_dedupe_key: `web-push-test:${data.user.id}:${minuteKey}`
      });
      if (insertError?.code === "23505") {
        return jsonResponse(request, { error: "Wait a minute before sending another test alert." }, 429);
      }
      if (insertError) {
        throw insertError;
      }

      return jsonResponse(request, { queued: true });
    }

    if (token !== config.fwb_push_worker_token) {
      return jsonResponse(request, { error: "Unauthorized" }, 401);
    }

    const { data: jobs, error: jobsError } = await admin.rpc("fwb_claim_push_jobs");
    if (jobsError) {
      throw jobsError;
    }

    let delivered = 0;
    for (let offset = 0; offset < (jobs || []).length; offset += 5) {
      await Promise.all((jobs || []).slice(offset, offset + 5).map(async (job: Record<string, any>) => {
        const [{ data: subscription }, { data: notification }] = await Promise.all([
          admin.from("fwb_web_push_subscriptions").select("*").eq("id", job.subscription_id).maybeSingle(),
          admin.from("client_notifications").select("*").eq("id", job.notification_id).maybeSingle()
        ]);
        if (!subscription || !notification) {
          return;
        }

        const { data: settings } = await admin
          .from("fwb_notification_settings")
          .select("*")
          .eq("user_id", subscription.user_id)
          .maybeSingle();
        const finish = (lastError: string | null) => requireMutation(
          admin
            .from("fwb_web_push_queue")
            .update({ delivered_at: new Date().toISOString(), last_error: lastError })
            .eq("id", job.id),
          "Could not finalize push delivery"
        );
        const category = notification.web_category || notification.kind;

        if (
          !settings?.push_enabled ||
          settings.categories?.[category] === false ||
          notification.read_at ||
          subscription.user_id !== notification.user_id
        ) {
          await finish("Skipped: read or disabled");
          return;
        }
        if (Date.now() - Date.parse(notification.created_at) > 86400000) {
          await finish("Expired");
          return;
        }
        if (quietNow(settings)) {
          await requireMutation(
            admin
              .from("fwb_web_push_queue")
              .update({
                available_at: new Date(Date.now() + 15 * 60000).toISOString(),
                attempts: Math.max(Number(job.attempts || 1) - 1, 0)
              })
              .eq("id", job.id),
            "Could not defer push delivery"
          );
          return;
        }
        if (!allowedEndpoint(subscription.endpoint)) {
          await finish("Unsupported push provider");
          return;
        }

        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth }
            },
            JSON.stringify({
              title: safePushTitle(category),
              body: "Open FWB to view your update.",
              tag: `fwb-${notification.id}`,
              data: { url: notification.web_url || "/client-dashboard.html?notifications=1" }
            }),
            {
              TTL: 900,
              timeout: 10000,
              vapidDetails: {
                subject: "mailto:fwb@benjaminbenz.com",
                publicKey: config.fwb_vapid_public,
                privateKey: config.fwb_vapid_private
              }
            }
          );
          await finish(null);
          delivered += 1;
        } catch (failure) {
          const statusCode = Number((failure as { statusCode?: number })?.statusCode || 0);
          if ([404, 410].includes(statusCode)) {
            await requireMutation(
              admin.from("fwb_web_push_subscriptions").delete().eq("id", subscription.id),
              "Could not remove an expired push subscription"
            );
            await finish("Push subscription expired");
          } else {
            await requireMutation(
              admin
                .from("fwb_web_push_queue")
                .update({
                  available_at: new Date(Date.now() + Math.min(60, 2 ** Number(job.attempts || 0)) * 60000).toISOString(),
                  last_error: `Push provider status ${statusCode || "unavailable"}`
                })
                .eq("id", job.id),
              "Could not schedule a push retry"
            );
          }
        }
      }));
    }

    return jsonResponse(request, { claimed: jobs?.length || 0, delivered });
  } catch {
    return jsonResponse(request, { error: "Notification delivery failed" }, 500);
  }
});
