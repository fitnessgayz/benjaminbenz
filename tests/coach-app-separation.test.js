const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const coachLogin = fs.readFileSync(path.join(root, "coach-login.html"), "utf8");
const clientLogin = fs.readFileSync(path.join(root, "client-login.html"), "utf8");
const coachAdmin = fs.readFileSync(path.join(root, "coach-admin.html"), "utf8");
const coachWorkout = fs.readFileSync(path.join(root, "coach-workout-log.html"), "utf8");
const coachManifest = JSON.parse(fs.readFileSync(path.join(root, "coach.webmanifest"), "utf8"));
const clientManifest = JSON.parse(fs.readFileSync(path.join(root, "client.webmanifest"), "utf8"));
const adminScript = fs.readFileSync(path.join(root, "js/coach-admin.js"), "utf8");
const workoutScript = fs.readFileSync(path.join(root, "js/coach-workout-log.js"), "utf8");
const pagesWorkflow = fs.readFileSync(path.join(root, ".github/workflows/pages.yml"), "utf8");

test("coach app has a distinct install identity and coach entry point", () => {
  assert.equal(coachManifest.id, "/coach-app");
  assert.equal(coachManifest.name, "FWB Coach");
  assert.equal(coachManifest.start_url, "/coach-admin.html");
  assert.equal(clientManifest.name, "FWB Training");
  assert.notEqual(coachManifest.name, clientManifest.name);
  assert.match(coachLogin, /rel="manifest" href="\/coach\.webmanifest"/);
  assert.match(coachLogin, /id="coach-login-form"/);
  assert.doesNotMatch(coachLogin, /id="client-login-form"/);
  assert.match(clientLogin, /id="client-login-form"/);
  assert.doesNotMatch(clientLogin, /id="coach-login-form"/);
  assert.match(clientLogin, /href="coach-login\.html">Open the FWB Coach app/);
  assert.match(pagesWorkflow, /client\.webmanifest coach\.webmanifest/);
});

test("every coach surface stays inside the coach app install identity", () => {
  for (const html of [coachAdmin, coachWorkout]) {
    assert.match(html, /rel="manifest" href="\/coach\.webmanifest"/);
    assert.match(html, /apple-mobile-web-app-title" content="FWB Coach"/);
  }
  assert.match(adminScript, /const coachLoginUrl = "coach-login\.html/);
  assert.match(workoutScript, /const coachWorkoutLoginUrl = "coach-login\.html/);
});

test("coach app remains connected to the shared Supabase client", () => {
  assert.match(coachLogin, /js\/supabase-config\.js/);
  assert.match(coachLogin, /js\/auth-session\.js/);
  assert.match(coachLogin, /js\/client-portal\.js/);
  assert.match(coachLogin, /Connected to FWB Training/);
});
