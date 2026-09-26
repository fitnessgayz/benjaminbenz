/**
 * Isolated PostgreSQL integration checks (no credentials/network/live data).
 * Uses pinned @electric-sql/pglite 0.5.8. Install outside the app repository:
 * npm install --prefix /tmp/fwb-messaging-db-test @electric-sql/pglite@0.5.8
 * PGLITE_MODULE=/tmp/fwb-messaging-db-test/node_modules/@electric-sql/pglite/dist/index.js \
 *   node supabase/tests/messaging-backend.mjs
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const packagePath = process.env.PGLITE_MODULE;
const { PGlite } = await import(packagePath ? pathToFileURL(packagePath).href : '@electric-sql/pglite');
const db = new PGlite();
const migration = new URL('../migrations/20260926064420_add_client_coach_messaging.sql', import.meta.url);
let checks = 0;
const ids = { a:'aaaaaaaa-0000-4000-8000-000000000001', b:'bbbbbbbb-0000-4000-8000-000000000002',
  coach:'cccccccc-0000-4000-8000-000000000003', stranger:'dddddddd-0000-4000-8000-000000000004',
  unverified:'eeeeeeee-0000-4000-8000-000000000005' };
const emails = {a:'messaging-a@example.test', b:'messaging-b@example.test', coach:'benjaminbenz.fit@gmail.com',
  stranger:'stranger@example.test', unverified:'unverified@example.test'};
let req = 0;
const request = () => `12345678-0000-4000-8000-${String(++req).padStart(12,'0')}`;
const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
const ok = (condition, label) => { assert.ok(condition, label); checks++; console.log(`ok ${checks} - ${label}`); };
async function rejects(sql, args, code, label) {
  try { await db.query(sql,args); assert.fail(`Expected ${code}: ${label}`); }
  catch (e) { assert.equal(e.code, code, `${label}: ${e.message}`); }
  checks++; console.log(`ok ${checks} - ${label}`);
}
async function actor(who, claims = {}) {
  await db.exec('reset role');
  const jwt = who ? {sub:ids[who],email:emails[who],role:'authenticated',...claims} : {role:'anon'};
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(jwt)]);
  await db.exec(`set role ${who ? 'authenticated' : 'anon'}`);
}
const history = (email=null,before=null,limit=50) => rows('select * from public.messaging_history($1,$2,$3)',[email,before,limit]);
const inbox = () => rows('select * from public.messaging_inbox()');
const send = async (body, email=null, key=request()) => (await rows('select * from public.messaging_send($1,$2,$3)',[body,key,email]))[0];
const read = (id,email=null) => rows('select public.messaging_mark_read($1,$2)',[id,email]);
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create table auth.users (id uuid primary key, email text unique, email_confirmed_at timestamptz,
    is_anonymous boolean default false, banned_until timestamptz, deleted_at timestamptz, raw_user_meta_data jsonb default '{}');
  create function auth.jwt() returns jsonb language sql stable as
    $$select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb$$;
  create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
  grant usage on schema auth to authenticated, anon;
  grant execute on all functions in schema auth to authenticated, anon;
  create function public.is_coach_admin() returns boolean language sql stable set search_path='' as
    $$select lower(coalesce(auth.jwt()->>'email','')) = 'benjaminbenz.fit@gmail.com'$$;
  create table public.client_programs (id uuid primary key default gen_random_uuid(), client_email text not null,
    client_name text not null, active boolean default true, client_archived boolean default false,
    updated_at timestamptz default now());
  alter table public.client_programs enable row level security;
  grant select on public.client_programs to authenticated;
  create policy programs_read on public.client_programs for select to authenticated using
    (public.is_coach_admin() or lower(client_email)=lower(auth.jwt()->>'email'));
`);
for (const who of Object.keys(ids)) {
  await db.query('insert into auth.users(id,email,email_confirmed_at) values ($1,$2,$3)',
    [ids[who],emails[who],who==='unverified'?null:new Date().toISOString()]);
}
for (const who of ['a','b','unverified']) {
  await db.query('insert into public.client_programs(client_email,client_name) values ($1,$2)',[emails[who],`Client ${who.toUpperCase()}`]);
}
await db.exec(await readFile(migration,'utf8'));

await actor(null);
await rejects('select * from public.messaging_inbox()',[],'42501','anonymous RPC denied');
await rejects('select * from messaging_private.messages',[],'42501','anonymous table denied');
await actor('unverified');
await rejects('select * from public.messaging_inbox()',[],'42501','unverified email denied');
await actor('stranger');
await rejects('select * from public.messaging_send($1,$2)', ['hello',request()],'42501','unassigned account cannot open a conversation');
await actor('a');
ok((await history()).length===0,'first conversation history is empty');
await rejects('select * from public.messaging_history($1)',[emails.b],'42501','client cannot select another client');
for (const body of [null,'','   ','\n\t\r','\u00a0\u2000\u202f\ufeff','x'.repeat(4001)]) {
  await rejects('select * from public.messaging_send($1,$2)',[body,request()],'22023','invalid/blank/oversize body rejected');
}
await rejects('select * from public.messaging_send($1,$2)',['hello',null],'22023','null idempotency key rejected');
const key = request();
const first = await send('  Hello coach\n',null,key);
ok(first.body==='Hello coach' && first.sender_role==='client' && first.sender_user_id===ids.a,'server normalizes body and derives client sender');
ok((await send('Hello coach',null,key)).id===first.id,'retry returns original message');
ok((await history()).length===1,'retry does not duplicate message');
await rejects('select * from public.messaging_send($1,$2)',['changed',key],'22023','changed retry payload rejected');
ok((await inbox())[0].unread_count===0,'own messages do not count unread');
ok((await history(emails.a.toUpperCase())).length===1,'email matching is case insensitive');
await rejects('insert into messaging_private.messages(conversation_id,sender_user_id,sender_role,body,request_id) values (gen_random_uuid(),$1,\'coach\',\'spoof\',$2)',[ids.coach,request()],'42501','direct sender/role spoof insert denied');
await rejects('update messaging_private.messages set body=\'changed\'',[],'42501','direct message edit denied');
await rejects('delete from messaging_private.messages',[],'42501','direct message delete denied');
await rejects('insert into messaging_private.read_cursors values (gen_random_uuid(),$1,1,now())',[ids.coach],'42501','direct read cursor spoof denied');
await actor('b',{user_metadata:{role:'coach',is_coach:true,email:emails.coach},app_metadata:{role:'client'}});
ok((await rows('select * from messaging_private.messages')).length===0,'RLS hides other client message despite metadata spoof');
ok((await inbox()).length===0,'client inbox does not expose other client previews');
await rejects('select * from public.messaging_send($1,$2,$3)',['attacker',request(),emails.a],'42501','spoofed role cannot send another client message');
await rejects('select public.messaging_mark_read($1,$2)',[first.id,emails.a],'42501','spoofed role cannot mark another conversation read');
await db.exec('reset role');
await db.query('update public.client_programs set client_archived=true where client_email=$1',[emails.b]);
await actor('b');
await rejects('select * from public.messaging_send($1,$2)',['Archived start',request()],'42501','archived program cannot start a conversation');
await db.exec('reset role');
await db.query('update public.client_programs set client_archived=false,active=false where client_email=$1',[emails.b]);
await actor('b');
await rejects('select * from public.messaging_send($1,$2)',['Inactive start',request()],'42501','inactive program cannot start a conversation');
await db.exec('reset role');
await db.query('update public.client_programs set active=true where client_email=$1',[emails.b]);
await actor('b');
const bFirst = await send('Hello from B');
await actor('coach');
const coachInbox = await inbox();
ok(coachInbox.length===2 && coachInbox[0].client_email===emails.b,'coach sees separate threads in latest-message order');
ok(coachInbox.every(x=>x.unread_count===1),'coach unread is per conversation');
await rejects('select * from public.messaging_history()',[],'22023','coach must select client');
await rejects('select * from public.messaging_send($1,$2,$3)',['hello',request(),emails.stranger],'P0002','coach cannot create unsolicited/unmatched thread');
await read(first.id,emails.a);
ok((await inbox()).find(x=>x.client_email===emails.a).unread_count===0,'coach read cursor clears only displayed client message');
const reply = await send('Here is your plan',emails.a);
ok(reply.sender_role==='coach' && reply.sender_user_id===ids.coach,'verified coach reply has server-derived role');
await actor('a');
ok((await inbox())[0].unread_count===1,'client sees unread coach reply');
await read(reply.id);
ok((await inbox())[0].unread_count===0,'client can mark its reply read');
await read(first.id);
ok((await inbox())[0].unread_count===0,'older read cursor cannot move backward');
await rejects('select public.messaging_mark_read($1)',[bFirst.id],'22023','cursor from another conversation rejected');
await rejects('select public.messaging_mark_read($1)',[9999999],'22023','guessed future cursor rejected');
const later = await send('Another question');
await actor('coach');
await read(first.id,emails.a);
ok((await inbox()).find(x=>x.client_email===emails.a).unread_count===1,'message after captured view boundary stays unread');
await read(later.id,emails.a);
ok((await inbox()).find(x=>x.client_email===emails.a).unread_count===0,'coach advances through displayed latest message');
const coachKey = request();
await send('Reply A',emails.a,coachKey);
await rejects('select * from public.messaging_send($1,$2,$3)',['Reply A',coachKey,emails.b],'22023','idempotency key cannot switch conversation');
await actor('a');
const all = await history();
const page1 = await history(null,null,2);
const page2 = await history(null,page1.at(-1).id,2);
ok([...page1,...page2].map(x=>x.id).join()===all.map(x=>x.id).join(),'history keyset pages have no duplicates or gaps');
ok(all.every((m,i)=>i===0 || all[i-1].id>m.id),'history is strict descending ID order');
ok((await send('😀'.repeat(4000))).body.length===8000,'Unicode length is codepoints, not UTF-16 units');
await rejects('select * from public.messaging_send($1,$2)',['😀'.repeat(4001),request()],'22023','4001 Unicode characters rejected');
for (const sql of ['select * from public.messaging_history(null,null,0)','select * from public.messaging_history(null,null,101)',
  'select * from public.messaging_history(null,-1,50)','select * from public.messaging_inbox(100,-1)']) {
  await rejects(sql,[],'22023','invalid pagination rejected');
}
await actor('a',{email:emails.coach});
await rejects('select * from public.messaging_inbox()',[],'42501','JWT email cannot impersonate another live auth user');
await actor('a');
await db.exec('reset role');
await db.query('update auth.users set banned_until=now()+interval \'1 day\' where id=$1',[ids.a]);
await actor('a');
await rejects('select * from public.messaging_inbox()',[],'42501','banned current identity denied');
await db.exec('reset role');
await db.query('update auth.users set banned_until=null,email=$2 where id=$1',[ids.a,'new-a@example.test']);
await actor('a');
await rejects('select * from public.messaging_inbox()',[],'42501','stale email JWT denied');
await actor('a',{email:'new-a@example.test'});
ok((await history()).length>0,'refreshed changed-email account retains UUID-bound history');
ok((await send('Still me')).client_email===emails.a,'changed email cannot create a duplicate conversation');
await db.exec('reset role');
await db.query('update auth.users set email=$2 where id=$1',[ids.stranger,emails.a]);
await actor('stranger',{email:emails.a});
ok((await history()).length===0,'new account reusing historical email cannot see original conversation');
await rejects('select * from public.messaging_send($1,$2)',['Takeover attempt',request()],'42501','new account cannot replace occupied historical email conversation');
await db.exec('reset role');
await db.query('update auth.users set is_anonymous=true,email_confirmed_at=now() where id=$1',[ids.unverified]);
await actor('unverified');
await rejects('select * from public.messaging_inbox()',[],'42501','anonymous Auth identity is denied even with verified email');
await db.exec('reset role');
const publicDefiners=await rows("select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname like 'messaging_%' and prosecdef");
ok(publicDefiners.length===0,'all public messaging functions are security invoker');
const tables=await rows("select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='messaging_private' and relkind='r'");
ok(tables.length===3 && tables.every(t=>t.relrowsecurity),'all private messaging tables enable RLS');
await db.query('update auth.users set deleted_at=now() where id=$1',[ids.a]);
await actor('a',{email:'new-a@example.test'});
await rejects('select * from public.messaging_inbox()',[],'42501','soft-deleted verified account old token denied');
await db.exec('reset role');
await db.query('delete from auth.users where id=$1',[ids.a]);
await actor('a',{email:'new-a@example.test'});
await rejects('select * from public.messaging_inbox()',[],'42501','deleted account old token denied');
console.log(`PASS: ${checks} PostgreSQL messaging integration checks`);
await db.close();
