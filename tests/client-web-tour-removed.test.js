const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('client dashboard has no first sign-in tour or Settings replay entry', () => {
  const html = fs.readFileSync(path.join(root, 'client-dashboard.html'), 'utf8');
  assert.doesNotMatch(html, /data-client-web-tour-open|App tour|client-web-tour\.(?:css|js)|first-tour=1/);
  assert.equal(fs.existsSync(path.join(root, 'js/client-web-tour.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'css/client-web-tour.css')), false);
});
