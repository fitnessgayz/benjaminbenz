// NODE_PATH=/Users/benjamingonzales/.local/lib/node_modules node tests/client-mobile-picker-logs.browser.cjs
// PLAYWRIGHT_BROWSER=webkit runs the same checks with Safari's engine.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/client-portal.js'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'client-dashboard.html'), 'utf8');
const styles = [...dashboard.matchAll(/<link[^>]+href="\/?(css\/[^"?]+)[^>]*>/g)]
  .map(match => fs.readFileSync(path.join(root, match[1]), 'utf8')).join('\n');
function production(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}`);
  const next = source.slice(start + 1).search(/\n(?:async )?function [\w$]+\(/);
  assert.ok(next >= 0, `Missing function boundary after ${name}`);
  return source.slice(start, start + next + 1);
}
assert.match(source, /client-logs-detail-primary-actions[^\n]+\n\s*\$\{appleWorkoutMarkup\}\$\{detailsHtml\}/,
  'Share and Copy actions must render before Apple Workout and exercise details');

const imagePath = path.join(root,
  'supabase/storage-assets/exercise-images/approved/2026-10-05/webp-480/45-degree-glute-hip-drive.webp');
const image = 'https://fixture.test/exercise-images/approved/2026-10-05/webp-480/45-degree-glute-hip-drive.webp';
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
${production('isBrandedExerciseImage')}
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
      await page.route('https://fixture.test/exercise-images/**', route => route.fulfill({ contentType: 'image/webp', body: fs.readFileSync(imagePath) }));
      await page.route('https://fixture.test/', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style></head><body class="dashboard-page client-dashboard-page"><section id="panel" class="client-workout-panel-custom" data-custom-workout-format="single"><button id="trigger" data-pick-custom-exercise>Add first exercise</button></section></body></html>` }));
      await page.goto('https://fixture.test/');
      await page.addScriptTag({ content: fixture });
      await page.evaluate(() => openCustomWorkoutExerciseDialog(document.getElementById('trigger')));
      await page.locator('[data-custom-exercise-suggestion]').first().click();
      assert.equal(await page.evaluate(() => addAttempts), 0, 'Choosing a result must only stage it');
      assert.equal(await page.locator('#custom-workout-picker-search').inputValue(), 'Leg Press');
      await page.locator('.custom-picker-image img').evaluate(img => img.decode());
      const pickerImage = await page.locator('.custom-picker-image img').evaluate(img => ({
        fit: getComputedStyle(img).objectFit,
        width: img.getBoundingClientRect().width,
        frameWidth: img.parentElement.getBoundingClientRect().width,
        left: img.getBoundingClientRect().left - img.parentElement.getBoundingClientRect().left,
        top: img.getBoundingClientRect().top - img.parentElement.getBoundingClientRect().top,
        branded: img.parentElement.classList.contains('is-branded')
      }));
      assert.equal(pickerImage.branded, true);
      assert.equal(pickerImage.fit, 'fill');
      assert.ok(pickerImage.width > pickerImage.frameWidth * 2.5, 'Branded thumbnail crops away its text panel');
      assert.ok(pickerImage.left < 0 && pickerImage.top < 0, 'Branded thumbnail trims its white edge');
      assert.deepEqual(await page.locator('[data-picker-chip]').evaluateAll(chips => chips.slice(0, 2).map(chip => chip.dataset.pickerChip)), ['recent', 'all']);
      await page.locator('#custom-workout-picker-search').focus();
      const focus = await page.locator('#custom-workout-picker-search').evaluate(input => ({
        outline: getComputedStyle(input).outlineStyle,
        rowShadow: getComputedStyle(input.parentElement).boxShadow
      }));
      assert.equal(focus.outline, 'none');
      assert.match(focus.rowShadow, /rgb\(255, 212, 0\)/);
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
        document.body.innerHTML = `<section data-client-dashboard-panel="logs"><div class="client-logs-tabs"><button>Workouts</button><button>Exercises</button><button>Health</button></div><p class="training-log-download-status"></p><div class="client-workout-import-preview" hidden></div><p id="client-workout-import-status"></p><p class="training-log-copy-status"></p><div id="client-logs-workouts"><section class="client-saved-log-calendar"><strong>November 2026</strong></section></div><div class="training-log-history-card-details"><div class="client-logs-detail-actions client-logs-detail-primary-actions"><button class="training-log-share-button" data-share-workout-history>Share workout</button><button class="training-log-copy-button">Copy workout</button></div><div class="apple-workout-empty"><button>+ Add Apple Workout</button></div><article class="training-log-row-nested"><div class="training-log-exercise-head"><span class="training-log-exercise-image"><button class="exercise-media-button exercise-media-button-branded-crop"><img src="${src}" alt=""></button></span><strong>Leg Press</strong></div></article></div></section>`;
        document.getElementById('client-logs-workouts').insertAdjacentHTML('beforeend',
          '<article class="client-logs-session is-custom-workout"><button class="client-logs-session-open"><span class="client-logs-session-copy"><strong>Custom Workout</strong></span></button></article>' +
          '<article class="client-logs-session client-logs-health-session"><div class="client-logs-session-open"><span class="client-logs-session-copy"><strong>♥ Cycling</strong></span></div></article>');
      }, image);
      const titleColors = await page.locator('.client-logs-session-copy strong').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).color));
      assert.deepEqual(titleColors, ['rgb(90, 169, 232)', 'rgb(247, 243, 233)']);
      await page.locator('.training-log-exercise-image img').evaluate(img => img.decode());
      const layout = await page.evaluate(() => {
        const photo = document.querySelector('.training-log-exercise-image');
        const img = photo.querySelector('img');
        const head = photo.closest('.training-log-exercise-head');
        const tabs = document.querySelector('.client-logs-tabs');
        const calendar = document.querySelector('.client-saved-log-calendar');
        const imgBounds = img.getBoundingClientRect();
        return { photoWidth: photo.getBoundingClientRect().width, photoHeight: photo.getBoundingClientRect().height,
          imageWidth: imgBounds.width, imageHeight: imgBounds.height, naturalRatio: img.naturalWidth / img.naturalHeight,
          columnWidth: parseFloat(getComputedStyle(head).gridTemplateColumns), fit: getComputedStyle(img).objectFit,
          imgPosition: getComputedStyle(img).position, gap: calendar.getBoundingClientRect().top - tabs.getBoundingClientRect().bottom,
          scrollWidth: document.documentElement.scrollWidth };
      });
      assert.equal(layout.photoWidth, layout.columnWidth, 'Photo frame must fit its grid column');
      assert.equal(layout.fit, 'contain', 'Logs photo must preserve its full aspect ratio');
      assert.equal(layout.imgPosition, 'absolute', 'Logs should frame the photo panels of a branded card');
      assert.ok(layout.imageWidth > layout.photoWidth && layout.imageHeight >= layout.photoHeight - 1,
        'Branded photo panels should fill the Logs thumbnail');
      assert.ok(Math.abs(layout.imageWidth / layout.imageHeight - layout.naturalRatio) < 0.02,
        'Logs thumbnail must not stretch the source image');
      assert.ok(layout.gap <= 32, `Empty status fields must not leave a Logs gap (${layout.gap}px)`);
      assert.ok(layout.scrollWidth <= width + 1, 'Detail must not overflow the viewport');
      const actions = await page.locator('.client-logs-detail-primary-actions > button').evaluateAll(buttons => buttons.map(button => {
        const style = getComputedStyle(button);
        const rect = button.getBoundingClientRect();
        return { width: rect.width, height: rect.height, fontFamily: style.fontFamily,
          fontSize: style.fontSize, fontWeight: style.fontWeight, lineHeight: style.lineHeight,
          color: style.color, background: style.backgroundColor, borderColor: style.borderTopColor };
      }));
      assert.equal(actions.length, 2);
      assert.deepEqual(actions[0], actions[1], 'Share and Copy workout buttons should look the same');
      if (process.env.MOBILE_WEB_SCREENSHOT && width === 390) {
        await page.screenshot({ path: process.env.MOBILE_WEB_SCREENSHOT, fullPage: true });
      }
      await page.close();
      process.stdout.write(`${browserName} ${width}px: picker selection, failure, persistence, photo layout passed\n`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
