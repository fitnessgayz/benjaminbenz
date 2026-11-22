const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('help is user-initiated and App tour has a separate workout logging guide', () => {
  const html = fs.readFileSync(require.resolve('../client-dashboard.html'), 'utf8');
  assert.doesNotMatch(html, /data-client-web-tour-open|client-web-tour\.(?:css|js)|first-tour=1/);
  for (const view of ['app-guide', 'workout-logging-guide']) {
    assert.match(html, new RegExp(`data-client-settings-open="${view}"`));
    assert.match(html, new RegExp(`data-client-settings-view="${view}" hidden`));
  }
  assert.match(html, /How to log a workout/);
});
