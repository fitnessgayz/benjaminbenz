const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/client-portal.js'), 'utf8');
function fn(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0);
  const rest = source.slice(start);
  const end = rest.slice(1).search(/\n(?:async )?function /);
  return rest.slice(0,end + 1);
}
function context(extra={}) {
  const ctx=vm.createContext({activeCustomWorkoutFormat:'single',customWorkoutTitle:'Custom workout',
    normalizeCustomWorkoutFormat:value=>['superset','circuit'].includes(value)?value:'single',
    escapeHtml:value=>String(value), ...extra});
  vm.runInContext(['normalizeCustomWorkoutInlineGroupType','customWorkoutInlineGroupOptionsMarkup','customWorkoutGroupedRoundCardMarkup','clearCustomWorkoutInlineGroup','updateCustomWorkoutInlineGrouping'].map(fn).join('\n'),ctx);
  return ctx;
}
test('visible grouped card exposes conversion controls outside hidden source cards',()=>{
  const ctx=context({customWorkoutGroupNameEditorMarkup:()=>'',customWorkoutCardMarkup:()=>'<article>Source card</article>',exerciseCardRows:()=>'<article>Assigned source</article>'});
  for(const format of ['single','superset','circuit']) {
    const markup=ctx.customWorkoutGroupedRoundCardMarkup(format,[{name:'Deadlift'}],2,0,'Custom workout',{panelFormat:'single'});
    const control=markup.indexOf('data-custom-workout-inline-group-options');
    assert.ok(control>markup.indexOf('</header>'));
    assert.ok(control<markup.indexOf('data-custom-workout-grouped-source'));
    assert.match(markup,/data-custom-workout-inline-group-option="superset"/);
    assert.match(markup,/data-custom-workout-inline-group-option="circuit"/);
  }
  for(const options of [{assigned:true,panelFormat:'single'},{panelFormat:'superset'},{panelFormat:'circuit'}]) {
    const markup=ctx.customWorkoutGroupedRoundCardMarkup('single',[],0,0,'Workout',options);
    assert.doesNotMatch(markup,/data-custom-workout-inline-group-options/);
  }
});
function fixture(count=4) {
  const cards=Array.from({length:count},(_,i)=>({dataset:{customWorkoutGroupType:'single',customWorkoutGroup:'0'},
    values:{name:`Exercise ${i}`,weight:50+i,reps:8,rir:2,complete:i===0},closest:()=>panel}));
  const panel={dataset:{customWorkoutFormat:'single'},querySelectorAll:()=>cards};
  let saved=0,synced=0;
  const ctx=context({syncCustomWorkoutCarousel:()=>{synced++;},syncCustomWorkoutFormatMarkers:()=>{},
    persistCustomWorkoutDraftFromPanel:()=>{saved++;},appendInlineGroupingPartner:()=>{const added={dataset:{customWorkoutGroupType:'single',customWorkoutGroup:'0'},closest:()=>panel};cards.push(added);return added;}});
  const toggle=(index,type,checked=true)=>ctx.updateCustomWorkoutInlineGrouping({dataset:{customWorkoutInlineGroupOption:type},checked,
    closest:selector=>selector==='[data-custom-workout-carousel]'?{querySelector:()=>cards[index]}:null});
  return {cards,panel,toggle,get saved(){return saved;},get synced(){return synced;}};
}
test('visible Superset control groups the selected exercise with its partner and reverses without losing entries',()=>{
  const f=fixture();const values=f.cards.map(card=>card.values);
  f.toggle(2,'superset');
  assert.deepEqual(f.cards.map(card=>card.dataset.customWorkoutGroupType),['single','single','superset','superset']);
  assert.equal(f.cards[2].dataset.customWorkoutGroup,f.cards[3].dataset.customWorkoutGroup);
  f.toggle(2,'superset',false);
  assert.ok(f.cards.every(card=>card.dataset.customWorkoutGroupType==='single'));
  f.cards.forEach((card,i)=>assert.equal(card.values,values[i]));
  assert.equal(f.saved,2);assert.equal(f.synced,2);
});
test('visible Circuit control creates and extends a circuit and can switch to superset',()=>{
  const f=fixture();
  f.toggle(0,'circuit');f.toggle(2,'circuit');
  assert.deepEqual(f.cards.map(card=>card.dataset.customWorkoutGroupType),['circuit','circuit','circuit','single']);
  assert.equal(f.cards[0].dataset.customWorkoutGroup,f.cards[2].dataset.customWorkoutGroup);
  f.toggle(0,'superset');
  assert.deepEqual(f.cards.map(card=>card.dataset.customWorkoutGroupType),['superset','superset','single','single']);
});
test('single remaining card gets a partner; non-straight workout format is protected',()=>{
  const f=fixture(1);f.toggle(0,'superset');assert.equal(f.cards.length,2);
  assert.ok(f.cards.every(card=>card.dataset.customWorkoutGroupType==='superset'));
  f.panel.dataset.customWorkoutFormat='circuit';f.toggle(0,'superset',false);assert.equal(f.saved,1);
});
