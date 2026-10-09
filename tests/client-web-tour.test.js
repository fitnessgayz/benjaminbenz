const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('web app tour covers the current client paths and is reachable from Settings', () => {
  const dashboard = fs.readFileSync('client-dashboard.html', 'utf8');
  const source = fs.readFileSync('js/client-web-tour.js', 'utf8');
  const global = {};
  vm.runInNewContext(source, { window: global });
  const steps = global.FWB_CLIENT_WEB_TOUR.steps;
  assert.deepEqual(Array.from(steps, step => step.title),
    ['Home', 'Choose a workout', 'Warm up and log', 'Logs', 'Progress', 'Community', 'Settings']);
  assert.match(steps[1].body, /weekly plan.*Today’s workout/);
  assert.match(steps[2].body, /gray values.*do not count/i);
  assert.match(steps[3].body, /Apple Health.*import/i);
  assert.match(steps[0].body, /Hi, I’m Atari/);
  assert.ok(steps.every(step => ['greeting', 'celebrating', 'encouraging', 'resting'].includes(step.pose)));
  assert.match(source, /ATARI SAYS/i);
  assert.match(source, /atari-expressions\.png/);
  assert.match(dashboard, /data-client-web-tour-open/);
  assert.match(dashboard, /js\/client-web-tour\.js/);
});
