import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const productionOrigins = new Set([
  "https://benjaminbenz.com",
  "https://www.benjaminbenz.com"
]);
const coachEmail = "benjaminbenz.fit@gmail.com";
const defaultTimezone = "America/Los_Angeles";
const maxDispatchBatch = 100;

type JsonRecord = Record<string, unknown>;
type AdminClient = ReturnType<typeof createClient<any>>;

type NotificationRow = {
  id: string;
  user_id: string;
  recipient_role: "client" | "coach";
  kind: string;
  title: string;
  body: string;
  action_url: string;
  dedupe_key: string | null;
  created_at: string;
  expires_at: string | null;
  push_attempted_at: string | null;
  push_attempt_count: number;
};

function allowedOrigin(request: Request) {
  const origin = request.headers.get("Origin") || "https://benjaminbenz.com";

  try {
    const url = new URL(origin);
    if (productionOrigins.has(origin) || url.hostname === "127.0.0.1" || url.hostname === "localhost") {
      return origin;
    }
  } catch {
    // Fall through to the production origin.
  }

  return "https://benjaminbenz.com";
}

function corsHeaders(request: Request) {
  return {
    "Access-Control-Allow-Origin": allowedOrigin(request),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-fwb-dispatch-secret",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin"
  };
}

function jsonResponse(request: Request, body: JsonRecord, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function safeTimezone(value: unknown) {
  const timezone = String(value || defaultTimezone).trim();

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return defaultTimezone;
  }
}

function timeMinute(value: unknown) {
  return String(value || "").slice(0, 5);
}

function clockParts(date: Date, timezone: string) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      weekday: "short"
    }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  );
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(values.weekday);

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    weekday,
    time: `${values.hour}:${values.minute}`,
    date: `${values.year}-${values.month}-${values.day}`
  };
}

function previousMonthKey(parts: ReturnType<typeof clockParts>) {
  const date = new Date(Date.UTC(parts.year, parts.month - 2, 1));
  return date.toISOString().slice(0, 7);
}

function sha256Hex(value: string) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)).then((buffer) =>
    Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("")
  );
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function verifyDispatchSecret(adminClient: AdminClient, request: Request) {
  const suppliedSecret = request.headers.get("X-FWB-Dispatch-Secret") || "";
  if (!suppliedSecret) {
    return false;
  }

  const { data, error } = await adminClient
    .from("notification_dispatch_config")
    .select("secret_hash")
    .eq("id", 1)
    .single();

  if (error || !data?.secret_hash) {
    return false;
  }

  return constantTimeEqual(await sha256Hex(suppliedSecret), String(data.secret_hash));
}

async function listAuthUsers(adminClient: AdminClient) {
  const users: Array<{ id: string; email?: string }> = [];

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      throw error;
    }

    users.push(...(data?.users || []));
    if ((data?.users || []).length < 1000) {
      break;
    }
  }

  return users;
}

async function insertNotification(adminClient: AdminClient, payload: JsonRecord) {
  const { data, error } = await adminClient
    .from("client_notifications")
    .insert(payload)
    .select("id")
    .single();

  if (error && error.code !== "23505") {
    throw error;
  }

  return data?.id || "";
}

function preferenceColumn(notification: NotificationRow) {
  const clientColumns: Record<string, string> = {
    coach_reply: "coach_replies",
    program_update: "program_updates",
    nutrition_plan_update: "program_updates",
    session_reminder: "session_reminders",
    workout_reminder: "workout_reminders",
    weekly_check_in: "weekly_check_ins",
    monthly_report: "monthly_reports",
    session_balance: "session_balance",
    nutrition_reminder: "nutrition_reminders",
    progress_reminder: "progress_reminders",
    achievement: "achievements",
    workout_comment: "coach_replies",
    form_check_feedback: "coach_replies"
  };
  const coachColumns: Record<string, string> = {
    workout_completed: "client_workout_completed",
    check_in_submitted: "client_check_ins",
    progress_submitted: "client_progress_updates",
    dexa_uploaded: "client_dexa_uploads",
    questionnaire_submitted: "client_questionnaires",
    coach_request: "client_coach_requests",
    workout_comment: "client_workout_comments",
    form_check_submitted: "client_form_checks",
    nutrition_activity: "client_nutrition_activity",
    session_balance: "client_session_balance",
    client_inactive: "client_inactivity"
  };

  return notification.recipient_role === "coach"
    ? coachColumns[notification.kind]
    : clientColumns[notification.kind];
}

function pushCopy(notification: NotificationRow) {
  if (notification.recipient_role === "coach" && notification.kind === "check_in_submitted") {
    const safeTitle = String(notification.title || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);

    return {
      title: safeTitle || "Client check-in submitted",
      body: "Open Coach Admin to review the private check-in."
    };
  }
  if (notification.recipient_role === "coach" && notification.kind === "workout_completed") {
    const safeTitle = String(notification.title || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);
    const safeBody = String(notification.body || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 240);

    return {
      title: safeTitle || "Client workout completed",
      body: safeBody || "Open Coach Admin to review the completed workout log."
    };
  }

  const copy: Record<string, { title: string; body: string }> = {
    "client:coach_reply": {
      title: "New coaching update",
      body: "Open FWB to view your private coaching update."
    },
    "client:program_update": {
      title: "Training plan update",
      body: "Open FWB to review your latest training plan."
    },
    "client:nutrition_plan_update": {
      title: "Nutrition plan update",
      body: "Open FWB to review your latest nutrition guidance."
    },
    "client:session_reminder": {
      title: "Session reminder",
      body: "Open FWB to view your session information."
    },
    "client:workout_reminder": {
      title: "Workout reminder",
      body: "Open FWB when you are ready to train."
    },
    "client:weekly_check_in": {
      title: "Weekly check-in reminder",
      body: "Open FWB when you are ready to check in."
    },
    "client:monthly_report": {
      title: "Monthly report ready",
      body: "Open FWB to view your private training report."
    },
    "client:session_balance": {
      title: "Session balance update",
      body: "Open FWB to review your coaching-session balance."
    },
    "client:nutrition_reminder": {
      title: "Nutrition log reminder",
      body: "Open FWB if you would like to add today’s food entries."
    },
    "client:progress_reminder": {
      title: "Progress update",
      body: "Open FWB to review or update your private progress information."
    },
    "client:achievement": {
      title: "Workout saved",
      body: "Open FWB to view your completed workout."
    },
    "client:workout_comment": {
      title: "New workout reply",
      body: "Open FWB to read the private comment from your coach."
    },
    "client:form_check_feedback": {
      title: "Form check reviewed",
      body: "Open FWB to read your private coaching feedback."
    },
    "coach:workout_completed": {
      title: "Client workout completed",
      body: "Open Coach Admin to review the workout log."
    },
    "coach:check_in_submitted": {
      title: "Client check-in submitted",
      body: "Open Coach Admin to review the private check-in."
    },
    "coach:progress_submitted": {
      title: "Client progress updated",
      body: "Open Coach Admin to review the private progress entry."
    },
    "coach:dexa_uploaded": {
      title: "Client report uploaded",
      body: "Open Coach Admin to review the private report status."
    },
    "coach:questionnaire_submitted": {
      title: "Client questionnaire submitted",
      body: "Open Coach Admin to review the private questionnaire."
    },
    "coach:coach_request": {
      title: "New client request",
      body: "Open Coach Admin to review the private request."
    },
    "coach:workout_comment": {
      title: "New client workout comment",
      body: "Open Coach Admin to read the private comment."
    },
    "coach:form_check_submitted": {
      title: "New client form check",
      body: "Open Coach Admin to review the private submission."
    },
    "coach:nutrition_activity": {
      title: "Client nutrition summary ready",
      body: "Open Coach Admin to review today’s nutrition activity."
    },
    "coach:session_balance": {
      title: "Client session balance update",
      body: "Open Coach Admin to review session packages."
    },
    "coach:client_inactive": {
      title: "Client activity reminder",
      body: "Open Coach Admin to review recent training activity."
    }
  };

  return copy[`${notification.recipient_role}:${notification.kind}`] || {
    title: "New FWB notification",
    body: "Open FWB to view this update."
  };
}

async function preferenceAllows(
  adminClient: AdminClient,
  notification: NotificationRow,
  cache: Map<string, JsonRecord | null>
) {
  if (!cache.has(notification.user_id)) {
    const { data } = await adminClient
      .from("client_notification_preferences")
      .select("*")
      .eq("user_id", notification.user_id)
      .maybeSingle();
    cache.set(notification.user_id, data || null);
  }

  const preferences = cache.get(notification.user_id);
  if (preferences?.push_enabled === false) {
    return false;
  }

  const column = preferenceColumn(notification);
  return !column || preferences?.[column] !== false;
}

async function dispatchNotifications(
  adminClient: AdminClient,
  notificationId = ""
) {
  const now = new Date();
  const nowIso = now.toISOString();
  const minimumCreatedAt = new Date(now.getTime() - 7 * 86400000).toISOString();
  const retryBefore = new Date(now.getTime() - 5 * 60000).toISOString();

  await adminClient
    .from("client_notifications")
    .update({
      push_suppressed_at: nowIso,
      push_error: "Notification expired before delivery"
    })
    .is("push_sent_at", null)
    .is("push_suppressed_at", null)
    .lt("expires_at", nowIso);

  let query = adminClient
    .from("client_notifications")
    .select("id,user_id,recipient_role,kind,title,body,action_url,dedupe_key,created_at,expires_at,push_attempted_at,push_attempt_count")
    .is("push_sent_at", null)
    .is("push_suppressed_at", null)
    .lt("push_attempt_count", 3)
    .gte("created_at", minimumCreatedAt)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .or(`push_attempted_at.is.null,push_attempted_at.lt.${retryBefore}`)
    .order("created_at", { ascending: true })
    .limit(maxDispatchBatch);

  if (notificationId) {
    query = query.eq("id", notificationId);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  const preferences = new Map<string, JsonRecord | null>();
  let sent = 0;
  let suppressed = 0;
  let failed = 0;

  for (const row of (data || []) as NotificationRow[]) {
    const attemptedAt = new Date().toISOString();
    const nextAttemptCount = Math.min(Number(row.push_attempt_count || 0) + 1, 10);
    const { data: claim, error: claimError } = await adminClient
      .from("client_notifications")
      .update({
        push_attempted_at: attemptedAt,
        push_attempt_count: nextAttemptCount,
        push_error: null
      })
      .eq("id", row.id)
      .eq("push_attempt_count", Number(row.push_attempt_count || 0))
      .is("push_sent_at", null)
      .is("push_suppressed_at", null)
      .or(`push_attempted_at.is.null,push_attempted_at.lt.${retryBefore}`)
      .select("id")
      .maybeSingle();

    if (claimError) {
      throw claimError;
    }
    if (!claim?.id) {
      continue;
    }

    if (!(await preferenceAllows(adminClient, row, preferences))) {
      await adminClient.from("client_notifications").update({
        push_suppressed_at: new Date().toISOString(),
        push_error: "Disabled in notification preferences"
      }).eq("id", row.id);
      suppressed += 1;
      continue;
    }

    const { data: subscriptions, error: subscriptionsError } = await adminClient
      .from("web_push_subscriptions")
      .select("id,endpoint,p256dh,auth")
      .eq("user_id", row.user_id)
      .eq("is_active", true);

    if (subscriptionsError) {
      throw subscriptionsError;
    }

    if (!subscriptions?.length) {
      await adminClient.from("client_notifications").update({
        push_suppressed_at: new Date().toISOString(),
        push_error: "No active browser subscription"
      }).eq("id", row.id);
      suppressed += 1;
      continue;
    }

    let delivered = false;
    let finalError = "";
    const safeCopy = pushCopy(row);

    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth
          }
        }, JSON.stringify({
          title: safeCopy.title,
          body: safeCopy.body,
          tag: row.dedupe_key || row.id,
          icon: "/fwb-home-icon-192.png",
          badge: "/favicon-32.png",
          data: {
            url: row.action_url,
            notificationId: row.id
          }
        }), { TTL: 86400, urgency: "normal" });
        delivered = true;
      } catch (pushError) {
        const statusCode = Number((pushError as { statusCode?: number })?.statusCode || 0);
        finalError = String((pushError as Error)?.message || "Web Push delivery failed").slice(0, 500);
        if (statusCode === 404 || statusCode === 410) {
          await adminClient.from("web_push_subscriptions").update({ is_active: false }).eq("id", subscription.id);
        }
      }
    }

    const updatePayload: JsonRecord = {
      push_attempted_at: attemptedAt,
      push_attempt_count: nextAttemptCount,
      push_error: delivered ? null : finalError || "Web Push delivery failed"
    };

    if (delivered) {
      updatePayload.push_sent_at = attemptedAt;
      sent += 1;
    } else {
      if (nextAttemptCount >= 3) {
        updatePayload.push_suppressed_at = attemptedAt;
      }
      failed += 1;
    }

    await adminClient.from("client_notifications").update(updatePayload).eq("id", row.id);
  }

  return { queued: data?.length || 0, sent, suppressed, failed };
}

async function generateScheduledNotifications(adminClient: AdminClient) {
  const now = new Date();
  const [{ data: preferenceRows, error: preferencesError }, users, { data: programs, error: programsError }] = await Promise.all([
    adminClient.from("client_notification_preferences").select("*"),
    listAuthUsers(adminClient),
    adminClient.from("client_programs").select("id,client_email,active,client_archived").eq("active", true).eq("client_archived", false)
  ]);

  if (preferencesError) {
    throw preferencesError;
  }
  if (programsError) {
    throw programsError;
  }

  const usersById = new Map(users.map((user) => [user.id, user]));
  const programsByEmail = new Map((programs || []).map((program) => [normalizeEmail(program.client_email), program]));
  let created = 0;

  for (const preferences of preferenceRows || []) {
    const user = usersById.get(preferences.user_id);
    const email = normalizeEmail(user?.email);
    if (!email || email === coachEmail || preferences.push_enabled === false) {
      continue;
    }

    const timezone = safeTimezone(preferences.timezone);
    const parts = clockParts(now, timezone);
    const program = programsByEmail.get(email);
    if (!program) {
      continue;
    }

    if (preferences.weekly_check_ins !== false
        && parts.weekday === Number(preferences.weekly_check_in_day)
        && parts.time === timeMinute(preferences.weekly_check_in_time)) {
      const since = new Date(Date.now() - 6 * 86400000).toISOString();
      const { count } = await adminClient.from("client_check_ins")
        .select("id", { count: "exact", head: true })
        .eq("client_email", email)
        .gte("created_at", since);
      if (!count) {
        created += Boolean(await insertNotification(adminClient, {
          user_id: user?.id,
          recipient_role: "client",
          kind: "weekly_check_in",
          title: "Your weekly check-in is ready",
          body: "Open FWB when you have a moment to share how training and recovery are going.",
          action_url: "/client-dashboard.html?tab=home",
          dedupe_key: `weekly-check-in:${user?.id}:${parts.date}`,
          metadata: {}
        })) ? 1 : 0;
      }
    }

    const workoutDays = Array.isArray(preferences.workout_reminder_days)
      ? preferences.workout_reminder_days.map(Number)
      : [1, 3, 5];
    if (preferences.workout_reminders !== false
        && workoutDays.includes(parts.weekday)
        && parts.time === timeMinute(preferences.workout_reminder_time)) {
      const since = new Date(Date.now() - 48 * 3600000).toISOString();
      const { count } = await adminClient.from("client_workout_logs")
        .select("id", { count: "exact", head: true })
        .eq("client_email", email)
        .not("completed_at", "is", null)
        .gte("completed_at", since);
      if (!count) {
        created += Boolean(await insertNotification(adminClient, {
          user_id: user?.id,
          recipient_role: "client",
          kind: "workout_reminder",
          title: "Your next workout is ready",
          body: "Open FWB whenever you are ready to train and log your workout.",
          action_url: "/client-dashboard.html?tab=workouts",
          dedupe_key: `workout-reminder:${user?.id}:${parts.date}`,
          metadata: {}
        })) ? 1 : 0;
      }
    }

    if (preferences.nutrition_reminders !== false
        && parts.time === timeMinute(preferences.nutrition_reminder_time)) {
      const { count } = await adminClient.from("client_food_logs")
        .select("id", { count: "exact", head: true })
        .eq("client_email", email)
        .eq("entry_date", parts.date);
      if (!count) {
        created += Boolean(await insertNotification(adminClient, {
          user_id: user?.id,
          recipient_role: "client",
          kind: "nutrition_reminder",
          title: "Nutrition log reminder",
          body: "Open FWB if you would like to add today’s food entries.",
          action_url: "/client-dashboard.html?tab=nutrition",
          dedupe_key: `nutrition-reminder:${user?.id}:${parts.date}`,
          metadata: {}
        })) ? 1 : 0;
      }
    }

    if (preferences.progress_reminders !== false
        && parts.day === Number(preferences.progress_reminder_day)
        && parts.time === timeMinute(preferences.progress_reminder_time)) {
      const monthStart = `${parts.year}-${String(parts.month).padStart(2, "0")}-01`;
      const { count } = await adminClient.from("client_progress")
        .select("id", { count: "exact", head: true })
        .eq("client_email", email)
        .gte("entry_date", monthStart);
      if (!count) {
        created += Boolean(await insertNotification(adminClient, {
          user_id: user?.id,
          recipient_role: "client",
          kind: "progress_reminder",
          title: "Monthly progress check-in",
          body: "Open FWB when you are ready to add this month’s measurements or progress notes.",
          action_url: "/client-dashboard.html?tab=stats",
          dedupe_key: `progress-reminder:${user?.id}:${monthStart}`,
          metadata: {}
        })) ? 1 : 0;
      }
    }

    if (preferences.monthly_reports !== false && parts.day === 1 && parts.time === "09:05") {
      const reportMonth = previousMonthKey(parts);
      const { count } = await adminClient.from("client_workout_logs")
        .select("id", { count: "exact", head: true })
        .eq("client_email", email)
        .gte("entry_date", `${reportMonth}-01`)
        .lt("entry_date", parts.date);
      if (count) {
        created += Boolean(await insertNotification(adminClient, {
          user_id: user?.id,
          recipient_role: "client",
          kind: "monthly_report",
          title: "Your monthly training report is ready",
          body: "Open FWB to review your private training summary.",
          action_url: `/client-dashboard.html?tab=progress&report=${reportMonth}`,
          dedupe_key: `monthly-report:${user?.id}:${reportMonth}`,
          metadata: { month: reportMonth }
        })) ? 1 : 0;
      }
    }

  }

  const coachUser = users.find((user) => normalizeEmail(user.email) === coachEmail);
  const coachPreferences = (preferenceRows || []).find((row) => row.user_id === coachUser?.id);
  if (coachUser && coachPreferences?.push_enabled !== false) {
    const timezone = safeTimezone(coachPreferences?.timezone);
    const parts = clockParts(now, timezone);

    if (coachPreferences?.client_nutrition_activity !== false
        && parts.time === timeMinute(coachPreferences?.nutrition_digest_time || "20:00")) {
      const { count, error } = await adminClient.from("client_food_logs")
        .select("id", { count: "exact", head: true })
        .eq("entry_date", parts.date);
      if (error) {
        throw error;
      }
      if (count) {
        created += Boolean(await insertNotification(adminClient, {
          user_id: coachUser.id,
          recipient_role: "coach",
          kind: "nutrition_activity",
          title: "Client nutrition summary is ready",
          body: "Open Coach Admin to review today’s client nutrition activity.",
          action_url: "/coach-admin.html?tab=nutrition",
          dedupe_key: `coach-nutrition-activity:${parts.date}`,
          metadata: { entry_count: count }
        })) ? 1 : 0;
      }
    }

    if (coachPreferences?.client_inactivity !== false
        && parts.weekday === 1
        && parts.time === "09:00") {
      const since = new Date(Date.now() - 7 * 86400000).toISOString();
      for (const program of programs || []) {
        const email = normalizeEmail(program.client_email);
        const { count } = await adminClient.from("client_workout_logs")
          .select("id", { count: "exact", head: true })
          .eq("client_email", email)
          .not("completed_at", "is", null)
          .gte("completed_at", since);
        if (!count) {
          created += Boolean(await insertNotification(adminClient, {
            user_id: coachUser.id,
            recipient_role: "coach",
            kind: "client_inactive",
            title: "A client has not logged a workout this week",
            body: "Open Coach Admin to review the client’s recent training history.",
            action_url: "/coach-admin.html?tab=logs",
            dedupe_key: `client-inactive:${program.id}:${parts.date}`,
            metadata: { client_email: email, program_id: program.id }
          })) ? 1 : 0;
        }
      }
    }
  }

  return created;
}

async function authenticatedUser(adminClient: AdminClient, request: Request) {
  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) {
    return null;
  }

  const { data, error } = await adminClient.auth.getUser(token);
  return error ? null : data.user;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(request) });
  }

  if (request.method !== "GET" && request.method !== "POST") {
    return jsonResponse(request, { error: "Use GET or POST." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const vapidPublicKey = Deno.env.get("WEB_PUSH_VAPID_PUBLIC_KEY") || "";
  const vapidPrivateKey = Deno.env.get("WEB_PUSH_VAPID_PRIVATE_KEY") || "";
  const vapidSubject = Deno.env.get("WEB_PUSH_VAPID_SUBJECT") || "mailto:fwb@benjaminbenz.com";

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(request, { error: "Notification service is missing Supabase configuration." }, 500);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const requestBody = request.method === "POST" ? await request.json().catch(() => ({})) : {};
  const url = new URL(request.url);
  const action = String((requestBody as JsonRecord).action || url.searchParams.get("action") || "public-key");

  if (action === "public-key") {
    if (!vapidPublicKey) {
      return jsonResponse(request, { error: "Browser alerts are not configured yet." }, 503);
    }
    return jsonResponse(request, { publicKey: vapidPublicKey });
  }

  if (!vapidPublicKey || !vapidPrivateKey) {
    return jsonResponse(request, { error: "Web Push keys are missing." }, 500);
  }
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  try {
    if (action === "test") {
      const user = await authenticatedUser(adminClient, request);
      if (!user?.id || !user.email) {
        return jsonResponse(request, { error: "Sign in before sending a test alert." }, 401);
      }

      const isCoach = normalizeEmail(user.email) === coachEmail;
      const testMinute = new Date().toISOString().slice(0, 16);
      const notificationId = await insertNotification(adminClient, {
        user_id: user.id,
        recipient_role: isCoach ? "coach" : "client",
        kind: "general",
        title: "FWB notifications are on",
        body: "This test confirms that private FWB alerts can reach this device.",
        action_url: isCoach ? "/coach-admin.html" : "/client-dashboard.html?tab=home",
        dedupe_key: `test:${user.id}:${testMinute}`,
        metadata: {}
      });
      if (!notificationId) {
        return jsonResponse(request, { error: "Wait a minute before sending another test alert." }, 429);
      }
      const dispatch = await dispatchNotifications(adminClient, notificationId);
      return jsonResponse(request, { ok: true, notificationId, dispatch });
    }

    if (action !== "dispatch") {
      return jsonResponse(request, { error: "Unknown notification action." }, 400);
    }

    if (!(await verifyDispatchSecret(adminClient, request))) {
      return jsonResponse(request, { error: "Dispatch authorization failed." }, 401);
    }

    const scheduled = await generateScheduledNotifications(adminClient);
    const dispatch = await dispatchNotifications(adminClient);
    return jsonResponse(request, { ok: true, scheduled, dispatch });
  } catch (error) {
    console.error("Notification dispatch failed", error);
    return jsonResponse(request, { error: "Notification delivery failed." }, 500);
  }
});
