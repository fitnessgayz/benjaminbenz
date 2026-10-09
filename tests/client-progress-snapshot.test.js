const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/client-portal.js'), 'utf8');
function declaration(name) {
  const match = new RegExp(`function ${name}\\(`).exec(source);
  assert.ok(match, `${name} exists`);
  const next = source.slice(match.index + match[0].length).search(/\nfunction [\w$]+\(/);
  return source.slice(match.index, next < 0 ? undefined : match.index + match[0].length + next);
}
const context = vm.createContext({ progressMeasurements: (entry) => entry.measurements || {} });
vm.runInContext(['clientHomeSnapshotValue', 'latestClientProgressValue', 'clientProgressSnapshotItems']
  .map(declaration).join('\n'), context);

test('progress snapshot shows latest available measurement for each field', () => {
  const rows = [
    { bodyweight: 181, bodyfat: 20, measurements: { waist: 34 } },
    { bodyweight: 178, lean_mass: 142 },
    { bodyfat: 18, measurements: { waist: 33 } }
  ];
  assert.deepEqual(JSON.parse(JSON.stringify(context.clientProgressSnapshotItems(rows))), [
    { label: 'Bodyweight', value: '178 lb' },
    { label: 'Body fat', value: '18%' },
    { label: 'Lean mass', value: '142 lb' },
    { label: 'Waist', value: '33 in' }
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(context.clientProgressSnapshotItems([]))), []);
});
