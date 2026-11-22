const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");
const { createHash } = require("node:crypto");
const routines = require("../js/client-workout-routines");
const portal = fs.readFileSync(require.resolve("../js/client-portal.js"),"utf8");

test("Explore exposes four exact native routines without changing Benjamin or old links", () => {
  const markup = routines.markup(String);
  const titles = ["Full Body Foundations","Lower Body &amp; Core","Upper Body Strength","Full Body Strength"];
  const slugs = ["foundations","lower-core","upper-strength","full-strength"];
  assert.equal((markup.match(/class="client-routine client-at-home-card"/g)||[]).length,4);
  assert.match(markup,/Benjamin’s Routine/);
  assert.ok(routines.find("home-bodyweight"));
  for (let i=0;i<4;i++) {
    const id=createHash("sha256").update("fwb-explore-at-home-v1|"+slugs[i]).digest().subarray(0,16);
    id[6]=(id[6]&15)|80; id[8]=(id[8]&63)|128;
    const h=id.toString("hex"), uuid=[h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join("-");
    const routine=routines.find(uuid);
    assert.equal(routine.title,titles[i].replace("&amp;","&"));
    assert.match(markup,new RegExp(routine.cover+"\\.webp"));
    assert.ok(fs.existsSync(require.resolve("../images/routines/"+routine.cover+".webp")));
    assert.ok(routine.exercises.every(e=>e.rest===[60,60,75,90][i]+"s rest"));
  }
});

test("custom workout rest restores seconds and explicit Off without leaking between accounts", () => {
  const declarations=portal.slice(portal.indexOf("const workoutExerciseRestOptions"),portal.indexOf("function startAutomaticRestTimer"));
  function f(name) {
    const start=portal.indexOf("function "+name+"(");
    return portal.slice(start,portal.indexOf("\nfunction ",start+1));
  }
  const context={};
  vm.runInNewContext(`
    let workoutElapsedTimerState = {clientEmail:"fixture@example.test",panelIndex:0,running:false,updatedAt:Date.now()};
    let account="fixture@example.test", stored, seconds=60;
    const workoutElapsedTimerClientEmail=()=>account, clientCustomWorkoutPanelIndex=()=>0, automaticRestSeconds=()=>seconds;
    const workoutElapsedTimerStorageKey="fixture", workoutElapsedTimerMaximumMilliseconds=86400000;
    const workoutElapsedTimerIsStale=()=>false;
    const persistWorkoutElapsedTimerState=()=>{stored=JSON.stringify(workoutElapsedTimerState);};
    const window={localStorage:{getItem:()=>stored}};
    ${declarations}
    ${f("readWorkoutElapsedTimerState")}
    const row=(key)=>({dataset:{exerciseCode:key},closest:()=>true});
    this.fixture={row,set:storeWorkoutExerciseRestChoice,get:workoutExerciseRestSeconds,preferences(v){seconds=v;},
      resume(){workoutElapsedTimerState=readWorkoutElapsedTimerState();}, account(v){account=v;}};
  `,context);
  const x=context.fixture;
  x.set(x.row("CW01"),"90"); x.set(x.row("CW02"),"0");
  x.resume();
  assert.equal(x.get(x.row("CW01")),90);
  assert.equal(x.get(x.row("CW02")),0);
  x.preferences(120);
  assert.equal(x.get(x.row("CW03")),120);
  x.set(x.row("CW01"),"");
  assert.equal(x.get(x.row("CW01")),120);
  x.account("different@example.test");
  assert.equal(x.get(x.row("CW02")),120);
});
