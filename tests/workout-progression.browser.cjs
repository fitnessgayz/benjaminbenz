// Isolated production markup/engine proof. All requests are blocked and all clients/history are synthetic.
// NODE_PATH=<bundled node_modules> node tests/workout-progression.browser.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const playwright = require('playwright');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/client-portal.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'client-dashboard.html'), 'utf8');
const styles = [...html.matchAll(/<link[^>]+href="\/?(css\/[^"?]+)[^>]*>/g)].map(m => fs.readFileSync(path.join(root, m[1]), 'utf8')).join('\n');
function production(name) {
  const start = source.indexOf(`function ${name}(`); assert.ok(start >= 0, name);
  const rest = source.slice(start), next = rest.slice(1).search(/\n(?:async )?function /);
  return rest.slice(0, next + 1);
}
const names = ['setCountFromPrescription', 'repTargetsFromPrescription', 'normalizedSetType', 'warmUpOrdinal', 'setNumberLabel', 'setTypeForRow', 'setRowMarkup', 'setRows', 'exerciseLogFields', 'exerciseNameInputForLog',
  'customWorkoutGroupedRoundCardMarkup', 'customWorkoutCarouselCards', 'customWorkoutGroupedLogElements', 'customWorkoutGroupedRows', 'customWorkoutGroupedCanonicalRow', 'customWorkoutGroupedRoundCode', 'customWorkoutGroupedFieldMarkup', 'customWorkoutGroupedSetRowMarkup', 'customWorkoutGroupedRoundCount', 'customWorkoutGroupedRoundIsLogged', 'customWorkoutGroupedSectionsMarkup', 'customWorkoutGroupedExerciseKeyMarkup', 'assignedWorkoutPrescriptionLabel', 'workoutSetUnit', 'setRowInputValues', 'currentExerciseLabel', 'restoreStrengthSetRows', 'savedStrengthSetSpecs', 'updateExerciseLogField', 'renderPreviousExerciseWeights', 'renderWorkoutProgression', 'restoreWorkoutProgressionHistory', 'pendingWorkoutProgressionDraft'];
const fixture = `
var warmUpSetType='warm_up', workingSetType='working', warmUpSetNumberBase=1000, customWorkoutTitle='Synthetic workout';
var WorkoutLayout=window.WorkoutLayout;
function escapeHtml(value) { return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'); }
function todayDate() { return '2026-09-26'; }
var sessionLogs=[];
function logsForExerciseDisplay() { return history; }
function logsForExercise() { return sessionLogs; }
function updateSetHistoryPlaceholders() {}
function personalBestWeightLog() { return null; }
function renderSetRirValue() {}
function renderExerciseNotesState() {}
function syncExerciseNamePreview() {}
function updateVisibleSetProgress() {}
function syncExerciseFinishedState() {}
function workoutProgressionContext() { return window.context; }
function exerciseVideoMarkup() { return ''; }
function exerciseLogActions() { return ''; }
function normalizeCustomWorkoutFormat(value) { return value; }
function customWorkoutGroupNameEditorMarkup() { return ''; }
function customWorkoutInlineGroupOptionsMarkup() { return ''; }
function exerciseCardRows(exercises, title) { return exercises.map(exercise=>'<article class="workout-exercise-card" data-custom-exercise-card>'+exerciseLogFields(exercise,title,{showDate:false,showDemo:false,showActions:false})+'</article>').join(''); }
function customWorkoutCardMarkup(exercise,title) { return exerciseCardRows([exercise],title); }
${names.map(production).join('\n')}
const config={enabled:true,exercise_key:'name:bench press',rep_min:8,rep_max:12,planned_sets:3,target_rir:2,increment:2.5,unit:'lb',required_sessions:2};
const history=['2026-09-20','2026-09-23'].flatMap((date,index)=>[1,2,3].map(set_number=>({session_id:'saved-'+index,entry_date:date,completed_at:date+'T20:00:00Z',exercise_name:'Bench Press',exercise_code:'A1',set_number,set_type:'working',weight_used:40,reps:12,effort_scale:'rir',effort_value:2,progression_target:config})));
const memory=new Map();
window.renderFixture=(format,custom)=>{
  document.querySelector('#fixture').className='client-workout-panel '+(custom?'client-workout-panel-custom':'client-workout-panel-assigned');
  document.querySelector('#fixture').innerHTML=customWorkoutGroupedRoundCardMarkup(format,[{code:'A1',name:'Bench Press',prescription:'8–12 reps x 3 sets',progression:config}],0,0,'Synthetic workout',{assigned:!custom});
  const carousel=document.querySelector('[data-custom-workout-grouped]');
  const log=customWorkoutGroupedLogElements(carousel)[0];
  log.querySelector('[data-set-number="1"] [data-set-weight]').value='45';
  log.querySelector('[data-set-number="2"] [data-set-reps]').value='10';
  const complete=log.querySelector('[data-set-number="3"]'); complete.classList.add('is-complete');
  complete.querySelector('[data-set-weight]').value='40'; complete.querySelector('[data-set-reps]').value='12';
  window.context={name:'Bench Press',date:'2026-09-26',title:'Synthetic workout',clientEmail:'synthetic@example.com',custom,sessionId:'current',history,historyComplete:true,now:new Date('2026-09-26T20:00:00Z'),storage:{getItem:key=>memory.get(key),setItem:(key,value)=>memory.set(key,value)},afterApply:()=>draw()};
  function draw() { carousel.querySelector('[data-custom-grouped-exercise-key]').innerHTML=customWorkoutGroupedExerciseKeyMarkup(carousel); carousel.querySelector('[data-custom-grouped-sections]').innerHTML=customWorkoutGroupedSectionsMarkup(carousel); window.FWB_WORKOUT_PROGRESSION_UI.render(log,window.context); }
  window.fixtureLog=log; window.drawFixture=draw; draw();
  window.simulateSaveRefresh=()=>{
    const rows=[...log.querySelectorAll('[data-set-row]')];
    const third=rows.find(row=>row.dataset.setNumber==='3');
    third.classList.remove('is-complete');
    third.querySelector('[data-set-weight]').value=''; third.querySelector('[data-set-reps]').value='';
    window.FWB_WORKOUT_PROGRESSION_UI.apply(log,window.context);
    rows.find(row=>row.dataset.setNumber==='1').classList.add('is-complete');
    window.FWB_WORKOUT_PROGRESSION_UI.persistPending(log,window.context);
    sessionLogs=[{entry_date:'2026-09-26',session_id:'current',exercise_name:'Bench Press',set_number:1,set_type:'working',weight_used:45,reps:8,progression_target:config}];
    updateExerciseLogField(log); draw();
    // A second refresh must keep the same pending values after another DOM rebuild.
    updateExerciseLogField(log); draw();
    return [...log.querySelectorAll('[data-set-row]')].map(row=>({number:row.dataset.setNumber,weight:row.querySelector('[data-set-weight]').value,reps:row.querySelector('[data-set-reps]').value,complete:row.classList.contains('is-complete')}));
  };
};
document.addEventListener('click',event=>{ if(event.target.closest('[data-progression-apply]')) window.FWB_WORKOUT_PROGRESSION_UI.apply(window.fixtureLog,window.context); });
`;
(async()=>{
  const browser = await playwright.chromium.launch({ headless:true, channel:'chrome' });
  const directory='/private/tmp/fwb-progression-browser'; fs.mkdirSync(directory,{recursive:true});
  let scenarios=0;
  try {
    for (const width of [320,390,1280]) {
      const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
      const errors=[]; page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/*',route=>route.abort());
      await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body class="dashboard-page client-dashboard-page"><main class="dashboard-shell"><div id="dashboard-content"><section id="fixture"></section></div></main></body></html>');
      await page.addStyleTag({content:styles});
      for(const file of ['js/workout-layout.js','js/workout-progression.js','js/workout-progression-ui.js']) await page.addScriptTag({content:fs.readFileSync(path.join(root,file),'utf8')});
      await page.addScriptTag({content:fixture});
      for(const format of ['single','superset','circuit']) for(const custom of [false,true]) {
        await page.evaluate(({format,custom})=>window.renderFixture(format,custom),{format,custom});
        const action=page.locator('[data-workout-progression-index] [data-progression-apply]');
        await action.click();
        const values=await page.evaluate(()=>[...window.fixtureLog.querySelectorAll('[data-set-row]')].map(row=>({number:row.dataset.setNumber,weight:row.querySelector('[data-set-weight]').value,reps:row.querySelector('[data-set-reps]').value,complete:row.classList.contains('is-complete')})));
        assert.deepEqual(values,[{number:'1001',weight:'',reps:'',complete:false},{number:'1',weight:'45',reps:'8',complete:false},{number:'2',weight:'42.5',reps:'10',complete:false},{number:'3',weight:'40',reps:'12',complete:true}]);
        const bounds=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,buttons:[...document.querySelectorAll('[data-workout-progression-index] button')].map(node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width};})}));
        assert.ok(bounds.scroll<=bounds.width+1,`${width}/${format}/${custom} page overflow ${JSON.stringify(bounds)}`);
        assert.ok(bounds.buttons.every(b=>b.width>0&&b.left>=0&&b.right<=bounds.width+1));
        assert.equal(await page.locator('[data-custom-grouped-round="1"] [data-custom-grouped-field="reps"]').inputValue(),'8');
        assert.deepEqual(errors,[]);
        if (format==='single'&&custom===false) await page.screenshot({path:path.join(directory,`${width}-suggested-targets.png`),fullPage:true});
        const refreshed = await page.evaluate(()=>window.simulateSaveRefresh());
        assert.deepEqual(refreshed,[{number:'1001',weight:'',reps:'',complete:false},{number:'1',weight:'45',reps:'8',complete:true},{number:'2',weight:'42.5',reps:'10',complete:false},{number:'3',weight:'42.5',reps:'8',complete:false}], 'Production save/restoreStrengthSetRows/updateExerciseLogField must preserve pending targets');
        assert.equal(await page.locator('[data-custom-grouped-round="2"] [data-custom-grouped-field="weight"]').inputValue(),'42.5');
        scenarios++;
      }
      await page.close();
    }
    console.log(`${scenarios} production browser scenarios passed (assigned/custom × straight/superset/circuit × 320/390/1280px). Screenshots: ${directory}`);
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
