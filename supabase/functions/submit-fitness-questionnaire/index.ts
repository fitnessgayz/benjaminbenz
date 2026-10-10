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
  ["request_type", 40],
  ["membership_requested_type", 40],
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
  ["additional_notes", 4000],
  ["training_frequency", 2],
  ["training_experience", 40],
  ["training_minutes", 3],
  ["training_equipment", 40],
  ["avoid_movements", 2000],
  ["strengthen_weaknesses", 2000],
  ["macro_calories", 5],
  ["macro_protein", 4],
  ["macro_carbs", 4],
  ["macro_fat", 4],
  ["nutrition_goal", 30],
  ["nutrition_age", 3],
  ["nutrition_sex", 10],
  ["nutrition_height", 30],
  ["nutrition_weight", 20],
  ["nutrition_workouts", 2],
  ["nutrition_movement", 30],
  ["nutrition_intensity", 20]
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

function sameAnswers(left: Record<string, unknown>, right: Record<string, unknown>) {
  const entries = (value: Record<string, unknown>) => Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries(left)) === JSON.stringify(entries(right));
}

async function syncClientIntakeCompletion(adminClient: ReturnType<typeof createClient>, clientEmail: string, completedAt: string) {
  const { error } = await adminClient.from("client_programs")
    .update({ first_login_questionnaire_completed_at: completedAt })
    .eq("client_email", clientEmail)
    .is("first_login_questionnaire_completed_at", null);
  return error;
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

    if (key === "training_frequency" && answer && !/^[2-6]$/.test(answer)) return { error: "Choose 2 to 6 training days." };
    if (key === "training_experience" && answer && !["beginner", "intermediate", "advanced"].includes(answer)) return { error: "Choose a valid experience level." };
    if (key === "training_minutes" && answer && !["20", "30", "45", "60"].includes(answer)) return { error: "Choose a valid workout length." };
    if (key === "training_equipment" && answer && !["full_gym", "dumbbell", "bodyweight"].includes(answer)) return { error: "Choose valid equipment." };
    if (key === "request_type" && !["workout_plan_review", "first_login_intake"].includes(answer)) return { error: "Choose a valid request type." };
    if (key === "membership_requested_type" && !["personal_training", "online_training", "app_access_only"].includes(answer)) return { error: "Choose a valid membership." };
    if (key === "nutrition_goal" && answer && !["fat_loss", "muscle_gain", "recomposition", "maintenance"].includes(answer)) return { error: "Choose a valid nutrition goal." };
    if (key === "nutrition_sex" && answer && !["male", "female"].includes(answer)) return { error: "Choose a valid sex option." };
    if (key === "nutrition_movement" && answer && !["mostly_sitting", "mixed", "active_job"].includes(answer)) return { error: "Choose valid daily movement." };
    if (key === "nutrition_intensity" && answer && !["light", "moderate", "hard"].includes(answer)) return { error: "Choose valid training intensity." };
    if (key === "nutrition_age" && answer && (!/^\d{1,3}$/.test(answer) || Number(answer) < 13 || Number(answer) > 100)) return { error: "Enter a valid age." };
    if (key === "nutrition_weight" && answer && (!/^\d+(?:\.\d)?$/.test(answer) || Number(answer) < 60 || Number(answer) > 700)) return { error: "Enter a valid current weight." };
    if (key === "nutrition_workouts" && answer && !/^[2-6]$/.test(answer)) return { error: "Choose 2 to 6 workouts per week." };
    if (key.startsWith("macro_") && answer && (!/^\d{1,5}$/.test(answer) || Number(answer) > (key === "macro_calories" ? 10000 : 1000))) return { error: "Enter valid macro targets." };

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
    .select("id,client_email,client_name,client_phone,fitness_goal,equipment_note,updated_at,active,account_type,membership_type,membership_requested_type,first_login_questionnaire_completed_at")
    .eq("client_archived", false)
    .ilike("client_email", signedInEmail)
    .order("updated_at", { ascending: false });

  const matchingPrograms = (candidatePrograms || []).filter(
    (candidate) => normalizeEmail(candidate.client_email) === signedInEmail
  );
  const program = matchingPrograms.find((candidate) => candidate.active) || matchingPrograms[0];

  const firstLoginIntake = sanitized.answers.request_type === "first_login_intake";
  const requestedMembership = stringValue(sanitized.answers.membership_requested_type);
  const heightMatch = /^([4-8])'(\d{1,2})"$/.exec(stringValue(sanitized.answers.nutrition_height));
  const heightInches = heightMatch ? Number(heightMatch[1]) * 12 + Number(heightMatch[2]) : 0;
  if (firstLoginIntake && (
    programLookupError || !program?.active || !requestedMembership ||
    !sanitized.answers.fitness_goals || !sanitized.answers.training_frequency ||
    !sanitized.answers.training_experience || !sanitized.answers.training_minutes ||
    !sanitized.answers.training_equipment || !sanitized.answers.nutrition_goal ||
    !sanitized.answers.nutrition_age || !sanitized.answers.nutrition_sex ||
    !heightMatch || Number(heightMatch[2]) > 11 || heightInches < 48 || heightInches > 96 ||
    !sanitized.answers.nutrition_weight ||
    !sanitized.answers.nutrition_movement || !sanitized.answers.nutrition_intensity
  )) {
    return jsonResponse(request, { error: "Complete the first login questionnaire for an active client profile." }, 400);
  }
  if (firstLoginIntake && program?.account_type === "beta_tester" && requestedMembership !== "app_access_only") {
    return jsonResponse(request, { error: "Beta testers have app access only." }, 403);
  }
  if (firstLoginIntake && program?.first_login_questionnaire_completed_at) {
    const syncError = await syncClientIntakeCompletion(adminClient, program.client_email, program.first_login_questionnaire_completed_at);
    if (syncError) return jsonResponse(request, { error: "Your profile could not be synchronized. Please try again." }, 500);
    return jsonResponse(request, { message: "Your first login questionnaire is already saved.", membership_type: program.membership_type,
      membership_requested_type: program.membership_requested_type, first_login_questionnaire_completed_at: program.first_login_questionnaire_completed_at });
  }
  const isWorkoutPlanRequest = !firstLoginIntake && (sanitized.answers.request_type === "workout_plan_review" ||
    Boolean(sanitized.answers.nutrition_goal && sanitized.answers.training_frequency));
  if (isWorkoutPlanRequest && (
    programLookupError || !program?.active || program.account_type !== "client" ||
    !["personal_training", "online_training"].includes(program.membership_type)
  )) {
    return jsonResponse(request, { error: "Coach review requires an active Personal training or Online training membership." }, 403);
  }

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
      .select("id,linked_user_id,answers")
      .eq("source", "client_portal")
      .eq("source_submission_id", submissionId)
      .maybeSingle();

    if (!existingRecord || existingRecord.linked_user_id !== user.id) {
      return jsonResponse(request, { error: "Questionnaire submission ID is already in use." }, 409);
    }
    if (firstLoginIntake && !sameAnswers(existingRecord.answers || {}, sanitized.answers)) {
      return jsonResponse(request, { error: "This questionnaire retry does not match the saved answers." }, 409);
    }

    if (!firstLoginIntake) {
      return jsonResponse(request, { message: "Questionnaire is already linked to your client profile.", profile_fields_updated: [] });
    }
  }

  let membershipResult: Record<string, string | null> = {};
  if (firstLoginIntake && program) {
    const completedAt = new Date().toISOString();
    const confirmedMembership = requestedMembership === "app_access_only" ? "app_access_only" :
      (["personal_training", "online_training"].includes(program.membership_type) && program.membership_type === requestedMembership
        ? program.membership_type : "app_access_only");
    const { data: updatedMembership, error: membershipError } = await adminClient
      .from("client_programs")
      .update({
        membership_type: confirmedMembership,
        membership_requested_type: requestedMembership,
        membership_requested_at: completedAt,
        membership_confirmed_at: confirmedMembership === requestedMembership ? completedAt : null,
        first_login_questionnaire_completed_at: completedAt
      })
      .eq("id", program.id).is("first_login_questionnaire_completed_at", null)
      .select("membership_type,membership_requested_type,first_login_questionnaire_completed_at")
      .maybeSingle();
    if (membershipError) return jsonResponse(request, { error: "Your membership choice could not be saved. Please try again." }, 500);
    if (!updatedMembership) return jsonResponse(request, { error: "Your profile changed. Refresh and try again." }, 409);
    membershipResult = updatedMembership;
    const syncError = await syncClientIntakeCompletion(adminClient, program.client_email, completedAt);
    if (syncError) return jsonResponse(request, { error: "Your profile could not be synchronized. Please try again." }, 500);
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
    profile_import_warning: profileImportWarning,
    ...membershipResult
  });
});
