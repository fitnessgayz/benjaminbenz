import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const origins = new Set(["https://benjaminbenz.com", "https://www.benjaminbenz.com"]);
const cache = new Map<string, { image_url: string | null; source_url: string | null; expires: number }>();

function headers(request: Request) {
  const origin = request.headers.get("Origin") || "https://benjaminbenz.com";
  return {
    "Access-Control-Allow-Origin": origins.has(origin) || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)
      ? origin : "https://benjaminbenz.com",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "private, max-age=3600",
    "Vary": "Origin"
  };
}

function reply(request: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: headers(request) });
}

function safeImageURL(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 2000) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") ||
      /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) return null;
    return url.href;
  } catch { return null; }
}

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: headers(request) });
  if (request.method !== "POST") return reply(request, { error: "POST required" }, 405);
  const url = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const apiKey = Deno.env.get("GEOAPIFY_API_KEY") || "";
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!url || !anon || !token) return reply(request, { error: "Unauthorized" }, 401);
  const client = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: auth, error: authError } = await client.auth.getUser(token);
  if (authError || !auth.user) return reply(request, { error: "Unauthorized" }, 401);

  let gymID: string;
  try {
    const body = await request.json();
    gymID = typeof body?.gym_id === "string" ? body.gym_id : "";
  } catch { return reply(request, { error: "Invalid request" }, 400); }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(gymID)) {
    return reply(request, { error: "Invalid gym" }, 400);
  }
  const { data: place, error: placeError } = await client.from("gym_places")
    .select("source,provider_place_id").eq("id", gymID).maybeSingle();
  if (placeError || !place) return reply(request, { error: "Gym not found" }, 404);
  if (place.source !== "geoapify" || !place.provider_place_id) {
    return reply(request, { image_url: null, source_url: null });
  }
  const cached = cache.get(gymID);
  if (cached && cached.expires > Date.now()) {
    return reply(request, { image_url: cached.image_url, source_url: cached.source_url });
  }
  if (!apiKey) return reply(request, { error: "Photo lookup unavailable" }, 503);

  try {
    const endpoint = new URL("https://api.geoapify.com/v2/place-details");
    endpoint.searchParams.set("id", place.provider_place_id);
    endpoint.searchParams.set("features", "details");
    endpoint.searchParams.set("apiKey", apiKey);
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(7000) });
    if (!response.ok) throw new Error("Geoapify Place Details unavailable");
    const body = await response.json();
    const details = Array.isArray(body?.features)
      ? body.features.find((item: Record<string, unknown>) =>
        (item.properties as Record<string, unknown> | undefined)?.feature_type === "details")
      : null;
    const media = details?.properties?.wiki_and_media;
    const image = safeImageURL(media?.image);
    const result = { image_url: image, source_url: image };
    cache.set(gymID, { ...result, expires: Date.now() + 24 * 60 * 60 * 1000 });
    return reply(request, result);
  } catch {
    return reply(request, { error: "Photo lookup unavailable" }, 503);
  }
});
