const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const tabs = require(path.join(root, 'js/client-bottom-tabs.js'));
const dashboard = fs.readFileSync(path.join(root, 'client-dashboard.html'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'css/client-bottom-tabs.css'), 'utf8');

test('bottom tab preferences migrate legacy tabs and keep Profile visible', () => {
  const value = tabs.normalize({
    order: ['workouts', 'progress', 'mystery', 'notifications', 'home', 'workouts'],
    hidden: ['home', 'notifications', 'profile', 'mystery', 'home']
  });
  assert.deepEqual(value.order, ['workouts', 'spotter', 'home', 'community', 'profile']);
  assert.deepEqual(value.hidden, ['home']);
  assert.deepEqual(tabs.normalize(null).order, ['home', 'workouts', 'spotter', 'community', 'profile']);
  assert.deepEqual(tabs.toggleHidden(value, 'profile'), value);
});

test('shown tabs can move, hide, show, and reset without losing order', () => {
  const defaultState = tabs.normalize();
  const moved = tabs.moveRelative(defaultState, 'community', 'home');
  assert.deepEqual(moved.order, ['community', 'home', 'workouts', 'spotter', 'profile']);
  const hidden = tabs.toggleHidden(moved, 'workouts');
  assert.deepEqual(hidden.hidden, ['workouts']);
  assert.deepEqual(tabs.toggleHidden(hidden, 'workouts').order, moved.order);
  assert.deepEqual(tabs.normalize(), defaultState);
});

test('Settings exposes controls, preview and reset, with a responsive dock', () => {
  assert.match(dashboard, /data-client-settings-open="bottom-tabs"/);
  assert.match(dashboard, /data-client-bottom-tabs-shown/);
  assert.match(dashboard, /data-client-bottom-tabs-hidden/);
  assert.match(dashboard, /data-client-bottom-tabs-preview/);
  assert.match(dashboard, /href="\/client-spotter\.html" data-client-dashboard-tab="spotter"/);
  assert.match(dashboard, /data-client-bottom-tabs-reset/);
  assert.match(dashboard, /js\/client-bottom-tabs\.js/);
  assert.match(styles, /repeat\(var\(--client-visible-tab-count/);
  assert.match(styles, /is-mobile-tab-hidden/);
});

test('mobile order changes preserve desktop sidebar controls and account preferences', () => {
  const title = { name: 'title' };
  const sidebar = { name: 'sidebar' };
  const ids = ['home', 'workouts', 'spotter', 'community', 'profile'];
  const nodes = ids.map((id) => ({
    name: id,
    dataset: { clientDashboardTab: id },
    classList: { toggle(name, active) { this[name] = active; } }
  }));
  const nav = {
    children: [title, ...nodes, sidebar],
    querySelectorAll() { return nodes; },
    replaceChildren(...children) { this.children = children; },
    style: { setProperty(name, value) { this[name] = value; } }
  };
  const view = { dataset: {}, addEventListener() {} };
  let mobile = true;
  const preferences = new Map([['fwb_client_bottom_tabs_v1:client-a', JSON.stringify({
    order: ['community', 'home', 'workouts', 'profile'], hidden: ['home', 'profile']
  })]]);
  const document = {
    getElementById() { return view; },
    querySelector(selector) { return selector === '.client-dashboard-tabs' ? nav : null; }
  };
  const window = {
    document,
    localStorage: { getItem(key) { return preferences.get(key) || null; } },
    matchMedia() { return { matches: mobile, addEventListener() {} }; }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'js/client-bottom-tabs.js'), 'utf8'), { window });
  window.FWB_CLIENT_BOTTOM_TABS.setAccount('client-a');
  assert.deepEqual(nav.children.map((node) => node.name),
    ['title', 'community', 'home', 'workouts', 'spotter', 'profile', 'sidebar']);
  assert.equal(nodes.find((node) => node.name === 'home').classList['is-mobile-tab-hidden'], true);
  assert.equal(nodes.find((node) => node.name === 'profile').classList['is-mobile-tab-hidden'], false);
  assert.equal(nav.style['--client-visible-tab-count'], '4');
  mobile = false;
  window.FWB_CLIENT_BOTTOM_TABS.setAccount('client-b');
  assert.deepEqual(nav.children.map((node) => node.name), ['title', ...ids, 'sidebar']);
});
