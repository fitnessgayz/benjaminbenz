import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://benjaminbenz.com",
  "https://www.benjaminbenz.com",
  "http://127.0.0.1:4177",
  "http://localhost:4177",
  "http://127.0.0.1:4191",
  "http://localhost:4191",
  "http://127.0.0.1:4196",
  "http://localhost:4196"
]);

function corsHeaders(request: Request) {
  const origin = request.headers.get("Origin") || "https://benjaminbenz.com";
  const allowedOrigin = allowedOrigins.has(origin) ? origin : "https://benjaminbenz.com";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}

function jsonResponse(request: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

function coachEmails() {
  return (Deno.env.get("COACH_ADMIN_EMAILS") || "benjaminbenz.fit@gmail.com")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: unknown) {
  return stringValue(value).toLowerCase();
}

function numberValue(value: unknown) {
  const number = Number(String(value ?? "").trim());

  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

function sessionDatesValue(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(
    value
      .map((item) => stringValue(item))
      .filter(Boolean)
  ));
}

function sessionPackageDatesValue(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(
    value
      .map((item) => stringValue(item))
      .filter(Boolean)
  ));
}

function sessionPackageHistoryValue(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      const source = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const used = numberValue(source.used);
      const total = numberValue(source.total);
      const dates = sessionPackageDatesValue(source.dates);
      const archivedAt = stringValue(source.archived_at);
      const label = stringValue(source.label) || `Package ${index + 1}`;

      return {
        label,
        used,
        total,
        dates,
        archived_at: archivedAt || new Date().toISOString().slice(0, 10)
      };
    })
    .filter((item) => item.used > 0 || item.total > 0 || item.dates.length > 0)
    .slice(0, 20);
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function findAuthUserByEmail(adminClient: ReturnType<typeof createClient>, email: string) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });

    if (error) {
      return { error };
    }

    const users = data?.users || [];
    const user = users.find((item) => normalizeEmail(item.email) === email);

    if (user || users.length < 1000) {
      return { user };
    }
  }

  return {};
}

async function rowsForEmail(adminClient: ReturnType<typeof createClient>, tableName: string, email: string) {
  const { data, error } = await adminClient
    .from(tableName)
    .select("id, client_email")
    .ilike("client_email", email);

  if (error) {
    return { error };
  }

  return {
    rows: (data || []).filter((row) => normalizeEmail(row.client_email) === email)
  };
}

async function updateRowsById(
  adminClient: ReturnType<typeof createClient>,
  tableName: string,
  ids: string[],
  payload: Record<string, unknown>
) {
  if (ids.length === 0) {
    return {};
  }

  const { error } = await adminClient
    .from(tableName)
    .update(payload)
    .in("id", ids);

  return { error };
}

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(request) });
  }

  if (request.method !== "POST") {
    return jsonResponse(request, { error: "Use POST." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = request.headers.get("Authorization") || "";

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse(request, { error: "Profile function is missing Supabase secrets." }, 500);
  }

  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse(request, { error: "Sign in as coach first." }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } }
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  const callerEmail = userData.user?.email?.toLowerCase();

  if (userError || !callerEmail) {
    return jsonResponse(request, { error: "Could not verify coach login." }, 401);
  }

  if (!coachEmails().includes(callerEmail)) {
    return jsonResponse(request, { error: "This login is not set up as a coach admin." }, 403);
  }

  const body = await request.json().catch(() => ({}));
  const safeBody = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const programId = stringValue(safeBody.program_id);
  const oldEmailExact = stringValue(safeBody.old_email);
  const oldEmail = normalizeEmail(oldEmailExact);
  const nextEmail = normalizeEmail(safeBody.client_email);
  const clientName = stringValue(safeBody.client_name);
  const clientPhone = stringValue(safeBody.client_phone);
  const initials = stringValue(safeBody.initials).slice(0, 4).toUpperCase();
  const height = stringValue(safeBody.height) || "Not set";
  const startingWeight = stringValue(safeBody.starting_weight) || "Not set";
  const startingBodyfat = stringValue(safeBody.starting_bodyfat) || "Not set";
  const sessionCountUsed = numberValue(safeBody.session_count_used);
  const sessionCountTotal = numberValue(safeBody.session_count_total);
  const sessionDates = sessionDatesValue(safeBody.session_dates);
  const sessionPackageHistory = sessionPackageHistoryValue(safeBody.session_package_history);
  const sheetUrl = stringValue(safeBody.sheet_url);

  if (!programId || !oldEmail) {
    return jsonResponse(request, { error: "Choose an existing client first." }, 400);
  }

  if (!isValidEmail(nextEmail)) {
    return jsonResponse(request, { error: "Add a valid client email." }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });
  const emailChanged = oldEmail !== nextEmail;
  let authEmailUpdated = false;
  const { rows: programs, error: programFindError } = await rowsForEmail(adminClient, "client_programs", oldEmail);

  if (programFindError) {
    return jsonResponse(request, { error: programFindError.message }, 400);
  }

  const programIds = (programs || []).map((program) => program.id);

  if (!programIds.includes(programId)) {
    return jsonResponse(request, { error: "Could not find the selected client program." }, 404);
  }

  let progressIds: string[] = [];
  let logIds: string[] = [];

  if (emailChanged) {
    const { rows: existingPrograms, error: existingProgramError } = await rowsForEmail(adminClient, "client_programs", nextEmail);

    if (existingProgramError) {
      return jsonResponse(request, { error: existingProgramError.message }, 400);
    }

    if ((existingPrograms || []).length > 0) {
      return jsonResponse(request, { error: "That email already belongs to another client." }, 409);
    }

    const { rows: progressRows, error: progressFindError } = await rowsForEmail(adminClient, "client_progress", oldEmail);

    if (progressFindError) {
      return jsonResponse(request, { error: progressFindError.message }, 400);
    }

    progressIds = (progressRows || []).map((row) => row.id);

    const { rows: logRows, error: logFindError } = await rowsForEmail(adminClient, "client_workout_logs", oldEmail);

    if (logFindError) {
      return jsonResponse(request, { error: logFindError.message }, 400);
    }

    logIds = (logRows || []).map((row) => row.id);

    const { user, error: findUserError } = await findAuthUserByEmail(adminClient, oldEmail);

    if (findUserError) {
      return jsonResponse(request, { error: findUserError.message }, 400);
    }

    const { user: existingAuthUser, error: findExistingUserError } = await findAuthUserByEmail(adminClient, nextEmail);

    if (findExistingUserError) {
      return jsonResponse(request, { error: findExistingUserError.message }, 400);
    }

    if (existingAuthUser && existingAuthUser.id !== user?.id) {
      return jsonResponse(request, { error: "That email already belongs to another login." }, 409);
    }

    if (user?.id) {
      const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(user.id, {
        email: nextEmail,
        email_confirm: true,
        user_metadata: {
          client_email: nextEmail,
          client_name: clientName,
          client_phone: clientPhone
        }
      });

      if (authUpdateError) {
        return jsonResponse(request, { error: authUpdateError.message }, 400);
      }

      authEmailUpdated = true;
    }
  }

  const profilePayload = {
    client_email: nextEmail,
    client_name: clientName || nextEmail.split("@")[0],
    client_phone: clientPhone,
    initials,
    height,
    starting_weight: startingWeight,
    starting_bodyfat: startingBodyfat,
    session_count_used: sessionCountUsed,
    session_count_total: sessionCountTotal,
    session_dates: sessionDates,
    session_package_history: sessionPackageHistory,
    sheet_url: sheetUrl || null
  };
  const { error: programError } = await updateRowsById(adminClient, "client_programs", programIds, profilePayload);

  if (programError) {
    return jsonResponse(request, { error: programError.message }, 400);
  }

  if (emailChanged) {
    const { error: progressError } = await updateRowsById(
      adminClient,
      "client_progress",
      progressIds,
      { client_email: nextEmail }
    );

    if (progressError) {
      return jsonResponse(request, { error: progressError.message }, 400);
    }

    const { error: logsError } = await updateRowsById(
      adminClient,
      "client_workout_logs",
      logIds,
      { client_email: nextEmail }
    );

    if (logsError) {
      return jsonResponse(request, { error: logsError.message }, 400);
    }
  }

  const { data: program, error: programLoadError } = await adminClient
    .from("client_programs")
    .select("*")
    .eq("id", programId)
    .single();

  if (programLoadError) {
    return jsonResponse(request, { error: programLoadError.message }, 400);
  }

  return jsonResponse(request, {
    message: emailChanged && !authEmailUpdated
      ? "Profile saved. No matching Auth user was found for the old email."
      : "Profile saved.",
    program,
    emailChanged,
    authEmailUpdated
  });
});
