const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/client-portal.js'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'js/coach-admin.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'client-dashboard.html'), 'utf8');
function fn(name, text=source) {
  const start = text.indexOf(`function ${name}(`);
  assert.ok(start >= 0);
  const rest = text.slice(start);
  const end = rest.slice(1).search(/\n(?:async )?function /);
  return rest.slice(0, end + 1);
}
function form(values={}) {
  return {elements:Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{value}])),reset(){this.didReset=true;}};
}
test('five categories each have unselected accessible 1–5 radio ratings', () => {
  for (const name of ['home_mood','home_energy','home_sleep','home_eating','home_body_feeling']) {
    const fields = [...html.matchAll(new RegExp(`<input type="radio" name="${name}" value="([1-5])"[^>]*>`, 'g'))];
    assert.deepEqual(fields.map(match=>match[1]), ['1','2','3','4','5']);
    for (const [markup] of fields) { assert.match(markup,/aria-label=/); assert.doesNotMatch(markup,/checked/); }
  }
});
test('ratings serialize consistently, with partial and note-only check-ins supported', () => {
  const context=vm.createContext({}); vm.runInContext(fn('homeMoodNote'),context);
  assert.equal(context.homeMoodNote(form({home_mood:'4',home_energy:'3',home_sleep:'2',home_eating:'5',home_body_feeling:'1'})), 'Mood: 4/5 · Energy: 3/5 · Sleep: 2/5 · Eating: 5/5 · Body: 1/5');
  assert.equal(context.homeMoodNote(form({home_mood_note:' Feeling good '})), 'Note: Feeling good');
  assert.equal(context.homeMoodNote(form()), '');
  assert.equal(context.homeMoodNote(form({home_mood:'Good'})), 'Mood: Good');
});
function saveFixture(result={error:null}, reject=false) {
  const callbacks=[]; const button={disabled:false}; const messages=[]; let payload; let dismissed=false;
  const context=vm.createContext({document:{addEventListener:(_,cb)=>callbacks.push(cb),getElementById:()=>button},
    supabaseClient:{from:()=>({upsert:async value=>{payload=value;if(reject)throw Error('timeout');return result;},select:()=>({ilike:()=>({order:async()=>({data:[],error:null})})})})},
    activeClientEmail:'client@example.com',activeDashboardUser:{id:'client',email:'client@example.com'},isCoachDashboardPreview:false,isCoachPortalEmail:()=>false,clientDailyCheckinSaving:false,window:{FWB_DAILY_WORKOUT:{parseCheckIn:()=>null}},rememberClientHomeCheckinPromptSeen(){},currentProgram:{},progressEntries:[{entry_date:'2026-09-18',bodyweight:150,measurements:{waist:30}}],
    normalizeClientEmail:value=>value,homeMoodNote:()=> 'Mood: 4/5',setText:(_,message)=>messages.push(message),todayDate:()=> '2026-09-18',
    progressMeasurements:entry=>entry.measurements,withTimeout:promise=>promise,renderProgress(rows){context.progressEntries=rows},dismissClientHomeCheckinPrompt:()=>{dismissed=true;}
  });
  vm.runInContext('async '+fn('saveClientMoodNote')+'\n'+fn('handleClientProgressSave'),context); context.handleClientProgressSave();
  const inputForm=form();
  return {button,messages,inputForm,context,get payload(){return payload;},get dismissed(){return dismissed;},submit:()=>callbacks[0]({target:{closest:()=>inputForm},preventDefault(){}})};
}
test('successful save includes submission marker and preserves measurements',async()=>{
  const f=saveFixture();await f.submit();
  assert.match(f.payload.mood_checkin_submitted_at,/^\d{4}-\d{2}-\d{2}T/);
  assert.equal(Object.hasOwn(f.payload,'bodyweight'),false);assert.equal(Object.hasOwn(f.payload,'measurements'),false);assert.equal(f.context.progressEntries[0].bodyweight,150);assert.equal(f.context.progressEntries[0].measurements.waist,30);
  assert.equal(f.payload.goal_note,'Mood: 4/5');assert.equal(f.inputForm.didReset,true);assert.equal(f.dismissed,true);assert.equal(f.button.disabled,false);
});
test('failed saves and timeouts retain the form and allow retry',async()=>{
  for(const f of [saveFixture({error:{message:'Save failed'}}),saveFixture(undefined,true)]) {
    await f.submit();assert.equal(f.inputForm.didReset,undefined);assert.equal(f.dismissed,false);assert.equal(f.button.disabled,false);
    assert.match(f.messages.at(-1),/failed|Could not confirm|timeout/i);
  }
});
test('empty check-ins and repeated submissions do not write',async()=>{
  const empty=saveFixture();empty.context.homeMoodNote=()=>'';await empty.submit();assert.equal(empty.payload,undefined);
  const busy=saveFixture();busy.button.disabled=true;await busy.submit();assert.equal(busy.payload,undefined);
});
test('coach notification links select only the requested client',async()=>{
  for(const id of ['two','missing','']) {
    let selected;
    const programs=[{id:'one'},{id:'two'}];
    const context=vm.createContext({URLSearchParams,window:{location:{search:`?tab=progress&client=${id}`}},
      coachSupabase:{from:()=>({select:()=>({order:async()=>({data:programs,error:null})})})},
      adminStatus(){},renderCoachWorkoutClientOptions(){},programsForCurrentClientView:()=>programs,
      fillForm:value=>{selected=value;},renderClientList(){},loadRecentTrainingLogs:async()=>{}
    });
    vm.runInContext('async '+fn('loadPrograms',admin),context);await context.loadPrograms();
    assert.equal(selected?.id,id==='two'?'two':id==='missing'?undefined:'one');
  }
});
