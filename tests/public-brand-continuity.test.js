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
const publicStyles = read("css/public-brand.css");
const support = read("fwb-training-support.html");
const privacy = read("fwb-training-privacy.html");
const assistantTerms = read("ai-coach-terms.html");
const publicConversionPages = [homepage, questionnaire, interest, privateInterest];

test("leads the homepage with the canonical promise and a direct coaching-fit action", () => {
  assert.match(homepage, /Train with intention\.<br><em>Feel your progress\.<\/em>/);
  assert.match(homepage, /href="questionnaire\.html">Fitness questionnaire/);
  assert.doesNotMatch(homepage, /home-tabs|data-home-tab-panel/);
});

test("presents services, inquiry and client access on one page", () => {
  for (const service of ["Personal Training", "Online Coaching", "Hybrid Coaching"]) assert.match(homepage, new RegExp(service));
  assert.match(homepage, /Interested in training\?/);
  assert.match(homepage, /id="home-login-form"/);
  assert.match(homepage, /Keep me signed in/);
  assert.match(homepage, /href="coach-login\.html"/);
  assert.doesNotMatch(homepage, /San Francisco \+ online coaching/);
});

test("uses the anatomy artwork and complete sharing metadata", () => {
  assert.match(homepage, /images\/home\/anatomy\/curl\.png/);
  assert.match(homepage, /rel="canonical" href="https:\/\/benjaminbenz\.com\/"/);
  assert.match(homepage, /property="og:title" content="Fitness with Benjamin \| Train with intention"/);
  assert.match(homepage, /name="twitter:card" content="summary_large_image"/);
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

test("sets expectations and privacy context before the public questionnaire", () => {
  const formIndex = questionnaire.indexOf('<form class="questionnaire-form"');
  const expectationsIndex = questionnaire.indexOf('class="public-form-intro"');
  const privacyIndex = questionnaire.indexOf('id="questionnaire-privacy-note"');

  assert.ok(expectationsIndex >= 0 && expectationsIndex < formIndex);
  assert.ok(privacyIndex >= 0 && privacyIndex < formIndex);
  assert.match(questionnaire, /Your information is reviewed privately—not scored by an automated system/);
  assert.match(questionnaire, /aria-describedby="questionnaire-privacy-note"/);
  assert.match(questionnaire, /Send questionnaire to Benjamin/);
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

test("keeps public styling isolated and based on canonical tokens", () => {
  for (const page of [questionnaire, interest]) {
    assert.match(page, /css\/public-brand\.css\?v=public-nav-3/);
    assert.match(page, /public-page/);
  }
  assert.match(homepage, /css\/homepage-one-page\.css\?v=4/);
  assert.match(homepage, /public-page/);

  assert.match(publicStyles, /\.public-page \{/);
  assert.doesNotMatch(publicStyles, /(?:^|\n)\s*(?:body|:root|\.dashboard-page|\.coach-admin-page)\s*\{/);
  for (const token of ["--brand-primary", "--brand-primary-hover", "--brand-primary-ink", "--ink-deep", "--canvas", "--surface", "--text-muted", "--border", "--focus"]) {
    assert.match(publicStyles, new RegExp(`var\\(${token}\\)`));
  }
});

test("uses shared surface roles for proof and coaching offers", () => {
  assert.match(publicStyles, /\.homepage\.public-page \.review-card\s*\{[^}]*background:\s*var\(--surface\)/s);
  assert.match(publicStyles, /\.homepage\.public-page \.review-card span\s*\{[^}]*background:\s*var\(--brand-primary\)/s);
  assert.match(publicStyles, /\.homepage\.public-page \.coaching-option-card-featured\s*\{[^}]*background:\s*var\(--surface-soft\)/s);
  assert.match(publicStyles, /box-shadow:\s*inset 0 5px 0 var\(--brand-primary\)/);
});

test("uses a dark translucent primary dock with a neon selected state", () => {
  assert.match(publicStyles, /:root body\.homepage\.public-page \.home-tabs\s*\{[^}]*background:\s*rgb\(11 24 17 \/ 94%\)/s);
  assert.match(publicStyles, /backdrop-filter:\s*blur\(28px\) saturate\(135%\)/);
  assert.match(publicStyles, /:root body\.homepage\.public-page \.home-tab\s*\{[^}]*color:\s*var\(--ink\)[^}]*background:\s*transparent/s);
  assert.match(publicStyles, /:root body\.homepage\.public-page \.home-tab\.is-active\s*\{[^}]*background:\s*var\(--brand-primary\)/s);
});

test("keeps the master identity and legal navigation on public support and policy pages", () => {
  for (const page of [support, privacy, assistantTerms]) {
    assert.match(page, /Fitness with Benjamin/);
    assert.match(page, /<footer>/);
  }
  assert.match(support, /fwb-training-privacy\.html/);
  assert.match(privacy, /fwb-training-support\.html/);
  assert.match(assistantTerms, /ai-coach-support\.html/);
  assert.match(assistantTerms, /ai-coach-privacy\.html/);
});
