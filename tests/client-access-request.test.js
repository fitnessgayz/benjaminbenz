const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/client-access-request.js'), 'utf8');

test('sign-up requests approval and does not create a client account', async () => {
  const requests = [];
  const button = { disabled: false };
  const status = { textContent: '' };
  const form = {
    handler: null,
    resetCalled: false,
    elements: {
      name: { value: 'Ben Tester' },
      email: { value: 'BEN@example.com', validity: { valid: true } },
      phone: { value: '' },
      goals: { value: 'Get stronger' },
      website: { value: '' }
    },
    querySelector() { return button; },
    addEventListener(_name, handler) { this.handler = handler; },
    reset() { this.resetCalled = true; }
  };
  const document = { getElementById(id) { return id === 'client-access-request-form' ? form : status; } };
  const window = {
    document,
    FWB_SUPABASE_CONFIG: { url: 'https://qukdfjeupjhpthfbaonv.supabase.co', anonKey: 'publishable-key' },
    setTimeout() { return 1; },
    clearTimeout() {},
    async fetch(url, options) { requests.push({ url, options }); return { ok: true }; }
  };
  vm.runInNewContext(source, { window, AbortController });
  await form.handler({ preventDefault() {} });
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /\/functions\/v1\/request-client-access$/);
  assert.equal(requests[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    name: 'Ben Tester', email: 'ben@example.com', phone: '', goals: 'Get stronger', website: ''
  });
  assert.equal(form.resetCalled, true);
  assert.match(status.textContent, /review.*invitation if approved/i);
  assert.equal(button.disabled, false);
});

test('signed-out screens link to the review-based request form', () => {
  const homepage = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const login = fs.readFileSync(path.join(root, 'client-login.html'), 'utf8');
  const request = fs.readFileSync(path.join(root, 'client-access-request.html'), 'utf8');
  for (const screen of [homepage, login]) assert.match(screen, /href="client-access-request\.html"[^>]*>Sign up/);
  assert.match(request, /Submitting a request does not create an account/);
  assert.match(request, /js\/client-access-request\.js/);
});
