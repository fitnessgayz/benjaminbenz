import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, stringValue } from "../_shared/http.ts";

function nutrientAmount(food: Record<string, unknown>, names: string[]) {
  const nutrients = Array.isArray(food.foodNutrients) ? food.foodNutrients : [];

  for (const nutrient of nutrients) {
    if (!nutrient || typeof nutrient !== "object") {
      continue;
    }

    const source = nutrient as Record<string, unknown>;
    const nutrientName = String(source.nutrientName || source.name || "").toLowerCase();
    const match = names.some((name) => nutrientName === name || nutrientName.includes(name));

    if (!match) {
      continue;
    }

    const value = Number(source.value ?? source.amount);

    if (Number.isFinite(value)) {
      return Math.round(value * 10) / 10;
    }
  }

  return null;
}

function servingLabel(food: Record<string, unknown>) {
  const household = stringValue(food.householdServingFullText);

  if (household) {
    return household;
  }

  const size = Number(food.servingSize);
  const unit = stringValue(food.servingSizeUnit);

  if (Number.isFinite(size) && unit) {
    return `${size}${unit}`;
  }

  return "100g";
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
  const authHeader = request.headers.get("Authorization") || "";

  if (!supabaseUrl || !anonKey) {
    return jsonResponse(request, { error: "Food lookup is missing Supabase secrets." }, 500);
  }

  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse(request, { error: "Sign in first." }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } }
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();

  if (userError || !userData.user?.email) {
    return jsonResponse(request, { error: "Could not verify login." }, 401);
  }

  const body = await request.json().catch(() => ({}));
  const safeBody = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const query = stringValue(safeBody.query);

  if (query.length < 2) {
    return jsonResponse(request, { foods: [] });
  }

  const apiKey = Deno.env.get("USDA_FDC_API_KEY") || "DEMO_KEY";
  const response = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      pageSize: 8,
      dataType: ["Foundation", "SR Legacy", "Survey (FNDDS)", "Branded"]
    })
  });

  if (!response.ok) {
    return jsonResponse(request, { error: "Food lookup is not available right now." }, 502);
  }

  const payload = await response.json().catch(() => ({}));
  const foods = Array.isArray(payload.foods) ? payload.foods : [];

  return jsonResponse(request, {
    foods: foods.map((food) => {
      const source = food && typeof food === "object" ? food as Record<string, unknown> : {};

      return {
        fdcId: String(source.fdcId || ""),
        description: stringValue(source.description),
        brandOwner: stringValue(source.brandOwner),
        serving: servingLabel(source),
        calories: nutrientAmount(source, ["energy"]),
        protein: nutrientAmount(source, ["protein"]),
        carbs: nutrientAmount(source, ["carbohydrate"]),
        fat: nutrientAmount(source, ["total lipid", "fat"])
      };
    }).filter((food) => food.description)
  });
});
