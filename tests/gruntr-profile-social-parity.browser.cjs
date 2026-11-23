const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { webkit, chromium } = require('playwright');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'client-dashboard.html'), 'utf8');
const css = [...html.matchAll(/<link[^>]+href="\/?(css\/[^"?]+)[^>]*>/g)]
  .map(match => fs.readFileSync(path.join(root, match[1]), 'utf8')).join('\n');
const fixture = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace(/<link\b[^>]*rel="stylesheet"[^>]*>/gi, '').replace('</head>', '<style>'+css+'</style></head>');
(async () => {
 const browser = await (process.env.PLAYWRIGHT_BROWSER === 'webkit' ? webkit : chromium).launch({headless:true});
 try {
  for (const width of [320,390,1280]) for (const theme of ['light','dark']) {
   const page = await browser.newPage({ viewport: {width,height:850} });
   await page.route('**/*', r => r.abort());
   await page.setContent(fixture);
   for (const script of ['client-community-social.js','gruntr-profile-activity.js']) await page.addScriptTag({path:path.join(root,'js',script)});
   await page.clock.setFixedTime(new Date('2026-11-22T20:00:00Z'));
   await page.evaluate(theme => {
    document.documentElement.dataset.clientTheme = theme;
    document.body.classList.remove('is-loading');
    document.getElementById('dashboard-loading').hidden=true;
    document.getElementById('dashboard-content').hidden=false;
    document.querySelectorAll('[data-client-dashboard-panel]').forEach(p=>p.hidden=p.dataset.clientDashboardPanel!=='profile');
    const owner='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', other='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
    const work='cccccccc-cccc-4ccc-accc-cccccccccccc', priv='dddddddd-dddd-4ddd-addd-dddddddddddd';
    const old='eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee', hidden='99999999-9999-4999-a999-999999999999';
    const day='2026-11-22', email='fixture@example.invalid', calls=[];
    let auth={id:owner,email}, fail=true, hold=false;
    const events=[
      {event_type:'workout',event_id:'workout:'+owner+':'+work,props_count:0,is_own:true,occurred_at:day+'T12:00:00Z',nickname:'Athlete'},
      {event_type:'gym_visit',event_id:'gym:'+owner+':'+day,props_count:1,is_own:true,occurred_at:day+'T12:00:00Z'},
      {event_type:'workout',event_id:'workout:'+owner+':'+old,props_count:8,is_own:true,occurred_at:'2026-11-18T12:00:00Z'},
      {event_type:'workout',event_id:'workout:'+other+':'+priv,props_count:6,is_own:true,occurred_at:day+'T12:00:00Z'},
      {event_type:'workout',event_id:'workout:'+owner+':'+hidden,props_count:3,is_own:false,occurred_at:day+'T12:00:00Z'}
    ];
    let comment = '';
    const api = {
     auth:{getSession: async()=>({data:{session:auth?{user:auth}:null}})},
     from(table){if(table!=='client_gym_checkins')throw Error(table);
      return {select(){return this},eq(){return this},lte(){return this},order(){return this},limit(){return Promise.resolve({data:[{entry_date:day,gym_name:'Sample Gym'}]})}};},
     async rpc(method, args){
      calls.push([method,args]);
      if(method==='community_wall_feed') {
       if(hold) return new Promise(resolve=>fixtureState.release=()=>resolve({data:events}));
       return {data:events};
      }
      if(method==='community_wall_comments') return fail ? {error:'fixture network error'} : {data:comment?[{nickname:'Athlete',body:comment}]:[]};
      if(method==='community_add_wall_comment'){comment=args.p_body;return {data:true};}
      throw Error('Unexpected RPC: '+method);
     }
    };
    const social=FWB_COMMUNITY_SOCIAL.mount(document,document.querySelector('[data-client-dashboard-panel="community"]'),{openCircles(){}});
    social.configure(api,owner,false);
    const logs=[['Shared Log',work],['Private Log',priv],['Old Log',old],['Not Owned',hidden]].map(([workout_title,session_id])=>({
     workout_title,session_id, id:other,entry_date:day,completed_at:day+'T10:00:00Z',updated_at:day+'T10:00:00Z',
     exercise_name:'Squat',weight_used:100,reps:5
    }));
    const context={client:api,owner,email,logs,today:day,status:'ready',sessionKey:r=>'session:'+r.session_id,
     openComments: social.openOwnThread,closeComments:social.closeOwnThread,
     canShareWorkout:()=>true,shareWorkout:row=>calls.push(['local-summary',row.key])};
    const profile=FWB_GRUNTR_PROFILE_ACTIVITY;
    window.fixtureState={calls,events,profile,context,social,pass(){fail=false;},hold(){hold=true;},
      swap(){auth={id:other,email:'other@example.invalid'};social.configure(api,other,false);
        profile.render({...context,owner:other,email:auth.email,logs:[]});},
      preview(){profile.render({...context,preview:true});}};
    profile.render(context);
    profile.selectTab('profile');
   },theme);
   const card = title => page.locator('[data-activity-kind=workout]').filter({hasText:title});
   const shared=card('Shared Log'), priv=card('Private Log'), old=card('Old Log'), gym=page.locator('[data-activity-kind=checkIn]');
   await shared.getByText('0 props',{exact:true}).waitFor();
   assert.equal(await shared.locator('button').filter({hasText:/props/i}).count(),0);
   assert.equal(await shared.getByText('Shared',{exact:true}).count(),1);
   assert.equal(await priv.getByText('Shared',{exact:true}).count(),0);
   assert.equal(await priv.getByRole('button',{name:'Comments'}).count(),0);
   assert.equal(await old.getByText('8 props',{exact:true}).count(),1);
   assert.equal(await old.getByRole('button',{name:'Comments'}).count(),0);
   assert.equal(await gym.getByText('1 prop',{exact:true}).count(),1);
   assert.equal(await card('Not Owned').getByRole('button',{name:'Comments'}).count(),0);
   const comments=shared.getByRole('button',{name:'Comments'});
   const props=await shared.getByText('0 props',{exact:true}).boundingBox(), commentBox=await comments.boundingBox();
   const share=shared.getByRole('button',{name:'Share workout'}), shareBox=await share.boundingBox();
   assert.ok(props.x<commentBox.x && commentBox.x+commentBox.width<=shareBox.x);
   assert.ok(commentBox.height>=44 && shareBox.height>=44 && shareBox.x+shareBox.width<=width);
   const colors=await comments.evaluate(el=>[getComputedStyle(el).color,getComputedStyle(el).backgroundColor]);
   assert.notEqual(colors[1],'rgba(0, 0, 0, 0)');
   await comments.focus(); await page.keyboard.press('Enter');
   const dialog=page.getByRole('dialog',{name:'Comments'});
   await dialog.getByText('Comments could not load. Try again.').waitFor();
   assert.equal(await dialog.getByRole('button',{name:'Post comment'}).isVisible(),false);
   await page.evaluate(()=>fixtureState.pass());
   await dialog.getByRole('button',{name:'Try Again'}).click();
   await dialog.getByLabel('Add a comment').fill('Synthetic comment');
   await dialog.getByRole('button',{name:'Post comment'}).click();
   await dialog.getByText('Synthetic comment',{exact:true}).waitFor();
   await dialog.getByRole('button',{name:'Close'}).click();
   assert.equal(await comments.evaluate(el=>el===document.activeElement),true);
   await share.click();
   await page.waitForFunction(()=>fixtureState.calls.some(([call])=>call==='local-summary'));
   assert.equal(await page.evaluate(()=>fixtureState.calls.filter(([call])=>call==='community_add_wall_comment').length),1);
   await page.evaluate(()=>{fixtureState.hold();document.dispatchEvent(new Event('fwb:community-visibility-changed'));});
   await page.waitForFunction(()=>Boolean(fixtureState.release));
   assert.equal(await comments.count(),0);
   await page.evaluate(()=>{fixtureState.swap();fixtureState.release();});
   assert.equal(await page.locator('.gruntr-profile-activity-comments').count(),0);
   await page.evaluate(()=>fixtureState.preview());
   assert.equal(await page.locator('[data-gruntr-profile-activity]').isVisible(),false);
   console.log(width+' '+theme+': shared/private, props, comments retry and exact write, keyboard focus, summary, revoked/stale/beta-preview guard');
   await page.close();
  }
 } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
