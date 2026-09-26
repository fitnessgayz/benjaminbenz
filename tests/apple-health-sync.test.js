const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('js/apple-health-sync.js','utf8');
const now = new Date('2026-09-25T20:00:00Z');
const user = {id:'alice',email:'alice@example.test'};
function fixture(options={}) {
 const calls=[];let settingsReads=0,authReads=0;
 const global = {setTimeout,clearTimeout,AbortController}; vm.runInNewContext(source,{window:global});
 const settings={user_id:'alice',client_email:user.email,shared_categories:options.categories??['activity','bodyWeight','workouts'],updated_at:now.toISOString()};
 const client={auth:{getUser:async()=>({data:{user: options.actorChanged && ++authReads>1 ? {id:'bob',email:'bob@example.test'} : options.actor??user}})},from(table){
  const query={select(columns){calls.push({table,columns});return this;},eq(){return this;},gte(){return this;},lte(){return this;},order(){return this;},limit(){return this;},abortSignal(){return this;},then(resolve,reject){
   let data=[];if(table.endsWith('settings'))data=options.noSettings?[]:[{...settings,shared_categories: options.revoked && ++settingsReads>1 ? [] : settings.shared_categories}];
   if(table.endsWith('daily'))data=options.daily??[{user_id:'alice',client_email:user.email,date:'2026-09-25',steps:0,body_weight_kg:80,updated_at:now.toISOString()}];
   if(table.endsWith('workouts'))data=options.workouts??[{user_id:'alice',client_email:user.email,healthkit_id:'w1',activity_type:'Run',started_at:'2026-09-25T15:00:00Z',duration_seconds:1800,active_calories:0,distance_meters:null,average_heart_rate:null,source_name:'Watch',updated_at:now.toISOString()}];
   return Promise.resolve({data,error:options.error}).then(resolve,reject);
  }};return query;
 }};
 return {api:global.FWB_APPLE_HEALTH,calls,load:(args={})=>global.FWB_APPLE_HEALTH.loadSnapshot({supabaseClient:client,clientEmail:user.email,now,...args})};
}
test('opt-out never queries health record tables',async()=>{const f=fixture({categories:[]});const s=await f.load();assert.equal(s.state,'not-shared');assert.equal(f.calls.length,1);});
test('only consented columns are queried and missing stays missing',async()=>{const f=fixture({categories:['activity']});const s=await f.load();assert.equal(s.daily[0].steps,0);assert.equal(s.daily[0].body_weight_kg,undefined);assert.equal(f.calls.filter(c=>c.table.endsWith('workouts')).length,0);assert.doesNotMatch(f.calls.find(c=>c.table.endsWith('daily')).columns,/body_weight|heart_rate/);});
test('revocation during read discards pending data',async()=>{const f=fixture({revoked:true});const s=await f.load();assert.equal(s.state,'not-shared');assert.equal(s.daily.length,0);});
test('account change during read rejects the pending snapshot',async()=>{await assert.rejects(fixture({actorChanged:true}).load(),e=>e.code==='AUTH_CHANGED');});
test('different owner cannot impersonate client and coach relies on RLS',async()=>{const f=fixture({actor:{id:'coach',email:'coach@example.test'}});await assert.rejects(f.load(),e=>e.code==='AUTH_CHANGED');assert.equal((await f.load({isCoach:true})).state,'ready');});
test('malformed foreign future and out of range values are excluded',async()=>{const f=fixture({daily:[{user_id:'bob',client_email:user.email,date:'2026-09-25',steps:50},{user_id:'alice',client_email:user.email,date:'2026-02-30',steps:50},{user_id:'alice',client_email:user.email,date:'2026-09-25',steps:-1,body_weight_kg:Infinity}]});const s=await f.load();assert.equal(s.daily.length,1);assert.equal(s.daily[0].steps,null);assert.equal(s.daily[0].body_weight_kg,null);});
test('backend schema not installed is a recoverable state',async()=>{assert.equal((await fixture({error:{code:'PGRST205'}}).load()).state,'not-configured');});
test('network failures are not misreported as opt-out',async()=>{await assert.rejects(fixture({error:{code:'NETWORK'}}).load(),e=>e.code==='NETWORK');});
test('workout names and sources are escaped and null metrics omitted',async()=>{const f=fixture();const s=await f.load();s.workouts[0].activity_type='<img src=x onerror=alert(1)>';const html=f.api.renderSnapshot(s);assert.doesNotMatch(html,/<img/);assert.match(html,/&lt;img/);assert.match(html,/0 active kcal/);assert.doesNotMatch(html,/null|NaN|undefined/);});
test('daily weight chart preserves actual dates and does not invent missing days',async()=>{const f=fixture();const s=await f.load();s.daily.push({date:'2026-09-22',body_weight_kg:81});const html=f.api.renderSnapshot(s);assert.match(html,/<svg/);assert.match(html,/2 shared weigh-ins/);assert.match(html,/Missing days are not estimated/);});
test('client and coach integration load the module before their controller',()=>{for(const [html,script] of [['client-dashboard.html','client-portal'],['coach-admin.html','coach-admin']]){const s=fs.readFileSync(html,'utf8');assert.ok(s.indexOf('js/apple-health-sync.js')<s.indexOf('js/'+script+'.js'));assert.match(s,/data-apple-health-view/);}assert.match(fs.readFileSync('js/client-portal.js','utf8'),/configureClientAppleHealth\(\);/);assert.match(fs.readFileSync('js/coach-admin.js','utf8'),/coachAppleHealthController\?\.destroy\(\)/);});
