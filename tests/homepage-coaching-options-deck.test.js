const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const homepage = fs.readFileSync(path.join(root, "index.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "css/style.css"), "utf8");
const script = fs.readFileSync(path.join(root, "js/script.js"), "utf8");

function functionSource(name) {
  const start = script.indexOf(`function ${name}(`);
  const end = script.indexOf("\nfunction ", start + 1);

  assert.ok(start >= 0, `Expected ${name} to exist`);
  return script.slice(start, end >= 0 ? end : undefined);
}

const wrapIndex = Function(`${functionSource("wrapCoachingOptionIndex")}; return wrapCoachingOptionIndex;`)();
const swipeDirection = Function(`${functionSource("coachingOptionSwipeDirection")}; return coachingOptionSwipeDirection;`)();

test("keeps all three coaching plans and opens the featured Hybrid card", () => {
  assert.equal((homepage.match(/data-coaching-option-card/g) || []).length, 3);

  const onlineIndex = homepage.indexOf("<h3>Online Coaching</h3>");
  const hybridIndex = homepage.indexOf("<h3>Hybrid Coaching</h3>");
  const personalIndex = homepage.indexOf("<h3>Personal Training</h3>");

  assert.ok(onlineIndex >= 0);
  assert.ok(hybridIndex > onlineIndex);
  assert.ok(personalIndex > hybridIndex);
  assert.match(homepage, /data-coaching-option-start="1"/);
  assert.match(homepage, /coaching-option-card coaching-option-card-featured[\s\S]*?<h3>Hybrid Coaching<\/h3>/);
  assert.match(homepage, /One in-person session per month/);
  assert.match(homepage, /In-person training per session/);
});

test("provides accessible deck controls without changing the questionnaire flow", () => {
  assert.match(homepage, /data-coaching-option-deck[\s\S]*?aria-roledescription="carousel"[\s\S]*?aria-label="Coaching options"[\s\S]*?tabindex="0"/);
  assert.match(homepage, /data-coaching-option-status aria-live="polite"/);
  assert.match(homepage, /data-coaching-option-previous aria-label="Previous coaching option"/);
  assert.match(homepage, /data-coaching-option-dots role="group" aria-label="Choose a coaching option"/);
  assert.match(homepage, /data-coaching-option-next aria-label="Next coaching option"/);
  assert.match(homepage, /href="questionnaire\.html">Start Questionnaire<\/a>/);

  const deckIndex = homepage.indexOf("data-coaching-option-deck");
  const footerIndex = homepage.indexOf("coaching-options-footer");
  assert.ok(footerIndex > deckIndex);
});

test("wraps the card deck and ignores short or vertical swipes", () => {
  assert.equal(wrapIndex(-1, 3), 2);
  assert.equal(wrapIndex(3, 3), 0);
  assert.equal(wrapIndex(1, 3), 1);
  assert.equal(swipeDirection(-80, 12), 1);
  assert.equal(swipeDirection(80, 12), -1);
  assert.equal(swipeDirection(30, 2), 0);
  assert.equal(swipeDirection(70, 90), 0);
});

test("synchronizes slide accessibility and supports every navigation method", () => {
  const syncSource = functionSource("setCoachingOptionDeckCard");
  const initializeSource = functionSource("initializeCoachingOptionDeck");

  assert.match(syncSource, /classList\.toggle\("is-current", isCurrent\)/);
  assert.match(syncSource, /setAttribute\("aria-hidden", isCurrent \? "false" : "true"\)/);
  assert.match(syncSource, /toggleAttribute\("inert", !isCurrent\)/);
  assert.match(syncSource, /setAttribute\("aria-pressed", isActive \? "true" : "false"\)/);
  assert.match(initializeSource, /aria-roledescription", "slide"/);
  assert.match(initializeSource, /data-coaching-option-dot/);
  assert.match(initializeSource, /previousButton\?\.addEventListener\("click"/);
  assert.match(initializeSource, /nextButton\?\.addEventListener\("click"/);
  assert.match(initializeSource, /ArrowLeft:[\s\S]*?ArrowRight:/);
  assert.match(initializeSource, /event\.key === "Home" \|\| event\.key === "End"/);
  assert.match(initializeSource, /"touchstart"/);
  assert.match(initializeSource, /"touchend"/);
  assert.match(initializeSource, /"touchcancel"/);
});

test("renders a layered, content-driven deck with mobile-safe controls", () => {
  assert.match(styles, /\.coaching-option-deck \{[\s\S]*?touch-action: pan-y;/);
  assert.match(styles, /\.coaching-option-deck\.is-enhanced \.coaching-option-grid \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);[\s\S]*?padding: 0 24px 24px 0;/);
  assert.match(styles, /\.coaching-option-deck\.is-enhanced \.coaching-option-card \{[\s\S]*?grid-area: 1 \/ 1;[\s\S]*?min-height: 0;/);
  assert.match(styles, /\.coaching-option-card\.is-deck-behind-1 \{[\s\S]*?translate\(12px, 12px\)/);
  assert.match(styles, /\.coaching-option-card\.is-deck-behind-2 \{[\s\S]*?translate\(24px, 24px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.coaching-option-deck\.is-enhanced \.coaching-option-card[\s\S]*?transition: none;/);
  assert.match(styles, /\.coaching-option-deck-dot \{[\s\S]*?min-height: 48px;/);
  assert.match(styles, /\.coaching-options \{[\s\S]*?padding: 34px 0 128px;/);
  assert.doesNotMatch(styles, /\.coaching-option-deck-stage \{[^}]*height:\s*\d/);
});

test("cache-busts the homepage deck assets", () => {
  assert.match(homepage, /css\/style\.css\?v=physical-card-decks-1/);
  assert.match(homepage, /js\/script\.js\?v=physical-card-decks-1/);
});
