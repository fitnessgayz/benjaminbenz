const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "client-invite.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "css/client-invite.css"), "utf8");
const script = fs.readFileSync(path.join(root, "js/client-invite.js"), "utf8");
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260913155314_allow_client_onboarding_questionnaires.sql"),
  "utf8"
);
const hardenedMigration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260913160512_remove_direct_questionnaire_inserts.sql"),
  "utf8"
);
const onboardingFunction = fs.readFileSync(
  path.join(root, "supabase/functions/submit-client-onboarding/index.ts"),
  "utf8"
);

test("presents account, fitness, and optional macro cards as one onboarding deck", () => {
  assert.match(html, /data-invite-step="account"/);
  assert.match(html, /data-invite-step="fitness"/);
  assert.match(html, /data-invite-step="macros"/);
  assert.match(html, /name="wants_macros" value="no"/);
  assert.match(html, /data-invite-progress="2"/);
  assert.match(styles, /\.invite-deck-peek-left/);
  assert.match(styles, /touch-action: pan-y/);
  assert.match(script, /addEventListener\("touchstart"/);
  assert.match(script, /if \(distance < -55\) advanceInviteStep\(\)/);
});

test("keeps password recovery on the account card and skips onboarding", () => {
  assert.match(script, /if \(passwordFlow === "recovery"\) \{[\s\S]*?window\.location\.href = "client-login\.html"/);
  assert.match(script, /form\?\.classList\.add\("is-recovery"\)/);
  assert.match(styles, /\.invite-onboarding\.is-recovery \.invite-deck-peek/);
});

test("saves fitness answers and only writes calculated macros when requested", () => {
  assert.match(script, /answers: inviteOnboardingAnswers\(wantsMacros, nutritionResult\.plan \|\| null\)/);
  assert.match(script, /fitness_goal: inviteSelectedValue\("fitness_goal"\)/);
  assert.match(script, /functions\/v1\/submit-client-onboarding/);
  assert.match(script, /macro_estimate: nutritionPlan/);
  assert.match(script, /\.eq\("client_archived", false\)/);
});

test("keeps an on-device draft until the server confirms onboarding was saved", () => {
  const draftFields = script.match(/const inviteDraftFieldNames = \[([\s\S]*?)\];/)?.[1] || "";
  assert.match(script, /fwb-client-onboarding-draft:\$\{data\.session\.user\.id\}/);
  assert.match(script, /function saveInviteDraft\(\)/);
  assert.match(script, /function restoreInviteDraft\(\)/);
  assert.doesNotMatch(draftFields, /password/);
  assert.match(script, /if \(!response\.ok\) throw[\s\S]*?clearInviteDraft\(\);/);
});

test("initial questionnaire migration defines the owned insert policy", () => {
  assert.match(migration, /create table if not exists public\.client_fitness_questionnaires/);
  assert.match(migration, /linked_user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /linked_client_email = lower\(coalesce\(\(select auth\.jwt\(\) ->> 'email'\), ''\)\)/);
  assert.match(migration, /grant select, insert on public\.client_fitness_questionnaires to authenticated/);
  assert.doesNotMatch(migration, /grant update on public\.client_programs/);
});

test("production hardening routes questionnaire writes through a verified function", () => {
  assert.match(hardenedMigration, /revoke insert on table public\.client_fitness_questionnaires from authenticated/);
  assert.match(onboardingFunction, /userClient\.auth\.getUser\(\)/);
  assert.match(onboardingFunction, /\.eq\("active", true\)/);
  assert.match(onboardingFunction, /\.eq\("client_archived", false\)/);
  assert.match(onboardingFunction, /source_submission_id: `invite-\$\{user\.id\}`/);
  assert.match(onboardingFunction, /onConflict: "source,source_submission_id"/);
  assert.match(onboardingFunction, /could not be confirmed after saving/);
  assert.match(onboardingFunction, /\.select\("id,linked_user_id,linked_client_email,match_status,answers"\)/);
});

test("mobile styles keep the deck within 375 to 430 pixel screens", () => {
  assert.match(styles, /@media \(max-width: 620px\)[\s\S]*?width: min\(100% - 24px, 480px\)/);
  assert.match(styles, /@media \(max-width: 380px\)[\s\S]*?width: min\(100% - 16px, 480px\)/);
  assert.match(styles, /grid-template-columns: repeat\(7, minmax\(0, 1fr\)\)/);
});
