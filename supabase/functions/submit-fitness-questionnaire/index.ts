import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://benjaminbenz.com",
  "https://www.benjaminbenz.com",
  "http://127.0.0.1:4177",
  "http://localhost:4177",
  "http://127.0.0.1:4191",
  "http://localhost:4191",
  "http://127.0.0.1:4192",
  "http://localhost:4192",
  "http://127.0.0.1:4196",
  "http://localhost:4196",
  "http://127.0.0.1:4210",
  "http://localhost:4210"
]);

const answerLimits = new Map<string, number>([
  ["date_of_birth", 10],
  ["phone", 80],
  ["home_address", 300],
  ["address_line_2", 160],
  ["address_city", 120],
  ["address_state", 120],
  ["address_zip", 32],
  ["preferred_communication", 40],
  ["service_interest", 120],
  ["heart_condition", 20],
  ["chest_pain_activity", 20],
  ["chest_pain_rest", 20],
  ["bone_joint_problem", 20],
  ["other_activity_reason", 20],
  ["comfortable_fitness_history", 2000],
  ["fitness_goals", 4000],
  ["goal_timeline", 1000],
  ["why_now", 4000],
  ["goal_plan", 4000],
  ["daily_nutrition", 4000],
  ["fitness_apps", 1000],
  ["commitment_level", 4],
  ["ready_for_change", 20],
  ["occupation", 1000],
  ["repetitive_movements", 3000],
  ["work_stress", 2000],
  ["recreational_activities", 3000],
  ["hobbies", 3000],
  ["pain_or_injuries", 4000],
  ["surgeries", 4000],
  ["sleep_schedule", 1000],
  ["home_equipment", 3000],
  ["availability_days", 120],
  ["availability_times", 3000],
  ["additional_notes", 4000]
]);
const weekdayValues = new Set([
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday"
]);
const placeholderValues = new Set(["not set", "not provided", "n/a", "na", "unknown"]);

function requestOriginIsAllowed(request: Request) {
  const origin = request.headers.get("Origin");

  return !origin || allowedOrigins.has(origin);
}

function corsHeaders(request: Request) {
  const origin = request.headers.get("Origin");
  const allowedOrigin = origin && allowedOrigins.has(origin)
    ? origin
    : "https://benjaminbenz.com";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    "Vary": "Origin"
  };
}

function jsonResponse(request: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json"
    }
  });
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: unknown) {
  return stringValue(value).toLowerCase();
}

function validEmail(value: string) {
  return value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validSubmissionId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizedPlaceholder(value: unknown) {
  return stringValue(value).toLowerCase().replace(/\s+/g, " ");
}

function canFillProfileValue(value: unknown, field: string) {
  const normalized = normalizedPlaceholder(value);

  if (!normalized || placeholderValues.has(normalized)) {
    return true;
  }

  return field === "client_name" && normalized === "client";
}

function sanitizeAnswers(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: "Questionnaire answers are missing." };
  }

  const source = value as Record<string, unknown>;
  const answers: Record<string, string | string[]> = Object.create(null);
  let totalLength = 0;

  for (const [key, rawValue] of Object.entries(source)) {
    const limit = answerLimits.get(key);

    if (!limit) {
      return { error: "Questionnaire contains an unsupported answer." };
    }

    if (key === "availability_days") {
      const rawDays = Array.isArray(rawValue) ? rawValue : [rawValue];
      const days = Array.from(new Set(rawDays.map((day) => stringValue(day)).filter(Boolean)));

      if (days.length > 7 || days.some((day) => !weekdayValues.has(day))) {
        return { error: "Choose valid training days." };
      }

      totalLength += days.join(",").length;
      if (days.length > 0) {
        answers[key] = days;
      }
      continue;
    }

    if (typeof rawValue !== "string") {
      return { error: "Questionnaire contains an invalid answer." };
    }

    const answer = rawValue.trim();

    if (answer.length > limit) {
      return { error: "One or more questionnaire answers are too long." };
    }

    if (key === "commitment_level" && answer && !/^[1-5]$/.test(answer)) {
      return { error: "Choose a commitment level from 1 to 5." };
    }

    totalLength += answer.length;
    if (answer) {
      answers[key] = answer;
    }
  }

  if (totalLength > 30000) {
    return { error: "Questionnaire answers are too long." };
  }

  return { answers };
}

serve(async (request) => {
  if (!requestOriginIsAllowed(request)) {
    return jsonResponse(request, { error: "Origin is not allowed." }, 403);
  }

  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(request) });
  }

  if (request.method !== "POST") {
    return jsonResponse(request, { error: "Use POST." }, 405);
  }

  const contentLength = Number(request.headers.get("Content-Length") || 0);

  if (Number.isFinite(contentLength) && contentLength > 65536) {
    return jsonResponse(request, { error: "Questionnaire is too large." }, 413);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = request.headers.get("Authorization") || "";

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse(request, { error: "Questionnaire storage is unavailable." }, 500);
  }

  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse(request, { error: "Sign in to link this questionnaire to a client profile." }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } }
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  const user = userData.user;
  const signedInEmail = normalizeEmail(user?.email);

  if (userError || !user?.id || !validEmail(signedInEmail)) {
    return jsonResponse(request, { error: "Your client login could not be verified." }, 401);
  }

  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object" || Array.isArray(body) || JSON.stringify(body).length > 65536) {
    return jsonResponse(request, { error: "Questionnaire data is invalid." }, 400);
  }

  const safeBody = body as Record<string, unknown>;
  const submissionId = stringValue(safeBody.submission_id);
  const respondentEmail = normalizeEmail(safeBody.email);
  const respondentName = stringValue(safeBody.name);
  const sanitized = sanitizeAnswers(safeBody.answers);

  if (!validSubmissionId(submissionId)) {
    return jsonResponse(request, { error: "Questionnaire submission ID is invalid." }, 400);
  }

  if (!validEmail(respondentEmail) || respondentEmail !== signedInEmail) {
    return jsonResponse(request, {
      error: "The questionnaire email must exactly match your signed-in client email."
    }, 409);
  }

  if (!respondentName || respondentName.length > 200) {
    return jsonResponse(request, { error: "Add a valid name." }, 400);
  }

  if (sanitized.error || !sanitized.answers) {
    return jsonResponse(request, { error: sanitized.error || "Questionnaire answers are invalid." }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });
  const { data: candidatePrograms, error: programLookupError } = await adminClient
    .from("client_programs")
    .select("id,client_email,client_name,client_phone,fitness_goal,equipment_note,updated_at")
    .eq("client_archived", false)
    .ilike("client_email", signedInEmail)
    .order("updated_at", { ascending: false });

  const program = (candidatePrograms || []).find(
    (candidate) => normalizeEmail(candidate.client_email) === signedInEmail
  );

  const submittedAt = new Date().toISOString();
  const questionnaireRecord = {
    source: "client_portal",
    source_submission_id: submissionId,
    submitted_at: submittedAt,
    respondent_name: respondentName,
    respondent_email: respondentEmail,
    linked_user_id: user.id,
    linked_client_email: signedInEmail,
    match_status: "matched",
    answers: sanitized.answers
  };
  const { data: insertedRecord, error: insertError } = await adminClient
    .from("client_fitness_questionnaires")
    .insert(questionnaireRecord)
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code !== "23505") {
      return jsonResponse(request, { error: "The client questionnaire copy could not be saved." }, 500);
    }

    const { data: existingRecord } = await adminClient
      .from("client_fitness_questionnaires")
      .select("id,linked_user_id")
      .eq("source", "client_portal")
      .eq("source_submission_id", submissionId)
      .maybeSingle();

    if (!existingRecord || existingRecord.linked_user_id !== user.id) {
      return jsonResponse(request, { error: "Questionnaire submission ID is already in use." }, 409);
    }

    return jsonResponse(request, {
      message: "Questionnaire is already linked to your client profile.",
      profile_fields_updated: []
    });
  }

  const profileUpdates: Record<string, string> = {};
  const candidateProfileFields: Array<[string, string]> = [
    ["client_name", respondentName],
    ["client_phone", stringValue(sanitized.answers.phone)],
    ["fitness_goal", stringValue(sanitized.answers.fitness_goals)],
    ["equipment_note", stringValue(sanitized.answers.home_equipment)]
  ];

  candidateProfileFields.forEach(([field, nextValue]) => {
    if (
      program &&
      nextValue &&
      Object.prototype.hasOwnProperty.call(program, field) &&
      canFillProfileValue(program[field], field)
    ) {
      profileUpdates[field] = nextValue;
    }
  });

  let profileUpdateApplied = false;
  let profileImportWarning = Boolean(programLookupError);

  if (program && Object.keys(profileUpdates).length > 0) {
    let profileUpdateQuery = adminClient
      .from("client_programs")
      .update(profileUpdates)
      .eq("id", program.id);

    Object.keys(profileUpdates).forEach((field) => {
      const originalValue = program[field];

      profileUpdateQuery = originalValue === null
        ? profileUpdateQuery.is(field, null)
        : profileUpdateQuery.eq(field, originalValue);
    });

    const { data: updatedProgram, error: profileUpdateError } = await profileUpdateQuery
      .select("id")
      .maybeSingle();

    profileUpdateApplied = !profileUpdateError && Boolean(updatedProgram?.id);
    profileImportWarning = profileImportWarning || !profileUpdateApplied;

    if (profileUpdateApplied && insertedRecord?.id) {
      const { error: importTimestampError } = await adminClient
        .from("client_fitness_questionnaires")
        .update({ profile_imported_at: submittedAt })
        .eq("id", insertedRecord.id);

      profileImportWarning = profileImportWarning || Boolean(importTimestampError);
    }
  }

  return jsonResponse(request, {
    message: "Questionnaire linked to your client profile.",
    profile_fields_updated: profileUpdateApplied ? Object.keys(profileUpdates) : [],
    profile_import_warning: profileImportWarning
  });
});
