const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {create,mondaySlot,storageKey} = require('../js/client-weekly-inbox');
const user = {id:'tester-1',email:'tester@example.invalid'};
function fixture({ preview = false, memory = new Map(), rows = [], active = user,
    date = new Date(2026,10,23,8,0), queryError = false } = {}) {
  const reads=[],updates=[];
  let time=date, session=active, result=rows, failed=queryError, opens=0;
  const storage={getItem:key=>memory.get(key),setItem:(key,value)=>memory.set(key,value)};
  const client={
    auth:{getSession:async()=>({data:{session:session && {user:session}}})},
    from(table) {
      assert.equal(table,'client_check_ins');
      const query={select:columns=>{reads.push(['select',columns]);return query;},
        eq:(key,value)=>{reads.push([key,value]);return query;},
        not:(key,op,value)=>{reads.push([key,op,value]);return query;},
        limit:async()=>({data:result,error:failed?Error('offline'):null})};
      return query;
    }
  };
  const control = create({client,user,preview,now:()=>time,
    getStorage:()=>storage,publish:row=>updates.push(row),open:()=>{opens++;}});
  return {control,reads,updates,memory, row:()=>updates.at(-1),
    setTime:value=>{time=value;}, setRows:value=>{result=value;},setError:value=>{failed=value;},
    setSession:value=>{session=value;},opened:()=>opens};
}

test('local Monday starts precisely at 08:00; the key is Monday across Sunday and year boundaries', () => {
  assert.equal(mondaySlot(new Date(2026,10,23,7,59)).eligible,false);
  assert.equal(mondaySlot(new Date(2026,10,23,8)).eligible,true);
  assert.equal(mondaySlot(new Date(2026,10,24,8)).eligible,false);
  assert.equal(mondaySlot(new Date(2027,0,1,12)).key,'2026-12-28');
});
test('one private local item per account/week after verification, read persisted and no phantom Tuesday reminder', async () => {
  const f=fixture({date:new Date(2026,10,23,7,59)});
  await f.control.refresh();
  assert.deepEqual(f.reads,[]);
  f.setTime(new Date(2026,10,23,8));
  await Promise.all([f.control.refresh(),f.control.refresh()]);
  assert.equal(f.updates.length,1);
  assert.deepEqual(f.reads,[['select','weekly_submitted_at'],['client_email',user.email],['occurred_on','2026-11-23'],['weekly_submitted_at','is',null]]);
  const row=f.row();
  assert.equal(row.read_at,null);
  row.onOpen(); assert.equal(f.opened(),1);
  row.onRead(); assert.ok(f.row().read_at);
  assert.equal(JSON.parse(f.memory.get(storageKey(user.id))).read,'2026-11-23');
  const next=fixture({memory:f.memory,date:new Date(2026,10,24,12)});
  await next.control.refresh(); assert.ok(next.row().read_at);
  const missed=fixture({date:new Date(2026,10,24,12)});
  await missed.control.refresh(); assert.deepEqual(missed.reads,[]);
  next.setTime(new Date(2026,10,30,7,30));
  await next.control.refresh(); assert.equal(next.row(),null);
  next.setTime(new Date(2026,10,30,8,0));
  await next.control.refresh(); assert.equal(next.row().id,'local-weekly-2026-11-30');
});
test('submissions clear the reminder, including submissions from another session', async () => {
  const f=fixture();
  await f.control.refresh(); assert.ok(f.row());
  f.setRows([{weekly_submitted_at:'2026-11-23T16:01:00Z'}]);
  await f.control.refresh(true); assert.equal(f.row(),null);
  const reads=f.reads.length;
  await f.control.refresh(); assert.equal(f.reads.length,reads);
  const g=fixture(); await g.control.refresh(); g.control.complete('2026-11-23');
  assert.equal(g.row(),null);
});
test('coach/preview, wrong accounts, expired sessions and failed reads do not deliver or retain a reminder', async () => {
  for (const options of [{preview:true},{active:null},{active:{...user,id:'other'}},{active:{...user,email:'other@example.invalid'}}]) {
    const f=fixture(options); await f.control.refresh(); assert.deepEqual(f.updates,[]); assert.deepEqual(f.reads,[]);
  }
  const g=fixture();
  await g.control.refresh(); assert.ok(g.row());
  g.setError(true); await g.control.refresh(true); assert.equal(g.row(),null);
  await g.control.refresh(); assert.equal(g.row(),null);
  g.setError(false); await g.control.refresh(true); assert.ok(g.row());
  g.setSession(null); await g.control.refresh(true); assert.equal(g.row(),null);
  g.control.destroy();
  await g.control.refresh(true); assert.equal(g.row(),null);
});
test('Settings Account is the only permanent shortcut; gym/daily/recap are intact and local row bypasses remote markRead', () => {
  const html=fs.readFileSync(require.resolve('../client-dashboard.html'),'utf8');
  const home=html.slice(html.indexOf('data-client-dashboard-panel="home"'),html.indexOf('data-client-dashboard-panel="workouts"'));
  assert.doesNotMatch(home,/data-client-weekly-checkin\b/);
  assert.match(home,/data-client-home-gym-action/);
  assert.match(home,/data-client-daily-checkin/);
  assert.match(home,/data-client-home-week-detail/);
  assert.match(html,/id="client-settings-security"[\s\S]*?data-client-weekly-checkin hidden[\s\S]*?id="client-settings-notifications"/);
  assert.equal((html.match(/data-client-weekly-checkin\b(?!-)/g)||[]).length,1);
  const inbox=fs.readFileSync(require.resolve('../js/web-notifications'),'utf8');
  assert.match(inbox,/isLocal[\s\S]*?dataset\.webLocalWeekly = ""[\s\S]*?else link\.dataset\.webNotificationOpen = row\.id/);
});
