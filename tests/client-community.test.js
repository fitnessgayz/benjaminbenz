const test = require('node:test');
const assert = require('node:assert/strict');
const { mount } = require('../js/client-community.js');

function fixture() {
  const handlers = {};
  const badge = { checked: false, disabled: false };
  const progress = { checked: false, disabled: false };
  const save = { disabled: false, closest: selector => selector === '[data-community-save]' ? save : null };
  const status = { textContent: '' };
  const title = { textContent: '' };
  const body = { textContent: '' };
  const buttons = ['leaderboard', 'connections', 'challenges'].map(name => ({
    dataset: { communityView: name },
    setAttribute(key, value) { this[key] = value; },
    focus() {}
  }));
  const nodes = {
    '#client-community-share-badges': badge,
    '#client-community-share-progress': progress,
    '[data-community-save]': save,
    '#client-community-consent-status': status,
    '#client-community-feature-title': title,
    '#client-community-feature-body': body
  };
  const panel = {
    querySelector: key => nodes[key],
    querySelectorAll: key => key === '[data-community-view]' ? buttons : [],
    addEventListener: (event, fn) => { handlers[event] = fn; }
  };
  return { controller: mount({ querySelector: () => panel }), handlers, badge, progress, save, status, title, body, buttons };
}

test('sharing choices default off, load only for the signed-in owner, and save separately', async () => {
  const ui = fixture();
  let selectedUser, saved;
  const client = { from(table) {
    assert.equal(table, 'client_community_preferences');
    return {
      select() { return this; },
      eq(key, value) { assert.equal(key, 'user_id'); selectedUser = value; return this; },
      async maybeSingle() { return { data: null, error: null }; },
      upsert(values, options) {
        assert.equal(options.onConflict, 'user_id');
        saved = values;
        return { select() { return this; }, async single() { return { data: values, error: null }; } };
      }
    };
  } };
  ui.controller.configure(client, 'user-1', false);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(selectedUser, 'user-1');
  assert.equal(ui.badge.checked, false);
  assert.equal(ui.progress.checked, false);
  assert.equal(ui.save.disabled, false);
  ui.badge.checked = true;
  ui.handlers.click({ target: ui.save });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(saved, { user_id: 'user-1', badges_opt_in: true, progress_opt_in: false });
  assert.match(ui.status.textContent, /Saved/);
});

test('coach preview cannot alter a client’s sharing choices', () => {
  const ui = fixture();
  ui.controller.configure({ from() { throw new Error('Unexpected database access'); } }, 'user-1', true);
  assert.equal(ui.badge.disabled, true);
  assert.equal(ui.progress.disabled, true);
  assert.equal(ui.save.disabled, true);
  assert.match(ui.status.textContent, /client signs in/);
});

