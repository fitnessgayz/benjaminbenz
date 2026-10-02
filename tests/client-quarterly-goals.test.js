const test=require('node:test');
const assert=require('node:assert/strict');
const goals=require('../js/client-quarterly-goals.js');
const achievements=require('../js/client-achievements.js');
const plan=()=>({...goals.defaults('client','2026-10-02'),weight_target:180,bodyfat_target:18});
const badge=(result,suffix)=>result.find(b=>b.id.endsWith(suffix));
test('calendar quarters handle year rollover and invalid dates',()=>{
 assert.equal(goals.quarterStart('2026-10-02'),'2026-10-01');
 assert.equal(goals.quarterEnd('2026-10-01'),'2027-01-01');
 assert.equal(goals.quarterStart('2026-02-30'),'');
 assert.equal(goals.quarterStart('2024-02-29'),'2024-01-01');
});
test('workouts and visits are separate; repeat gym check-ins count once',()=>{
 const p=plan();p.workouts_week=2;p.visits_week=2;
 const result=goals.evaluate(p,{workouts:['2026-10-01','2026-10-01'],visits:['2026-10-01','2026-10-01'],today:'2026-10-02'});
 assert.equal(badge(result,':workouts:week').unlocked,true);
 assert.equal(badge(result,':visits:week').unlocked,false);
 assert.equal(badge(result,':visits:week').current,1);
});
test('Monday resets weekly counts and calendar months reset monthly counts',()=>{
 const p=plan();p.workouts_week=2;p.workouts_month=3;p.workouts_quarter=4;
 const result=goals.evaluate(p,{workouts:['2026-10-04','2026-10-05','2026-10-30','2026-11-02'],today:'2026-11-03'});
 assert.equal(badge(result,':workouts:week').unlocked,false);
 assert.equal(badge(result,':workouts:month').earnedOn,'2026-10-30');
 assert.equal(badge(result,':workouts:quarter').earnedOn,'2026-11-02');
});
test('future days and previous-quarter activity cannot earn badges',()=>{
 const result=goals.evaluate(plan(),{workouts:['2026-09-30','2026-10-03','2027-01-01'],visits:['2026-09-30'],measurements:[{entry_date:'2026-09-30',bodyweight:175,bodyfat:15},{entry_date:'2026-10-03',bodyweight:175,bodyfat:15}],today:'2026-10-02'});
 assert.ok(result.every(b=>!b.unlocked&&b.current===0));
});
test('body goals use saved values; missing, zero, nonnumeric values earn nothing',()=>{
 const result=goals.evaluate(plan(),{measurements:[{entry_date:'2026-10-01',bodyweight:0,bodyfat:null},{entry_date:'2026-10-02',bodyweight:'170',bodyfat:NaN}],today:'2026-10-02'});
 assert.equal(badge(result,':weight').unlocked,false);assert.equal(badge(result,':bodyfat').unlocked,false);
});
test('body badges retain the first achievement even after a later rebound',()=>{
 const result=goals.evaluate(plan(),{measurements:[{entry_date:'2026-10-02',bodyweight:190,bodyfat:20},{entry_date:'2026-10-01',bodyweight:180,bodyfat:18}],today:'2026-10-02'});
 assert.equal(badge(result,':weight').earnedOn,'2026-10-01');assert.equal(badge(result,':bodyfat').earnedOn,'2026-10-01');
});
test('weight gain can target at or above; blank body targets omit those badges',()=>{
 const p=plan();p.weight_direction='at_or_above';p.bodyfat_target=null;
 const result=goals.evaluate(p,{measurements:[{entry_date:'2026-10-01',bodyweight:181}],today:'2026-10-02'});
 assert.equal(badge(result,':weight').unlocked,true);assert.equal(result.length,7);
 p.weight_target=null;assert.equal(goals.evaluate(p,{today:'2026-10-02'}).length,6);
});
test('validation rejects impossible visits, fractions, and invalid body targets',()=>{
 for(const edit of [{visits_week:8},{workouts_week:1.5},{bodyfat_target:100},{weight_target:Infinity},{quarter_start:'2026-10-02'}])assert.equal(goals.valid({...plan(),...edit}),false);
});
test('completed-session dates deduplicate sets and reject empty or unfinished workouts',()=>{
 const row=(id,extra={})=>({session_id:id,entry_date:'2026-10-01',exercise_name:'Row',weight_used:20,reps:10,set_number:1,completed_at:'2026-10-01T12:00:00Z',...extra});
 const dates=achievements.completedWorkoutDates([row('one'),row('one',{set_number:2}),row('two',{completed_at:null}),row('three',{reps:0})],{today:'2026-10-02'});
 assert.deepEqual(dates,['2026-10-01']);
});
test('badge markup escapes dynamic content',()=>{
 assert.doesNotMatch(goals.badgesMarkup([{title:'<script>x</script>',detail:'<img>',current:1,target:3,unlocked:false}]),/<script>|<img>/);
});
