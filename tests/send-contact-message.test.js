const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.resolve(__dirname, "../supabase/functions/send-contact-message/index.ts"),
  "utf8"
);

test("accepts a valid contact request without a message", () => {
  assert.match(source, /if \(!name \|\| !validEmail\(email\)\)/);
  assert.doesNotMatch(source, /message\.length < \d+/);
  assert.match(source, /message\.length > 2000/);
});

test("preserves optional messages from older cached pages", () => {
  assert.match(source, /if \(message\) \{[\s\S]*?emailText\.push\("", "Message:", message\);[\s\S]*?\}/);
  assert.match(source, /text: emailText\.join\("\\n"\)/);
});

test("labels the email and API response as a coaching inquiry", () => {
  assert.match(source, /subject: `Website coaching inquiry from \$\{name\}`/);
  assert.match(source, /\{ message: "Inquiry sent\." \}/);
});
