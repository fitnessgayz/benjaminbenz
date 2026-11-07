// NODE_PATH=/Users/benjamingonzales/.local/lib/node_modules node tests/client-settings-light-theme.browser.cjs
// PLAYWRIGHT_BROWSER=webkit checks iPhone Safari's rendering engine.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');

const root = path.resolve(__dirname, '..');
const dashboard = fs.readFileSync(path.join(root, 'client-dashboard.html'), 'utf8');
const styles = [...dashboard.matchAll(/<link[^>]+href="\/?(css\/[^"?]+)[^>]*>/g)]
  .map(match => fs.readFileSync(path.join(root, match[1]), 'utf8')).join('\n');
const pageHtml = dashboard
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace(/<link\b[^>]*rel="stylesheet"[^>]*>/gi, '')
  .replace('</head>', `<style>${styles}</style></head>`);
const redesign = fs.readFileSync(path.join(root, 'js/client-settings-redesign.js'), 'utf8');

function luminance(value) {
  const channels = value.match(/[\d.]+/g).slice(0, 3).map(Number).map(channel => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(a, b) {
  const [bright, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (bright + 0.05) / (dark + 0.05);
}

(async () => {
  const browserName = process.env.PLAYWRIGHT_BROWSER || 'chromium';
  const engine = { chromium, webkit }[browserName];
  assert.ok(engine, `Unsupported browser ${browserName}`);
  const browser = await engine.launch({ headless: true });
  try {
    for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.route('**/*', route => route.abort());
      await page.route('https://fixture.test/client-dashboard.html', route => route.fulfill({ contentType: 'text/html', body: pageHtml }));
      await page.goto('https://fixture.test/client-dashboard.html');
      await page.evaluate(selected => {
        document.documentElement.dataset.clientTheme = selected;
        document.body.classList.remove('is-loading');
        document.getElementById('dashboard-content').hidden = false;
        document.getElementById('dashboard-loading').hidden = true;
        document.querySelector(`input[name="client-theme"][value="${selected}"]`).checked = true;
        document.querySelectorAll('[data-client-dashboard-panel]').forEach(panel => { panel.hidden = true; });
        const settings = document.querySelector('.client-settings-panel');
        settings.hidden = false;
        settings.classList.add('is-active');
      }, theme);
      await page.addScriptTag({ content: redesign });
      await page.locator('.client-settings-appearance-toggle').click();
      const colors = await page.evaluate(() => {
        const style = selector => getComputedStyle(document.querySelector(selector));
        return {
          body: style('body').backgroundColor,
          panel: style('.client-settings-panel').backgroundColor,
          card: style('.client-settings-redesign-list').backgroundColor,
          label: style('.client-settings-redesign-list .client-settings-shortcut-copy strong').color,
          heading: style('.client-settings-redesign-group h3').color,
          legend: style('.client-settings-appearance-details legend').color,
          detail: style('.client-settings-appearance-details').backgroundColor,
          selectedText: style('.client-theme-setting input:checked + span').color,
          selectedBackground: style('.client-theme-setting input:checked + span').backgroundColor,
          overflow: document.documentElement.scrollWidth > innerWidth
        };
      });
      assert.equal(colors.overflow, false, `${theme} Settings must fit the viewport`);
      if (theme === 'light') {
        assert.ok(luminance(colors.panel) > 0.85, 'Light Settings panel must be light');
        assert.ok(luminance(colors.card) > 0.85, 'Light Settings card must be light');
        assert.ok(contrast(colors.label, colors.card) >= 4.5, 'Settings labels need readable contrast');
        assert.ok(contrast(colors.heading, colors.panel) >= 4.5, 'Settings section headings need readable contrast');
        assert.ok(contrast(colors.legend, colors.detail) >= 4.5, 'Appearance label needs readable contrast');
        assert.ok(contrast(colors.selectedText, colors.selectedBackground) >= 4.5, 'Selected Light control needs readable contrast');
      } else {
        assert.ok(luminance(colors.panel) < 0.1, 'Dark Settings panel stays dark');
        assert.ok(contrast(colors.label, colors.card) >= 4.5, 'Dark Settings labels stay readable');
      }
      if (process.env.SETTINGS_SCREENSHOT && theme === 'light') {
        await page.screenshot({ path: process.env.SETTINGS_SCREENSHOT, fullPage: true });
      }
      await page.close();
      process.stdout.write(`${browserName} ${theme} Settings: readable at 390px\n`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
