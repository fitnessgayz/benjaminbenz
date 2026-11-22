// NODE_PATH=/Users/benjamingonzales/.local/lib/node_modules node tests/android-workout-zoom.browser.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');

const root = path.join(__dirname, '..');
const dashboard = fs.readFileSync(path.join(root, 'client-dashboard.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'js/client-portal.js'), 'utf8');
const styles = [...dashboard.matchAll(/<link[^>]+href="\/?(css\/[^"?]+)[^>]*>/g)]
  .map(match => fs.readFileSync(path.join(root, match[1]), 'utf8')).join('\n');
const groupStart = source.indexOf('function customWorkoutGroupedRoundCardMarkup(');
const groupEnd = source.indexOf('\nfunction ', groupStart + 1);
assert.ok(groupStart >= 0 && groupEnd > groupStart);
assert.doesNotMatch(source.slice(groupStart, groupEnd), /data-custom-grouped-gym|Gym location \(optional\)|custom-workout-group-format-button/,
  'superset and circuit cards do not repeat the workout gym or format selectors');
assert.match(source, /<div class="custom-workout-launcher-gym">\$\{workoutGymPickerMarkup/,
  'the workout setup keeps its gym selector');
assert.match(source, /data-custom-workout-setup-open="format"[^>]+Change workout format/,
  'the workout summary keeps its format selector');

const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>${styles}</style></head><body class="dashboard-page client-dashboard-page">
  <main id="client-workouts-panel" class="is-compact-workout-log"><div id="client-workout-panels">
    <section class="client-workout-panel client-workout-panel-custom">
      <section data-custom-workout-grouped="true" data-custom-workout-format="__FORMAT__"><article class="custom-workout-grouped-card">
        <div class="ios-log-exercise-block"><article class="ios-log-exercise-card">
          <header class="ios-log-exercise-header">
            <span class="ios-log-exercise-image"><button class="exercise-media-button" type="button"><img alt="" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='280'%3E%3Crect width='400' height='280' fill='%23577d9a'/%3E%3C/svg%3E"></button></span>
            <span class="ios-log-exercise-heading-copy"><button class="ios-log-exercise-title" type="button"><span class="ios-log-exercise-marker">__BADGE__</span><span class="ios-log-exercise-name">Dumbbell Bench Press</span></button><small class="ios-log-exercise-meta">Chest | Dumbbell</small><small class="ios-log-exercise-progress">3 / 3 complete</small></span>
            <details class="ios-log-exercise-menu"><summary aria-label="Exercise options">•••</summary></details>
          </header>
        </article></div>
      </article></section>
    </section>
  </div></main></body></html>`;

(async () => {
  const engineName = process.env.PLAYWRIGHT_BROWSER || 'chromium';
  const engine = { chromium, webkit }[engineName];
  assert.ok(engine, `Unsupported browser engine: ${engineName}`);
  const browser = await engine.launch({ headless: true });
  try {
    for (const format of ['superset', 'circuit']) {
      for (const width of [280, 320, 390]) {
        const page = await browser.newPage({ viewport: { width, height: 844 }, deviceScaleFactor: 2 });
        await page.setContent(fixture.replace('__FORMAT__', format).replace('__BADGE__', format === 'superset' ? 'A1' : 'B12'));
        for (const rootFontSize of [16, 20]) {
          await page.evaluate(size => { document.documentElement.style.fontSize = `${size}px`; }, rootFontSize);
          const layout = await page.evaluate(() => {
          const bounds = selector => document.querySelector(selector).getBoundingClientRect();
          const header = document.querySelector('.ios-log-exercise-header');
          const title = document.querySelector('.ios-log-exercise-name');
          const badge = document.querySelector('.ios-log-exercise-marker');
          const badgeBounds = badge.getBoundingClientRect();
          const badgeText = document.createRange();
          badgeText.selectNodeContents(badge);
          return {
            viewport: document.documentElement.clientWidth,
            documentWidth: document.documentElement.scrollWidth,
            headerWidth: header.clientWidth,
            headerScrollWidth: header.scrollWidth,
            imageWidth: bounds('.ios-log-exercise-image').width,
            imageHeight: bounds('.ios-log-exercise-image').height,
            imageBottom: bounds('.ios-log-exercise-image').bottom,
            titleTop: bounds('.ios-log-exercise-title').top,
            titleRight: bounds('.ios-log-exercise-name').right,
            titleLeft: bounds('.ios-log-exercise-name').left,
            headerRight: bounds('.ios-log-exercise-header').right,
            titleWidth: title.clientWidth,
            badgeRight: badgeBounds.right,
            badgeTextLines: badgeText.getClientRects().length,
            badgeTextFits: badgeText.getBoundingClientRect().width < badgeBounds.width,
            menuLeft: bounds('.ios-log-exercise-menu').left,
            menuRight: bounds('.ios-log-exercise-menu').right,
          };
          });
          const context = `${engineName}/${format}/${width}px/${rootFontSize}px`;
          assert.ok(layout.documentWidth <= layout.viewport + 1, `${context}: page fits (${JSON.stringify(layout)})`);
          assert.ok(layout.headerScrollWidth <= layout.headerWidth + 1, `${context}: card fits (${JSON.stringify(layout)})`);
          assert.ok(layout.imageWidth >= layout.headerWidth - 26, `${context}: image spans the card interior (${JSON.stringify(layout)})`);
          assert.ok(layout.imageHeight >= 160 && layout.imageHeight <= 205, `${context}: image stays large (${JSON.stringify(layout)})`);
          assert.ok(layout.titleTop >= layout.imageBottom - 1, `${context}: name sits below the image (${JSON.stringify(layout)})`);
          assert.ok(layout.titleRight <= layout.menuLeft && layout.titleWidth > 0 && layout.titleRight <= layout.headerRight + 1,
            `${context}: title stays inside card (${JSON.stringify(layout)})`);
          assert.ok(layout.badgeTextLines === 1 && layout.badgeTextFits && layout.badgeRight < layout.titleLeft,
            `${context}: exercise badge fits on one line before the name (${JSON.stringify(layout)})`);
          assert.ok(layout.menuRight <= layout.headerRight + 1, `${context}: menu stays inside card (${JSON.stringify(layout)})`);
        }
        await page.close();
      }
    }
    console.log(`${engineName}: large images and single-line exercise badges fit superset and circuit cards at 280–390px`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
