// Offline browser test. Use NODE_PATH=<Playwright modules> PLAYWRIGHT_BROWSER=webkit.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, webkit } = require("playwright");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");
const styles = [...html.matchAll(/<link[^>]+href="\/?(css\/[^"?]+)[^>]*>/g)]
  .map(match => fs.readFileSync(path.join(root, match[1]), "utf8")).join("\n");
const portal = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");
const fixture = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
  .replace(/<link\b[^>]*rel="stylesheet"[^>]*>/gi, "")
  .replace("</head>", `<style>${styles}</style></head>`);
function production(name) {
  const start = portal.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  const tail = portal.slice(start);
  return tail.slice(0, tail.slice(1).search(/\n(?:async )?function /) + 1);
}
function luminance([r,g,b]) {
  const channels = [r,g,b].map(channel => {const c = channel / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;});
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}
const rgb = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);
const contrast = (fg, bg) => {
  const [high, low] = [luminance(rgb(fg)), luminance(rgb(bg))].sort((a,b) => b - a);
  return (high + .05) / (low + .05);
};
(async () => {
  const name = process.env.PLAYWRIGHT_BROWSER || "chromium";
  const browser = await ({ chromium, webkit })[name].launch({headless: true});
  try {
    for (const width of [320,390,1280]) for (const theme of ["light","dark"]) {
      const page = await browser.newPage({viewport:{width,height:760}});
      await page.route("**/*", route => route.abort());
      await page.setContent(fixture);
      for (const script of ["lifthardr-profile.js","gruntr-profile-activity.js","client-achievements-ui.js","client-workout-calendar.js"]) {
        await page.addScriptTag({path:path.join(root,"js",script)});
      }
      // Integrate the production measurement renderer with synthetic values.
      await page.addScriptTag({content:[
        production("latestClientProgressValue"), production("progressMetricDetails"), production("progressMetricNumber"),
        production("formatProgressValue"), production("renderProfileMeasurementChart"),
        'const escapeHtml = String, progressMetricValue = (entry, key) => entry[key];',
        'function renderProgressGraph(_entries, {chart,metricKey}) { chart.dataset.renderedMetric = metricKey; }'
      ].join('\n')});
      await page.evaluate(selected => {
        document.documentElement.dataset.clientTheme = selected;
        document.body.classList.remove("is-loading");
        document.getElementById("dashboard-loading").hidden = true;
        document.getElementById("dashboard-content").hidden = false;
        window.profile = document.querySelector('[data-client-dashboard-panel="profile"]');
        document.querySelectorAll("[data-client-dashboard-panel]").forEach(panel => panel.hidden = panel !== profile);
        document.querySelectorAll("[data-client-dashboard-tab]").forEach(tab => {
          const active = tab.dataset.clientDashboardTab === "profile";
          tab.classList.toggle("is-active",active);
          if (active) tab.setAttribute("aria-current","page");
          else tab.removeAttribute("aria-current");
        });
        window.syntheticUser = {id:"owner",email:"owner@example.invalid"};
        window.syntheticRows = [{
          id:"pt", client_email:syntheticUser.email, active:true, client_archived:false, membership_type:"personal_training",
          session_count_used:9,session_count_total:10
        }];
        window.boundAuth = { onAuthStateChange(callback) {
          window.syntheticEvent = callback;
          return {data:{subscription:{unsubscribe() {}}}};
        }};
        FWB_LIFTHARDR_PROFILE.configurePack({ user:syntheticUser, clientEmail:syntheticUser.email, programs:syntheticRows, auth:boundAuth });
        window.syntheticEvent("INITIAL_SESSION",{user:syntheticUser});
        FWB_LIFTHARDR_PROFILE.render({
          name:"Sample Athlete",status:"ready",today:"2026-11-20",
          achievements:{badges:[{id:"workout-1",title:"First Spark",detail:"Finish your first workout.",unlocked:true}]},
          logs:[{entry_date:"2026-11-19",workout_title:"Sample workout",workout_duration_seconds:1200,reps:8,weight_used:100}],
          sessionKey:row=>row.workout_title,isWorkingSet:()=>true
        });
        window.syntheticMeasurements = [{bodyweight:158,chest:39},{bodyweight:160,chest:40}];
        renderProfileMeasurementChart(syntheticMeasurements);
      },theme);
      await page.evaluate(() => {
        const gymRecords = [{entry_date:"2026-11-20",gym_name:"Sample Gym"}];
        const queries = [];
        const query = {
          select() { return this; },
          eq(field,value) { queries.push([field,value]); return this; },
          lte() { return this; }, order() { return this; },
          limit() { return Promise.resolve({data:gymRecords,error:null}); }
        };
        const client = {
          auth:{getSession:()=>Promise.resolve({data:{session:{user:syntheticUser}},error:null})},
          from(table) {
            if (table !== "client_gym_checkins") throw Error("Unexpected Profile data read");
            return query;
          }
        };
        window.feedQueries=queries;
        const complete={entry_date:"2026-11-20",session_id:"workout-synthetic",completed_at:"2026-11-20T12:00:00Z",
          workout_title:"Sample Strength",gym_name:"Sample Gym",workout_duration_seconds:1200};
        window.syntheticFeed={
          client,owner:syntheticUser.id,email:syntheticUser.email,preview:false,today:"2026-11-20",status:"ready",
          logs:[
            {...complete,exercise_name:"Bench Press",weight_used:100,reps:8},
            {...complete,exercise_name:"Row",weight_used:40,reps:10},
            {...complete,exercise_name:"Squat",weight_used:125,reps:8},
            {...complete,exercise_name:"Warm-up",weight_used:10,reps:8,set_type:"warmup"},
            {...complete,workout_title:"Never show unfinished",session_id:"draft",completed_at:null,exercise_name:"Bench Press"}
          ],
          achievements:{prs:1,badges:[{id:"workout-1",unlocked:true}],events:[
            {kind:"pr",id:"pr-1",title:"Bench Press PR",detail:"100 lb × 8",date:"2026-11-20",sessionId:"workout-synthetic"},
            {kind:"badge",id:"badge-1",title:"First Spark",date:"2026-11-20",sessionId:"workout-synthetic"}
          ]},
          openWorkout:key=>{window.syntheticOpenedKey=key;},
          setKind:row=>row.set_type==="warmup"?"warmup":"strength",
          sessionKey:row=>row.session_id
        };
        FWB_GRUNTR_PROFILE_ACTIVITY.render(syntheticFeed);
        FWB_GRUNTR_PROFILE_ACTIVITY.selectTab("profile");
      });
      const profile = page.locator('[data-client-dashboard-panel="profile"]');
      const count = profile.locator("[data-client-profile-session-pack]");
      assert.equal(await count.innerText(),"1 session left in current pack");
      const order = await profile.locator(":scope > :not(dialog)").evaluateAll(list=>list.map(node=>node.className));
      assert.deepEqual(order.slice(0,4),["lifthardr-profile-topbar","lifthardr-profile-identity","lifthardr-profile-insight-stack","lifthardr-profile-shortcuts"]);
      const stats = profile.locator("#client-profile-measurements");
      const snapshot = profile.locator("details").nth(1);
      assert.equal(await stats.getAttribute("open"),null);
      assert.equal(await snapshot.getAttribute("open"),null);
      assert.match(await stats.locator("summary").innerText(),/160 lb/);
      assert.match(await snapshot.locator("summary").innerText(),/20 min/);
      await stats.locator("summary").focus();
      await page.keyboard.press("Enter");
      assert.notEqual(await stats.getAttribute("open"),null);
      assert.equal(await stats.getByRole("button",{name:"Update Measurements"}).isVisible(),true);
      assert.equal(await stats.getByRole("button",{name:"View Full Stats"}).isVisible(),true);
      assert.equal(await stats.getByRole("button",{name:"Bodyweight 160 lb"}).getAttribute("aria-pressed"),"true");
      await snapshot.locator("summary").click();
      await snapshot.getByRole("button",{name:"Volume",exact:true}).click();
      assert.equal(await snapshot.locator("[data-lifthardr-profile-week-value]").innerText(),"800 lb");
      const before = await snapshot.locator(".lifthardr-profile-chart-bars li").count();
      await snapshot.getByRole("combobox").selectOption("6");
      assert.ok(await snapshot.locator(".lifthardr-profile-chart-bars li").count() > before);
      const mini = profile.locator(".lifthardr-profile-counts");
      assert.deepEqual(await mini.locator(".lifthardr-profile-count").evaluateAll(items=>items.map(node=>node.title)),
        ["Squad members","Badges earned","Personal records","Gym workouts logged"]);
      assert.equal(await mini.locator('svg[aria-hidden="true"]').count(),4);
      const miniBoxes = await mini.locator(".lifthardr-profile-count").evaluateAll(items=>items.map(node => {
        const box=node.getBoundingClientRect();
        return {x:box.left,y:box.top,w:box.width,h:box.height};
      }));
      assert.equal(new Set(miniBoxes.map(box=>box.y)).size,width===320?2:1,JSON.stringify(miniBoxes));
      assert.ok(miniBoxes.every(box=>box.w>=44&&box.h>=44));
      for (const label of await mini.locator(".sr-only").all()) assert.equal(await label.evaluate(node=>getComputedStyle(node).position),"absolute");
      assert.equal(await mini.locator("[data-gruntr-profile-badges]").innerText(),"1");
      assert.equal(await mini.locator("[data-gruntr-profile-records]").innerText(),"1");
      const geometry = await page.evaluate(() => {
        const card = document.querySelector("#client-profile-measurements");
        const title = card.querySelector("summary strong");
        const shortcutWidths = [...profile.querySelectorAll(".lifthardr-profile-shortcuts button")].map(el=>el.getBoundingClientRect().height);
        const packRect = document.querySelector("[data-client-profile-session-pack]").getBoundingClientRect();
        const iconRect = document.querySelector(".lifthardr-profile-counts").getBoundingClientRect();
        const nameRect = document.querySelector("[data-lifthardr-profile-name]").getBoundingClientRect();
        return {view:innerWidth,scroll:document.documentElement.scrollWidth,color:getComputedStyle(title).color,
          bg:getComputedStyle(card).backgroundColor,shortcutWidths,packTop:packRect.top,iconBottom:iconRect.bottom,iconTop:iconRect.top,nameBottom:nameRect.bottom};
      });
      assert.equal(geometry.view,geometry.scroll,JSON.stringify(geometry));
      assert.ok(contrast(geometry.color,geometry.bg) >= 4.5,JSON.stringify(geometry));
      assert.ok(geometry.shortcutWidths.every(height=>height>=44));
      assert.ok(geometry.nameBottom<=geometry.iconTop && geometry.packTop>=geometry.iconBottom);
      const activity = profile.locator("[data-gruntr-profile-activity]");
      await activity.locator('[data-activity-kind="checkIn"]').waitFor();
      assert.equal(await activity.getByRole("button",{name:"Try Again"}).isVisible(),false);
      assert.equal(await activity.getByRole("button",{name:"Show More Activity"}).isVisible(),false);
      assert.deepEqual(await activity.locator("ol > li").evaluateAll(nodes=>nodes.map(node=>node.dataset.activityKind)),
        ["workout","pr","badge","checkIn"]);
      assert.deepEqual(await page.evaluate(()=>feedQueries),[["client_email","owner@example.invalid"]]);
      assert.doesNotMatch(await activity.innerText(),/Never show unfinished/);
      const workout = activity.locator('[data-activity-kind="workout"]');
      assert.match(await workout.innerText(),/Workout[\s\S]*Nov 20[\s\S]*Sample Strength[\s\S]*Sample Gym/);
      assert.deepEqual(await workout.locator("dl dd").allTextContents(),["20 min","3","2,200 lb"]);
      assert.equal(await workout.locator(".gruntr-profile-activity-exercise:visible").count(),2);
      const moreExercises = workout.getByRole("button",{name:"See 1 More Exercise"});
      await moreExercises.focus();
      await page.keyboard.press("Space");
      assert.equal(await workout.locator(".gruntr-profile-activity-exercise:visible").count(),3);
      await workout.getByRole("button",{name:"Show Fewer Exercises"}).click();
      assert.equal(await workout.locator(".gruntr-profile-activity-exercise:visible").count(),2);
      await workout.getByRole("button",{name:"Sample Strength"}).click();
      assert.equal(await page.evaluate(()=>syntheticOpenedKey),"workout-synthetic");
      const feedColors = await workout.evaluate(card=>[getComputedStyle(card.querySelector(".gruntr-profile-activity-tag")).color,
        getComputedStyle(card).backgroundColor]);
      assert.ok(contrast(...feedColors)>=4.5,JSON.stringify(feedColors));
      if (width===390 && process.env.PROFILE_SCREENSHOT_DIR) {
        await stats.locator("summary").click();
        await snapshot.locator("summary").click();
        const shot = path.join(process.env.PROFILE_SCREENSHOT_DIR,`profile-${theme}.png`);
        await page.evaluate(()=>window.scrollTo(0,0));
        await page.screenshot({path:shot});
      }
      await page.evaluate(()=>FWB_GRUNTR_PROFILE_ACTIVITY.render({...syntheticFeed,preview:true}));
      assert.equal(await activity.isVisible(),false);
      // Switch owner before an empty visit result. It must discard prior rows.
      await page.evaluate(()=>{
        const emptyUser={id:"empty",email:"empty@example.invalid"};
        FWB_GRUNTR_PROFILE_ACTIVITY.render({...syntheticFeed,owner:emptyUser.id,email:emptyUser.email,logs:[],achievements:null,
          client:{
            auth:{getSession:()=>Promise.resolve({data:{session:{user:emptyUser}},error:null})},
            from(){
              return {select(){return this;},eq(){return this;},lte(){return this;},order(){return this;},
                limit(){return Promise.resolve({data:[],error:null});}};
            }
          }
        });
      });
      assert.match(await activity.innerText(),/Your logged workouts, gym check-ins, PRs, and earned badges will appear here/);
      assert.equal(await activity.locator("ol > li").count(),0);

      const earned = profile.locator("#client-profile-earned-badges");
      await profile.getByRole("button",{name:/Badges earned/i}).click();
      assert.equal(await earned.isVisible(),true);
      assert.equal(await earned.getByText("First Spark").isVisible(),true);
      await earned.getByText("First Spark").click();
      assert.equal(await earned.getByText("Finish your first workout.").isVisible(),true);
      await earned.getByRole("button",{name:"Done"}).click();
      assert.equal(await earned.isVisible(),false);
      await page.evaluate(async () => {
        const button = profile.querySelector("[data-client-workout-calendar-open]");
        await FWB_CLIENT_WORKOUT_CALENDAR.open({panel:profile,returnFocus:button,userId:null});
      });
      assert.equal(await profile.locator(".client-workout-calendar").isVisible(),true);
      await profile.locator("[data-calendar-back]").click();
      assert.equal(await profile.getByRole("button",{name:"Workout calendar"}).isVisible(),true);
      assert.equal(await profile.getByRole("button",{name:"Workout calendar"}).evaluate(node=>node===document.activeElement),true);
      await page.evaluate(() => FWB_LIFTHARDR_PROFILE.refreshPack({...syntheticRows[0],session_count_used:10}));
      assert.equal(await count.innerText(),"0 sessions left in current pack");
      await page.evaluate(() => FWB_LIFTHARDR_PROFILE.refreshPack({...syntheticRows[0],session_count_used:null}));
      assert.equal(await count.isVisible(),false);
      assert.equal(await count.locator("span").textContent(),"");
      await page.evaluate(() => {
        FWB_LIFTHARDR_PROFILE.refreshPack(syntheticRows[0]);
        syntheticEvent("SIGNED_IN",{user:{...syntheticUser,id:"wrong"}});
      });
      assert.equal(await count.isVisible(),false);
      assert.equal(await count.locator("span").textContent(),"");
      for (const gate of ["preview","isCoach","app"]) {
        await page.evaluate(which => FWB_LIFTHARDR_PROFILE.configurePack({
          user:syntheticUser,clientEmail:syntheticUser.email,preview:which==="preview",isCoach:which==="isCoach",
          programs:which==="app"?[{...syntheticRows[0],membership_type:"app_access_only"}]:syntheticRows,auth:boundAuth
        }),gate);
        if (gate==="app") await page.evaluate(()=>syntheticEvent("INITIAL_SESSION",{user:syntheticUser}));
        assert.equal(await count.isVisible(),false);
        assert.equal(await count.locator("span").textContent(),"");
      }
      assert.equal(await page.locator('[data-client-dashboard-panel="community"] [data-client-profile-session-pack]').count(),0);
      console.log(`${name} ${width}px ${theme}: Profile geometry, mini icons, typed activity and empty state, keyboard, badges, calendar and private PT count passed`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
