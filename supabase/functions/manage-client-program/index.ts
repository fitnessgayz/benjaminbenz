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
  "http://localhost:4196",
  "http://127.0.0.1:4210",
  "http://localhost:4210"
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

async function rowsForEmail(adminClient: ReturnType<typeof createClient>, email: string) {
  const { data, error } = await adminClient
    .from("client_programs")
    .select("*")
    .ilike("client_email", email);

  if (error) {
    return { error };
  }

  return {
    rows: (data || []).filter((row) => normalizeEmail(row.client_email) === email)
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
    return jsonResponse(request, { error: "Client management function is missing Supabase secrets." }, 500);
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
  const action = stringValue(safeBody.action);

  if (!programId) {
    return jsonResponse(request, { error: "Choose a saved client first." }, 400);
  }

  if (!["archive", "restore", "delete", "delete_archived"].includes(action)) {
    return jsonResponse(request, { error: "Choose a valid client action." }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });

  const { data: selectedProgram, error: selectedError } = await adminClient
    .from("client_programs")
    .select("*")
    .eq("id", programId)
    .single();

  if (selectedError || !selectedProgram) {
    return jsonResponse(request, { error: selectedError?.message || "Could not find the selected client." }, 404);
  }

  const clientEmail = normalizeEmail(selectedProgram.client_email);
  const { rows, error: rowsError } = await rowsForEmail(adminClient, clientEmail);

  if (rowsError) {
    return jsonResponse(request, { error: rowsError.message }, 400);
  }

  const targetRows = action === "delete_archived"
    ? (rows || []).filter((row) => row.client_archived === true)
    : (rows || []);
  const targetIds = targetRows.map((row) => row.id).filter(Boolean);

  if (targetIds.length === 0) {
    return jsonResponse(request, { error: "Could not find saved programs for this client." }, 404);
  }

  if (action === "delete" || action === "delete_archived") {
    const { error: deleteError } = await adminClient
      .from("client_programs")
      .delete()
      .in("id", targetIds);

    if (deleteError) {
      return jsonResponse(request, { error: deleteError.message }, 400);
    }

    return jsonResponse(request, {
      message: "Client deleted.",
      deleted_ids: targetIds,
      client_email: clientEmail
    });
  }

  const shouldRestore = action === "restore";
  const { data: updatedPrograms, error: updateError } = await adminClient
    .from("client_programs")
    .update({ client_archived: !shouldRestore })
    .in("id", targetIds)
    .select("*");

  if (updateError) {
    return jsonResponse(request, { error: updateError.message }, 400);
  }

  let selectedAfterAction = (updatedPrograms || []).find((program) => program.id === programId) || selectedProgram;

  if (shouldRestore) {
    const hasActiveProgram = (rows || []).some((row) => row.active !== false && row.id !== programId);

    if (!hasActiveProgram && selectedAfterAction.active === false) {
      const { data: restoredActiveProgram, error: restoreActiveError } = await adminClient
        .from("client_programs")
        .update({ active: true, client_archived: false })
        .eq("id", programId)
        .select("*")
        .single();

      if (restoreActiveError) {
        return jsonResponse(request, { error: restoreActiveError.message }, 400);
      }

      selectedAfterAction = restoredActiveProgram;
    }
  }

  const { rows: latestPrograms, error: latestError } = await rowsForEmail(adminClient, clientEmail);

  if (latestError) {
    return jsonResponse(request, { error: latestError.message }, 400);
  }

  return jsonResponse(request, {
    message: shouldRestore ? "Client restored." : "Client archived.",
    programs: latestPrograms || updatedPrograms || [],
    selected_program: selectedAfterAction,
    client_email: clientEmail
  });
});
