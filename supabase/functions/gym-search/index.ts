import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const origins = new Set(["https://benjaminbenz.com", "https://www.benjaminbenz.com"]);

function headers(request: Request) {
  const origin = request.headers.get("Origin") || "https://benjaminbenz.com";
  return {
    "Access-Control-Allow-Origin": origins.has(origin) || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)
      ? origin : "https://benjaminbenz.com",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "private, no-store",
    "Vary": "Origin"
  };
}

function reply(request: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: headers(request) });
}

function distanceKm(a: number, b: number, c: number, d: number) {
  const lat = Math.PI / 180;
  const x = (c - a) * lat;
  const y = (d - b) * lat;
  const hav = Math.sin(x / 2) ** 2 + Math.cos(a * lat) * Math.cos(c * lat) * Math.sin(y / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(hav)));
}

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: headers(request) });
  if (request.method !== "POST") return reply(request, { error: "POST required" }, 405);
  const url = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!url || !anon || !serviceKey || !token) return reply(request, { error: "Unauthorized" }, 401);
  const authClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: auth, error: authError } = await authClient.auth.getUser(token);
  if (authError || !auth.user) return reply(request, { error: "Sign in to search nearby gyms" }, 401);

  let payload: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid request");
    payload = parsed;
  } catch { return reply(request, { error: "Invalid request" }, 400); }
  const latitude = Number(payload.latitude);
  const longitude = Number(payload.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return reply(request, { error: "Invalid location" }, 400);
  }
  // Round to a shared ~1 km grid before querying/caching; never store exact device location.
  const lat = Math.round(latitude * 100) / 100;
  const lon = Math.round(longitude * 100) / 100;
  const key = `${lat.toFixed(2)}:${lon.toFixed(2)}`;
  const admin = createClient(url, serviceKey);
  const { data: cached } = await admin.from("gym_search_cache").select("place_ids,expires_at").eq("cache_key", key).maybeSingle();
  let ids: string[] = cached?.place_ids || [];
  let fromCache = Boolean(cached && Date.parse(cached.expires_at) > Date.now());
  let partial = false;

  if (!fromCache) {
    const query = `[out:json][timeout:12];(nwr(around:5000,${lat},${lon})["leisure"="fitness_centre"];nwr(around:5000,${lat},${lon})["leisure"="sports_centre"]["sport"~"(^|;)fitness(;|$)"];nwr(around:5000,${lat},${lon})["tourism"="hotel"]["fitness_centre"="yes"];nwr(around:5000,${lat},${lon})["tourism"="hotel"]["gym"="yes"];);out center 100;`;
    try {
      // The public Overpass instances can be busy. Cache successful lookups
      // and keep client-added places available if the map source times out.
      const providers = ["https://overpass.private.coffee/api/interpreter", "https://overpass-api.de/api/interpreter"];
      let data: Record<string, unknown> | null = null;
      for (const provider of providers) {
        try {
          const response = await fetch(provider, {
            method: "POST", body: new URLSearchParams({ data: query }),
            headers: { "User-Agent": "FitnessWithBenjamin-GymFinder/1.0 (fwb@benjaminbenz.com)" },
            signal: AbortSignal.timeout(7000)
          });
          if (!response.ok) continue;
          const result = await response.json();
          if (Array.isArray(result?.elements)) { data = result; break; }
        } catch { /* Try the alternate public endpoint. */ }
      }
      if (!data) throw new Error("OpenStreetMap search is busy");
      const places = (Array.isArray(data.elements) ? data.elements : []).flatMap((element: Record<string, unknown>) => {
        const tags = (element.tags || {}) as Record<string, string>;
        const placeLat = Number(element.lat ?? (element.center as Record<string, unknown> | undefined)?.lat);
        const placeLon = Number(element.lon ?? (element.center as Record<string, unknown> | undefined)?.lon);
        if (!Number.isFinite(placeLat) || !Number.isFinite(placeLon) || !tags.name || tags.name.trim().length < 2) return [];
        return [{ source: "osm", osm_type: element.type, osm_id: element.id,
          kind: tags.tourism === "hotel" ? "hotel_gym" : "gym", name: tags.name.slice(0, 180),
          latitude: placeLat, longitude: placeLon,
          address: [tags["addr:housenumber"], tags["addr:street"], tags["addr:city"]].filter(Boolean).join(" ").slice(0, 300) || null,
          website: /^https?:\/\//.test(tags.website || "") ? tags.website.slice(0, 500) : null }];
      });
      const { data: saved, error } = places.length
        ? await admin.from("gym_places").upsert(places, { onConflict: "osm_type,osm_id" }).select("id")
        : { data: [], error: null };
      if (error) throw error;
      ids = (saved || []).map((place: { id: string }) => place.id);
      await admin.from("gym_search_cache").upsert({ cache_key: key, place_ids: ids,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() });
    } catch {
      partial = true;
      fromCache = true;
    }
  }
  const { data: osmPlaces, error: placeError } = ids.length
    ? await admin.from("gym_places").select("id,source,osm_type,osm_id,kind,name,latitude,longitude,address,website").in("id", ids)
    : { data: [], error: null };
  if (placeError) return reply(request, { error: "Could not load gym places" }, 503);
  const { data: clientPlaces } = await admin.from("gym_places")
    .select("id,source,osm_type,osm_id,kind,name,latitude,longitude,address,website").eq("source", "client")
    .gte("latitude", lat - 0.07).lte("latitude", lat + 0.07)
    .gte("longitude", lon - 0.1).lte("longitude", lon + 0.1).limit(100);
  const places = [...(osmPlaces || []), ...(clientPlaces || [])]
    .map((place) => ({ ...place, distance_km: distanceKm(latitude, longitude, place.latitude, place.longitude) }))
    .filter((place) => place.distance_km <= 6)
    .sort((a, b) => a.distance_km - b.distance_km).slice(0, 80);
  return reply(request, { places, partial, stale: fromCache && Date.parse(cached?.expires_at || "") <= Date.now(),
    attribution: "© OpenStreetMap contributors" });
});
