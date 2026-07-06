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
  "http://localhost:4192"
]);

const programSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "program_title",
    "program_summary",
    "fitness_goal",
    "focus_target",
    "coach_note_title",
    "coach_note_body",
    "workouts"
  ],
  properties: {
    program_title: { type: "string" },
    program_summary: { type: "string" },
    fitness_goal: { type: "string" },
    focus_target: { type: "string" },
    coach_note_title: { type: "string" },
    coach_note_body: { type: "string" },
    workouts: {
      type: "array",
      minItems: 1,
      maxItems: 7,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "focus", "format", "exercises"],
        properties: {
          title: { type: "string" },
          focus: { type: "string" },
          format: { type: "string", enum: ["single", "superset", "circuit"] },
          exercises: {
            type: "array",
            minItems: 1,
            maxItems: 12,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["code", "name", "prescription", "rest"],
              properties: {
                code: { type: "string" },
                name: { type: "string" },
                prescription: { type: "string" },
                rest: { type: "string" }
              }
            }
          }
        }
      }
    }
  }
};

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
      "Content-Type": "application/json"
    }
  });
}

function coachEmails() {
  return (Deno.env.get("COACH_ADMIN_EMAILS") || "benjaminbenz.fit@gmail.com")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function numberValue(value: unknown, fallback: number) {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function readOutputText(data: Record<string, unknown>) {
  if (typeof data.output_text === "string") {
    return data.output_text;
  }

  const output = Array.isArray(data.output) ? data.output : [];

  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const content = Array.isArray((item as { content?: unknown }).content)
      ? (item as { content: unknown[] }).content
      : [];

    for (const part of content) {
      if (!part || typeof part !== "object") {
        continue;
      }

      const text = (part as { text?: unknown }).text;

      if (typeof text === "string") {
        return text;
      }
    }
  }

  return "";
}

function cleanProgram(program: Record<string, unknown>) {
  const workouts = Array.isArray(program.workouts) ? program.workouts : [];

  return {
    program_title: stringValue(program.program_title, "Client Program"),
    program_summary: stringValue(program.program_summary),
    fitness_goal: stringValue(program.fitness_goal),
    focus_target: stringValue(program.focus_target),
    coach_note_title: stringValue(program.coach_note_title),
    coach_note_body: stringValue(program.coach_note_body),
    workouts: workouts.slice(0, 7).map((workout, workoutIndex) => {
      const item = workout && typeof workout === "object" ? workout as Record<string, unknown> : {};
      const exercises = Array.isArray(item.exercises) ? item.exercises : [];
      const format = ["single", "superset", "circuit"].includes(stringValue(item.format))
        ? stringValue(item.format)
        : "single";

      return {
        title: stringValue(item.title, `Workout ${workoutIndex + 1}`),
        focus: stringValue(item.focus),
        format,
        exercises: exercises.slice(0, 12).map((exercise, exerciseIndex) => {
          const exerciseItem = exercise && typeof exercise === "object" ? exercise as Record<string, unknown> : {};

          return {
            code: stringValue(exerciseItem.code, String.fromCharCode(65 + exerciseIndex)),
            name: stringValue(exerciseItem.name, "Exercise"),
            prescription: stringValue(exerciseItem.prescription, "10-12 reps x 3 sets"),
            rest: stringValue(exerciseItem.rest, "60-90s rest")
          };
        })
      };
    })
  };
}

function buildPrompt(body: Record<string, unknown>) {
  const client = body.client && typeof body.client === "object" ? body.client as Record<string, unknown> : {};
  const program = body.program && typeof body.program === "object" ? body.program as Record<string, unknown> : {};
  const preferences = body.preferences && typeof body.preferences === "object" ? body.preferences as Record<string, unknown> : {};
  const daysPerWeek = Math.max(1, Math.min(7, numberValue(preferences.daysPerWeek, 4)));

  return {
    client: {
      name: stringValue(client.name),
      height: stringValue(client.height),
      startingWeight: stringValue(client.startingWeight),
      startingBodyfat: stringValue(client.startingBodyfat)
    },
    program: {
      title: stringValue(program.title),
      fitnessGoal: stringValue(program.fitnessGoal, "Gain muscle and reduce bodyfat"),
      focusTarget: stringValue(program.focusTarget),
      summary: stringValue(program.summary)
    },
    preferences: {
      experience: stringValue(preferences.experience, "intermediate"),
      daysPerWeek,
      programLength: stringValue(preferences.programLength, "12 weeks"),
      equipment: stringValue(preferences.equipment, "Full gym"),
      limitations: stringValue(preferences.limitations, "None"),
      split: stringValue(preferences.split),
      coachDirection: stringValue(preferences.coachDirection)
    }
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
  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  const openAiModel = Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini";
  const authHeader = request.headers.get("Authorization") || "";

  if (!supabaseUrl || !anonKey) {
    return jsonResponse(request, { error: "AI function is missing Supabase secrets." }, 500);
  }

  if (!openAiKey) {
    return jsonResponse(request, { error: "Add OPENAI_API_KEY to Supabase Edge Function secrets first." }, 500);
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
  const promptInput = buildPrompt(body && typeof body === "object" ? body as Record<string, unknown> : {});

  const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openAiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: openAiModel,
      input: [
        {
          role: "system",
          content: [
            "You draft strength and physique training programs for Fitness with Benjamin.",
            "Use the coach's intent as the priority. Keep the plan practical, editable, and safe.",
            "Return only valid JSON matching the requested schema.",
            "Use a mix of single exercises, supersets, and circuits when useful.",
            "For supersets, code paired exercises like A1 and A2. For circuits, code exercises A, B, C.",
            "Use prescriptions like '8-10 reps x 3 sets' and rest like '60-90s rest'.",
            "Do not diagnose, treat injuries, or make medical claims. Respect limitations and choose lower-risk alternatives."
          ].join(" ")
        },
        {
          role: "user",
          content: JSON.stringify(promptInput)
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "client_workout_program",
          strict: true,
          schema: programSchema
        }
      },
      max_output_tokens: 3500
    })
  });

  const openAiData = await openAiResponse.json().catch(() => ({}));

  if (!openAiResponse.ok) {
    const errorMessage = typeof openAiData?.error?.message === "string"
      ? openAiData.error.message
      : "OpenAI could not generate the program draft.";

    return jsonResponse(request, { error: errorMessage }, 400);
  }

  const outputText = readOutputText(openAiData as Record<string, unknown>);

  if (!outputText) {
    return jsonResponse(request, { error: "OpenAI returned an empty program draft." }, 500);
  }

  try {
    const program = JSON.parse(outputText);

    return jsonResponse(request, { program: cleanProgram(program) });
  } catch {
    return jsonResponse(request, { error: "OpenAI returned a draft that could not be read." }, 500);
  }
});
