// Uses production markup, styles, and controllers with a synthetic backend.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'js/client-portal.js'),'utf8');
const html=fs.readFileSync(path.join(root,'client-dashboard.html'),'utf8');
const styles=[...html.matchAll(/<link[^>]+href="\/?(css\/[^"?]+)[^>]*>/g)].map(m=>fs.readFileSync(path.join(root,m[1]),'utf8')).join('\n');
function production(name){const start=source.indexOf(`function ${name}(`);assert.ok(start>=0,name);const rest=source.slice(start),next=rest.slice(1).search(/\n(?:async )?function /);return rest.slice(0,next+1);}
const linkMarkup=html.match(/<div class="client-workout-program-links"[\s\S]*?<\/div>/)[0];
const script=`
window.FWB_SUPABASE_CONFIG={url:'https://synthetic.supabase.co'};
const exerciseNameMatcher=null,exerciseLibraryEntries=[{name:'Chest-Supported Dumbbell Row',aliases:[],primary_muscle:'back',secondary_muscles:['biceps'],image_url:'https://synthetic.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-30/png/chest-supported-dumbbell-wide-row.png'}];
function exerciseVideoUrl(){return '';}function formatLogDate(value){return value;}function exerciseProgressNumber(value){return String(value);}
${['escapeHtml','approvedExerciseForName','trustedExerciseImageUrl','trustedExerciseMotionUrl','responsiveExerciseImageUrls','exerciseMedia','isBrandedExerciseImage','exerciseMediaButtonMarkup','exerciseSuggestionMuscleLabel','clientExerciseProgressCardMarkup','setupWorkoutProgramWindows'].map(production).join('\n')}
const id='10000000-0000-4000-8000-000000000001';
window.currentUserID=id;
window.savedPlans=[{...FWB_QUARTER_GOALS.defaults(id,'2026-10-02'),workouts_week:2,weight_target:180,bodyfat_target:18}];
window.failSave=false;window.failLoad=false;window.readOnly=false;
const client={auth:{getUser:async()=>({data:{user:{id}}})},from(table){let values=null;const builder={select(){return this;},eq(){return this;},gte(){return this;},lte(){return this;},order(){return this;},range(){return this;},upsert(plan){values=plan;return this;},then(resolve){
 if(values){if(window.failSave)return resolve({error:{message:'offline'}});window.savedPlans=[values];return resolve({data:window.savedPlans});}
 if(window.failLoad)return resolve({error:{message:'offline'}});
 return resolve({data:table==='client_quarterly_goals'?window.savedPlans:table==='client_gym_checkins'?[{entry_date:'2026-10-01'}]:[{entry_date:'2026-10-02',bodyweight:180,bodyfat:18}]});}};return builder;}};
window.controller=FWB_QUARTER_GOALS.mount({client,getContext:()=>({user:{id:window.currentUserID},email:'sample@example.invalid',today:'2026-10-02',readOnly:window.readOnly}),historyReady:()=>true,getWorkoutDates:()=>['2026-10-01','2026-10-02']});
window.fixtureReady=controller.load();
document.getElementById('progress-cards').innerHTML=clientExerciseProgressCardMarkup({name:'Chest-Supported Dumbbell Row',code:'A1',change:40,unit:'lb',startingValue:40,bestValue:80,started:{date:'2026-08-01'},best:{date:'2026-10-02'}});
setupWorkoutProgramWindows();
`;
(async()=>{const browser=await chromium.launch({headless:true,channel:"chrome"});try{
const directory=path.join(root,'assets/mockups/dark-mode');fs.mkdirSync(directory,{recursive:true});
for(const width of [320,390,1280]){
 const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>route.request().url().includes('/exercise-images/')?route.fulfill({contentType:'image/png',body:fs.readFileSync(path.join(root,'supabase/storage-assets/exercise-images/approved/2026-09-30/png/chest-supported-dumbbell-wide-row.png'))}):route.abort());
 await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body class="dashboard-page client-dashboard-page"><main style="max-width:920px;margin:auto;padding:16px"><h2>Fitness questionnaire</h2><div id="client-quarter-goals" class="client-quarter-goals"></div><div id="client-quarter-badges" class="client-quarter-badges" hidden></div><section id="progress" hidden><h2>Exercise progress</h2><div id="progress-cards"></div></section><section id="workouts" hidden><h2>Workouts</h2>'+linkMarkup+'</section><article class="client-home-program-card"><h3 id="dashboard-program-title">Strength & mobility</h3><p id="dashboard-program-summary">Three focused sessions each week.</p></article><article class="client-home-coach-note"><h3 id="client-home-note-title">Keep building</h3><p id="client-home-note-body">Keep your reps controlled.</p></article><dialog id="client-quarter-goals-dialog" aria-labelledby="quarter-goal-dialog-title"></dialog><dialog id="client-program-info-dialog" aria-labelledby="client-program-info-title"></dialog></main></body></html>');
 await page.addStyleTag({content:styles});await page.addScriptTag({content:fs.readFileSync(path.join(root,'js/client-quarterly-goals.js'),'utf8')});await page.addScriptTag({content:script});await page.evaluate(()=>fixtureReady);
 assert.equal(await page.locator('#client-quarter-goals .is-earned').count(),3);
 await page.evaluate(()=>{window.currentUserID='20000000-0000-4000-8000-000000000002';controller.render();});
 assert.equal(await page.locator('#client-quarter-goals .is-earned').count(),0);
 assert.equal(await page.locator('#client-quarter-badges .is-earned').count(),0);
 assert.equal(await page.locator('[data-quarter-edit]').count(),0);
 await page.evaluate(()=>{window.currentUserID='10000000-0000-4000-8000-000000000001';controller.render();});
 await page.locator('[data-quarter-edit]').click();assert.equal(await page.locator('#client-quarter-goals-dialog').evaluate(el=>el.open),true);
 await page.locator('[name="workouts_week"]').fill('4');await page.locator('[name="weight_target"]').fill('');await page.locator('[name="bodyfat_target"]').fill('');
 await page.evaluate(()=>window.failSave=true);await page.locator('.quarter-goal-form [type="submit"]').click();await page.waitForFunction(()=>document.querySelector('[data-quarter-save-status]').textContent.includes('could not'));
 assert.equal(await page.locator('[name="workouts_week"]').inputValue(),'4');assert.equal(await page.locator('#client-quarter-goals-dialog').evaluate(el=>el.open),true);
 if(width===390)await page.screenshot({path:path.join(directory,'quarterly-goals-form-web.png')});
 await page.evaluate(()=>window.failSave=false);await page.locator('.quarter-goal-form [type="submit"]').click();await page.waitForFunction(()=>!document.getElementById('client-quarter-goals-dialog').open);
 assert.deepEqual(await page.evaluate(()=>({week:savedPlans[0].workouts_week,weight:savedPlans[0].weight_target,bodyfat:savedPlans[0].bodyfat_target})),{week:4,weight:null,bodyfat:null});
 assert.equal(await page.locator('#client-quarter-goals .is-earned').count(),0);
 await page.evaluate(()=>{document.querySelector('#client-quarter-goals').hidden=true;document.querySelector('#progress').hidden=false;});
 const image=page.locator('#progress img');await image.waitFor();await page.waitForFunction(()=>{const img=document.querySelector('#progress img');return img.complete&&img.naturalWidth>0;});
 assert.match(await page.locator('#progress').innerText(),/Back · Biceps/);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width}: progress overflow`);
 if(width===390)await page.screenshot({path:path.join(directory,'progress-photo-cards-web.png')});
 await page.evaluate(()=>{document.querySelector('#progress').hidden=true;document.querySelector('#workouts').hidden=false;});
 for(const name of ['overview','notes']){await page.locator('[data-program-window="'+name+'"]').click();assert.equal(await page.locator('#client-program-info-dialog').evaluate(el=>el.open),true);assert.match(await page.locator('#client-program-info-dialog').innerText(),name==='overview'?/Strength & mobility/:/Keep your reps controlled/);await page.getByRole('button',{name:'Done',exact:true}).click();}
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width}: links overflow`);
 await page.evaluate(async()=>{window.failLoad=true;await controller.load();});assert.match(await page.locator('#client-quarter-goals').innerText(),/Connect to refresh/);
 assert.deepEqual(errors,[]);await page.close();
}
console.log('9 browser scenarios passed at 320/390/1280px: form save/retry, progress photo cards, program windows.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
