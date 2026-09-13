const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const questionnaireHtml = fs.readFileSync(path.join(root, "questionnaire.html"), "utf8");
const siteScript = fs.readFileSync(path.join(root, "js/script.js"), "utf8");
const functionSource = fs.readFileSync(
  path.join(root, "supabase/functions/submit-fitness-questionnaire/index.ts"),
  "utf8"
);
const supabaseConfig = fs.readFileSync(path.join(root, "supabase/config.toml"), "utf8");
const privacyPolicy = fs.readFileSync(path.join(root, "fwb-training-privacy.html"), "utf8");

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);

  assert.ok(start >= 0, `Expected ${startMarker}`);
  assert.ok(end > start, `Expected ${endMarker}`);
  return source.slice(start, end);
}

test("loads the authenticated questionnaire dependencies before the site script", () => {
  const supabaseIndex = questionnaireHtml.indexOf("@supabase/supabase-js@2");
  const configIndex = questionnaireHtml.indexOf("js/supabase-config.js");
  const scriptIndex = questionnaireHtml.indexOf("js/script.js?v=questionnaire-client-sync-1");

  assert.ok(supabaseIndex >= 0);
  assert.ok(configIndex > supabaseIndex);
  assert.ok(scriptIndex > configIndex);
});

test("sends one browser-generated submission ID to Google and the private client copy", () => {
  const questionnaireSource = sourceBetween(
    siteScript,
    'const questionnaire = document.getElementById("training-questionnaire")',
    'const contactForm = document.getElementById("contact-message-form")'
  );

  assert.match(questionnaireSource, /const submissionId = questionnaireSubmissionId\(\)/);
  assert.match(questionnaireSource, /formData\.set\("submission_id", submissionId\)/);
  assert.match(questionnaireSource, /body:\s*new URLSearchParams\(formData\)/);
  assert.match(questionnaireSource, /"submit-fitness-questionnaire"[\s\S]*?submission_id:\s*submissionId/);
  assert.match(questionnaireSource, /signedInEmail !== submittedEmail/);
  assert.match(questionnaireSource, /not linked to your client profile because the form email does not match/);
  assert.match(questionnaireSource, /status\.textContent = successMessage/);
  assert.doesNotMatch(questionnaireSource, /innerHTML\s*=/);
});

test("keeps the Supabase copy authenticated, UID-linked, allowlisted, and profile-safe", () => {
  assert.match(
    supabaseConfig,
    /\[functions\.submit-fitness-questionnaire\]\s*\nverify_jwt\s*=\s*true/
  );
  assert.match(functionSource, /userClient\.auth\.getUser\(\)/);
  assert.match(functionSource, /respondentEmail !== signedInEmail/);
  assert.match(functionSource, /linked_user_id:\s*user\.id/);
  assert.match(functionSource, /linked_client_email:\s*signedInEmail/);
  assert.match(functionSource, /match_status:\s*"matched"/);
  assert.match(functionSource, /answerLimits\.get\(key\)/);
  assert.match(functionSource, /Questionnaire contains an unsupported answer/);
  assert.match(functionSource, /canFillProfileValue\(program\[field\], field\)/);
  assert.match(functionSource, /Object\.prototype\.hasOwnProperty\.call\(program, field\)/);
  assert.match(functionSource, /Object\.keys\(profileUpdates\)\.forEach\(\(field\) =>/);
  assert.match(functionSource, /profileUpdateQuery\.is\(field, null\)/);
  assert.match(functionSource, /profileUpdateQuery\.eq\(field, originalValue\)/);
  assert.match(functionSource, /\.select\("id"\)\s*\.maybeSingle\(\)/);
  assert.match(functionSource, /profileUpdateApplied = !profileUpdateError && Boolean\(updatedProgram\?\.id\)/);
  assert.doesNotMatch(functionSource, /\.eq\("active", true\)/);
  assert.doesNotMatch(functionSource, /No active client profile/);
  assert.match(functionSource, /"Cache-Control": "no-store"/);
  assert.match(functionSource, /if \(!requestOriginIsAllowed\(request\)\)/);
  assert.doesNotMatch(functionSource, /console\.(?:log|info|warn|error)/);
});

test("discloses questionnaire processing by Google Sheets and Supabase", () => {
  assert.match(privacyPolicy, /Effective September 13, 2026/);
  assert.match(privacyPolicy, /Fitness questionnaire information:/);
  assert.match(privacyPolicy, /Google Apps Script to a restricted Google Sheet/);
  assert.match(privacyPolicy, /authenticated client copies of fitness questionnaires[\s\S]*?Supabase project/);
  assert.match(privacyPolicy, /Existing client or coach-entered profile information is not replaced automatically/);
});
