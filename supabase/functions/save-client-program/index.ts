import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { coachEmails, corsHeaders, jsonResponse, normalizeEmail, stringValue, validEmail } from "../_shared/http.ts";

function booleanValue(value: unknown, fallback = true) {
  return typeof value === "boolean" ? value : fallback;
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function cleanProgramPayload(value: unknown) {
  const source = objectValue(value);
  const clientEmail = normalizeEmail(source.client_email);
  const clientName = stringValue(source.client_name);

  return {
    client_email: clientEmail,
    client_name: clientName || (clientEmail ? clientEmail.split("@")[0] : "Client"),
    client_phone: stringValue(source.client_phone),
    initials: stringValue(source.initials),
    program_title: stringValue(source.program_title) || "Client Program",
    program_summary: stringValue(source.program_summary),
    session_count_used: Number.isFinite(Number(source.session_count_used)) ? Number(source.session_count_used) : 0,
    session_count_total: Number.isFinite(Number(source.session_count_total)) ? Number(source.session_count_total) : 0,
    session_dates: arrayValue(source.session_dates),
    sheet_url: stringValue(source.sheet_url) || null,
    session_package_history: arrayValue(source.session_package_history),
    fitness_goal: stringValue(source.fitness_goal),
    focus_target: stringValue(source.focus_target),
    height: stringValue(source.height) || "Not set",
    starting_weight: stringValue(source.starting_weight) || "Not set",
    starting_bodyfat: stringValue(source.starting_bodyfat) || "Not set",
    nutrition_plan: objectValue(source.nutrition_plan),
    coach_note_title: stringValue(source.coach_note_title),
    coach_note_body: stringValue(source.coach_note_body),
    workouts: arrayValue(source.workouts),
    active: booleanValue(source.active, true),
    client_archived: booleanValue(source.client_archived, false)
  };
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
    return jsonResponse(request, { error: "Client save function is missing Supabase secrets." }, 500);
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
  const safeBody = objectValue(body);
  const programId = stringValue(safeBody.program_id);
  const payload = cleanProgramPayload(safeBody.program);

  if (!validEmail(payload.client_email)) {
    return jsonResponse(request, { error: "Add a valid client email." }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });

  if (payload.active) {
    let archiveQuery = adminClient
      .from("client_programs")
      .update({ active: false })
      .eq("client_email", payload.client_email)
      .eq("active", true);

    if (programId) {
      archiveQuery = archiveQuery.neq("id", programId);
    }

    const { error: archiveError } = await archiveQuery;

    if (archiveError) {
      return jsonResponse(request, { error: archiveError.message }, 400);
    }
  }

  const query = programId
    ? adminClient.from("client_programs").update(payload).eq("id", programId).select("*").single()
    : adminClient.from("client_programs").insert(payload).select("*").single();

  const { data: program, error } = await query;

  if (error) {
    return jsonResponse(request, { error: error.message }, 400);
  }

  return jsonResponse(request, {
    message: "Client saved.",
    program
  });
});
