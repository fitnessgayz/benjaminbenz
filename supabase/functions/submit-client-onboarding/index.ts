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
  "http://127.0.0.1:4197",
  "http://localhost:4197"
]);

const answerLimits = new Map<string, number>([
  ["height", 60],
  ["current_weight", 20],
  ["body_fat", 20],
  ["fitness_goal", 120],
  ["training_days_per_week", 2],
  ["training_experience", 80],
  ["available_equipment", 240],
  ["limitations", 4000],
  ["nutrition_goal", 80],
  ["age", 3],
  ["sex_for_calculation", 40],
  ["daily_movement", 80],
  ["training_intensity", 80],
  ["completed_at", 40]
]);

const nutritionPlanLimits = new Map<string, number>([
  ["calories", 30],
  ["protein", 30],
  ["carbs", 30],
  ["fat", 30],
  ["guide", 1200],
  ["source", 80],
  ["goal", 80],
  ["sex", 40],
  ["age", 3],
  ["height", 60],
  ["current_weight", 20],
  ["workouts_per_week", 2],
  ["daily_movement", 80],
  ["training_intensity", 80],
  ["activity_factor", 12],
  ["maintenance_calories", 30],
  ["updated_at", 40]
]);

function requestOriginIsAllowed(request: Request) {
  const origin = request.headers.get("Origin");
  return !origin || allowedOrigins.has(origin);
}

function corsHeaders(request: Request) {
  const origin = request.headers.get("Origin");
  return {
    "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin) ? origin : "https://benjaminbenz.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    "Vary": "Origin"
  };
}

function jsonResponse(request: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json" }
  });
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: unknown) {
  return stringValue(value).toLowerCase();
}

function sanitizeStringObject(value: unknown, limits: Map<string, number>) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const result: Record<string, string> = Object.create(null);

  for (const [key, rawValue] of Object.entries(source)) {
    const limit = limits.get(key);
    if (!limit || typeof rawValue !== "string") return null;
    const cleanValue = rawValue.trim();
    if (cleanValue.length > limit) return null;
    if (cleanValue) result[key] = cleanValue;
  }

  return result;
}

function sanitizeAnswers(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = Object.create(null);

  for (const [key, rawValue] of Object.entries(source)) {
    if (key === "macro_estimate_requested") {
      if (typeof rawValue !== "boolean") return null;
      result[key] = rawValue;
      continue;
    }
    if (key === "macro_estimate") {
      if (rawValue === null) continue;
      const macroEstimate = sanitizeStringObject(rawValue, nutritionPlanLimits);
      if (!macroEstimate) return null;
      result[key] = macroEstimate;
      continue;
    }

    const limit = answerLimits.get(key);
    if (!limit || typeof rawValue !== "string") return null;
    const cleanValue = rawValue.trim();
    if (cleanValue.length > limit) return null;
    if (cleanValue) result[key] = cleanValue;
  }

  const validGoals = new Set(["Lose fat", "Build muscle", "Get stronger", "Move better"]);
  const validExperience = new Set(["", "Beginner", "Intermediate", "Advanced"]);
  const validEquipment = new Set(["", "Full gym", "Home gym", "Dumbbells and bands", "Bodyweight only"]);
  if (!result.height || !result.current_weight || !validGoals.has(String(result.fitness_goal || ""))) return null;
  if (!/^[1-7]$/.test(String(result.training_days_per_week || ""))) return null;
  if (!validExperience.has(String(result.training_experience || ""))) return null;
  if (!validEquipment.has(String(result.available_equipment || ""))) return null;
  return result;
}

serve(async (request) => {
  if (!requestOriginIsAllowed(request)) return jsonResponse(request, { error: "Origin is not allowed." }, 403);
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return jsonResponse(request, { error: "Use POST." }, 405);

  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (Number.isFinite(contentLength) && contentLength > 32768) {
    return jsonResponse(request, { error: "Onboarding data is too large." }, 413);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = request.headers.get("Authorization") || "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse(request, { error: "Client onboarding is unavailable." }, 500);
  }
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse(request, { error: "Open the secure account setup link first." }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } }
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  const user = userData.user;
  const email = normalizeEmail(user?.email);
  if (userError || !user?.id || !email) {
    return jsonResponse(request, { error: "Your client login could not be verified." }, 401);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) || JSON.stringify(body).length > 32768) {
    return jsonResponse(request, { error: "Onboarding data is invalid." }, 400);
  }

  const safeBody = body as Record<string, unknown>;
  const answers = sanitizeAnswers(safeBody.answers);
  const profile = safeBody.profile && typeof safeBody.profile === "object" && !Array.isArray(safeBody.profile)
    ? safeBody.profile as Record<string, unknown>
    : null;
  if (!answers || !profile) return jsonResponse(request, { error: "Onboarding answers are invalid." }, 400);

  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: candidatePrograms, error: programError } = await adminClient
    .from("client_programs")
    .select("id,client_email,client_name,nutrition_plan,updated_at")
    .eq("active", true)
    .eq("client_archived", false)
    .ilike("client_email", email)
    .order("updated_at", { ascending: false });
  if (programError) return jsonResponse(request, { error: "Your client profile could not be checked." }, 500);

  const program = (candidatePrograms || []).find((candidate) => normalizeEmail(candidate.client_email) === email);
  if (!program?.id) {
    return jsonResponse(request, { error: "This email is not connected to an active client profile. Contact Benjamin for help." }, 404);
  }

  const height = stringValue(profile.height);
  const startingWeight = stringValue(profile.starting_weight);
  const startingBodyfat = stringValue(profile.starting_bodyfat);
  const fitnessGoal = stringValue(profile.fitness_goal);
  if (
    !height ||
    !startingWeight ||
    height !== answers.height ||
    startingWeight !== answers.current_weight ||
    startingBodyfat !== String(answers.body_fat || "") ||
    fitnessGoal !== answers.fitness_goal
  ) {
    return jsonResponse(request, { error: "Your profile answers do not match the questionnaire." }, 400);
  }

  const profileUpdate: Record<string, unknown> = {
    height,
    starting_weight: startingWeight,
    fitness_goal: fitnessGoal
  };
  if (startingBodyfat) profileUpdate.starting_bodyfat = startingBodyfat;
  if (answers.macro_estimate_requested === true) {
    const nutritionPlan = answers.macro_estimate as Record<string, string> | undefined;
    if (!nutritionPlan?.calories || !nutritionPlan.protein || !nutritionPlan.carbs || !nutritionPlan.fat) {
      return jsonResponse(request, { error: "The macro estimate is incomplete." }, 400);
    }
    profileUpdate.nutrition_plan = {
      ...(program.nutrition_plan && typeof program.nutrition_plan === "object" ? program.nutrition_plan : {}),
      ...nutritionPlan
    };
  }

  const { error: profileError } = await adminClient
    .from("client_programs")
    .update(profileUpdate)
    .eq("id", program.id);
  if (profileError) return jsonResponse(request, { error: "Your client profile could not be updated." }, 500);

  const now = new Date().toISOString();
  const { error: questionnaireError } = await adminClient
    .from("client_fitness_questionnaires")
    .upsert({
      source: "client_portal",
      source_submission_id: `invite-${user.id}`,
      submitted_at: now,
      respondent_name: stringValue(program.client_name) || email.split("@")[0],
      respondent_email: email,
      linked_user_id: user.id,
      linked_client_email: email,
      match_status: "matched",
      answers,
      profile_imported_at: now,
      updated_at: now
    }, { onConflict: "source,source_submission_id" });
  if (questionnaireError) {
    return jsonResponse(request, { error: "Your questionnaire could not be saved. Try again." }, 500);
  }

  return jsonResponse(request, { message: "Account setup and questionnaire saved." });
});
