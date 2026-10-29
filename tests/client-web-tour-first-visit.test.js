const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../js/client-web-tour.js'), 'utf8');

test('first sign-in shows the tour once per account and Settings can replay it', () => {
  const saved = new Map();
  const title = { textContent: '', focus() {} };
  const image = { src: '' };
  const atari = { className: '', querySelector() { return image; } };
  const fields = new Map([
    ['[data-client-web-tour-count]', { textContent: '' }],
    ['[data-client-web-tour-title]', title],
    ['[data-client-web-tour-body]', { textContent: '' }],
    ['[data-client-web-tour-atari]', atari],
    ['[data-client-web-tour-back]', { disabled: false }],
    ['[data-client-web-tour-next]', { textContent: '' }]
  ]);
  const dialog = {
    open: false,
    className: '',
    setAttribute() {},
    querySelector(selector) { return fields.get(selector); },
    addEventListener() {},
    showModal() { this.open = true; },
    close() { this.open = false; }
  };
  const trigger = {
    handler: null,
    addEventListener(_name, handler) { this.handler = handler; },
    click() { this.handler(); },
    focus() {}
  };
  const document = {
    querySelector() { return trigger; },
    createElement() { return dialog; },
    body: { append() {} }
  };
  const window = {
    document,
    localStorage: {
      getItem(key) { return saved.get(key) || null; },
      setItem(key, value) { saved.set(key, value); }
    }
  };
  vm.runInNewContext(source, { window });
  const tour = window.FWB_CLIENT_WEB_TOUR;
  assert.equal(tour.showFirstVisit('client-a'), true);
  assert.equal(dialog.open, true);
  assert.equal(saved.get('fwb_client_web_tour_seen_v1:client-a'), 'true');
  dialog.close();
  assert.equal(tour.showFirstVisit('client-a'), false);
  assert.equal(tour.showFirstVisit('client-b'), true);
  dialog.close();
  trigger.click();
  assert.equal(dialog.open, true);
});
