const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

const homepage = read("index.html");
const questionnaire = read("questionnaire.html");
const interest = read("app-interest.html");
const privateInterest = read("fwb-ios-invite-d00108bdaab031f8.html");
const publicConversionPages = [homepage, questionnaire, interest, privateInterest];

test("leads the homepage with the canonical promise and a direct coaching-fit action", () => {
  assert.match(homepage, /Train<\/span> with intention\. <span class="hero-accent">Feel<\/span> your progress\./);
  assert.match(homepage, /href="questionnaire\.html">Find your coaching fit<\/a>/);
  assert.doesNotMatch(homepage, /href="#start"[^>]*>Take the questionnaire<\/a>/);
});

test("removes DTF language from public conversion pages", () => {
  for (const page of publicConversionPages) {
    assert.doesNotMatch(page, /\bDTF\b|Dedicated To Fitness/i);
  }
});

test("keeps the questionnaire field contract while using clear commitment language", () => {
  assert.match(questionnaire, /how ready are you to make consistent changes to your training\?/i);
  assert.match(questionnaire, /name="commitment_level" min="1" max="5"/);
});

test("uses the approved client product name on public app-interest pages", () => {
  for (const page of [interest, privateInterest]) {
    assert.match(page, /FWB Training app interest list/);
    assert.match(page, /FWB Training brings your workouts, progress, and connection with Benjamin together/);
    assert.doesNotMatch(page, /Android coming soon|iOS only|available now/i);
  }
});

test("makes support and privacy visible on public conversion pages", () => {
  for (const page of publicConversionPages) {
    assert.match(page, /fwb-training-support\.html/);
    assert.match(page, /fwb-training-privacy\.html/);
  }
});
