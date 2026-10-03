const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const api = require('../js/coach-workout-corrections.js');
const row = { id: 'saved-id', updated_at: '2026-10-02T10:00:00Z', client_email: 'CLIENT@example.com', exercise_code: 'A1', weight_used: 600, reps: 8, set_number: 1, set_type: 'working' };

test('corrects exactly one saved row with its client and revision; does not send reps or metadata', async () => {
  const requests = [];
  const client = { async rpc(name, params) { requests.push({ name, params }); return { data: 1 }; } };
  assert.equal(await api.correctWeight(client, row, '60.25'), 60.25);
  assert.deepEqual(requests, [{ name: 'coach_correct_workout_weight', params: {
    p_log_id: row.id, p_client_email: 'client@example.com', p_weight: 60.25, p_expected_updated_at: row.updated_at
  } }]);
  assert.equal(row.weight_used, 600);
});
test('accepts zero but rejects blank, negative, malformed, and nonfinite weights before any request', async () => {
  let calls = 0;
  const client = { async rpc() { calls++; return { data: 1 }; } };
  for (const value of ['', ' ', -1, '60lb', Infinity, NaN]) await assert.rejects(api.correctWeight(client, row, value));
  assert.equal(calls, 0);
  await api.correctWeight(client, row, '0');
  assert.equal(calls, 1);
});
test('does not pretend a conflict or denied update succeeded', async () => {
  await assert.rejects(api.correctWeight({ rpc: async () => ({ data: 0 }) }, row, 60), /set changed/);
  await assert.rejects(api.correctWeight({ rpc: async () => ({ error: { message: 'Refresh history' } }) }, row, 60), /Refresh history/);
  for (const override of [{ updated_at: '' }, { exercise_code: 'CARDIO' }, { exercise_code: 'WARMUP' }]) {
    await assert.rejects(api.correctWeight({}, { ...row, ...override }, 60), /Refresh/);
  }
});
test('older history beyond the first page is available with stable order and escaped email wildcards', async () => {
  const pages = [Array.from({ length: 1000 }, (_, i) => ({ id: i })), [{ id: 'old-pr' }]];
  const requests = [];
  const client = { from(table) { const request = { table, orders: [] }; return {
    select() { return this; }, ilike(column, value) { request.email = value; return this; },
    order(column) { request.orders.push(column); return this; },
    async range(from, to) { request.range = [from, to]; requests.push(request); return { data: pages.shift() }; }
  }; } };
  const rows = await api.loadHistory(client, 'CLIENT_NAME@example.com');
  assert.equal(rows.length, 1001);
  assert.equal(rows.at(-1).id, 'old-pr');
  assert.deepEqual(requests.map(r => r.range), [[0, 999], [1000, 1999]]);
  assert.deepEqual(requests[0].orders, ['entry_date', 'id']);
  assert.equal(requests[0].email, 'client\\_name@example.com');
});
test('a failed later page never returns partial history', async () => {
  let page = 0;
  const client = { from() { return { select() { return this; }, ilike() { return this; }, order() { return this; }, async range() {
    return ++page === 1 ? { data: Array(1000).fill(row) } : { error: new Error('offline') };
  } }; } };
  await assert.rejects(api.loadHistory(client, 'client@example.com'), /offline/);
});
test('correcting a typo recomputes the client PR from the next valid best without changing other sets', async () => {
  const source = fs.readFileSync(require.resolve('../js/client-portal.js'), 'utf8');
  function extract(name) {
    const start = source.indexOf(`function ${name}(`), rest = source.slice(start);
    const end = rest.slice(1).search(/\n(?:async )?function /);
    assert.ok(start >= 0); return end < 0 ? rest : rest.slice(0, end + 1);
  }
  const context = vm.createContext({ trainingLogs: [], warmupExerciseCode: 'WARMUP', cardioExerciseCode: 'CARDIO', warmUpSetType: 'warm_up', workingSetType: 'working', warmUpSetNumberBase: 1000 });
  vm.runInContext(['normalizedSetType', 'normalizeExerciseHistoryName', 'exerciseProgressRecords'].map(extract).join('\n'), context);
  context.trainingLogs = [
    { ...row, exercise_name: 'Bench Press', entry_date: '2026-09-20' },
    { ...row, id: 'valid', exercise_name: 'Bench Press', entry_date: '2026-09-21', weight_used: 70 },
    { ...row, id: 'warmup', exercise_name: 'Bench Press', entry_date: '2026-09-21', weight_used: 1000, set_type: 'warm_up' }
  ];
  const before = context.exerciseProgressRecords(context.trainingLogs);
  assert.equal(before[0].bestValue, 600);
  await api.correctWeight({ async rpc(_, params) { context.trainingLogs[0].weight_used = params.p_weight; return { data: 1 }; } }, row, 60);
  const after = context.exerciseProgressRecords(context.trainingLogs);
  assert.equal(after[0].bestValue, 70);
  assert.equal(context.trainingLogs[1].weight_used, 70);
  assert.equal(context.trainingLogs[0].reps, 8);
});
