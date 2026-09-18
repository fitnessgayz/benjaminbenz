const test = require('node:test');
const assert = require('node:assert/strict');
const { weekRange, summarize, readRows, saveVisit } = require('../js/client-weekly-activity.js');

test('Monday–Sunday boundaries include Sunday and cross year and DST changes', () => {
  assert.equal(weekRange(new Date(2026, 8, 20)).start, '2026-09-14');
  assert.equal(weekRange(new Date(2026, 8, 21)).start, '2026-09-21');
  assert.deepEqual(weekRange(new Date(2026, 0, 1)).dates, ['2025-12-29','2025-12-30','2025-12-31','2026-01-01','2026-01-02','2026-01-03','2026-01-04']);
  assert.equal(weekRange(new Date(2026, 2, 9), -1).end, '2026-03-08');
});
test('counts sessions once, preserves distinct sessions, and ignores out-of-week rows', () => {
  const row = { entry_date: '2026-09-18', workout_title: 'Strength' };
  const range = weekRange(new Date(2026, 8, 18));
  const result = summarize([
    {...row, workout_session_id: 'a'}, {...row, workout_session_id: 'a'},
    {...row, session_id: 'b'}, row,
    {entry_date:'2026-09-19', workout_title:'Cardio'}, {entry_date:'2026-09-19', workout_title:'Cardio'},
    {...row, entry_date:'2026-09-13'}, {...row, entry_date:'2026-09-21'}
  ], [{entry_date:'2026-09-18'}, {entry_date:'2026-09-18'}, {entry_date:'2026-09-13'}], range);
  assert.equal(result.workouts, 3);
  assert.equal(result.checkins, 1);
  assert.equal(result.activity.length, 4);
  assert.equal(summarize([], [], range).workouts, 0);
});
test('loads all pages instead of truncating a week to the first 500 sets', async () => {
  const calls = [];
  const client = { from(table) {
    const q = { select(){return q}, eq(key, value){calls.push([key,value]);return q}, gte(){return q}, lte(){return q}, order(){return q},
      range(start,end){ calls.push([start,end]); q.start=start; return q; },
      abortSignal(){return Promise.resolve({data:Array.from({length:q.start===0?500:2},()=>({entry_date:'2026-09-18'}))})} };
    return q;
  }};
  const rows = await readRows(client,'client_workout_logs','*','client@example.com',weekRange(new Date(2026,8,18)));
  assert.equal(rows.length,502);
  assert.ok(calls.some(call=>call[0]===500 && call[1]===999));
  assert.ok(calls.some(call=>call[0]==='client_email' && call[1]==='client@example.com'));
});
test('check-in retries use an idempotent date key and propagate database failure', async () => {
  let payload, options;
  const client = { from(table){ assert.equal(table,'client_gym_checkins'); return {upsert(row,opts){ payload=row; options=opts; return {abortSignal:async()=>({error:null})} }}} };
  await saveVisit(client,'client@example.com','2026-09-18');
  assert.deepEqual(payload,{client_email:'client@example.com',entry_date:'2026-09-18'});
  assert.equal(options.ignoreDuplicates,true);
  assert.equal(options.onConflict,'client_email,entry_date');
  await assert.rejects(()=>saveVisit({from:()=>({upsert:()=>({abortSignal:async()=>({error:new Error('offline')})})})},'a','2026-09-18'),/offline/);
});
