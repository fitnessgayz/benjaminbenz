const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("workout plan help stays paused and the tutorial is removed", () => {
  const html = read("client-dashboard.html");
  const portal = read("js/client-portal.js");
  assert.doesNotMatch(html, /id="workout-plan-dialog"|data-workout-plan-help-open/);
  assert.doesNotMatch(portal, /\s+maybeShowFirstLoginFitnessQuestionnaire\(\);/);
  assert.doesNotMatch(portal.match(/function maybeShowClientHomeCheckinPrompt\(\) \{[\s\S]*?\n\}/)?.[0] || "", /firstLoginFitnessQuestionnaireRequired\(\)/);
  assert.doesNotMatch(html, /client-web-tour|data-client-web-tour-open|App tour/);
});

test("membership confirmation and beta access are enforced at the server", () => {
  const migration = read("supabase/migrations/20261010105000_client_membership_type.sql");
  const questionnaire = read("supabase/functions/submit-fitness-questionnaire/index.ts");
  const builder = require("../js/fitness-plan-builder.js");
  assert.match(migration, /account_type <> 'beta_tester' or membership_type = 'app_access_only'/);
  assert.match(migration, /Membership changes require the verified questionnaire or coach approval/);
  assert.match(questionnaire, /program\?\.account_type === "beta_tester" && requestedMembership !== "app_access_only"/);
  assert.match(questionnaire, /membership_type: confirmedMembership/);
  assert.equal(builder.canRequestCoachReview({ active: true, account_type: "client", membership_type: "app_access_only", membership_requested_type: "online_training" }), false);
  assert.equal(builder.canRequestCoachReview({ active: true, account_type: "beta_tester", membership_type: "personal_training" }), false);
});
