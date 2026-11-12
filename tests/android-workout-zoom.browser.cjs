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
assert.doesNotMatch(source.slice(groupStart, groupEnd), /data-custom-grouped-gym|Gym location \(optional\)/,
  'superset and circuit cards do not repeat the workout gym selector');
assert.match(source, /<div class="custom-workout-launcher-gym">\$\{workoutGymPickerMarkup/,
  'the workout setup keeps its gym selector');

const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>${styles}</style></head><body class="dashboard-page client-dashboard-page">
  <main id="client-workouts-panel" class="is-compact-workout-log"><div id="client-workout-panels">
    <section class="client-workout-panel client-workout-panel-custom">
      <section data-custom-workout-grouped="true" data-custom-workout-format="__FORMAT__"><article class="custom-workout-grouped-card">
        <div class="ios-log-exercise-block"><article class="ios-log-exercise-card">
          <header class="ios-log-exercise-header">
            <span class="ios-log-exercise-image"><button class="exercise-media-button" type="button"><img alt="" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='280'%3E%3Crect width='400' height='280' fill='%23577d9a'/%3E%3C/svg%3E"></button></span>
            <span class="ios-log-exercise-heading-copy"><button class="ios-log-exercise-title" type="button"><span class="ios-log-exercise-marker">B2</span><span class="ios-log-exercise-name">Dumbbell Bench Press</span></button><small class="ios-log-exercise-meta">Chest | Dumbbell</small><small class="ios-log-exercise-progress">3 / 3 complete</small></span>
            <details class="ios-log-exercise-menu"><summary aria-label="Exercise options">•••</summary></details>
            <button class="ios-log-exercise-collapse" type="button" aria-label="Minimize exercise">⌃</button>
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
        await page.setContent(fixture.replace('__FORMAT__', format));
        for (const rootFontSize of [16, 20]) {
          await page.evaluate(size => { document.documentElement.style.fontSize = `${size}px`; }, rootFontSize);
          const layout = await page.evaluate(() => {
          const bounds = selector => document.querySelector(selector).getBoundingClientRect();
          const header = document.querySelector('.ios-log-exercise-header');
          const title = document.querySelector('.ios-log-exercise-name');
          return {
            viewport: document.documentElement.clientWidth,
            documentWidth: document.documentElement.scrollWidth,
            headerWidth: header.clientWidth,
            headerScrollWidth: header.scrollWidth,
            imageWidth: bounds('.ios-log-exercise-image').width,
            titleRight: bounds('.ios-log-exercise-name').right,
            headerRight: bounds('.ios-log-exercise-header').right,
            titleScrollWidth: title.scrollWidth,
            titleWidth: title.clientWidth,
            menuRight: bounds('.ios-log-exercise-menu').right,
            collapseRight: bounds('.ios-log-exercise-collapse').right
          };
          });
          const context = `${engineName}/${format}/${width}px/${rootFontSize}px`;
          assert.ok(layout.documentWidth <= layout.viewport + 1, `${context}: page fits (${JSON.stringify(layout)})`);
          assert.ok(layout.headerScrollWidth <= layout.headerWidth + 1, `${context}: card fits (${JSON.stringify(layout)})`);
          assert.ok(layout.imageWidth >= (width === 390 ? 128 : 103), `${context}: image is legible (${JSON.stringify(layout)})`);
          assert.ok(layout.titleRight <= layout.headerRight + 1 && layout.titleScrollWidth <= layout.titleWidth + 1,
            `${context}: title stays inside card (${JSON.stringify(layout)})`);
          assert.ok(layout.menuRight <= layout.headerRight + 1 && layout.collapseRight <= layout.headerRight + 1,
            `${context}: controls stay inside card (${JSON.stringify(layout)})`);
        }
        await page.close();
      }
    }
    console.log(`${engineName}: superset and circuit cards fit at 280–390px with normal and enlarged type`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
