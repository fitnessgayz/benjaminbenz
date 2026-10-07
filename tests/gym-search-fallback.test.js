const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { stripTypeScriptTypes } = require("node:module");

const source = fs.readFileSync(path.join(__dirname, "../supabase/functions/gym-search/index.ts"), "utf8")
  .replace(/^import .+;\n/gm, "");

function handlerWith({ fetchProvider, cached = null, clients = [], apiKey = "" }) {
  let handler;
  let attempts = 0;
  let savedPlaces = [];
  const upserts = [];
  const tables = {
    gym_search_cache: {
      maybeSingle: async () => ({ data: cached }),
      upsert: async () => ({ error: null })
    },
    gym_places: {
      in: async () => ({ data: savedPlaces }),
      limit: async () => ({ data: clients }),
      upsert: (places, options) => {
        upserts.push({ places, options });
        const added = places.map((place, index) => ({ ...place, id: `provider-${upserts.length}-${index}` }));
        savedPlaces.push(...added);
        return { select: async () => ({ data: added.map(({ id }) => ({ id })), error: null }) };
      }
    }
  };
  const createClient = (_url, key) => key === "anon"
    ? { auth: { getUser: async () => ({ data: { user: { id: "client-1" } }, error: null }) } }
    : {
      from(name) {
        const target = tables[name];
        const chain = {
          select: () => chain, eq: () => chain, gte: () => chain, lte: () => chain,
          maybeSingle: target.maybeSingle, in: target.in, limit: target.limit,
          upsert: target.upsert
        };
        return chain;
      }
    };
  const context = {
    serve: (fn) => { handler = fn; }, createClient,
    Deno: { env: { get: (name) => ({
      SUPABASE_URL: "https://example.test", SUPABASE_ANON_KEY: "anon",
      SUPABASE_SERVICE_ROLE_KEY: "service", GEOAPIFY_API_KEY: apiKey
    })[name] } },
    fetch: async (...args) => { attempts++; return fetchProvider(...args); },
    Request, Response, URLSearchParams, AbortSignal, Date, Set, Math, Number, JSON
  };
  vm.runInNewContext(stripTypeScriptTypes(source), context);
  return {
    handle: (body) => handler(new Request("https://example.test/gym-search", {
      method: "POST", headers: { Authorization: "Bearer token" }, body: JSON.stringify(body)
    })),
    attempts: () => attempts,
    upserts: () => upserts
  };
}

test("map provider outage still returns signed-in client-added gyms", async () => {
  const gym = {
    id: "gym-1", source: "client", kind: "gym", name: "Neighborhood Gym",
    latitude: 37.77, longitude: -122.42
  };
  const h = handlerWith({
    fetchProvider: async () => { throw new Error("provider unavailable"); },
    clients: [gym]
  });
  const response = await h.handle({ latitude: 37.77, longitude: -122.42 });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.partial, true);
  assert.deepEqual(body.places.map((place) => place.name), ["Neighborhood Gym"]);
  assert.equal(h.attempts(), 2);
});

test("Geoapify gyms use server-side key and supplement OSM-tagged hotel gyms", async () => {
  let geoapifyRequest;
  let hotelQuery;
  const h = handlerWith({
    apiKey: "private-key",
    fetchProvider: async (url, options) => {
      if (url.includes("geoapify")) {
        geoapifyRequest = { url, options };
        return { ok: true, json: async () => ({ features: [{ properties: {
          place_id: "place-123", name: "City Gym", lat: 37.77, lon: -122.42,
          formatted: "123 Main St"
        } }] }) };
      }
      hotelQuery = options.body.get("data");
      return { ok: true, json: async () => ({ elements: [{
        type: "node", id: 92, lat: 37.775, lon: -122.42,
        tags: { name: "Hotel Fitness", tourism: "hotel", gym: "yes" }
      }] }) };
    }
  });
  const body = await (await h.handle({ latitude: 37.77, longitude: -122.42 })).json();
  assert.equal(h.attempts(), 2);
  assert.equal(geoapifyRequest.url, "https://api.geoapify.com/v2/places");
  assert.equal(geoapifyRequest.options.headers["x-api-key"], "private-key");
  assert.equal(JSON.stringify(geoapifyRequest.options.body).includes("private-key"), false);
  assert.match(hotelQuery, /\["tourism"="hotel"\]/);
  assert.doesNotMatch(hotelQuery, /\["leisure"="fitness_centre"\]/);
  assert.equal(h.upserts()[0].options.onConflict, "provider_place_id");
  assert.equal(h.upserts()[0].places[0].provider_place_id, "place-123");
  assert.equal(h.upserts()[1].options.onConflict, "osm_type,osm_id");
  assert.equal(body.places[0].source, "geoapify");
  assert.equal(body.places[1].kind, "hotel_gym");
  assert.match(body.attribution, /Geoapify/);
});

test("hotel search outage keeps Geoapify gyms available", async () => {
  const h = handlerWith({
    apiKey: "private-key",
    fetchProvider: async (url) => url.includes("geoapify")
      ? { ok: true, json: async () => ({ features: [{ properties: {
        place_id: "place-123", name: "City Gym", lat: 37.77, lon: -122.42
      } }] }) }
      : (() => { throw new Error("OSM busy"); })()
  });
  const body = await (await h.handle({ latitude: 37.77, longitude: -122.42 })).json();
  assert.equal(body.partial, true);
  assert.equal(body.places[0].name, "City Gym");
});

test("Geoapify outage falls back to public OpenStreetMap search", async () => {
  const h = handlerWith({
    apiKey: "private-key",
    fetchProvider: async (url) => url.includes("geoapify")
      ? { ok: false }
      : { ok: true, json: async () => ({ elements: [{
        type: "node", id: 42, lat: 37.77, lon: -122.42,
        tags: { name: "Fallback Gym", leisure: "fitness_centre" }
      }] }) }
  });
  const body = await (await h.handle({ latitude: 37.77, longitude: -122.42 })).json();
  assert.equal(h.attempts(), 2);
  assert.equal(body.partial, false);
  assert.equal(body.places[0].source, "osm");
  assert.equal(h.upserts()[0].options.onConflict, "osm_type,osm_id");
});

test("fresh map cache avoids provider calls", async () => {
  const h = handlerWith({
    fetchProvider: async () => { throw new Error("should not fetch"); },
    cached: { place_ids: [], partial: true, expires_at: new Date(Date.now() + 3600000).toISOString() }
  });
  const response = await h.handle({ latitude: 37.77, longitude: -122.42 });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.partial, true);
  assert.equal(body.stale, false);
  assert.equal(h.attempts(), 0);
});
