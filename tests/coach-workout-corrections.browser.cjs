// Isolated browser with mock workout records; no live client data is edited.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  try {
    for (const width of [320, 390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.setContent('<html><body class="dashboard-page coach-admin-page"><main><div class="training-log-controls"></div><p id="coach-weight-correction-status" role="status"></p><div id="training-log-history"></div></main></body></html>');
      await page.addStyleTag({ path: path.join(root, 'css/style.css') });
      await page.addStyleTag({ path: path.join(root, 'css/fwb-design-system.css') });
      await page.addStyleTag({ path: path.join(root, 'css/fwb-dark-theme.css') });
      await page.addStyleTag({ path: path.join(root, 'css/coach-workout-corrections.css') });
      await page.evaluate(() => {
        window.rows = [{ id: 'saved-id', client_email: 'client@example.com', entry_date: '2026-10-02', workout_title: 'Upper', exercise_code: 'A1', exercise_name: 'Bench press <img src=x onerror="window.xss=true">', set_number: 1, set_type: 'working', weight_used: 600, reps: 8, notes: 'Keep these notes', updated_at: '2026-10-02T10:00:00Z' }];
        window.requests = []; window.failSave = false;
        window.FWB_SUPABASE_CONFIG = { url: 'https://example.supabase.co', anonKey: 'test-key' };
        window.FWB_AUTH_SESSION = { storage: {} };
        window.supabase = { createClient: () => ({
          async rpc(name, params) {
            window.requests.push({ name, params });
            if (window.failSave) return { error: { message: 'This set changed. Refresh workout history.' } };
            window.rows[0] = { ...window.rows[0], weight_used: params.p_weight, updated_at: '2026-10-02T10:01:00Z' };
            return { data: 1 };
          },
          from() { return { select() { return this; }, ilike() { return this; }, order() { return this; }, async range() { return { data: window.rows }; } }; }
        }) };
      });
      await page.addScriptTag({ path: path.join(root, 'js/coach-workout-corrections.js') });
      const source = fs.readFileSync(path.join(root, 'js/coach-admin.js'), 'utf8').replace(/^bootCoachAdmin\(\);$/m, '').replace(/^bootCoachExerciseLibrary\(\);$/m, '');
      await page.addScriptTag({ content: source + '\nprograms=[{id:"client",client_email:"client@example.com"}]; selectedProgramId="client"; activeAdminTab="profile"; trainingLogs=window.rows; renderTrainingLogs(); handleCoachWorkoutWeightCorrections();' });
      await page.locator('[data-coach-correct-weight]').click();
      await page.locator('#coach-weight-input').fill('60.25');
      await page.locator('.coach-weight-dialog button[type=submit]').click();
      await page.waitForFunction(() => document.querySelector('#coach-weight-correction-status').textContent.includes('Weight corrected'));
      assert.match(await page.locator('#training-log-history').innerText(), /60\.25 lb/);
      assert.equal(await page.evaluate(() => window.rows[0].reps), 8);
      assert.equal(await page.evaluate(() => window.rows[0].notes), 'Keep these notes');
      await page.locator('[data-coach-correct-weight]').click();
      assert.equal(await page.locator('#coach-weight-input').inputValue(), '60.25');
      await page.evaluate(() => { window.failSave = true; });
      await page.locator('#coach-weight-input').fill('70');
      await page.locator('.coach-weight-dialog button[type=submit]').click();
      await page.waitForFunction(() => document.querySelector('[data-weight-error]').textContent.includes('set changed'));
      assert.equal(await page.locator('.coach-weight-dialog').isVisible(), true);
      assert.equal(await page.locator('#coach-weight-input').isEnabled(), true);
      assert.equal(await page.evaluate(() => window.rows[0].weight_used), 60.25);
      assert.equal(await page.evaluate(() => window.requests[1].params.p_expected_updated_at), '2026-10-02T10:01:00Z');
      const dialog = await page.locator('.coach-weight-dialog').boundingBox();
      assert.ok(dialog.x >= 0 && dialog.x + dialog.width <= width, JSON.stringify(dialog));
      assert.equal(await page.evaluate(() => Boolean(window.xss)), false);
      assert.deepEqual(errors, []);
      fs.mkdirSync('/private/tmp/fwb-weight-correction-browser', { recursive: true });
      await page.screenshot({ path: `/private/tmp/fwb-weight-correction-browser/${width}.png` });
      console.log(`${width}px: correction, preserved reps/notes, reopen, conflict, dark dialog, escape checks passed`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
