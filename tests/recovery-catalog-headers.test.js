const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const scripts = ["client-portal", "coach-admin", "coach-workout-log"];
const sources = Object.fromEntries(scripts.map((name) => [name, fs.readFileSync(path.join(root, `js/${name}.js`), "utf8")]));
const header = "x-fwb-recovery-catalog";

function libraryRead(name) {
  const match = sources[name].match(/\w+\s*\.from\("exercise_library"\)\s*\.select\([\s\S]*?\.order\("name", \{ ascending: true \}\)/);
  assert.ok(match, `${name} has a library read`);
  return match[0];
}

function saveFunction() {
  const source = sources["coach-admin"];
  const start = source.indexOf("async function saveExerciseLibraryRecord(");
  const rest = source.slice(start);
  const end = rest.slice(1).search(/\n(?:async )?function /);
  return end < 0 ? rest : rest.slice(0, end + 1);
}

test("recovery visibility is requested only by exercise-library reads and coach saves", () => {
  for (const name of scripts) {
    assert.match(libraryRead(name), /\.setHeader\("x-fwb-recovery-catalog", "1"\)/);
    const occurrences = [...sources[name].matchAll(/x-fwb-recovery-catalog/g)];
    assert.equal(occurrences.length, name === "coach-admin" ? 2 : 1);
    assert.doesNotMatch(sources[name], /["']x-fwb-recovery-catalog["']\s*:/, "Never set this header globally: Edge Functions do not allow it in CORS preflight");
  }
  assert.match(saveFunction(), /request\.setHeader\("x-fwb-recovery-catalog", "1"\)\.select\("\*"\)\.single\(\)/);
  assert.match(libraryRead("client-portal"), /\.eq\("is_active", true\)[\s\S]*\.eq\("is_approved", true\)/);
});

test("each affected page requests a fresh recovery-aware script", () => {
  for (const [page, script] of [["client-dashboard", "client-portal"], ["client-login", "client-portal"], ["coach-admin", "coach-admin"], ["coach-workout-log", "coach-workout-log"]]) {
    const html = fs.readFileSync(path.join(root, `${page}.html`), "utf8");
    assert.match(html, new RegExp(`src="js/${script}\\.js\\?[^"\\n]*&amp;recovery-catalog=1(?:&amp;[^"\\n]+)*"`));
  }
});

// Run against the same public browser SDK without adding a repository dependency:
// FWB_SUPABASE_SDK_PATH=/path/to/supabase.js node --test tests/recovery-catalog-headers.test.js
test("actual Supabase SDK isolates recovery headers from other tables, RPCs, and Edge Functions", { skip: !process.env.FWB_SUPABASE_SDK_PATH }, async () => {
  const sdkSource = fs.readFileSync(process.env.FWB_SUPABASE_SDK_PATH, "utf8");
  const sdk = Function(`${sdkSource}\n; return supabase;`)();
  const requests = [];
  const client = sdk.createClient("https://recovery-catalog.example", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, options = {}) => {
      const headers = new Headers(options.headers);
      requests.push({ url: String(url), method: options.method || "GET", headers });
      const body = headers.get("accept")?.includes("vnd.pgrst.object") ? { id: "saved-id" } : [];
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    } }
  });
  for (const name of scripts) {
    const expression = libraryRead(name).replace(/^\w+/, "client");
    const result = await Function("client", `return ${expression};`)(client);
    assert.equal(result.error, null);
  }
  const save = Function("coachSupabase", "exerciseLibraryStatus", `${saveFunction()}; return saveExerciseLibraryRecord;`)(client, () => {});
  await save({ name: "Cat-Cow", movement_pattern: "mobility" }, "saved-id");
  await save({ name: "New recovery movement", movement_pattern: "stretching" }, "");
  await client.from("client_progress").select("entry_date");
  await client.rpc("example_read_only_rpc", {});
  await client.functions.invoke("example-edge-function", { body: { check: true } });
  assert.equal(requests.length, 8);
  for (const request of requests) {
    const library = new URL(request.url).pathname === "/rest/v1/exercise_library";
    assert.equal(request.headers.get(header), library ? "1" : null, request.url);
  }
  assert.equal(requests.filter((request) => request.headers.has(header)).length, 5);
});
