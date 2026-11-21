const assert = require('node:assert/strict');
const test = require('node:test');
const { calculate, units } = require('../js/client-plate-calculator.js');

test('plate calculator matches the native default loads in pounds and kilograms', () => {
  assert.deepEqual(calculate(135, 45, units.lb.inventory), { weight: 135, plates: [[45, 1]], exact: true });
  assert.deepEqual(calculate(60, 20, units.kg.inventory), { weight: 60, plates: [[20, 1]], exact: true });
});

test('plate calculator finds exact combinations beyond selecting the largest plate first', () => {
  assert.deepEqual(calculate(65, 45, [[8, 1], [5, 2]]), { weight: 65, plates: [[5, 2]], exact: true });
});

test('plate calculator skips unavailable plates and prefers the lighter nearest load on ties', () => {
  assert.deepEqual(calculate(67.5, 45, [[11.25, 0], [10, 1], [2.5, 1]]), {
    weight: 65, plates: [[10, 1]], exact: false
  });
});

test('plate calculator handles invalid, below-bar, and bar-only targets', () => {
  assert.match(calculate(NaN, 45, []).error, /positive/);
  assert.match(calculate(40, 45, []).error, /lighter than the bar/);
  assert.deepEqual(calculate(45, 45, []), { weight: 45, plates: [], exact: true });
});
