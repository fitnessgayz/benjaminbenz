const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const homepage = fs.readFileSync(path.join(root, "index.html"), "utf8");
const services = fs.readFileSync(path.join(root, "personal-training.html"), "utf8");
const script = fs.readFileSync(path.join(root, "js/script.js"), "utf8");

test("directs visitors to the questionnaire without an inquiry form", () => {
  assert.doesNotMatch(homepage, /id="contact-message-form"|Send inquiry/);
  assert.match(homepage, /href="personal-training\.html">Explore personal training/);
  assert.match(services, /href="questionnaire\.html">Fitness questionnaire/);
  assert.match(homepage, /id="home-login-form"/);
});

test("sends a coaching inquiry without asking for message text", () => {
  assert.doesNotMatch(script, /formData\.get\("message"\)/);
  assert.doesNotMatch(script, /message:\s*contactInquiryMessage/);
  assert.match(script, /Sending your inquiry/);
  assert.match(script, /information was sent to Benjamin/);
});

test("cache-busts the updated homepage assets", () => {
  assert.match(homepage, /css\/homepage-login-first\.css\?v=1/);
  assert.match(homepage, /js\/homepage-one-page\.js\?v=1/);
});
