/** Offline PostgreSQL checks; never sends HTTP/email. Requires pinned PGlite 0.5.8.
 * PGLITE_MODULE=/tmp/fwb-messaging-db-test/node_modules/@electric-sql/pglite/dist/index.js \
 * node supabase/tests/messaging-email-outbox.mjs
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite');
const db = new PGlite();
let count = 0;
const ok=(condition,label)=>{ assert.ok(condition,label); console.log(`ok ${++count} - ${label}`); };
const rows=async(sql,args=[]) => (await db.query(sql,args)).rows;
const one=async(sql,args=[]) => (await rows(sql,args))[0];
async function rejects(sql,args,code,label) {
  try {await db.query(sql,args);assert.fail(`Expected ${code}`);} catch(e) {assert.equal(e.code,code,`${label}: ${e.message}`);}
  console.log(`ok ${++count} - ${label}`);
}
const id={a:'aaaaaaaa-0000-4000-8000-000000000001',b:'bbbbbbbb-0000-4000-8000-000000000002',coach:'cccccccc-0000-4000-8000-000000000003'};
const email={a:'email-client-a@example.test',b:'email-client-b@example.test',coach:'benjaminbenz.fit@gmail.com'};
let requests=0;
const request=()=>`12345678-0000-4000-8000-${String(++requests).padStart(12,'0')}`;
const owner=()=>db.exec('reset role');
async function actor(who) {
  await owner();
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id[who],email:email[who],role:'authenticated'})]);
  await db.exec('set role authenticated');
}
const service=async()=>{await owner();await db.exec('set role service_role');};
const send=async(body,target=null,key=request())=>(await rows('select * from public.messaging_send($1,$2,$3)',[body,key,target]))[0];
const claim=async(from='FWB Training <notify@example.test>',limit=20)=>rows('select * from public.messaging_claim_email_notifications($1,$2)',[from,limit]);
const validate=async(job)=>(await one('select public.messaging_validate_email_notification($1,$2) as valid',[job.id,job.lease_token])).valid;
const ack=async(job)=>(await one('select public.messaging_complete_email_notification($1,$2,$3) as done',[job.id,job.lease_token,'resend-fixture-receipt'])).done;
const retry=async(job,code='provider_http_503',retryable=true,after=0)=>(await one('select public.messaging_retry_email_notification($1,$2,$3,$4,$5) as done',[job.id,job.lease_token,code,retryable,after])).done;
await db.exec(`create role anon; create role authenticated; create role service_role;
create schema auth; create schema extensions;
create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,is_anonymous boolean default false,banned_until timestamptz,deleted_at timestamptz,created_at timestamptz,updated_at timestamptz,raw_app_meta_data jsonb);
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
grant usage on schema auth to anon,authenticated; grant execute on all functions in schema auth to anon,authenticated;
create function public.is_coach_admin() returns boolean language sql stable as $$select lower(auth.jwt()->>'email')='benjaminbenz.fit@gmail.com'$$;
create table public.client_programs(client_email text,client_name text,active boolean default true,client_archived boolean default false,updated_at timestamptz default now());`);
for(const who of Object.keys(id))await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id[who],email[who]]);
await db.query('insert into public.client_programs(client_email,client_name) values($1,$2),($3,$4)',[email.a,'Alex\r\nBcc: nobody@example.test',email.b,'Riley']);
await db.exec(await readFile(new URL('../migrations/20260926064420_add_client_coach_messaging.sql',import.meta.url),'utf8'));
await actor('a'); await send('Historic message must not be backfilled');
await owner();
await db.exec(await readFile(new URL('../migrations/20260926070523_add_messaging_email_outbox.sql',import.meta.url),'utf8'));
ok(Number((await one('select count(*) as n from messaging_private.email_outbox')).n)===0,'no historic message backfill');
await actor('a'); const key=request();const clientMessage=await send('HIGHLY PRIVATE TEXT MUST NEVER LEAVE',null,key);await send('HIGHLY PRIVATE TEXT MUST NEVER LEAVE',null,key);
await owner();
const clientJob=await one('select * from messaging_private.email_outbox where message_id=$1',[clientMessage.id]);
ok(clientJob.recipient_user_id===id.coach && clientJob.recipient_email===email.coach,'client send queues only verified coach');
ok(Number((await one('select count(*) as n from messaging_private.email_outbox')).n)===1,'idempotent resend creates one email job');
ok(!JSON.stringify(clientJob).includes('HIGHLY PRIVATE'),'outbox contains no actual message text');
ok(!/[\r\n]/.test(clientJob.sender_name),'sender name strips subject header line breaks');
await actor('coach');const coachMessage=await send('PRIVATE COACH REPLY',email.a);
await owner();const replyJob=await one('select * from messaging_private.email_outbox where message_id=$1',[coachMessage.id]);
ok(replyJob.recipient_user_id===id.a && replyJob.recipient_email===email.a,'coach reply queues only UUID-bound client');
ok(replyJob.destination_url.endsWith('/client-dashboard.html?messages=1') && clientJob.destination_url.endsWith('/coach-admin.html?tab=inbox'),'each recipient receives the correct web destination');
await db.query('insert into messaging_private.conversations(client_user_id,client_email,client_name) values($1,$2,$3)',[id.coach,email.coach,'Coach own account']);
await actor('coach');const self=await send('Self message',email.coach);
await owner();ok(Number((await one('select count(*) as n from messaging_private.email_outbox where message_id=$1',[self.id])).n)===0,'no email to the sender');
for(const role of ['anon','authenticated']) {
 await owner();await db.exec(`set role ${role}`);
 await rejects('select * from messaging_private.email_outbox',[],'42501',`${role} cannot read outbox`);
 await rejects('select * from public.messaging_claim_email_notifications($1)',['notify@example.test'],'42501',`${role} cannot claim delivery`);
 await rejects('select public.messaging_complete_email_notification(gen_random_uuid(),gen_random_uuid(),\'id\')',[],'42501',`${role} cannot spoof delivery completion`);
}
await service();await rejects('select * from messaging_private.email_outbox',[],'42501','service worker has RPC-only queue access');
await rejects('select * from public.messaging_claim_email_notifications($1)',['notify@example.test\r\nBcc: attacker@example.test'],'22023','sender header controls rejected');
const first=(await claim(undefined,1))[0];const second=(await claim(undefined,1))[0];
ok(first&&second&&first.id!==second.id&&(await claim()).length===0,'claims lease distinct jobs and exclude existing leases');
ok(await validate(first),'current eligible lease is dispatchable');
ok(!await validate({...first,lease_token:request()}),'wrong lease token cannot validate');
ok(!JSON.stringify(first.provider_payload).includes('PRIVATE'),'provider email has no actual message text');
ok(first.provider_payload.from==='FWB Training <notify@example.test>' && Array.isArray(first.provider_payload.to),'complete provider payload is frozen before dispatch');
ok(new Date(first.retry_until)-new Date(first.first_attempt_at)===23*60*60*1000,'retry deadline fits within provider 24-hour idempotency retention');
await owner();await rejects('update messaging_private.email_outbox set recipient_email=$2 where id=$1',[first.id,'attacker@example.test'],'22023','queued recipient cannot be retargeted');
await rejects('update messaging_private.email_outbox set provider_payload=$2 where id=$1',[first.id,{from:'other@example.test'}],'22023','frozen provider payload cannot change');
await service();ok(await retry(first,'provider_http_429',true,300),'retryable response releases exact lease');
ok(!await ack(first),'released old lease cannot mark a new attempt complete');
ok((await claim()).length===0,'retry obeys next-attempt delay');
await owner();const scheduled=await one('select next_attempt_at>now()+interval \'4 minutes\' as delayed from messaging_private.email_outbox where id=$1',[first.id]);ok(scheduled.delayed,'Retry-After extends exponential backoff');
await db.query('update messaging_private.email_outbox set next_attempt_at=now()-interval \'1 second\' where id=$1',[first.id]);
await service();const reclaimed=(await claim('Changed Sender <changed@example.test>'))[0];
ok(reclaimed.id===first.id&&reclaimed.lease_token!==first.lease_token&&reclaimed.attempts===2,'retry keeps delivery ID and obtains fresh lease');
ok(JSON.stringify(reclaimed.provider_payload)===JSON.stringify(first.provider_payload)&&reclaimed.idempotency_key===first.idempotency_key,'retry reuses immutable payload and provider idempotency key');
ok(Number(new Date(reclaimed.first_attempt_at))===Number(new Date(first.first_attempt_at))&&Number(new Date(reclaimed.retry_until))===Number(new Date(first.retry_until)),'retry does not extend idempotency deadline');
ok(!await ack(first),'stale prior lease cannot acknowledge retry');
ok(await ack(reclaimed),'matching current lease records provider acceptance');
ok(!await ack(reclaimed),'duplicate ack does not mutate completed delivery');
// Recipient changed after claim: validate cancels rather than sending or retargeting.
await owner();const recipient=await one('select recipient_user_id from messaging_private.email_outbox where id=$1',[second.id]);
await db.query('update auth.users set email=$2 where id=$1',[recipient.recipient_user_id,'changed-recipient@example.test']);
await service();ok(!await validate(second),'pre-send validation cancels changed-email recipient');
await owner();ok((await one('select status from messaging_private.email_outbox where id=$1',[second.id])).status==='canceled','changed recipient becomes terminal canceled');
await db.query('update auth.users set email=$2 where id=$1',[recipient.recipient_user_id,Object.keys(id).map(k=>({id:id[k],email:email[k]})).find(x=>x.id===recipient.recipient_user_id).email]);
// Lease-expiry, terminal failure, max-attempt and provider-window cases.
await actor('a');await send('Lease expiry check');await owner();await service();const expiring=(await claim())[0];
await owner();await db.query('update messaging_private.email_outbox set lease_expires_at=now()-interval \'1 second\' where id=$1',[expiring.id]);
await service();ok(!await validate(expiring),'expired lease cannot dispatch');const again=(await claim())[0];
ok(again.id===expiring.id&&again.lease_token!==expiring.lease_token,'expired lease is recoverable after worker crash');
ok(await retry(again,'provider_invalid_idempotent_request',false),'terminal provider response is acknowledged');
await owner();ok((await one('select status from messaging_private.email_outbox where id=$1',[again.id])).status==='dead','terminal error stops retries');
await actor('a');await send('Bounded attempts');await owner();await db.exec("update messaging_private.email_outbox set attempts=10 where status='pending'");await service();ok((await claim()).length===0,'max attempts prevents further provider calls');
await owner();ok((await one("select count(*) as n from messaging_private.email_outbox where status='dead' and last_error_code='retry_window_exhausted'")).n>=1,'exhausted jobs are retained as dead letters');
await actor('a');await send('Expired provider retry window');await owner();
// Set an old first-attempt snapshot once, before it is frozen (simulates restart).
await db.exec("update messaging_private.email_outbox set first_attempt_at=now()-interval '24 hours',retry_until=now()-interval '1 hour' where status='pending'");
await service();ok((await claim()).length===0,'no ambiguous resend after provider idempotency window');
// Enqueue validates recipient at message commit, not just when claimed.
for(const mutation of ["deleted_at=now()","banned_until=now()+interval '1 day'","email_confirmed_at=null","is_anonymous=true"]) {
 await owner();await db.query(`update auth.users set ${mutation} where id=$1`,[id.coach]);
 await actor('a');const m=await send('Ineligible coach recipient');await owner();
 ok(Number((await one('select count(*) as n from messaging_private.email_outbox where message_id=$1',[m.id])).n)===0,`enqueue excludes recipient with ${mutation}`);
 await db.query('update auth.users set deleted_at=null,banned_until=null,email_confirmed_at=now(),is_anonymous=false where id=$1',[id.coach]);
}
// Stub Vault/cron/pg_net only for the scheduler migration. These cannot network.
await db.exec(`create schema vault; create schema cron; create schema net;
create table vault.decrypted_secrets(id uuid default gen_random_uuid(),name text unique,decrypted_secret text);
create function vault.create_secret(new_secret text,new_name text,new_description text default null) returns uuid language plpgsql as $$declare result uuid;begin insert into vault.decrypted_secrets(name,decrypted_secret) values(new_name,new_secret) returning id into result;return result;end;$$;
create function extensions.gen_random_bytes(n integer) returns bytea language sql as $$select decode(repeat(replace(gen_random_uuid()::text,'-',''),2),'hex')$$;
create table cron.job(jobid bigint generated always as identity,jobname text,schedule text,command text,active boolean default true);
create function cron.schedule(job_name text,schedule text,command text) returns bigint language plpgsql as $$declare result bigint;begin insert into cron.job(jobname,schedule,command) values(job_name,schedule,command) returning jobid into result;return result;end;$$;
create function cron.alter_job(job_id bigint,active boolean) returns void language sql as $$update cron.job set active=$2 where jobid=$1$$;
create table net.test_calls(id bigint generated always as identity,url text);
create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$declare result bigint;begin insert into net.test_calls(url) values(url) returning id into result;return result;end;$$;`);
await db.exec(await readFile(new URL('../migrations/20260926070525_add_messaging_email_dispatch_schedule.sql',import.meta.url),'utf8'));
ok((await one('select active from cron.job')).active===false,'cron schedule starts inactive');
ok((await one('select enabled from messaging_private.email_dispatch_config')).enabled===false,'dispatch config starts disabled');
ok(Number((await one('select count(*) as n from net.test_calls')).n)===0,'migration performs no HTTP calls');
for(const role of ['anon','authenticated']){await owner();await db.exec(`set role ${role}`);await rejects('select public.messaging_email_worker_config()',[],'42501',`${role} cannot retrieve worker credential`);}
await service();const config=(await one('select public.messaging_email_worker_config() as config')).config;
ok(Object.keys(config).sort().join() === 'enabled,worker_token'&&config.worker_token.length===64,'service config exposes only dedicated token and enabled flag');
await owner();await rows('select messaging_private.dispatch_email_notifications()');
ok(Number((await one('select count(*) as n from net.test_calls')).n)===0,'disabled dispatcher does not call HTTP');
await db.exec('update messaging_private.email_dispatch_config set enabled=true');await rows('select messaging_private.dispatch_email_notifications()');
ok(Number((await one('select count(*) as n from net.test_calls')).n)===0,'enabled idle dispatcher does not call HTTP');
await actor('a');await send('Pending notification for stub dispatcher');await owner();await rows('select messaging_private.dispatch_email_notifications()');
ok(Number((await one('select count(*) as n from net.test_calls')).n)===1,'enabled due queue invokes only the stub dispatcher');
// Execute the reviewed live smoke and sink lifecycle files against this offline
// database too. pg_net remains a no-network stub throughout.
await db.exec("update messaging_private.email_outbox set status='canceled' where status in ('pending','leased')");
const callsBefore=Number((await one('select count(*) as n from net.test_calls')).n);
await db.exec(await readFile(new URL('./messaging-email-rollback.sql',import.meta.url),'utf8'));
ok(Number((await one('select count(*) as n from net.test_calls')).n)===callsBefore,'rollback smoke never invokes network dispatcher');
ok(Number((await one("select count(*) as n from auth.users where email like 'message-email-test-%@example.invalid'")).n)===0,'rollback smoke removes every synthetic identity');
await db.exec(await readFile(new URL('./messaging-email-sink-fixture.sql',import.meta.url),'utf8'));
ok(Number((await one("select count(*) as n from messaging_private.email_outbox where recipient_email='delivered+fwb-message-check@resend.dev' and status='pending'")).n)===1,'sink fixture queues exactly one provider-sink notification');
await db.exec(await readFile(new URL('./messaging-email-sink-cleanup.sql',import.meta.url),'utf8'));
ok(Number((await one("select count(*) as n from messaging_private.email_outbox where recipient_email='delivered+fwb-message-check@resend.dev'")).n)===0,'sink cleanup cascades its outbox job');
ok(Number((await one('select count(*) as n from net.test_calls')).n)===callsBefore,'fixture creation and cleanup never send email');
console.log(`PASS: ${count} email outbox/lease/privacy/scheduler checks; no real HTTP or email`);
await db.close();
