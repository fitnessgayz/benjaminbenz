const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const homepage = fs.readFileSync(path.join(root, "index.html"), "utf8");
const script = fs.readFileSync(path.join(root, "js/script.js"), "utf8");

function contactFormSource() {
  const start = homepage.indexOf('<form class="contact-form" id="contact-message-form">');
  const end = homepage.indexOf("</form>", start);

  assert.ok(start >= 0, "Expected the homepage contact form");
  assert.ok(end > start, "Expected the homepage contact form to close");
  return homepage.slice(start, end);
}

test("keeps the contact form compact without a message field", () => {
  const form = contactFormSource();

  assert.match(form, /name="name"[\s\S]*?required/);
  assert.match(form, /name="email"[\s\S]*?required/);
  assert.match(form, /name="phone"/);
  assert.doesNotMatch(form, /<textarea|name="message"|>Message\s*</i);
  assert.match(form, />Send inquiry<\/button>/);
});

test("sends a coaching inquiry without asking for message text", () => {
  assert.doesNotMatch(script, /formData\.get\("message"\)/);
  assert.doesNotMatch(script, /message:\s*contactInquiryMessage/);
  assert.match(script, /Sending your inquiry/);
  assert.match(script, /information was sent to Benjamin/);
});

test("cache-busts the updated homepage assets", () => {
  assert.match(homepage, /css\/style\.css\?v=contact-form-no-message-1/);
  assert.match(homepage, /js\/script\.js\?v=contact-form-no-message-1/);
});
