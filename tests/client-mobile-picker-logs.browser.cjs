// NODE_PATH=/Users/benjamingonzales/.local/lib/node_modules node tests/client-mobile-picker-logs.browser.cjs
// PLAYWRIGHT_BROWSER=webkit runs the same checks with Safari's engine.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/client-portal.js'), 'utf8');
const styles = ['custom-workout-mobile-fix.css', 'client-home-logs-preview.css',
  'client-picker-approved.css', 'client-logs-compact.css']
  .map(file => fs.readFileSync(path.join(root, 'css', file), 'utf8')).join('\n');
function production(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}`);
  const next = source.slice(start + 1).search(/\n(?:async )?function [\w$]+\(/);
  assert.ok(next >= 0, `Missing function boundary after ${name}`);
  return source.slice(start, start + next + 1);
}
assert.match(source, /client-logs-detail-primary-actions[^\n]+\n\s*\$\{appleWorkoutMarkup\}\$\{detailsHtml\}/,
  'Share and Copy actions must render before Apple Workout and exercise details');

const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="100"><rect width="240" height="100" fill="white"/><rect width="100" height="100" fill="red"/><rect x="100" width="100" height="100" fill="blue"/></svg>');
const fixture = `
const image = ${JSON.stringify(image)};
var trainingLogs = [], muscleMeta = {}, customWorkoutTitle = 'Custom Workout';
var addAttempts = 0, failAdd = false;
function escapeHtml(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }
function customWorkoutExerciseAddConfig() { return { count: 1, label: 'Add exercise', hint: '' }; }
function normalizeCustomWorkoutFormat(value) { return value || 'single'; }
function customWorkoutCarousels() { return []; }
function customWorkoutCarouselCards() { return []; }
function customWorkoutPickerMatches() { return [{ name: 'Leg Press', muscleLabel: 'Quads', libraryEntry: { image_url: image } }]; }
function trustedExerciseImageUrl(value) { return value; }
function responsiveExerciseImageUrls(value) { return { thumbnailUrl: value }; }
function addCustomWorkoutPickedExercise(panel, name) {
  addAttempts++;
  if (failAdd) return null;
  const card = document.createElement('article');
  card.setAttribute('data-custom-exercise-card', '');
  card.textContent = name;
  panel.append(card);
  localStorage.setItem('test-workout-draft', name);
  return card;
}
function notifyCoachAboutCustomExercises() {}
function openCustomWorkoutExerciseEditor() {}
${production('renderCustomWorkoutPickerResults')}
${production('openCustomWorkoutExerciseDialog')}
`;

(async () => {
  const browserName = process.env.PLAYWRIGHT_BROWSER || 'chromium';
  const engine = { chromium, webkit }[browserName];
  assert.ok(engine, `Unsupported browser ${browserName}`);
  const browser = await engine.launch({ headless: true });
  try {
    for (const width of [360, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      await page.route('https://fixture.test/', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style></head><body class="dashboard-page client-dashboard-page"><section id="panel" class="client-workout-panel-custom" data-custom-workout-format="single"><button id="trigger" data-pick-custom-exercise>Add first exercise</button></section></body></html>` }));
      await page.goto('https://fixture.test/');
      await page.addScriptTag({ content: fixture });
      await page.evaluate(() => openCustomWorkoutExerciseDialog(document.getElementById('trigger')));
      await page.locator('[data-custom-exercise-suggestion]').first().click();
      assert.equal(await page.evaluate(() => addAttempts), 0, 'Choosing a result must only stage it');
      assert.equal(await page.locator('#custom-workout-picker-search').inputValue(), 'Leg Press');
      const pickerImage = await page.locator('.custom-picker-image img').evaluate(img => ({ fit: getComputedStyle(img).objectFit, width: img.getBoundingClientRect().width, height: img.getBoundingClientRect().height }));
      assert.equal(pickerImage.fit, 'contain', 'Guide thumbnail must keep its full aspect ratio');
      assert.ok(pickerImage.width > pickerImage.height, 'Guide thumbnail frame must be landscape');
      await page.locator('.custom-workout-exercise-dialog button[type="submit"]').click();
      await page.locator('.custom-workout-exercise-dialog').waitFor({ state: 'detached' });
      assert.equal(await page.locator('.custom-workout-exercise-dialog').count(), 0, 'Picker closes after a successful add');
      assert.equal(await page.locator('[data-custom-exercise-card]').innerText(), 'Leg Press');
      assert.equal(await page.evaluate(() => localStorage.getItem('test-workout-draft')), 'Leg Press');

      await page.evaluate(() => { failAdd = true; openCustomWorkoutExerciseDialog(document.getElementById('trigger')); });
      await page.locator('[data-custom-exercise-suggestion]').first().click();
      await page.locator('.custom-workout-exercise-dialog button[type="submit"]').click();
      assert.equal(await page.locator('.custom-workout-exercise-dialog').count(), 1, 'Picker stays open when add fails');
      assert.equal(await page.locator('[data-workout-picker-error]').isVisible(), true);
      await page.locator('[data-close-exercise-dialog]').click();

      await page.evaluate((src) => {
        document.body.innerHTML = `<div class="training-log-history-card-details"><div class="client-logs-detail-actions client-logs-detail-primary-actions"><button>Share workout</button><button>Copy workout</button></div><div class="apple-workout-empty"><button>+ Add Apple Workout</button></div><article class="training-log-row-nested"><div class="training-log-exercise-head"><span class="training-log-exercise-image"><button class="exercise-media-button exercise-media-button-branded-crop"><img src="${src}" alt=""></button></span><strong>Leg Press</strong></div></article></div>`;
      }, image);
      const layout = await page.evaluate(() => {
        const photo = document.querySelector('.training-log-exercise-image');
        const img = photo.querySelector('img');
        const head = photo.closest('.training-log-exercise-head');
        return { photoWidth: photo.getBoundingClientRect().width, columnWidth: parseFloat(getComputedStyle(head).gridTemplateColumns), fit: getComputedStyle(img).objectFit, imgPosition: getComputedStyle(img).position, scrollWidth: document.documentElement.scrollWidth };
      });
      assert.equal(layout.photoWidth, layout.columnWidth, 'Photo frame must fit its grid column');
      assert.equal(layout.fit, 'contain', 'Logs photo must preserve its full aspect ratio');
      assert.equal(layout.imgPosition, 'static', 'Branded photo crop must not distort Logs detail');
      assert.ok(layout.scrollWidth <= width + 1, 'Detail must not overflow the viewport');
      await page.close();
      process.stdout.write(`${browserName} ${width}px: picker selection, failure, persistence, photo layout passed\n`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
