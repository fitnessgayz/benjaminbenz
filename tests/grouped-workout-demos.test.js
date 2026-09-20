const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../js/client-portal.js'), 'utf8');
const projectUrl = 'https://project.supabase.co';
const upload = `${projectUrl}/storage/v1/object/public/exercise-videos/squat/demo.mp4`;
function fn(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0);
  const rest = source.slice(start);
  const end = rest.slice(1).search(/\n(?:async )?function /);
  return rest.slice(0, end + 1);
}
function log(name, href='', editable=true) {
  return {dataset:{exerciseName:name}, input:editable?{value:name}:null,
    querySelector:selector=>selector==='.exercise-video-link' && href ? {getAttribute:()=>href}:null};
}
function fixture(entries=[]) {
  const ctx=vm.createContext({URL,window:{FWB_SUPABASE_CONFIG:{url:projectUrl}},exerciseNameMatcher:null,
    exerciseLibraryEntries:entries,customWorkoutGroupedLogElements:carousel=>carousel.logs,
    exerciseNameInputForLog:log=>log.input,
    escapeHtml:value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')});
  vm.runInContext(['youtubeExerciseSearchUrl','approvedExerciseForName','uploadedExerciseDemoUrl','exerciseVideoUrl','exerciseVideoMarkup','customWorkoutGroupedExerciseKeyMarkup','renderCustomWorkoutGroupedExerciseKey'].map(fn).join('\n'),ctx);
  return ctx;
}
for (const format of ['single','superset','circuit']) {
  test(`${format} visible exercise key has demo buttons for assigned and custom exercises`,()=>{
    const ctx=fixture([{name:'Goblet squat',aliases:['Squat'],demo_url:'https://youtu.be/squat'}]);
    const key={dataset:{}};
    const carousel={dataset:{customWorkoutFormat:format},logs:[log('Shoulder press','https://youtu.be/press'),log('Squat')],querySelector:()=>key};
    ctx.renderCustomWorkoutGroupedExerciseKey(carousel);
    assert.equal((key.innerHTML.match(/class="exercise-video-link"/g)||[]).length,2);
    assert.match(key.innerHTML,/href="https:\/\/youtu.be\/press"/);
    assert.match(key.innerHTML,/href="https:\/\/youtu.be\/squat"/);
    assert.match(key.innerHTML,/View demo for Shoulder press \(opens in a new tab\)/);
    assert.match(key.innerHTML,/target="_blank" rel="noopener noreferrer"/);
    assert.equal(key.dataset.count,'2');
  });
}
test('uploaded library video takes precedence over the old assigned demo',()=>{
  const ctx=fixture([{name:'Squat',demo_url:upload}]);
  const html=ctx.customWorkoutGroupedExerciseKeyMarkup({logs:[log('Squat','https://youtu.be/old')]});
  assert.ok(html.includes(upload));assert.ok(!html.includes('https://youtu.be/old'));
});
test('editing names updates demo and clearing a name removes the button',()=>{
  const ctx=fixture();const exercise=log('Shoulder press','https://youtu.be/press');
  const render=()=>ctx.customWorkoutGroupedExerciseKeyMarkup({logs:[exercise]});
  exercise.input.value='Cable fly';
  assert.ok(render().includes('Cable%20fly%20exercise%20demo'));assert.ok(!render().includes('youtu.be/press'));
  exercise.input.value='';
  assert.doesNotMatch(render(),/exercise-video-link/);assert.match(render(),/Exercise 1/);
  exercise.input.value='Shoulder press';
  assert.ok(render().includes('youtu.be/press'));
});
test('unnamed cards have no demo and noneditable assigned exercises retain theirs',()=>{
  const ctx=fixture();
  assert.doesNotMatch(ctx.customWorkoutGroupedExerciseKeyMarkup({logs:[log('')]}),/exercise-video-link/);
  assert.match(ctx.customWorkoutGroupedExerciseKeyMarkup({logs:[log('Press','https://youtu.be/press',false)]}),/youtu.be\/press/);
});
test('visible links keep URL validation and escape exercise names',()=>{
  const ctx=fixture();
  for(const href of ['javascript:alert(1)','https://untrusted.example/video.mp4']) {
    assert.doesNotMatch(ctx.customWorkoutGroupedExerciseKeyMarkup({logs:[log('Squat',href)]}),/exercise-video-link/);
  }
  const html=ctx.customWorkoutGroupedExerciseKeyMarkup({logs:[log('<img src=x>')]});
  assert.ok(!html.includes('<img'));assert.ok(html.includes('&lt;img src=x&gt;'));
});
