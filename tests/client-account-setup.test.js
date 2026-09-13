const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const loginHtml = fs.readFileSync(path.join(root, "client-login.html"), "utf8");
const signupHtml = fs.readFileSync(path.join(root, "client-signup.html"), "utf8");
const signupScript = fs.readFileSync(path.join(root, "js/client-signup.js"), "utf8");
const inviteScript = fs.readFileSync(path.join(root, "js/client-invite.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "css/style.css"), "utf8");

test("places Create new account beside the client password recovery action", () => {
  assert.match(loginHtml, /class="login-help-links"[\s\S]*?data-password-reset="client"[\s\S]*?href="client-signup\.html">Create new account/);
  assert.match(styles, /\.login-help-links \{[\s\S]*?display: flex/);
});

test("requests a secure setup email without exposing whether an account exists", () => {
  assert.match(signupHtml, /id="client-account-setup-form"/);
  assert.match(signupScript, /auth\.signInWithOtp\(\{/);
  assert.match(signupScript, /shouldCreateUser: false/);
  assert.match(signupScript, /client-invite\.html\?flow=account-setup/);
  assert.match(signupScript, /If that email matches a client account, a secure setup link was sent/);
  assert.doesNotMatch(signupScript, /auth\.signUp/);
});

test("account setup creates a password and continues into onboarding", () => {
  assert.match(inviteScript, /requestedFlow === "account-setup"/);
  assert.match(inviteScript, /passwordFlow = "account-setup"/);
  assert.match(inviteScript, /setInviteAccountSetupMode\(\)/);
  assert.match(inviteScript, /if \(passwordFlow === "recovery"\) \{[\s\S]*?window\.location\.href = "client-login\.html"/);
  assert.doesNotMatch(inviteScript, /passwordFlow === "account-setup"[\s\S]{0,160}window\.location\.href = "client-login\.html"/);
});
