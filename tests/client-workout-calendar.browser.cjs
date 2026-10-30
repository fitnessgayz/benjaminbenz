// Run: NODE_PATH=<runtime node_modules> node tests/client-workout-calendar.browser.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
      <body class="dashboard-page client-dashboard-page" style="margin:0;background:#101113;color:#fff;">
      <section id="client-workouts-panel" style="min-height:100vh;padding:12px 18px;"><button id="launch">Workout calendar</button></section>
      </body></html>`);
    for (const file of ['css/style.css', 'css/fwb-design-system.css', 'css/fwb-dark-theme.css',
      'css/client-workout-hub.css', 'css/client-light-theme.css', 'css/site-close-buttons.css',
      'css/client-workout-calendar.css']) {
      await page.addStyleTag({ content: fs.readFileSync(path.join(root, file), 'utf8') });
    }
    await page.addScriptTag({ path: path.join(root, 'js/client-workout-calendar.js') });
    await page.evaluate(() => {
      if (!crypto.randomUUID) Object.defineProperty(crypto, 'randomUUID', { value: () => `fixture-${Date.now()}-${Math.random()}` });
      const rows = [];
      const saved = [{ id: 'saved-1', user_id: 'user-1', is_deleted: false, title: 'Favorite day', plan_kind: 'session',
        plan: { title: 'Favorite day', exercises: [{ name: 'Bench Press', sets: 3 }] } }];
      window.__rows = rows;
      window.__opened = [];
      const client = { from(table) {
        return {
          select() {
            const filters = [];
            const result = () => ({ data: (table === 'client_workout_schedule' ? rows : saved)
              .filter(row => filters.every(([column, value]) => row[column] === value)), error: null });
            const query = { eq(column, value) { filters.push([column, value]); return query; },
              gte() { return query; }, lt() { return query; }, order() { return query; },
              limit() { return Promise.resolve(result()); }, then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); } };
            return query;
          },
          insert(value) {
            return { select() { return { single: async () => {
              const row = { ...value, is_deleted: false };
              rows.push(row);
              return { data: row, error: null };
            } }; } };
          },
          update(change) {
            let id;
            return { eq(column, value) { if (column === 'id') id = value; return this; },
              select() { return { single: async () => {
                const row = rows.find(item => item.id === id);
                if (!row) return { data: null, error: { message: 'Missing row' } };
                Object.assign(row, change);
                return { data: { id }, error: null };
              } }; } };
          }
        };
      } };
      window.__context = { client, userId: 'user-1', email: 'client@example.com',
        returnFocus: document.getElementById('launch'),
        getAssignedWorkouts: () => [{ programId: 'program-1', programTitle: 'Coach plan', index: 0,
          workout: { id: 'workout-1', title: 'Coach strength', exercises: [{ name: 'Squat', sets: 3 }] } }],
        onOpenWorkout(row, workout) { window.__opened.push({ row, workout }); return true; }
      };
      return window.FWB_CLIENT_WORKOUT_CALENDAR.open(window.__context);
    });
    assert.equal(await page.locator('.client-calendar-grid [data-calendar-date]').count(),
      new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate());
    assert.equal(await page.locator('.client-calendar-add').isVisible(), true);
    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    assert.equal(horizontalOverflow, false, 'calendar must fit a mobile viewport');
    if (process.env.CALENDAR_SCREENSHOT) await page.screenshot({ path: process.env.CALENDAR_SCREENSHOT, fullPage: true });

    await page.locator('[data-calendar-add]').click();
    assert.equal(await page.locator('[data-calendar-picker-close]').evaluate(node => Math.round(node.getBoundingClientRect().width)), 44);
    if (process.env.CALENDAR_PICKER_SCREENSHOT) await page.screenshot({ path: process.env.CALENDAR_PICKER_SCREENSHOT, fullPage: true });
    await page.locator('[data-calendar-choose="assigned:program-1:0"]').click();
    await page.locator('.client-calendar-workout').waitFor();
    assert.equal(await page.locator('.client-calendar-workout').count(), 1);
    assert.equal(await page.evaluate(() => window.__rows.length), 1);
    await page.locator('[data-calendar-open]').click();
    assert.equal(await page.evaluate(() => window.__opened[0].workout.title), 'Coach strength');
    assert.equal(await page.locator('#client-workouts-panel').evaluate(node => node.classList.contains('is-calendar-open')), false);

    await page.evaluate(() => window.FWB_CLIENT_WORKOUT_CALENDAR.open(window.__context));
    assert.equal(await page.locator('.client-calendar-workout').count(), 1,
      JSON.stringify(await page.evaluate(() => ({ rows: window.__rows, status: document.querySelector('[data-calendar-status]')?.textContent }))));
    page.once('dialog', dialog => dialog.accept());
    await page.locator('[data-calendar-remove]').click();
    await page.locator('.client-calendar-workout').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => window.__rows[0].is_deleted), true);
    assert.equal(await page.locator('.client-calendar-workout').count(), 0);

    await page.locator('[data-calendar-add]').click();
    await page.locator('[data-calendar-choose="saved:saved-1:0"]').click();
    await page.locator('.client-calendar-workout').waitFor();
    assert.equal(await page.evaluate(() => window.__rows.at(-1).source_type), 'generated');
    assert.equal(await page.locator('.client-calendar-workout').count(), 1);
    const currentMonth = await page.locator('.client-calendar-month h3').textContent();
    await page.locator('[data-calendar-next]').click();
    assert.notEqual(await page.locator('.client-calendar-month h3').textContent(), currentMonth);
    await page.locator('[data-calendar-prev]').click();
    assert.equal(await page.locator('.client-calendar-month h3').textContent(), currentMonth);
    assert.deepEqual(errors, []);
    console.log('Client workout calendar mobile browser flow passed.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
