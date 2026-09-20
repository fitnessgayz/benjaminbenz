const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const root = path.resolve(__dirname, "..");
const admin = fs.readFileSync(path.join(root, "js/coach-admin.js"), "utf8");
const portal = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");
const projectUrl = "https://qukdfjeupjhpthfbaonv.supabase.co";
const demoUrl = `${projectUrl}/storage/v1/object/public/exercise-videos/exercise-id/video-id.mp4`;
const file = { name: "demo.mp4", type: "video/mp4", size: 1000 };

function sourceFunction(source, name) {
  const match = new RegExp(`(?:async )?function ${name}\\(`).exec(source);
  assert.ok(match, name);
  const rest = source.slice(match.index);
  const end = rest.slice(1).search(/\n(?:async )?function /);
  return end < 0 ? rest : rest.slice(0, end + 1);
}

function makeSave({ uploadError = null, saveError = null } = {}) {
  const calls = [];
  const bucket = {
    async upload(...args) { calls.push(["upload", ...args]); return { error: uploadError }; },
    getPublicUrl(key) { return { data: { publicUrl: `${projectUrl}/storage/v1/object/public/exercise-videos/${key}` } }; },
    async remove(keys) { calls.push(["remove", keys]); return { error: null }; }
  };
  const query = {
    update(payload) { calls.push(["update", payload]); return this; },
    insert(payload) { calls.push(["insert", payload]); return this; },
    eq(...args) { calls.push(["eq", ...args]); return this; },
    select() { return this; },
    async single() { return { data: { id: "saved-id" }, error: saveError }; }
  };
  const save = Function("coachSupabase", "crypto", "exerciseLibraryStatus", `
    ${sourceFunction(admin, "exerciseVideoFileDetails")}
    ${sourceFunction(admin, "saveExerciseLibraryRecord")}
    return saveExerciseLibraryRecord;
  `)({ storage: { from: () => bucket }, from: () => query }, { randomUUID: () => "random-id" }, () => {});
  return { save, calls };
}

test("video file validation accepts supported phone/browser formats and rejects invalid or oversized files", () => {
  const validate = Function(`${sourceFunction(admin, "exerciseVideoFileDetails")}; return exerciseVideoFileDetails;`)();
  for (const [name, type] of [["a.mp4", "video/mp4"], ["a.MOV", "video/quicktime"], ["a.m4v", "video/x-m4v"], ["a.webm", "video/webm"], ["a.mp4", ""]]) {
    assert.ok(validate({ name, type, size: 52428800 }).contentType);
  }
  for (const invalid of [{ ...file, size: 0 }, { ...file, size: 52428801 }, { ...file, name: "a.exe" }, { ...file, type: "text/html" }]) {
    assert.throws(() => validate(invalid));
  }
});

test("new exercise uploads first, then attaches its permanent video URL", async () => {
  const { save, calls } = makeSave();
  await save({ name: "Squat", demo_url: "https://youtu.be/old" }, "", file);
  assert.equal(calls[0][0], "upload");
  assert.equal(calls[0][3].upsert, false);
  assert.equal(calls[1][0], "insert");
  assert.equal(calls[1][1].demo_url, `${projectUrl}/storage/v1/object/public/exercise-videos/random-id/random-id.mp4`);
});

test("replacement saves to the selected exercise and preserves older demo objects", async () => {
  const { save, calls } = makeSave();
  await save({ name: "Squat" }, "selected-id", file);
  assert.equal(calls[0][1], "selected-id/random-id.mp4");
  assert.deepEqual(calls[2], ["eq", "id", "selected-id"]);
  assert.equal(calls.some(([action]) => action === "remove"), false);
});

test("upload failure leaves the exercise unchanged; retry succeeds", async () => {
  const failed = makeSave({ uploadError: { message: "offline" } });
  await assert.rejects(failed.save({ name: "Squat" }, "id", file), /upload failed/);
  assert.deepEqual(failed.calls.map(([action]) => action), ["upload"]);
  const retry = makeSave();
  assert.equal((await retry.save({ name: "Squat" }, "id", file)).id, "saved-id");
});

test("definite database rejection cleans up the new upload; uncertain network outcome preserves it", async () => {
  const rejected = makeSave({ saveError: { code: "23505", message: "Duplicate name" } });
  await assert.rejects(rejected.save({}, "id", file));
  assert.deepEqual(rejected.calls.at(-1), ["remove", ["id/random-id.mp4"]]);
  const uncertain = makeSave({ saveError: { message: "Network unavailable" } });
  await assert.rejects(uncertain.save({}, "id", file));
  assert.equal(uncertain.calls.some(([action]) => action === "remove"), false);
});

test("saving a link without a selected file does not upload anything", async () => {
  const { save, calls } = makeSave();
  const payload = { demo_url: "https://youtu.be/demo" };
  await save(payload, "id");
  assert.equal(calls[0][0], "update");
  assert.equal(calls[0][1].demo_url, payload.demo_url);
});

test("client uses the uploaded library demo for existing workouts and rejects untrusted storage URLs", () => {
  const resolve = Function("window", "approvedExerciseForName", "youtubeExerciseSearchUrl", `
    ${sourceFunction(portal, "uploadedExerciseDemoUrl")}
    ${sourceFunction(portal, "exerciseVideoUrl")}
    return exerciseVideoUrl;
  `)({ FWB_SUPABASE_CONFIG: { url: projectUrl } }, (name) => name === "Squat" ? { demo_url: demoUrl } : null, () => "https://youtube.com/results?search_query=demo");
  assert.equal(resolve({ name: "Squat", video: "https://youtube.com/results?search_query=old" }), demoUrl);
  assert.equal(resolve({ name: "Other", video: demoUrl }), demoUrl);
  assert.equal(resolve({ name: "Other", video: "https://youtu.be/demo" }), "https://youtu.be/demo");
  for (const url of [demoUrl.replace(projectUrl, "https://evil.example"), demoUrl.replace("exercise-videos", "progress-photos"), "javascript:alert(1)"]) {
    assert.equal(resolve({ name: "Other", video: url }), "");
  }
});

test("coach workout editor retains an uploaded video URL", () => {
  const resolve = Function("window", `
    ${sourceFunction(admin, "uploadedExerciseDemoUrl")}
    ${sourceFunction(admin, "youtubeExerciseSearchUrl")}
    ${sourceFunction(admin, "youtubeExerciseDemoUrl")}
    return youtubeExerciseDemoUrl;
  `)({ FWB_SUPABASE_CONFIG: { url: projectUrl } });
  assert.equal(resolve(demoUrl, "Squat"), demoUrl);
});

test("program save API preserves uploaded demos and YouTube links", () => {
  const { stripTypeScriptTypes } = require("node:module");
  const source = stripTypeScriptTypes(fs.readFileSync(path.join(root, "supabase/functions/save-client-program/index.ts"), "utf8"));
  const resolve = Function("Deno", `
    ${sourceFunction(source, "stringValue")}
    ${sourceFunction(source, "youtubeExerciseSearchUrl")}
    ${sourceFunction(source, "youtubeExerciseDemoUrl")}
    return youtubeExerciseDemoUrl;
  `)({ env: { get: () => projectUrl } });
  assert.equal(resolve({ name: "Squat", video: demoUrl }), demoUrl);
  assert.equal(resolve({ name: "Squat", video: "https://youtu.be/demo" }), "https://youtu.be/demo");
  assert.match(resolve({ name: "Squat", video: demoUrl.replace(projectUrl, "https://evil.example") }), /youtube.com\/results/);
});
