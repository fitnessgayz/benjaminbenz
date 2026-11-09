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
var trainingLogs = [{ exercise_name: 'Leg Press' }], muscleMeta = {}, customWorkoutTitle = 'Custom Workout';
var addAttempts = 0, failAdd = false;
var exerciseNameMatcher = { normalizeName: value => String(value).trim().toLowerCase() };
function escapeHtml(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }
function customWorkoutExerciseAddConfig(format) { return { count: format === 'superset' ? 2 : format === 'circuit' ? 3 : 1, label: 'Add exercise', hint: '' }; }
function normalizeCustomWorkoutFormat(value) { return value || 'single'; }
function customWorkoutCarousels() { return []; }
function customWorkoutCarouselCards() { return []; }
function exerciseSuggestionRecords() { return [{ name: 'Leg Press', aliases: ['Leg Machine Press'], libraryEntry: { image_url: image, equipment: 'machine', primary_muscle: 'quads' } }]; }
function exerciseSuggestionMuscleLabel(entry) { return entry.primary_muscle; }
function customExerciseSuggestionMatches(query) { return exerciseSuggestionRecords().filter(record => record.name.toLowerCase().includes(query.toLowerCase())).map(record => ({ name: record.name, muscleLabel: 'Quads', libraryEntry: record.libraryEntry })); }
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
${production('customWorkoutPickerMatches')}
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
      await page.locator('#custom-workout-picker-search').evaluate(input => input.blur());
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
      await page.locator('.custom-workout-exercise-dialog').waitFor({ state: 'detached' });

      for (const [format, slots] of [['superset', 2], ['circuit', 3]]) {
        await page.evaluate((value) => {
          document.getElementById('panel').dataset.customWorkoutFormat = value;
          openCustomWorkoutExerciseDialog(document.getElementById('trigger'));
          const dialog = document.querySelector('.custom-workout-exercise-dialog');
          dialog.style.setProperty('--picker-viewport-height', '440px');
          dialog.classList.add('is-keyboard-open');
        }, format);
        assert.equal(await page.locator('#custom-workout-exercise-dialog-title').innerText(),
          format === 'superset' ? 'Superset' : 'Circuit');
        assert.equal(await page.locator('[data-workout-picker-submit]').innerText(), 'Add');
        assert.equal(await page.locator('[data-workout-picker-submit]').isDisabled(), true);
        assert.deepEqual(await page.locator('.custom-picker-slot').evaluateAll(items => items.map(item => ({
          label: item.textContent.trim(), repeatedNumber: Boolean(item.querySelector('.custom-picker-slot-letter'))
        }))), Array.from({ length: slots }, (_, index) => ({ label: `Exercise ${index + 1}`, repeatedNumber: false })));
        await page.locator('#custom-workout-picker-search').fill('Leg');
        await page.locator('[data-workout-picker-queue-typed]').waitFor({ state: 'visible' });
        const layout = await page.evaluate(() => {
          const dialog = document.querySelector('.custom-workout-exercise-dialog');
          const selected = dialog.querySelector('[data-workout-picker-selected-list]');
          const result = dialog.querySelector('[data-custom-exercise-suggestion]');
          const bottom = dialog.getBoundingClientRect().bottom;
          const search = dialog.querySelector('.custom-workout-picker-search-row').getBoundingClientRect();
          const filters = dialog.querySelector('.custom-picker-chips').getBoundingClientRect();
          return { slots: selected.children.length, selectedVisible: selected.getBoundingClientRect().height > 0,
            resultVisible: result.getBoundingClientRect().top < bottom && result.getBoundingClientRect().height > 0,
            searchBottom: search.bottom, filtersTop: filters.top, filtersBottom: filters.bottom,
            resultTop: result.getBoundingClientRect().top, bottom,
            scrollWidth: dialog.scrollWidth, clientWidth: dialog.clientWidth };
        });
        assert.equal(layout.slots, slots, `${format} must keep each named selection slot`);
        assert.ok(!layout.selectedVisible && layout.resultVisible, `${format} keeps results visible while condensing slots above the keyboard`);
        assert.ok(layout.searchBottom <= layout.filtersTop && layout.filtersBottom <= layout.resultTop,
          `${format} search, filters, and results follow the iOS picker order`);
        assert.ok(layout.scrollWidth <= layout.clientWidth + 1, `${format} picker must not overflow horizontally`);
        await page.evaluate(() => document.querySelector('.custom-workout-exercise-dialog').style.setProperty('--picker-viewport-height', '300px'));
        const typingLayout = await page.evaluate(() => {
          const dialog = document.querySelector('.custom-workout-exercise-dialog');
          const search = dialog.querySelector('.custom-workout-picker-search-row').getBoundingClientRect();
          const bounds = dialog.getBoundingClientRect();
          return { searchTop: search.top, searchBottom: search.bottom,
            dialogTop: bounds.top, dialogBottom: bounds.bottom };
        });
        assert.ok(typingLayout.searchTop >= typingLayout.dialogTop && typingLayout.searchBottom <= typingLayout.dialogBottom,
          `${format} search remains visible in a short keyboard viewport`);
        await page.evaluate(() => document.querySelector('.custom-workout-exercise-dialog').style.setProperty('--picker-viewport-height', '440px'));
        assert.equal(await page.locator('[data-custom-exercise-suggestion] .custom-picker-add').first().innerText(), '+',
          `${format} unselected exercise keeps its add control`);
        await page.locator('[data-custom-exercise-suggestion]').first().click();
        const selectedPill = await page.locator('[data-custom-exercise-suggestion][aria-selected="true"] .custom-picker-add').first().evaluate(pill => ({
          label: pill.textContent, background: getComputedStyle(pill).backgroundColor,
          color: getComputedStyle(pill).color, radius: getComputedStyle(pill).borderRadius
        }));
        assert.equal(selectedPill.label, 'Selected');
        assert.equal(selectedPill.background, 'rgb(255, 212, 0)');
        assert.equal(selectedPill.color, 'rgb(17, 17, 17)');
        assert.equal(selectedPill.radius, '999px');
        await page.locator('[data-picker-chip="chest"]').click();
        assert.equal(await page.locator('[data-custom-exercise-suggestion]').count(), 0,
          `${format} category filters can hide a selected exercise`);
        await page.locator('[data-picker-chip="recent"]').click();
        assert.equal(await page.locator('[data-custom-exercise-suggestion][aria-selected="true"] .custom-picker-add').innerText(), 'Selected',
          `${format} Recent restores the selected pill`);
        await page.locator('#custom-workout-picker-search').fill('Leg');
        await page.waitForFunction(() => document.querySelector('[data-workout-picker-results-label]')?.textContent === '1 result');
        assert.equal(await page.locator('[data-custom-exercise-suggestion][aria-selected="true"] .custom-picker-add').innerText(), 'Selected',
          `${format} the selected pill survives a new search`);
        await page.locator('[data-workout-picker-clear]').click();
        await page.waitForFunction(() => document.querySelector('[data-workout-picker-results-label]')?.textContent === 'Recent · 1');
        await page.locator('[data-picker-chip="all"]').click();
        assert.equal(await page.locator('[data-custom-exercise-suggestion][aria-selected="true"] .custom-picker-add').innerText(), 'Selected',
          `${format} clearing search and switching to All keeps the selection`);
        await page.locator('[data-custom-exercise-suggestion][aria-selected="true"]').click();
        assert.equal(await page.locator('.custom-workout-exercise-dialog').evaluate(dialog => dialog._pickerSelectedNames.length), 0,
          `${format} choosing an already selected exercise toggles it off instead of duplicating it`);
        await page.locator('[data-custom-exercise-suggestion]').first().click();
        assert.deepEqual(await page.locator('.custom-workout-exercise-dialog').evaluate(dialog => dialog._pickerSelectedNames), ['Leg Press'],
          `${format} the exercise can be reselected once without a duplicate slot`);
        for (const name of (format === 'superset' ? ['Cable Row'] : ['Cable Row', 'Push-Up'])) {
          await page.locator('#custom-workout-picker-search').fill(name);
          await page.locator('[data-workout-picker-queue-typed]').waitFor({ state: 'visible' });
          await page.locator('[data-workout-picker-queue-typed]').click();
        }
        const ready = await page.locator('[data-workout-picker-submit]').evaluate(button => ({
          disabled: button.disabled, visible: getComputedStyle(button).display !== 'none',
          background: getComputedStyle(button).backgroundColor,
          label: button.textContent
        }));
        assert.equal(ready.disabled, false, `${format} action becomes enabled once all slots are chosen`);
        assert.equal(ready.visible, true, `${format} action stays visible above the keyboard`);
        assert.equal(ready.background, 'rgb(255, 212, 0)', `${format} action is highlighted in gold`);
        assert.equal(ready.label, 'Add', `${format} uses a short inline action label`);
        const inline = await page.locator('.custom-workout-picker-selected').evaluate(selected => {
          const slots = selected.querySelector('[data-workout-picker-selected-list]').getBoundingClientRect();
          const button = selected.querySelector('[data-workout-picker-submit]').getBoundingClientRect();
          return { listRight: slots.right, buttonLeft: button.left,
            listMid: (slots.top + slots.bottom) / 2, buttonMid: (button.top + button.bottom) / 2,
            buttonRight: button.right, dialogRight: selected.closest('dialog').getBoundingClientRect().right };
        });
        assert.ok(inline.buttonLeft >= inline.listRight - 1 && inline.buttonRight <= inline.dialogRight,
          `${format} Add sits immediately beside the numbered exercises without overflow`);
        assert.ok(Math.abs(inline.buttonMid - inline.listMid) <= 2,
          `${format} Add aligns with its exercise slots`);
        await page.evaluate(() => {
          const dialog = document.querySelector('.custom-workout-exercise-dialog');
          dialog.classList.remove('is-keyboard-open');
          dialog.querySelector('#custom-workout-picker-search').blur();
        });
        assert.equal(await page.locator('[data-workout-picker-selected-list]').isVisible(), true,
          `${format} selected exercises return when the keyboard closes`);
        const titleAndSlots = await page.locator('.custom-workout-exercise-dialog').evaluate(dialog => {
          const header = dialog.querySelector('header').getBoundingClientRect();
          const selected = dialog.querySelector('.custom-workout-picker-selected').getBoundingClientRect();
          const search = dialog.querySelector('.custom-workout-picker-search-row').getBoundingClientRect();
          const prompt = dialog.querySelector('[data-workout-picker-prompt]').getBoundingClientRect();
          const count = dialog.querySelector('[data-workout-picker-selected-count]').getBoundingClientRect();
          return { gap: selected.top - header.bottom, selectedBottom: selected.bottom,
            searchTop: search.top, promptWidth: prompt.width, countWidth: count.width };
        });
        assert.ok(titleAndSlots.gap >= 0 && titleAndSlots.gap <= 20 && titleAndSlots.selectedBottom <= titleAndSlots.searchTop,
          `${format} selected exercises sit directly below the title`);
        assert.ok(titleAndSlots.promptWidth <= 1 && titleAndSlots.countWidth <= 1,
          `${format} no separate selected-count row appears`);
        if (process.env.MOBILE_PICKER_SCREENSHOT && width === 390 && format === 'circuit') {
          await page.screenshot({ path: process.env.MOBILE_PICKER_SCREENSHOT });
        }
        await page.locator('[data-close-exercise-dialog]').click();
        await page.locator('.custom-workout-exercise-dialog').waitFor({ state: 'detached' });
      }

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
      assert.equal(layout.fit, 'fill', 'Logs photo uses its natural dimensions while cropping to the photo panels');
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
