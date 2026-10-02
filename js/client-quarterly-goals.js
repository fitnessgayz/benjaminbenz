(function attachQuarterGoals(root) {
  'use strict';
  const DAY = 86400000;
  function day(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return null;
    const date = Date.parse(value + 'T00:00:00Z');
    return Number.isFinite(date) && new Date(date).toISOString().slice(0, 10) === value ? date : null;
  }
  const key = date => new Date(date).toISOString().slice(0, 10);
  function quarterStart(today) {
    if (day(today) === null) return '';
    return `${today.slice(0, 4)}-${String(Math.floor((Number(today.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, '0')}-01`;
  }
  function quarterEnd(start) {
    if (day(start) === null) return '';
    const date = new Date(day(start)); date.setUTCMonth(date.getUTCMonth() + 3); return key(date);
  }
  const label = start => `Q${Math.floor((Number(start.slice(5, 7)) - 1) / 3) + 1} · ${start.slice(0, 4)}`;
  function valid(goal) {
    return quarterStart(goal.quarter_start) === goal.quarter_start && goal.quarter_start !== ''
      && [['workouts_week',21],['workouts_month',93],['workouts_quarter',279],['visits_week',7],['visits_month',31],['visits_quarter',92]]
        .every(([name,max]) => Number.isInteger(goal[name]) && goal[name] >= 1 && goal[name] <= max)
      && (goal.weight_target == null || (typeof goal.weight_target === 'number' && Number.isFinite(goal.weight_target) && goal.weight_target > 0 && goal.weight_target <= 1500))
      && (goal.bodyfat_target == null || (typeof goal.bodyfat_target === 'number' && Number.isFinite(goal.bodyfat_target) && goal.bodyfat_target > 0 && goal.bodyfat_target < 100))
      && ['at_or_below','at_or_above'].includes(goal.weight_direction) && typeof goal.motivation === 'string' && [...goal.motivation].length <= 1000;
  }
  function defaults(clientID,today) {
    return {client_id:clientID,quarter_start:quarterStart(today),workouts_week:3,workouts_month:12,workouts_quarter:36,
      visits_week:3,visits_month:12,visits_quarter:36,weight_target:null,weight_direction:'at_or_below',bodyfat_target:null,motivation:''};
  }
  function evaluate(goal,{workouts=[],visits=[],measurements=[],today}={}) {
    if (!valid(goal) || day(today) === null) return [];
    const end = quarterEnd(goal.quarter_start);
    const within = date => day(date) !== null && date >= goal.quarter_start && date < end && date <= today;
    const badges=[];
    for (const [metric,dates,title] of [['workouts',workouts.filter(within).sort(),'Workout'],['visits',[...new Set(visits.filter(within))].sort(),'Gym visit']]) {
      for (const period of ['week','month','quarter']) {
        const counts=new Map(); let earnedOn=null;
        const target=goal[`${metric}_${period}`];
        for (const date of dates) {
          const bucket=period==='week' ? key(day(date)-((new Date(day(date)).getUTCDay()+6)%7)*DAY) : period==='month' ? date.slice(0,7) : goal.quarter_start;
          counts.set(bucket,(counts.get(bucket)||0)+1);
          if (!earnedOn && counts.get(bucket)>=target) earnedOn=date;
        }
        badges.push({id:`${goal.quarter_start}:${metric}:${period}`,title:`${title} ${period} goal`,
          detail:`${target} ${metric==='visits'?'gym visits':'completed workouts'} in a ${period} · ${label(goal.quarter_start)}`,
          icon:metric==='visits'?'calendar':'dumbbell.fill',current:Math.min(target,Math.max(0,...counts.values())),target,earnedOn,unlocked:!!earnedOn});
      }
    }
    const entries=measurements.filter(row=>within(row.entry_date)).sort((a,b)=>a.entry_date.localeCompare(b.entry_date));
    for (const [metric,target,title] of [['weight',goal.weight_target,'Weight goal'],['bodyfat',goal.bodyfat_target,'Body-fat goal']]) {
      if (target==null) continue;
      const above=metric==='weight' && goal.weight_direction==='at_or_above';
      const achieved=entries.find(row=> {
        const value=row[metric==='weight'?'bodyweight':'bodyfat'];
        return typeof value==='number' && Number.isFinite(value) && value>0 && (metric!=='bodyfat'||value<100) && (above ? value>=target : value<=target);
      });
      badges.push({id:`${goal.quarter_start}:${metric}`,title,detail:`at or ${above?'above':'below'} ${target}${metric==='weight'?' lb':'%'} · ${label(goal.quarter_start)}`,
        icon:'target',current:achieved?1:0,target:1,earnedOn:achieved?.entry_date||null,unlocked:!!achieved});
    }
    return badges;
  }
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function badgesMarkup(badges) {
    return `<ul class="quarter-badge-grid">${badges.map(b=>`<li class="quarter-badge${b.unlocked?' is-earned':''}"><span class="quarter-medal" aria-hidden="true">${b.unlocked?'✓':'◇'}</span><div><strong>${escape(b.title)}</strong><p>${escape(b.detail)}</p>${b.earnedOn?`<small>Earned ${escape(b.earnedOn)}</small>`:b.target>1?`<progress max="${b.target}" value="${b.current}" aria-label="${escape(b.title)}">${b.current}/${b.target}</progress><small>${b.current} / ${b.target} · best period this quarter</small>`:'<small>Keep tracking in Stats & measurements</small>'}</div></li>`).join('')}</ul>`;
  }
  function mount({client,getContext,getWorkoutDates,historyReady,retryHistory,document=root.document}) {
    const panel=document.getElementById('client-quarter-goals'), collection=document.getElementById('client-quarter-badges');
    if (!panel) return null;
    let plans=[],visits=[],measurements=[],status='loading',message='',generation=0,ownerID=null,timer;
    const dialog=document.getElementById('client-quarter-goals-dialog');
    const current=()=>quarterStart(getContext().today);
    async function readAll(table,columns,email,from) {
      const rows=[];
      for (let offset=0;;offset+=1000) {
        let query=client.from(table).select(columns).eq('client_email',email).gte('entry_date',from).lte('entry_date',getContext().today).order('entry_date');
        if(table==='client_progress') query=query.order('id');
        const result=await query.range(offset,offset+999);
        if(result.error) throw result.error;
        rows.push(...result.data); if(result.data.length<1000) return rows;
      }
    }
    function render() {
      const context=getContext();
      const heading=`<p class="kicker">${escape(label(current()))}</p><h3>Goals for the quarter</h3>`;
      if(context.readOnly) {
        panel.innerHTML=heading+'<p>Quarterly goals are available in the client’s account.</p>';
        if(collection) collection.innerHTML='<h3>Quarterly goal badges</h3><p>Available in the client’s account.</p>';
        return;
      }
      if(status==='loading'||(status==='ready'&&ownerID!==context.user?.id)) {
        panel.innerHTML=heading+'<p role="status">Loading your goals…</p>';
        if(collection) collection.innerHTML='<h3>Quarterly goal badges</h3><p>Loading your goals…</p>';
        return;
      }
      if(status==='error'||!historyReady()) {
        panel.innerHTML=heading+'<p role="status">Connect to refresh your goals and badges.</p><button class="button button-ghost" type="button" data-quarter-retry>Try again</button>';
        if(collection) collection.innerHTML='<h3>Quarterly goal badges</h3><p>Connect to refresh your saved progress.</p>';
        return;
      }
      const goal=plans.find(plan=>plan.quarter_start===current());
      const activity={workouts:getWorkoutDates(),visits:visits.map(v=>v.entry_date),measurements,today:context.today};
      panel.innerHTML=heading+`<p>Plan workouts and gym visits separately, with optional weight and body-fat targets.</p><button class="button button-dark" type="button" data-quarter-edit>${goal?'Edit':'Set'} quarterly goals</button><p role="status">${escape(message)}</p>`+(goal?badgesMarkup(evaluate(goal,activity)):'<p>Set your targets to start earning quarterly badges.</p>');
      if(collection) collection.innerHTML='<h3>Quarterly goal badges</h3>'+ (plans.length?plans.map(plan=>`<h4>${escape(label(plan.quarter_start))}</h4>${badgesMarkup(evaluate(plan,activity))}`).join(''):'<p>Set your quarterly goals in Settings → Fitness questionnaire.</p>');
    }
    async function load() {
      const request=++generation,context=getContext();
      if(!context.user||!client) return;
      if(context.readOnly) {status='ready';render();return;}
      try {
        const result=await client.from('client_quarterly_goals').select('*').eq('client_id',context.user.id).order('quarter_start',{ascending:false});
        if(result.error) throw result.error;
        const from=[current(),...result.data.map(plan=>plan.quarter_start)].sort()[0];
        const [gym,entries]=await Promise.all([readAll('client_gym_checkins','entry_date',context.email,from),readAll('client_progress','entry_date,bodyweight,bodyfat',context.email,from)]);
        if(request!==generation||context.user.id!==getContext().user?.id) return;
        plans=result.data;visits=gym;measurements=entries;ownerID=context.user.id;status='ready';render();
      } catch (_) {if(request===generation){status='error';render();}}
    }
    function open() {
      const context=getContext(); if(context.readOnly||status!=='ready'||ownerID!==context.user?.id)return;
      const goal=plans.find(plan=>plan.quarter_start===current())||defaults(context.user.id,context.today);
      dialog.innerHTML=`<form class="quarter-goal-form"><div class="quarter-dialog-heading"><h3 id="quarter-goal-dialog-title">${escape(label(current()))} goals</h3><button class="button button-ghost" type="button" data-quarter-close aria-label="Close quarterly goals">×</button></div><p>What would you like to achieve this quarter?</p><label>Your focus<textarea name="motivation" maxlength="1000">${escape(goal.motivation)}</textarea></label>${[['workouts','Completed workouts',[21,93,279]],['visits','Gym visits · tracked separately',[7,31,92]]].map(([metric,title,max])=>`<fieldset><legend>${title}</legend><div class="quarter-targets">${['week','month','quarter'].map((period,i)=>`<label>${period==='quarter'?'This quarter':`Per ${period}`}<input type="number" name="${metric}_${period}" min="1" max="${max[i]}" step="1" required value="${goal[`${metric}_${period}`]}"></label>`).join('')}</div></fieldset>`).join('')}<fieldset><legend>Body goals · optional</legend><label>Target weight (lb)<input type="number" name="weight_target" min="0.1" max="1500" step="any" value="${goal.weight_target??''}"></label><label>Weight target<select name="weight_direction"><option value="at_or_below"${goal.weight_direction==='at_or_below'?' selected':''}>At or below</option><option value="at_or_above"${goal.weight_direction==='at_or_above'?' selected':''}>At or above</option></select></label><label>Target body fat (%) · at or below<input type="number" name="bodyfat_target" min="0.1" max="99.99" step="any" value="${goal.bodyfat_target??''}"></label><p>Leave either target blank to skip it. Badges use measurements saved in this quarter.</p></fieldset><p role="status" data-quarter-save-status></p><button class="button button-dark" type="submit">Save quarterly goals</button></form>`;
      dialog.showModal();
      dialog.querySelector('[data-quarter-close]').onclick=()=>dialog.close();
      dialog.querySelector('form').onsubmit=async event=>{
        event.preventDefault();const form=event.currentTarget,values=new FormData(form),submit=form.querySelector('[type="submit"]'),feedback=form.querySelector('[data-quarter-save-status]');
        if(submit.disabled) return;
        const plan=defaults(context.user.id,context.today);
        for(const name of ['workouts_week','workouts_month','workouts_quarter','visits_week','visits_month','visits_quarter'])plan[name]=Number(values.get(name));
        for(const name of ['weight_target','bodyfat_target'])plan[name]=values.get(name)===''?null:Number(values.get(name));
        plan.weight_direction=values.get('weight_direction');plan.motivation=values.get('motivation').trim();
        if(!valid(plan)){feedback.textContent='Enter valid positive targets.';return;}
        submit.disabled=true;feedback.textContent='Saving…';
        try {
          const verified=await client.auth.getUser();
          if(verified.error||verified.data.user?.id!==context.user.id||context.user.id!==getContext().user?.id||getContext().readOnly)throw Error('Account changed');
          const result=await client.from('client_quarterly_goals').upsert(plan,{onConflict:'client_id,quarter_start'}).select();
          if(result.error||result.data?.length!==1||context.user.id!==getContext().user?.id||getContext().readOnly)throw Error('Not confirmed');
          ++generation;
          plans=[result.data[0],...plans.filter(p=>p.quarter_start!==plan.quarter_start)];message='Quarterly goals saved. Your coach can review them.';render();dialog.close();
        } catch (_) {feedback.textContent='Your goals could not be saved. Your answers are still here; try again.';}
        finally{submit.disabled=false;}
      };
    }
    panel.onclick=async event=>{
      if(event.target.closest('[data-quarter-edit]'))open();
      if(event.target.closest('[data-quarter-retry]')) {
        if(!historyReady()&&retryHistory)await retryHistory();
        await load();
      }
    };
    document.addEventListener('fwb:gym-checkin-saved',()=>void load());
    dialog.addEventListener('close',()=>panel.querySelector('[data-quarter-edit]')?.focus());
    return {load,render,refresh(){clearTimeout(timer);timer=setTimeout(()=>void load(),200);}};
  }
  const api={quarterStart,quarterEnd,label,valid,defaults,evaluate,badgesMarkup,mount};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.FWB_QUARTER_GOALS=api;
})(typeof window!=='undefined'?window:globalThis);
