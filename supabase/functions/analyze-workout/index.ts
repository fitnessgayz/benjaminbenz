import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { coachEmails, corsHeaders, jsonResponse, normalizeEmail, stringValue } from "../_shared/http.ts";

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function compactValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return stringValue(value);
}

function usageMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthlyLimit() {
  const parsed = Number(Deno.env.get("AI_WORKOUT_ANALYSIS_MONTHLY_LIMIT") || "30");
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 30;
}

function sanitizeLogs(logs: unknown) {
  if (!Array.isArray(logs)) {
    return [];
  }

  return logs
    .map((log) => {
      const source = log && typeof log === "object" ? log as Record<string, unknown> : {};

      return {
        entry_date: stringValue(source.entry_date),
        workout_title: stringValue(source.workout_title).slice(0, 120),
        exercise_code: stringValue(source.exercise_code).slice(0, 24),
        exercise_name: stringValue(source.exercise_name).slice(0, 120),
        set_number: numberValue(source.set_number),
        weight_used: compactValue(source.weight_used).slice(0, 40),
        reps: compactValue(source.reps).slice(0, 40),
        notes: stringValue(source.notes).slice(0, 500)
      };
    })
    .filter((log) => log.entry_date || log.workout_title || log.exercise_name)
    .slice(0, 120);
}

function responseText(payload: Record<string, unknown>) {
  const directText = stringValue(payload.output_text);

  if (directText) {
    return directText;
  }

  const output = Array.isArray(payload.output) ? payload.output : [];
  const pieces: string[] = [];

  for (const item of output) {
    const outputItem = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const content = Array.isArray(outputItem.content) ? outputItem.content : [];

    for (const part of content) {
      const source = part && typeof part === "object" ? part as Record<string, unknown> : {};
      const text = stringValue(source.text);

      if (text) {
        pieces.push(text);
      }
    }
  }

  return pieces.join("\n").trim();
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
    return jsonResponse(request, { error: "AI workout analysis is missing Supabase secrets." }, 500);
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
  const action = stringValue(safeBody.action) || "analyze";
  const clientEmail = normalizeEmail(safeBody.client_email);
  const clientName = stringValue(safeBody.client_name).slice(0, 120);
  const programTitle = stringValue(safeBody.program_title).slice(0, 160);
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });

  if (!clientEmail) {
    return jsonResponse(request, { error: "Choose a client first." }, 400);
  }

  if (action === "latest") {
    const { data, error } = await adminClient
      .from("ai_workout_recommendations")
      .select("*")
      .ilike("client_email", clientEmail)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      return jsonResponse(request, { error: error.message }, 400);
    }

    return jsonResponse(request, { analysis: data?.[0] || null });
  }

  if (action !== "analyze") {
    return jsonResponse(request, { error: "Choose a valid AI workout action." }, 400);
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY");

  if (!apiKey) {
    return jsonResponse(request, { error: "AI workout analysis is not configured yet. Add OPENAI_API_KEY to Supabase secrets." }, 500);
  }

  const logs = sanitizeLogs(safeBody.logs);

  if (logs.length === 0) {
    return jsonResponse(request, { error: "This client needs workout logs before AI can analyze progress." }, 400);
  }

  const monthKey = usageMonthKey();
  const limit = monthlyLimit();
  const { data: reserveRows, error: reserveError } = await adminClient.rpc("reserve_ai_workout_analysis_usage", {
    p_month_key: monthKey,
    p_monthly_limit: limit
  });
  const reserve = (Array.isArray(reserveRows) ? reserveRows[0] : reserveRows) as Record<string, unknown> | null;
  const usageCount = Number(reserve?.usage_count || 0);
  const usageLimit = Number(reserve?.monthly_limit || limit);

  if (reserveError) {
    return jsonResponse(request, { error: reserveError.message }, 400);
  }

  if (reserve?.allowed !== true) {
    return jsonResponse(request, {
      error: `Monthly AI workout analysis cap reached (${usageCount}/${usageLimit}).`,
      usage_count: usageCount,
      usage_limit: usageLimit
    }, 429);
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: Deno.env.get("AI_WORKOUT_ANALYSIS_MODEL") || "gpt-4o-mini",
      input: [
        {
          role: "system",
          content: [
            "You are Benjamin's assistant coach reviewing workout logs only.",
            "Do not analyze nutrition, calories, macros, medical issues, or diagnose injuries.",
            "Give concise coaching recommendations Benjamin can review before sharing.",
            "Keep the answer under 180 words with clear short sections."
          ].join(" ")
        },
        {
          role: "user",
          content: JSON.stringify({
            client: {
              email: clientEmail,
              name: clientName,
              program_title: programTitle
            },
            recent_workout_logs: logs,
            requested_format: [
              "What is improving",
              "What to watch",
              "Next progression",
              "Coach note"
            ]
          })
        }
      ],
      max_output_tokens: 650
    })
  });

  if (!response.ok) {
    await adminClient.rpc("release_ai_workout_analysis_usage", { p_month_key: monthKey });
    return jsonResponse(request, { error: "AI workout analysis is unavailable right now." }, 502);
  }

  const payload = await response.json().catch(() => ({}));
  const analysisText = responseText(payload && typeof payload === "object" ? payload as Record<string, unknown> : {});

  if (!analysisText) {
    await adminClient.rpc("release_ai_workout_analysis_usage", { p_month_key: monthKey });
    return jsonResponse(request, { error: "AI did not return a workout analysis. Try again." }, 502);
  }

  const analysisPayload = {
    client_email: clientEmail,
    client_name: clientName,
    program_title: programTitle,
    analysis_text: analysisText,
    source_logs: logs,
    usage_month_key: monthKey,
    usage_count: usageCount,
    usage_limit: usageLimit,
    created_by: callerEmail
  };

  const { data: savedAnalysis, error: saveError } = await adminClient
    .from("ai_workout_recommendations")
    .insert(analysisPayload)
    .select("*")
    .single();

  if (saveError) {
    return jsonResponse(request, {
      analysis: {
        ...analysisPayload,
        created_at: new Date().toISOString()
      },
      usage_count: usageCount,
      usage_limit: usageLimit,
      save_warning: "AI analysis generated, but the saved history could not be updated."
    });
  }

  return jsonResponse(request, {
    analysis: savedAnalysis,
    usage_count: usageCount,
    usage_limit: usageLimit
  });
});
