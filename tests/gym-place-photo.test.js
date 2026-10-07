const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { stripTypeScriptTypes } = require("node:module");

const source = fs.readFileSync(path.join(__dirname, "../supabase/functions/gym-place-photo/index.ts"), "utf8")
  .replace(/^import .+;\n/gm, "");
const id = "11111111-1111-4111-8111-111111111111";

function harness({ place = { source: "geoapify", provider_place_id: "provider-1" }, media = {},
  signedIn = true, providerStatus = 200 } = {}) {
  let handler;
  let providerCalls = 0;
  const createClient = () => ({
    auth: { getUser: async () => signedIn
      ? { data: { user: { id: "client-1" } }, error: null }
      : { data: { user: null }, error: new Error("No session") } },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: place, error: null }) }) }) })
  });
  vm.runInNewContext(stripTypeScriptTypes(source), {
    serve: (fn) => { handler = fn; }, createClient,
    Deno: { env: { get: (name) => ({
      SUPABASE_URL: "https://example.test", SUPABASE_ANON_KEY: "anon", GEOAPIFY_API_KEY: "secret-key"
    })[name] } },
    fetch: async (url) => {
      providerCalls++;
      assert.equal(url.hostname, "api.geoapify.com");
      assert.equal(url.searchParams.get("id"), "provider-1");
      return { ok: providerStatus === 200, json: async () => ({ features: [{ properties: {
        feature_type: "details", wiki_and_media: media
      } }] }) };
    },
    Request, Response, URL, AbortSignal, Date, Map, Set, Math, Number, JSON
  });
  return {
    invoke: () => handler(new Request("https://example.test/gym-place-photo", {
      method: "POST", headers: { Authorization: "Bearer token" }, body: JSON.stringify({ gym_id: id })
    })),
    calls: () => providerCalls
  };
}

test("returns a Geoapify place image and caches repeat detail views", async () => {
  const h = harness({ media: { image: "https://upload.wikimedia.org/example.jpg" } });
  const first = await (await h.invoke()).json();
  const second = await (await h.invoke()).json();
  assert.equal(first.image_url, "https://upload.wikimedia.org/example.jpg");
  assert.equal(first.source_url, first.image_url);
  assert.deepEqual(second, first);
  assert.equal(h.calls(), 1);
});

test("a place without OSM image data returns no provider photo", async () => {
  const h = harness();
  assert.equal((await (await h.invoke()).json()).image_url, null);
  assert.equal(h.calls(), 1);
});

test("rejects unsafe image URLs from place data", async () => {
  const h = harness({ media: { image: "http://localhost/private.jpg" } });
  assert.equal((await (await h.invoke()).json()).image_url, null);
});

test("client-added places do not trigger provider lookup", async () => {
  const h = harness({ place: { source: "client", provider_place_id: null } });
  assert.equal((await (await h.invoke()).json()).image_url, null);
  assert.equal(h.calls(), 0);
});

test("requires a signed-in client", async () => {
  const h = harness({ signedIn: false });
  assert.equal((await h.invoke()).status, 401);
  assert.equal(h.calls(), 0);
});
