// Offline full dashboard CSS, production footer markup and a synthetic grouped exercise.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const playwright = require('playwright');

const root = path.join(__dirname, '..');
const dashboard = fs.readFileSync(path.join(root, 'client-dashboard.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'js/client-portal.js'), 'utf8');
const styles = [...dashboard.matchAll(/<link[^>]+href="\/?(css\/[^"?]+)[^>]*>/g)]
  .map(match => fs.readFileSync(path.join(root, match[1]), 'utf8')).join('\n');
const start = source.indexOf('function floatingWorkoutFinishMarkup(');
assert.ok(start >= 0);
const end = source.indexOf('\nfunction ', start + 1);
const footer = vm.runInNewContext(source.slice(start, end) + '\nfloatingWorkoutFinishMarkup()')
  .replace('data-floating-workout-finish hidden', 'data-floating-workout-finish');
const fixture = (theme, size) => `<!doctype html>
<html data-client-theme="${theme}" style="font-size:${size}px"><head>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>${styles}</style></head>
<body class="dashboard-page client-dashboard-page"><main class="dashboard-shell">
<div id="dashboard-content"><div id="client-dashboard-grid" class="dashboard-grid">
<nav class="client-dashboard-tabs"></nav>
<section id="client-workouts-panel" class="client-workouts-panel is-compact-workout-log">
<div id="client-workout-panels"><section class="client-workout-panel client-workout-panel-custom is-active">
  <div data-custom-workout-grouped="true"><article class="custom-workout-grouped-card"><div class="ios-log-exercise-block"><article class="ios-log-exercise-card">
  <header class="ios-log-exercise-header">
    <span class="ios-log-exercise-image"><img alt="" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='280'%3E%3C/svg%3E"></span>
    <span class="ios-log-exercise-heading-copy">
      <button class="ios-log-exercise-title" type="button" data-ios-log-exercise-detail aria-label="Exercise details for 45-Degree Back Extension">
        <span class="ios-log-exercise-marker" aria-hidden="true">1</span><span class="ios-log-exercise-name">45-Degree Back Extension</span>
      </button>
      <small class="ios-log-exercise-meta">Glutes | Machine</small><small class="ios-log-exercise-progress">0 / 3 complete</small>
    </span>
    <details class="ios-log-exercise-menu"><summary aria-label="Exercise options">•••</summary></details>
  </header></article></div></article></div>
  ${footer}
</section></div></section></div></div></main></body></html>`;

(async () => {
  const engineName = process.env.PLAYWRIGHT_BROWSER || 'chromium';
  const browser = await playwright[engineName].launch({ headless: true });
  try {
    for (const width of [320, 375, 390, 430]) {
      for (const theme of ['light', 'dark']) {
        for (const size of [16, 24, 32]) {
          const context = await browser.newContext({ viewport: { width, height: 760 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
          const page = await context.newPage();
          await page.route('**/*', route => route.abort());
          await page.setContent(fixture(theme, size));
          const label = `${engineName} ${width}px ${theme} at ${size}px`;
          const result = await page.evaluate(() => {
            const rect = el => el.getBoundingClientRect();
            const textRects = el => {
              const range = document.createRange();
              range.selectNodeContents(el);
              return [...range.getClientRects()];
            };
            const discard = document.querySelector('[data-floating-workout-reset-action]');
            const finish = document.querySelector('[data-floating-workout-finish-action]');
            const name = document.querySelector('.ios-log-exercise-name');
            const menu = document.querySelector('.ios-log-exercise-menu');
            const view = { width: innerWidth, height: innerHeight };
            return {
              view,
              docWidth: document.documentElement.scrollWidth,
              dock: rect(discard.parentElement).toJSON(),
              controls: [discard, finish].map(control => {
                const box = rect(control);
                const target = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
                return {
                  ...box.toJSON(), hit: control === target || control.contains(target),
                  textFits: textRects(control).every(line => line.left >= box.left - 1 && line.right <= box.right + 1)
                };
              }),
              title: { right: rect(name).right, menu: rect(menu).left,
                textFits: textRects(name).every(line => line.left >= rect(name).left - 1 && line.right <= rect(name).right + 1),
                whiteSpace: getComputedStyle(name).whiteSpace, textOverflow: getComputedStyle(name).textOverflow }
            };
          });
          const [discard, finish] = result.controls;
          assert.ok(result.docWidth <= width + 1, `${label}: width ${JSON.stringify(result)}`);
          for (const button of result.controls) {
            assert.ok(button.x >= 12 && button.right <= width - 12 && button.width >= 44 && button.height >= 44 && button.hit && button.textFits,
              `${label}: footer hit target ${JSON.stringify(result)}`);
          }
          assert.ok(discard.right <= finish.left && finish.width > discard.width, `${label}: secondary must not crowd primary`);
          assert.ok(Math.abs((finish.left + finish.right) / 2 - width / 2) <= 1, label + ": centered Finish");
          assert.ok(result.dock.bottom <= result.view.height - 7, `${label}: bottom inset`);
          assert.ok(result.title.right <= result.title.menu + 1 && result.title.textFits && result.title.whiteSpace === 'normal' && result.title.textOverflow === 'clip',
            `${label}: complete exercise title ${JSON.stringify(result.title)}`);
          // Keyboard focus remains visible. A real touch does not draw the old gold ring.
          if (size === 16) {
            const title = page.locator('[data-ios-log-exercise-detail]');
            await title.tap();
            assert.equal(await title.evaluate(el => el.matches(':focus-visible')), false, `${label}: touch focus`);
            await page.evaluate(() => document.activeElement.blur());
            await page.keyboard.press('Tab');
            if (!(await title.evaluate(el => el === document.activeElement))) {
              // Safari may skip buttons with plain Tab, but keyboard input before
              // programmatic focus still exercises the focus-visible styling.
              await title.focus();
            }
            const focus = await title.evaluate(el => ({
              visible: el.matches(':focus-visible'),
              width: getComputedStyle(el).outlineWidth,
              style: getComputedStyle(el).outlineStyle,
              color: getComputedStyle(el).outlineColor
            }));
            assert.deepEqual(focus, { visible: true, width: '2px', style: 'solid',
              color: theme === 'light' ? 'rgb(7, 81, 199)' : 'rgb(102, 183, 255)' }, `${label}: keyboard focus`);
          }
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
  console.log(`${engineName}: 24 mobile viewport/theme/text-scale cases passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
