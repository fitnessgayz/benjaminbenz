const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

let PGlite;
try {
  ({ PGlite } = require(process.env.ACTIVITY_LIKES_PGLITE_PATH || "@electric-sql/pglite"));
} catch {}

const migration = fs.readFileSync(require.resolve("../supabase/migrations/20261124174837_coach_activity_comment_notifications.sql"), "utf8");
const compatibility = fs.readFileSync(require.resolve("../supabase/migrations/20261005154941_fix_deployed_coach_activity_likes.sql"), "utf8");
const emailResolver = compatibility.slice(compatibility.indexOf("create or replace function private.fwb_activity_client_email("), compatibility.indexOf("create or replace function public.coach_activity_feed("));
const uuid = (number) => `10000000-0000-4000-8000-${String(number).padStart(12, "0")}`;

for (const modern of [false, true]) {
  test(`Coach comments are private, retry-safe and in-app only (${modern ? "modern" : "deployed"} schema)`, {
    skip: !PGlite && "Install @electric-sql/pglite or set ACTIVITY_LIKES_PGLITE_PATH"
  }, async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create role anon nologin;
        create role authenticated nologin;
        create schema auth;
        create schema private;
        create schema community_private;
        create table auth.users (id uuid primary key, email text, deleted_at timestamptz, is_anonymous boolean);
        create function auth.uid() returns uuid language sql stable as $$
          select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
        $$;
        create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
        create function public.is_coach_admin() returns boolean language sql stable as $$
          select auth.uid() = '${uuid(1)}'::uuid
        $$;
        create table public.client_programs (id uuid primary key, client_email text, active boolean, client_archived boolean);
        create table public.client_achievement_events (id uuid primary key, client_email text);
        create table public.client_workout_logs (id uuid primary key, client_email text, completed_at timestamptz);
        create table community_private.wall_events (event_id text primary key, owner_id uuid, event_type text, visible boolean);
        create function community_private.community_wall_events()
        returns table(event_id text, owner_id uuid, event_type text) language sql stable as $$
          select event_id, owner_id, event_type from community_private.wall_events
        $$;
        create function community_private.community_wall_feed()
        returns table(event_id text, event_type text, is_own boolean) language sql stable as $$
          select event_id, event_type, owner_id = auth.uid()
          from community_private.wall_events where visible
        $$;
        create table public.client_notifications (
          id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users,
          kind text, title text, body text,
          ${modern ? "recipient_role text, action_url text, dedupe_key text, metadata jsonb, push_suppressed_at timestamptz" : "web_category text, web_url text, web_dedupe_key text"}
        );
        create unique index comment_dedupe on public.client_notifications (user_id, ${modern ? "dedupe_key" : "web_dedupe_key"})
          where ${modern ? "dedupe_key" : "web_dedupe_key"} is not null;
        create table public.fwb_native_push_queue (notification_id uuid references public.client_notifications);
        create table public.fwb_web_push_queue (notification_id uuid references public.client_notifications);
        create function private.queue_both_pushes() returns trigger language plpgsql as $$
          begin
            insert into public.fwb_native_push_queue values (new.id);
            insert into public.fwb_web_push_queue values (new.id);
            return new;
          end
        $$;
        create trigger queue_both_pushes after insert on public.client_notifications
          for each row execute function private.queue_both_pushes();
        alter table public.client_notifications enable row level security;
        grant usage on schema auth to authenticated;
        grant select on public.client_notifications to authenticated;
        create policy own_notifications on public.client_notifications for select to authenticated
          using ((select auth.uid()) = user_id);
        insert into auth.users(id,email) values
          ('${uuid(1)}','coach@example.test'), ('${uuid(2)}','client@example.test'), ('${uuid(3)}','other@example.test');
        insert into public.client_programs values ('${uuid(4)}','client@example.test',true,false);
        insert into community_private.wall_events values
          ('visible-workout','${uuid(2)}','workout',true),
          ('withdrawn-post','${uuid(2)}','gym_visit',false),
          ('my-post','${uuid(1)}','gym_visit',true),
          ('not-my-client','${uuid(3)}','gym_visit',true);
        insert into public.client_workout_logs values
          ('${uuid(5)}','client@example.test',now()), ('${uuid(10)}','client@example.test',null),
          ('${uuid(11)}','other@example.test',now());
        insert into public.client_notifications (id,user_id,kind,title,body,${modern ? "recipient_role,action_url" : "web_category,web_url"})
          values ('${uuid(6)}','${uuid(1)}','check_in_submitted','Gym visit','Check-in',
            '${modern ? "coach" : "check_in_submitted"}','/coach-admin.html?tab=home&client=${uuid(4)}'),
          ('${uuid(7)}','${uuid(3)}','check_in_submitted','Other visit','Check-in',
            '${modern ? "coach" : "check_in_submitted"}','/coach-admin.html?tab=home&client=${uuid(4)}');
      `);
      await db.exec(emailResolver);
      await db.exec(migration);
      const send = (notice, log, message, request = uuid(8), wall = null) =>
        db.query("select public.send_coach_activity_comment($1,$2,$3,$4,$5) as sent", [notice, log, message, request, wall]);
      const address = (who) => db.query("select set_config('request.jwt.claim.sub',$1,false)", [who]);
      await db.exec("set role anon");
      await assert.rejects(send(uuid(6), null, "Hello"), { code: "42501" });
      await db.exec("reset role; set role authenticated");
      await address(uuid(2));
      await assert.rejects(send(uuid(6), null, "Hello"), { code: "42501" });
      await assert.rejects(send(null, null, "Hello", uuid(12), "visible-workout"), { code: "42501" });
      await address(uuid(1));
      await assert.rejects(send(uuid(7), null, "Another person's notice"), { code: "P0002" });
      await assert.rejects(send(null, uuid(10), "Unfinished workout"), { code: "P0002" });
      await assert.rejects(send(null, uuid(11), "Client without an active program"), { code: "P0002" });
      await assert.rejects(send(uuid(6), uuid(5), "Ambiguous source"), { code: "22023" });
      await assert.rejects(send(uuid(6), null, " ".repeat(500)), { code: "22023" });
      await assert.rejects(send(uuid(6), null, "a".repeat(501)), { code: "22023" });
      assert.equal((await send(uuid(6), null, "  Nice work!  ")).rows[0].sent, true);
      assert.equal((await send(uuid(6), null, "Retry must not duplicate")).rows[0].sent, true);
      assert.equal((await send(null, uuid(5), "Good lifts", uuid(9))).rows[0].sent, true);
      await address(uuid(2));
      const clientNotices = await db.query("select title, body from public.client_notifications order by title");
      assert.deepEqual(clientNotices.rows, [
        { title: "Your coach commented on your check-in", body: "Nice work!" },
        { title: "Your coach commented on your workout", body: "Good lifts" }
      ]);
      if (modern) {
        assert.equal((await db.query("select count(*)::int as n from public.client_notifications where push_suppressed_at is not null")).rows[0].n, 2);
      }
      await address(uuid(1));
      await assert.rejects(send(null, null, "Withdrawn", uuid(12), "withdrawn-post"), { code: "P0002" });
      await assert.rejects(send(null, null, "Own post", uuid(12), "my-post"), { code: "P0002" });
      await assert.rejects(send(null, null, "Not a client", uuid(12), "not-my-client"), { code: "P0002" });
      await assert.rejects(send(uuid(6), null, "Two sources", uuid(12), "visible-workout"), { code: "22023" });
      assert.equal((await send(null, null, "Great Wall workout", uuid(12), "visible-workout")).rows[0].sent, true);
      assert.equal((await send(null, null, "Retry must not duplicate", uuid(12), "visible-workout")).rows[0].sent, true);
      await address(uuid(2));
      assert.deepEqual((await db.query("select title, body from public.client_notifications where body = 'Great Wall workout'")).rows, [
        { title: "Your coach commented on your workout", body: "Great Wall workout" }
      ]);
      assert.equal((await db.query("select count(*)::int as n from public.client_notifications")).rows[0].n, 3);
      await address(uuid(3));
      assert.equal((await db.query("select count(*)::int as n from public.client_notifications where kind='workout_comment'")).rows[0].n, 0);
      await db.exec("reset role");
      for (const queue of ["fwb_web_push_queue", "fwb_native_push_queue"]) {
        const counts = await db.query(`select count(*)::int as total, count(*) filter (where notice.kind='workout_comment')::int as comments
          from public.${queue} q join public.client_notifications notice on notice.id=q.notification_id`);
        assert.deepEqual(counts.rows, [{ total: 2, comments: 0 }]);
      }
    } finally {
      await db.close();
    }
  });
}
