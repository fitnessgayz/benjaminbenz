const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.resolve(__dirname, "..");
const adminHtml = fs.readFileSync(path.join(projectRoot, "coach-admin.html"), "utf8");
const adminSource = fs.readFileSync(path.join(projectRoot, "js/coach-admin.js"), "utf8");

test("selected-client hub offers a password reset action", () => {
  const actionsStart = adminHtml.indexOf('class="selected-client-actions"');
  const actionsEnd = adminHtml.indexOf("</div>", actionsStart);
  const actionsMarkup = adminHtml.slice(actionsStart, actionsEnd);

  assert.ok(actionsStart >= 0);
  assert.match(actionsMarkup, /id="selected-client-password-reset-button"[^>]*hidden>Send password reset link/);
  assert.match(adminHtml, /coach-admin\.js[^"']*password-reset=1/);
});

test("reset action targets the selected client and requires confirmation", () => {
  assert.match(adminSource, /const email = normalizeEmail\(program\?\.client_email\)/);
  assert.match(adminSource, /window\.confirm\(`Send a password reset link to \$\{clientName\} at \$\{email\}\?`\)/);
  assert.match(adminSource, /passwordResetButton\.hidden = !email/);
  assert.match(adminSource, /passwordResetButton\.disabled = true/);
  assert.match(adminSource, /passwordResetButton\.disabled = false/);
});

test("reset action uses Supabase Auth and the FWB recovery page", () => {
  assert.match(adminSource, /function coachPasswordResetRedirectUrl\(\)\s*\{\s*return `\$\{window\.location\.origin\}\/client-invite\.html`;/s);
  assert.match(adminSource, /coachSupabase\.auth\.resetPasswordForEmail\(email, \{\s*redirectTo: coachPasswordResetRedirectUrl\(\)\s*\}\)/s);
});
