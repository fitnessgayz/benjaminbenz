// Production quick-workout markup and dashboard styles, with synthetic data only.
// NODE_PATH=<runtime node_modules> node tests/client-quick-workout-primary.browser.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const playwright = require('playwright');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/client-portal.js'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'client-dashboard.html'), 'utf8');
const styles = [...dashboard.matchAll(/<link[^>]+href="\/?(css\/[^"?]+)[^>]*>/g)]
  .map(match => fs.readFileSync(path.join(root, match[1]), 'utf8')).join('\n');
function production(name) {
  const match = new RegExp(`(?:async )?function ${name}\\(`).exec(source);
  assert.ok(match, `Missing ${name}`);
  const following = source.slice(match.index + match[0].length);
  const end = following.search(/\n(?:async )?function [\w$]+\(/);
  assert.ok(end >= 0, `Missing function boundary for ${name}`);
  return source.slice(match.index, match.index + match[0].length + end);
}
const functions = [
  'workoutStartControlMarkup', 'workoutActionsMarkup', 'customWorkoutGroupedRoundCardMarkup',
  'customWorkoutCarouselGroupMarkup', 'customWorkoutCarouselMarkup',
  'customWorkoutPanelMarkup', 'regroupCustomWorkoutCarousels', 'openCustomWorkoutSetupDialog', 'workoutLoggerSetupMarkup',
  'floatingWorkoutFinishMarkup', 'syncFloatingWorkoutFinishButtons', 'syncWorkoutStartButtons',
  'clientWorkoutChoiceContent', 'clientWorkoutChoiceDialogMarkup', 'clientWorkoutListMarkup', 'clientCoachingMembership',
  'clientPersonalTrainingAccess', 'currentClientPersonalTrainingAccess', 'allowedClientWorkoutHubSection', 'selectClientWorkoutHubSection',
  'exerciseMediaButtonMarkup', 'restTimerMarkup'
].map(production).join('\n');
const fixture = `
var activeCustomWorkoutFormat = 'single', workoutElapsedTimerState = null;
var customWorkoutFormats = { single: {label: 'Straight sets'}, superset: {label: 'Superset'}, circuit: {label: 'Circuit'} };
var customWorkoutTitle = 'Custom Workout', fixtureExercises = [];
var clientPreviewProgramSelected = false, clientAvailablePrograms = [], currentProgram = { workouts: [] };
var clientWorkoutHubSection = 'routines', activeDashboardUser = { email: 'athlete@example.test' };
function normalizeClientEmail(value) { return String(value || '').trim().toLowerCase(); }
function escapeHtml(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }
function todayDate() { return '2026-11-06'; }
function formatLogDate() { return 'Nov 6, 2026'; }
function activeCustomWorkoutDraft() { return null; }
function normalizeCustomWorkoutFormat(value) { return value; }
function normalizeCustomWorkoutInlineGroupType(value) { return value || 'single'; }
function customWorkoutExercises() { return fixtureExercises; }
function customWorkoutPanelHasEnteredExerciseContent(panel) { return Boolean(panel.querySelector('[data-custom-exercise-card]')); }
function customWorkoutCopyStatusMessage() { return ''; }
function syncCustomWorkoutExerciseControls() {}
function syncAutoRestTimerPreference() {}
function customWorkoutStorageTitle() { return 'Custom Workout'; }
function storedWorkoutGymLocation() { return 'Gym'; }
function workoutGymPickerMarkup() { return ''; }
function customWorkoutFormatPickerMarkup() { return ''; }
function workoutExerciseListMarkup() { return ''; }
function workoutCarouselExerciseCode(format, group, index) { return String(index + 1); }
function setCountFromPrescription() { return 1; }
function customWorkoutGroupNameEditorMarkup() { return ''; }
function customWorkoutCardMarkup(exercise) { return '<article data-custom-exercise-card><div data-exercise-log>' + escapeHtml(exercise.name) + '</div></article>'; }
function customWorkoutMixedGroups(exercises) { return exercises.map((exercise, index) => ({ index, startIndex: index, format: 'single', items: [exercise] })); }
function customWorkoutCarousels(panel) { return [...panel.querySelectorAll('[data-custom-workout-carousel]')]; }
function customWorkoutCarouselCards(carousel) { return carousel ? [...carousel.querySelectorAll('[data-custom-exercise-card]')] : []; }
const isCoachDashboardPreview = false;
function exerciseMedia() {
  return {
    imageUrl: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22320%22 height=%22200%22/%3E',
    motionUrl: 'https://example.test/leg-press.webp',
    demoUrl: '', instructions: ''
  };
}
function responsiveExerciseImageUrls(value) { return { fullUrl: value, thumbnailUrl: value }; }
function isBrandedExerciseImage() { return false; }
${functions}
function renderCase(format, names, active) {
  activeCustomWorkoutFormat = format;
  fixtureExercises = names.map((name, index) => ({ name, code: 'EX' + index, group: 0, prescription: '1 set' }));
  workoutElapsedTimerState = active ? { workoutTitle: 'Custom Workout', workoutDate: todayDate(), running: true } : null;
  document.querySelector('#client-workout-panels').innerHTML = customWorkoutPanelMarkup(0);
  const panel = document.querySelector('.client-workout-panel-custom');
  panel.hidden = false;
  panel.classList.add('is-active');
  syncWorkoutStartButtons();
}
function renderAssignedCase(active) {
  workoutElapsedTimerState = active ? { workoutTitle: 'Trainer Workout', workoutDate: todayDate(), running: true } : null;
  document.querySelector('#client-workout-panels').innerHTML = '<section class="client-workout-panel client-workout-panel-assigned is-active" data-custom-workout-title="Trainer Workout">'
    + workoutLoggerSetupMarkup(1, { gymName: 'Gym', format: 'superset' })
    + workoutStartControlMarkup('Trainer Workout')
    + floatingWorkoutFinishMarkup({ assigned: true }) + '</section>';
  syncWorkoutStartButtons();
}
`;

(async () => {
  const browserName = process.env.PLAYWRIGHT_BROWSER || 'chromium';
  const browser = await playwright[browserName].launch({ headless: true });
  try {
    for (const width of [320, 360, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      await page.route(/^https:\/\/workouts\.fixture\.test\/images\/gruntr\/workout-shortcuts\/(explore|previous|trainer|saved|calendar|personal-training)\.jpg$/, route => {
        const file = path.basename(new URL(route.request().url()).pathname);
        return route.fulfill({ path: path.join(root, 'images/gruntr/workout-shortcuts', file), contentType: 'image/jpeg' });
      });
      await page.setContent(`<!doctype html><html><head><base href="https://workouts.fixture.test/"/><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style></head><body class="dashboard-page client-dashboard-page"><nav class="client-dashboard-tabs" aria-label="FWB Training sections"><button>Home</button><button>Workouts</button></nav><button class="client-dashboard-mobile-nav-toggle">Navigation</button><section id="client-workouts-panel" class="is-compact-workout-log"><button data-compact-workout-later hidden>Finish later</button><div id="client-workout-panels"></div></section></body></html>`);
      await page.addScriptTag({ content: fixture });
      await page.addScriptTag({ path: path.join(root, "js/client-workout-routines.js") });
      await page.addScriptTag({ path: path.join(root, "js/client-workout-plans.js") });
      await page.addScriptTag({ path: path.join(root, "js/client-plate-calculator.js") });
      await page.evaluate(() => {
        const section = document.getElementById('client-workouts-panel');
        section.classList.add('is-choosing-workout');
        section.insertAdjacentHTML('afterbegin', clientWorkoutListMarkup([]));
      });
      const selectedTab = await page.getByRole('tab', { name: 'Routines' }).evaluate(button => {
        const style = getComputedStyle(button);
        return { radius: style.borderRadius, fill: style.backgroundColor };
      });
      assert.deepEqual(selectedTab, {
        radius: '11px', fill: 'rgb(255, 212, 0)'
      }, 'Selected Workout section has a gold rounded tab');
      const routines = page.locator('#workout-hub-routines');
      assert.equal(await routines.getByRole('button', { name: 'Mobility', exact: true }).count(), 0);
      const previous = routines.getByRole('button', { name: 'Previous Workout' });
      const explore = routines.getByRole('button', { name: 'Explore Routines' });
      const planned = routines.getByRole('button', { name: 'Plan Your Routine' });
      const start = routines.getByRole('button', { name: 'Start Workout' });
      const [startRect, plannedRect, previousRect, exploreRect] = await Promise.all([start.boundingBox(), planned.boundingBox(), previous.boundingBox(), explore.boundingBox()]);
      assert.ok(Math.abs(startRect.y - plannedRect.y) < 2 && plannedRect.x > startRect.x, 'Start and Plan share the first tile row');
      assert.ok(Math.abs(previousRect.y - exploreRect.y) < 2 && previousRect.x > exploreRect.x, 'Explore and Previous share the next tile row');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Workout hub fits the viewport');
      const assertTile = async shortcut => {
        assert.ok(await shortcut.locator('.workout-choice-title').isVisible(), 'Shortcut retains a visible title');
        assert.equal(await shortcut.locator('img.workout-choice-cover').count(), 0, 'Centered tiles use icons without cover art');
        const iconRect = await shortcut.locator('.workout-choice-icon').boundingBox();
        const titleRect = await shortcut.locator('.workout-choice-title').boundingBox();
        const tileRect = await shortcut.boundingBox();
        assert.ok(tileRect.height >= 94 && titleRect.y >= iconRect.y + iconRect.height,
          'Icon and title stack inside a large tile');
        assert.ok(Math.abs((iconRect.x + iconRect.width / 2) - (tileRect.x + tileRect.width / 2)) < 3,
          'Icon is centered in its tile');
        for (const theme of ['dark', 'light']) {
          assert.ok(await shortcut.evaluate((button, value) => {
            document.documentElement.dataset.clientTheme = value;
            const style = getComputedStyle(button);
            return style.borderTopWidth === '1px' && style.borderTopStyle === 'solid' && style.borderTopColor !== 'rgba(0, 0, 0, 0)';
          }, theme), `The shortcut border stays visible in ${theme} mode`);
        }
        await page.evaluate(() => { delete document.documentElement.dataset.clientTheme; });
      };
      await assertTile(start);
      await assertTile(planned);
      await assertTile(explore);
      await assertTile(previous);
      await start.focus();
      const nextControl = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
      await page.keyboard.press(nextControl);
      assert.ok(await planned.evaluate(button => document.activeElement === button && getComputedStyle(button).outlineWidth === '2px'));
      await page.keyboard.press(nextControl);
      assert.ok(await explore.evaluate(button => document.activeElement === button));
      await page.evaluate(() => selectClientWorkoutHubSection('trainer'));
      const trainer = page.locator('#workout-hub-trainer');
      await assertTile(trainer.getByRole('button', { name: 'Start with GRUNTR Trainer' }));
      await assertTile(trainer.getByRole('button', { name: 'Saved FWB Workout' }));
      await assertTile(trainer.getByRole('button', { name: 'Workout Calendar' }));
      await page.evaluate(() => {
        clientAvailablePrograms = [{ id: 'plan', active: true, client_email: activeDashboardUser.email,
          membership_type: 'personal_training', program_title: 'Strength', workouts: [{}] }];
        document.querySelector('.client-workout-hub').remove();
        document.querySelector('[data-client-workout-choice-dialog]').remove();
        document.getElementById('client-workouts-panel').insertAdjacentHTML('afterbegin', clientWorkoutListMarkup([]));
        selectClientWorkoutHubSection('trainer');
      });
      await assertTile(page.getByRole('button', { name: 'Trainer Program' }));
      await page.evaluate(() => selectClientWorkoutHubSection('routines'));
      assert.equal(await start.locator('.workout-choice-title').evaluate(button => getComputedStyle(button).color), 'rgb(255, 212, 0)', 'Start title uses gold');
      assert.equal(await page.getByText('Benjamin’s Routine', { exact: true }).count(), 1);
      await page.evaluate(() => {
        window.FWB_WORKOUT_GENERATOR = {
          EQUIPMENT_OPTIONS: [{value: 'full_gym', label: 'Full gym'}],
          generate: ({intensity, minutes}) => ({intensity, estimatedMinutes: minutes, exercises: [{name: 'Goblet Squat', sets: 3}]})
        };
        return window.FWB_CLIENT_WORKOUT_PLANS.open('generate', {});
      });
      await page.getByLabel('Fitness experience').selectOption('beginner');
      await page.getByLabel('Current body weight').fill('160');
      await page.getByRole('button', { name: 'Continue' }).click();
      await page.getByLabel('Add cardio?').selectOption('before');
      await page.getByRole('button', { name: 'Continue' }).click();
      await page.getByRole('button', { name: 'Preview my plan' }).click();
      assert.equal(await page.locator('[data-plan-preview] article').count(), 0, 'Health terms are required');
      await page.getByLabel('I have read and accept the health terms.').check();
      await page.getByRole('button', { name: 'Preview my plan' }).click();
      assert.equal(await page.locator('[data-plan-preview]').getByText('Cardio before lifting').count(), 1);
      assert.equal(await page.locator('[data-plan-preview]').getByText('Current body weight: 160 lb').count(), 1);
      await page.locator('[data-plan-close]').click();
      await page.evaluate(() => {
        const section = document.getElementById('client-workouts-panel');
        section.classList.remove('is-choosing-workout');
        section.querySelector('.client-workout-hub').remove();
      });
      await page.evaluate(() => {
        renderCase('single', [], false);
        openCustomWorkoutSetupDialog(document.querySelector('[data-custom-workout-setup-open="settings"]'));
      });
      const workoutSettings = page.getByRole('dialog', { name: 'Workout Settings' });
      await workoutSettings.getByText('Plate Calculator', { exact: true }).click();
      const plateResult = workoutSettings.locator('[data-plate-result]');
      await plateResult.waitFor();
      assert.equal(await plateResult.textContent(), 'Exact load 135 lb. Per side: 1 × 45 lb.');
      await workoutSettings.getByLabel('Target weight (lb)', { exact: true }).fill('137.5');
      assert.match(await plateResult.textContent(), /Nearest available load 135 lb/);
      await workoutSettings.getByLabel('Weight unit').selectOption('kg');
      await workoutSettings.getByRole('button', { name: '80 kg', exact: true }).click();
      await workoutSettings.getByLabel('20 kg pairs', { exact: true }).fill('0');
      assert.equal(await plateResult.textContent(), 'Exact load 80 kg. Per side: 1 × 25 kg + 1 × 5 kg.');
      await page.evaluate(() => document.querySelector('[data-custom-workout-setup-dialog]').close());
      for (const [format, names] of [
        ['single', []], ['superset', []], ['circuit', []], ['single', ['Leg Press']],
        ['superset', ['Leg Press', 'Chest Press']],
        ['circuit', ['Leg Press', 'Chest Press', 'Cable Row']]
      ]) {
        await page.evaluate(([f, n]) => renderCase(f, n, false), [format, names]);
        if (names.length === 0) {
          await page.evaluate(() => regroupCustomWorkoutCarousels(document.querySelector('.client-workout-panel-custom')));
          assert.equal(await page.locator('.client-workout-panel-custom [data-custom-workout-carousel]').count(), 0,
            `${format} must not show a blank exercise group before a choice`);
          assert.equal(await page.locator('.client-workout-panel-custom [data-custom-workout-launcher-add]').isVisible(), true,
            `${format} must show Add first exercise`);
        }
        const primary = page.locator('.client-workout-panel-custom [data-workout-start]');
        assert.equal(await primary.innerText(), 'Start workout', `${format} initial label`);
        assert.equal(await primary.isVisible(), false, `${format} top Start hidden on mobile`);
        assert.equal(await page.locator('[data-floating-workout-start-action]').isVisible(), false,
          `${format} has no second workout Start control`);
        assert.equal(await page.locator('.client-dashboard-tabs').isVisible(), false,
          `${format} logger setup hides the navigation bar`);
        assert.equal(await page.locator('[data-floating-workout-reset-action]').isVisible(), names.length > 0,
          `${format} Discard appears as soon as exercises are chosen`);
        assert.equal(await page.locator('[data-floating-workout-finish-action]').isVisible(), names.length > 0,
          `${format} Finish appears before logging sets`);
        assert.equal(await page.locator('[data-floating-workout-more]').isVisible(), false,
          `${format} More hidden until workout starts`);
        const setupChips = page.locator('.custom-workout-setup-summary > button');
        assert.equal(await setupChips.count(), 3);
        const dimensions = await setupChips.evaluateAll(chips => chips.map(chip => Math.round(chip.getBoundingClientRect().width)));
        assert.equal(dimensions[0], dimensions[1], 'Gym and workout format are equal width');
        assert.equal(dimensions[2], 44, 'Settings is a 44px tap target');
        assert.equal(await page.locator('.client-workout-panel-custom [data-custom-workout-default-finish] .workout-finish-button').isVisible(), false,
          `${format} legacy Finish hidden`);
        assert.equal(await page.locator('.client-workout-panel-custom [data-workout-finish-later]').filter({ visible: true }).count(), 0,
          `${format} legacy Finish later hidden`);
        const grouped = page.locator('.client-workout-panel-custom .custom-workout-grouped-actions');
        if (await grouped.count()) assert.equal(await grouped.isVisible(), false, `${format} grouped footer hidden`);
        await page.evaluate(([f, n]) => renderCase(f, n, true), [format, names]);
        assert.equal(await primary.innerText(), 'Finish workout', `${format} active label`);
        assert.equal(await page.locator('[data-floating-workout-finish-action]').isVisible(), true,
          `${format} floating Finish visible`);
        assert.equal(await page.locator('.client-dashboard-tabs').isVisible(), false,
          `${format} logger hides the navigation bar`);
        assert.equal(await page.locator('.client-dashboard-mobile-nav-toggle').isVisible(), false,
          `${format} logger hides the mobile navigation control`);
        assert.ok(await page.locator('.workout-floating-finish').evaluate(bar =>
          innerHeight - bar.getBoundingClientRect().bottom <= 12),
        `${format} save action moves to the bottom of the viewport`);
        assert.equal(await page.locator('[data-floating-workout-reset-action]').isVisible(), true,
          `${format} Discard is a direct button`);
        assert.equal(await page.locator('[data-floating-workout-reset-action]').getAttribute('aria-label'), 'Discard workout');
        assert.equal(await page.locator('[data-floating-workout-more]').isVisible(), false,
          `${format} has no duplicate More action`);
      }
      await page.evaluate(() => {
        const panel = document.querySelector('#client-workout-panels .client-workout-panel-custom');
        panel.insertAdjacentHTML('beforeend', '<article class="ios-log-exercise-card"><div class="ios-log-exercise-controls"><label class="ios-log-rest-control"><span>Rest</span><select aria-label="Rest duration"><option>Use workout default</option><option selected>Off</option><option>90s</option></select></label><button type="button">Note</button></div></article>');
      });
      const restControl = page.locator('.ios-log-rest-control');
      assert.equal(await restControl.evaluate(label => {
        const text = label.querySelector('span');
        const select = label.querySelector('select');
        const range = document.createRange();
        range.selectNodeContents(text);
        const [line] = range.getClientRects();
        return range.getClientRects().length === 1 && line.right <= select.getBoundingClientRect().left + .5
          && select.getBoundingClientRect().right <= label.getBoundingClientRect().right + .5;
      }), true, 'Rest fits on one line next to the timer selector');
      await page.evaluate(() => {
        const panel = document.querySelector('#client-workout-panels .client-workout-panel-custom');
        panel.insertAdjacentHTML('beforeend', '<section data-custom-workout-grouped="true"><div class="ios-log-exercise-image">'
          + exerciseMediaButtonMarkup({ name: 'Leg Press' }, { compact: true, inlineMotion: true }) + '</div></section>');
      });
      const play = page.getByRole('button', { name: 'Play animation for Leg Press' });
      const overlay = await play.evaluate(button => {
        const buttonBox = button.getBoundingClientRect();
        const artBox = button.parentElement.getBoundingClientRect();
        return {
          width: buttonBox.width, height: buttonBox.height,
          bottomInset: artBox.bottom - buttonBox.bottom, rightInset: artBox.right - buttonBox.right,
          radius: getComputedStyle(button).borderRadius
        };
      });
      assert.deepEqual(overlay, { width: 44, height: 44, bottomInset: 8, rightInset: 8, radius: '50%' },
        'Exercise animation plays from a round button in the bottom right of the artwork');
      await page.evaluate(() => {
        document.body.insertAdjacentHTML('beforeend', restTimerMarkup());
        document.querySelector('[data-rest-timer-overlay]').hidden = false;
      });
      for (const theme of ['dark', 'light']) {
        assert.ok(await page.locator('[data-rest-timer-display]').evaluate((digits, theme) => {
          document.documentElement.dataset.clientTheme = theme;
          const luminance = color => color.match(/[\d.]+/g).slice(0, 3).reduce((total, component, index) => {
            const channel = Number(component) / 255;
            const linear = channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
            return total + linear * [.2126, .7152, .0722][index];
          }, 0);
          const fg = luminance(getComputedStyle(digits).color);
          const bg = luminance(getComputedStyle(digits.closest('.rest-timer-sheet')).backgroundColor);
          return (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05) >= 4.5;
        }, theme), `Rest timer digits stay readable on the ${theme} theme`);
      }
      await page.evaluate(() => {
        delete document.documentElement.dataset.clientTheme;
        document.querySelector('[data-rest-timer-overlay]').remove();
      });
      for (const active of [false, true]) {
        await page.evaluate(active => renderAssignedCase(active), active);
        assert.equal(await page.locator('.client-workout-panel-assigned > .workout-start-control').isVisible(), false,
          'trainer Start control is replaced by the floating bar on mobile');
        assert.equal(await page.locator('[data-floating-workout-start-action]').isVisible(), false,
          'trainer has no floating Start');
        assert.equal(await page.locator('[data-floating-workout-finish-action]').isVisible(), true,
          'trainer floating Finish is available before logging sets');
        assert.equal(await page.locator('.client-dashboard-tabs').isVisible(), false,
          'trainer logger keeps navigation hidden before and after Start');
        assert.equal(await page.locator('[data-floating-workout-more]').count(), 0,
          'trainer has no duplicate reset menu');
        assert.equal(await page.locator('[data-floating-workout-reset-action]').getAttribute('aria-label'), 'Discard workout');
        assert.equal(await page.locator('[data-workout-date]').isVisible(), false, 'trainer date is stored without a visible field');
        if (active) {
          assert.equal(await page.locator('[data-reset-assigned-workout]').isVisible(), true,
            'trainer Discard is a direct button');
          await page.evaluate(() => openCustomWorkoutSetupDialog(document.querySelector('[data-custom-workout-setup-open="settings"]')));
          await workoutSettings.getByText('Plate Calculator', { exact: true }).click();
          assert.equal(await plateResult.textContent(), 'Exact load 135 lb. Per side: 1 × 45 lb.');
          await page.evaluate(() => document.querySelector('[data-custom-workout-setup-dialog]').close());
        }
      }
      await page.evaluate(() => {
        document.querySelector('.workout-floating-finish').hidden = true;
        document.getElementById('client-workouts-panel').classList.remove('is-compact-workout-log');
      });
      assert.equal(await page.locator('.client-dashboard-tabs').isVisible(), true,
        'navigation returns when the client backs out to the workout picker');
      await page.evaluate(() => { document.getElementById('client-workouts-panel').hidden = true; });
      assert.equal(await page.locator('.client-dashboard-tabs').isVisible(), true,
        'navigation returns when the client leaves the workout logger');
      await page.close();
      process.stdout.write(`${browserName} ${width}px: quick and trainer floating actions passed\n`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
