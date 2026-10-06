const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { stripTypeScriptTypes } = require("node:module");

const source = fs.readFileSync(path.join(__dirname, "../supabase/functions/gym-search/index.ts"), "utf8")
  .replace(/^import .+;\n/gm, "");

function handlerWith({ fetchProvider, cached = null, clients = [] }) {
  let handler;
  let attempts = 0;
  const tables = {
    gym_search_cache: {
      maybeSingle: async () => ({ data: cached }),
      upsert: async () => ({ error: null })
    },
    gym_places: {
      in: async () => ({ data: [] }),
      limit: async () => ({ data: clients })
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
      SUPABASE_SERVICE_ROLE_KEY: "service"
    })[name] } },
    fetch: async (...args) => { attempts++; return fetchProvider(...args); },
    Request, Response, URLSearchParams, AbortSignal, Date, Set, Math, Number, JSON
  };
  vm.runInNewContext(stripTypeScriptTypes(source), context);
  return {
    handle: (body) => handler(new Request("https://example.test/gym-search", {
      method: "POST", headers: { Authorization: "Bearer token" }, body: JSON.stringify(body)
    })),
    attempts: () => attempts
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

test("fresh map cache avoids provider calls", async () => {
  const h = handlerWith({
    fetchProvider: async () => { throw new Error("should not fetch"); },
    cached: { place_ids: [], expires_at: new Date(Date.now() + 3600000).toISOString() }
  });
  const response = await h.handle({ latitude: 37.77, longitude: -122.42 });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.partial, false);
  assert.equal(body.stale, false);
  assert.equal(h.attempts(), 0);
});
