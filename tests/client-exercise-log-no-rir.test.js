import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../js/client-portal.js', import.meta.url), 'utf8');

function functionSource(name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextName}(`, start + 1);
  assert.ok(start >= 0 && end > start, `${name} source exists`);
  return source.slice(start, end);
}

test('single exercise set rows offer weight, reps, and completion without RIR', () => {
  const makeRow = new Function(
    'const warmUpSetType = "warmup";'
      + 'const workingSetType = "working";'
      + 'const normalizedSetType = (type) => type;'
      + 'const warmUpOrdinal = () => 1;'
      + 'const setNumberLabel = (number) => String(number);'
      + 'const escapeHtml = (value) => String(value);'
      + 'const autoRestTimerEnabled = () => false;'
      + functionSource('setRowMarkup', 'setRows')
      + 'return setRowMarkup(1, "10", workingSetType, "135");'
  );
  const html = makeRow();
  assert.match(html, /data-set-weight/);
  assert.match(html, /data-set-reps/);
  assert.match(html, /data-complete-set/);
  assert.doesNotMatch(html, /RIR|data-set-rir/);
});

test('grouped exercise set rows offer weight and reps without RIR', () => {
  const makeRow = new Function(
    'const warmUpSetType = "warmup";'
      + 'const escapeHtml = (value) => String(value);'
      + 'const setRowInputValues = () => ({ weightRaw: "135", repsRaw: "10" });'
      + functionSource('customWorkoutGroupedFieldMarkup', 'customWorkoutGroupedSetRowMarkup')
      + functionSource('customWorkoutGroupedSetRowMarkup', 'customWorkoutGroupedRoundCount')
      + 'return customWorkoutGroupedSetRowMarkup({ dataset: { setNumber: "1" }, classList: { contains: () => false }, querySelector: () => null }, "A1", 0, "working", 1, "Bench Press");'
  );
  const html = makeRow();
  assert.match(html, /data-custom-grouped-field="weight"/);
  assert.match(html, /data-custom-grouped-field="reps"/);
  assert.doesNotMatch(html, /RIR|data-custom-grouped-field="rir"/);
});
