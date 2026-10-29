import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const allowedOrigins = new Set([
  "https://benjaminbenz.com",
  "https://www.benjaminbenz.com"
]);

function headers(request: Request) {
  const origin = request.headers.get("Origin");
  return {
    "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin) ? origin : "https://benjaminbenz.com",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
    "Vary": "Origin"
  };
}

function reply(request: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: headers(request) });
}

function value(input: unknown, limit: number) {
  return typeof input === "string" ? input.trim().slice(0, limit + 1) : "";
}

serve(async (request) => {
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigins.has(origin)) return reply(request, { error: "Origin is not allowed." }, 403);
  if (request.method === "OPTIONS") return new Response("ok", { headers: headers(request) });
  if (request.method !== "POST") return reply(request, { error: "Use POST." }, 405);

  const rawBody = await request.text();
  if (rawBody.length > 5000) return reply(request, { error: "Request is too large." }, 413);
  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid request");
    body = parsed;
  } catch {
    return reply(request, { error: "Invalid request." }, 400);
  }

  // A hidden field lets the form quietly discard simple bot submissions.
  if (value(body.website, 100)) return reply(request, { message: "Request received." });

  const name = value(body.name, 120);
  const email = value(body.email, 180).toLowerCase();
  const phone = value(body.phone, 60);
  const goals = value(body.goals, 2000);
  if (name.length < 2 || name.length > 120 || email.length > 180 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || phone.length > 60 || goals.length > 2000) {
    return reply(request, { error: "Add your name and a valid email." }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return reply(request, { error: "Sign-up is temporarily unavailable." }, 503);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { error } = await admin.from("client_access_requests").insert({ name, email, phone, goals });
  if (error && error.code !== "23505") {
    return reply(request, { error: "Could not submit your request. Please try again." }, 503);
  }
  return reply(request, { message: "Request received." });
});
