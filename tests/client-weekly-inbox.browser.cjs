const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
const root = path.join(__dirname, '..');
const dashboard = fs.readFileSync(path.join(root,'client-dashboard.html'),'utf8');
const styles = [...dashboard.matchAll(/<link[^>]+href="\/?(css\/[^"?]+)[^>]*>/g)]
  .map(match=>fs.readFileSync(path.join(root,match[1]),'utf8')).join('\n');
const fixture = dashboard.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
  .replace(/<link\b[^>]*rel="stylesheet"[^>]*>/gi,'')
  .replace('</head>',`<style>${styles}</style></head>`);
(async () => {
  const engine = process.env.PLAYWRIGHT_BROWSER === 'webkit' ? webkit : chromium;
  const executablePath = process.env.TEST_CHROMIUM_PATH;
  const browser = await engine.launch({ headless:true,...(executablePath?{executablePath}:{}) });
  try {
    for (const width of [390,1280]) for (const theme of ['light','dark']) {
      const page = await browser.newPage({viewport:{width,height:830},timezoneId:'America/Los_Angeles'});
      page.setDefaultTimeout(8000);
      await page.clock.setFixedTime(new Date('2026-11-23T16:15:00Z'));
      await page.route('**/*', route => route.request().url() === 'https://fixture.test/client-dashboard.html'
        ? route.fulfill({status:200,contentType:'text/html',body:fixture}) : route.abort());
      await page.goto('https://fixture.test/client-dashboard.html');
      await page.evaluate(selected => {
        document.documentElement.dataset.clientTheme=selected;
        document.body.classList.remove('is-loading');
        document.querySelector('#dashboard-loading').hidden=true;
        document.querySelector('#dashboard-content').hidden=false;
        for (const panel of document.querySelectorAll('[data-client-dashboard-panel]'))
          panel.hidden=panel.dataset.clientDashboardPanel!=='notifications';
        for (const node of document.querySelectorAll('[data-client-settings-view]')) node.hidden=node.dataset.clientSettingsView!=='security';
        document.querySelector('[data-web-notifications]').hidden=false;
      },theme);
      for (const file of ['client-home-parity.js','client-weekly-inbox.js','web-notifications.js'])
        await page.addScriptTag({path:path.join(root,'js',file)});
      const notificationsReady = await page.evaluate(async () => {
        const user={id:'synthetic-test',email:'client@example.invalid'};
        window.queries=[];
        let submitted=null;
        const remoteId='weekly-test-notice';
        const client={
          auth:{getSession:async()=>({data:{session:{user}}})},
          from(table) {
            if (table==='client_notification_preferences') return {
              select(){return this;},eq(){return this;},
              async maybeSingle(){return this.single();},
              async single(){return {data:{user_id:user.id,push_enabled:false},error:null};}
            };
            if (table==='client_notifications') return {
              select(){return this;},eq(){return this;},order(){return this;},
              update(){queries.push(['synthetic-mark-read']);return this;},
              async limit(){return {data:[{id:remoteId,kind:'weekly_check_in',
                title:'Weekly check-in ready',body:'Review your check-in.',
                created_at:'2026-11-23T16:00:00Z',read_at:null}],error:null};}
            };
            if (table!=='client_check_ins') throw Error('Unexpected table: '+table);
            return {select(columns){queries.push([table,columns]);return this;},eq(){return this;},
              not(){return this;},limit(){return Promise.resolve({data:submitted?[submitted]:[],error:null});},
              insert(payload){queries.push(['synthetic-submit',payload]);submitted=payload;return Promise.resolve({error:null});}};
          }
        };
        FWB_CLIENT_HOME_PARITY.configure(client,user.email,false,user.id);
        const noticeRoot=document.querySelector('[data-web-notifications]');
        const notifications=FWBWebNotifications.createController({supabaseClient:client,user,root:noticeRoot,
          unreadBadges:document.querySelectorAll('[data-client-notification-unread]'),
          openWeeklyCheckIn:focus=>FWB_CLIENT_HOME_PARITY.openWeeklyCheckIn(focus)});
        const weekly=FWB_WEEKLY_INBOX.create({client,user,publish:row=>notifications.setWeeklyReminder(row),
          open:focus=>FWB_CLIENT_HOME_PARITY.openWeeklyCheckIn(focus)});
        document.addEventListener('fwb:weekly-checkin-complete',event=>weekly.complete(event.detail.week));
        window.weekly=weekly;
        return notifications.init();
      });
      assert.equal(notificationsReady, true);
      await page.evaluate(()=>weekly.refresh());
      const setting=page.locator('#client-settings-security button[data-client-weekly-checkin]');
      assert.ok(await setting.isVisible());
      assert.equal(await page.locator('[data-client-dashboard-panel="home"] [data-client-weekly-checkin]').count(),0);
      assert.equal(await page.locator('[data-client-dashboard-panel="profile"] [data-client-weekly-checkin]').count(),0);
      await setting.focus();
      await page.keyboard.press('Enter');
      const dialog=page.getByRole('dialog',{name:'How did your week go?'});
      await dialog.waitFor();
      await dialog.getByLabel('Wins this week').fill('Synthetic win');
      await dialog.getByRole('button',{name:'Close check-in'}).click();
      assert.equal(await dialog.isVisible(),false);
      assert.equal(await setting.evaluate(el=>el===document.activeElement),true);
      await page.evaluate(() => {
        document.querySelector('#client-settings-security').hidden=true;
        document.querySelector('#client-settings-recent-updates').hidden=false;
      });
      const reminder=page.locator('[data-web-local-weekly]');
      assert.ok(await reminder.isVisible());
      assert.equal(await reminder.count(),1);
      assert.equal(await reminder.getAttribute('data-web-notification-open'),null);
      await reminder.click();
      await dialog.waitFor();
      for (const label of ['Wins this week','Challenges','Recovery and energy','Pain or limitations'])
        await dialog.getByLabel(label).fill('Synthetic test response');
      await dialog.getByRole('button',{name:'Send weekly check-in'}).click();
      await dialog.getByText('Your check-in was sent to your coach.').waitFor();
      assert.equal(await reminder.count(),0);
      assert.match(await page.evaluate(()=>JSON.stringify(queries)),/synthetic-submit/);
      await dialog.getByRole('button',{name:'Close check-in'}).click();
      const remote=page.locator('[data-web-weekly-check-in]');
      assert.match(await remote.textContent(),/Open weekly check-in/);
      await remote.click();
      await dialog.getByText('Your check-in was sent to your coach.').waitFor();
      assert.equal(await dialog.getByLabel('Wins this week').inputValue(),'Synthetic test response');
      assert.equal(await dialog.getByLabel('Wins this week').evaluate(field=>field.readOnly),true);
      assert.match(await page.evaluate(()=>JSON.stringify(queries)),/synthetic-mark-read/);
      assert.equal(await remote.evaluate(link=>link.closest('li').classList.contains('is-unread')),false);
      const sizes=await page.evaluate(()=>({page:document.documentElement.scrollWidth,width:innerWidth,
        dialog:document.querySelector('#client-weekly-dialog').getBoundingClientRect().width}));
      assert.equal(sizes.page,sizes.width);
      assert.ok(sizes.dialog<=sizes.width);
      console.log(`${engine.name()} ${width}px ${theme}: Account, inbox link, keyboard form, synthetic submission and reminder dismissal`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(err=>{console.error(err);process.exitCode=1;});
