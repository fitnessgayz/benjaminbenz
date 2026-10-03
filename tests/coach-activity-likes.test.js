const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const notificationsSource = fs.readFileSync(path.join(root, "js/web-notifications.js"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20261003172116_coach_activity_likes.sql"), "utf8");
const coach = fs.readFileSync(path.join(root, "coach-admin.html"), "utf8");
const client = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");
const portal = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "css/style.css"), "utf8");
const modernPush = fs.readFileSync(path.join(root, "supabase/functions/send-web-push/index.ts"), "utf8");

function element(tag = "div") {
  const classes = new Set();
  return {
    tag,
    children: [],
    dataset: {},
    hidden: false,
    disabled: false,
    textContent: "",
    className: "",
    classList: { toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); } },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    setAttribute(name, value) { this[name] = value; },
    getAttribute(name) { return this[name]; }
  };
}

function coachHarness() {
  const list = element("ul");
  const empty = element("p");
  const badge = element("span");
  const markAll = element("button");
  const status = element("p");
  const selectors = new Map([
    ["[data-web-notification-list]", list],
    ["[data-web-notification-empty]", empty],
    ["[data-web-notification-unread]", badge],
    ["[data-web-notification-mark-all]", markAll],
    ["[data-web-notification-status]", status]
  ]);
  const listeners = new Map();
  const rootElement = element("section");
  rootElement.querySelector = (selector) => selectors.get(selector) || null;
  rootElement.querySelectorAll = () => [];
  rootElement.addEventListener = (type, listener) => listeners.set(type, listener);
  rootElement.removeEventListener = () => {};
  const notice = {
    id: "notice-1",
    recipient_role: "coach",
    kind: "workout_completed",
    title: "A client completed a workout",
    body: "Open the log.",
    action_url: "/coach-admin.html?tab=logs",
    metadata: { client_email: "client@example.com" },
    created_at: "2026-10-03T12:00:00Z",
    read_at: null
  };
  const rpcCalls = [];
  const supabaseClient = {
    rpc: async (name, args) => {
      rpcCalls.push({ name, args });
      return { data: [{ liked: true, reaction_id: "reaction-1" }], error: null };
    },
    from(table) {
      const query = {
        select() { return this; },
        eq() { return this; },
        order() { return this; },
        in() { return Promise.resolve({ data: [], error: null }); },
        maybeSingle() {
          assert.equal(table, "client_notification_preferences");
          return Promise.resolve({ data: { user_id: "coach-1", push_enabled: false }, error: null });
        },
        single() {
          assert.equal(table, "client_notification_preferences");
          return Promise.resolve({ data: { user_id: "coach-1", push_enabled: false }, error: null });
        },
        limit() {
          assert.equal(table, "client_notifications");
          return Promise.resolve({ data: [notice], error: null });
        }
      };
      assert.ok(["client_notification_preferences", "client_notifications", "coach_activity_likes"].includes(table));
      return query;
    }
  };
  const document = {
    visibilityState: "visible",
    createElement: (tag) => element(tag),
    addEventListener() {},
    removeEventListener() {}
  };
  const sandbox = { window: { document, navigator: {}, location: { origin: "https://fitness.test" }, URL,
    addEventListener() {}, removeEventListener() {}, atob: (value) => Buffer.from(value, "base64").toString("binary") },
  URL, Intl, Uint8Array, Buffer };
  vm.runInNewContext(notificationsSource, sandbox);
  const controller = sandbox.window.FWBWebNotifications.createController({
    supabaseClient, user: { id: "coach-1" }, role: "coach", root: rootElement
  });
  return { controller, list, status, listeners, rpcCalls };
}

test("coach activity likes are source-bound, account-scoped, and notify the client", () => {
  assert.match(migration, /create table public\.coach_activity_likes/);
  assert.match(migration, /source_notification_id uuid not null references public\.client_notifications\(id\)/);
  assert.match(migration, /unique \(coach_user_id, source_notification_id\)/);
  assert.match(migration, /notification\.user_id = actor_id[\s\S]*notification\.recipient_role = 'coach'/);
  assert.match(migration, /notification\.kind in \('workout_completed', 'check_in_submitted', 'achievement'\)/);
  assert.match(migration, /target_user_id := private\.fwb_notification_user_id\(target_email\)/);
  assert.match(migration, /if actor_id is null or not coalesce\(public\.is_coach_admin\(\), false\)/);
  assert.match(migration, /revoke all on function public\.toggle_client_activity_like\(uuid\) from public, anon/);
  assert.match(migration, /'coach_reaction'/);
  assert.match(migration, /Benjamin liked your workout/);
});

test("new badges become durable coach activity without trusting another account", () => {
  assert.match(migration, /create table public\.client_achievement_events/);
  assert.match(migration, /\(select auth\.uid\(\)\) = user_id/);
  assert.match(migration, /client_email = lower\(btrim\(coalesce\(\(select auth\.jwt\(\)\) ->> 'email'/);
  assert.match(migration, /create trigger fwb_achievement_event_notifications/);
  assert.match(portal, /recordClientAchievementEvents\(celebration\?\.events\)/);
  assert.match(portal, /from\("client_achievement_events"\)\.insert\(badge\)/);
  assert.match(portal, /error\.code \|\| ""\) !== "23505"/);
});

test("coach inbox presents an accessible like control and persists the toggle", async () => {
  const harness = coachHarness();
  assert.equal(await harness.controller.init(), true);
  const firstItem = harness.list.children[0];
  const likeButton = firstItem.children.find((child) => child.dataset.webNotificationLike);
  assert.ok(likeButton);
  assert.equal(likeButton["aria-pressed"], "false");
  assert.equal(likeButton["aria-label"], "Like this client update");

  await harness.listeners.get("click")({
    preventDefault() {},
    target: { closest: (selector) => selector === "[data-web-notification-like]" ? likeButton : null }
  });

  assert.equal(harness.rpcCalls.length, 1);
  assert.equal(harness.rpcCalls[0].name, "toggle_client_activity_like");
  assert.equal(harness.rpcCalls[0].args.p_notification_id, "notice-1");
  const updatedButton = harness.list.children[0].children.find((child) => child.dataset.webNotificationLike);
  assert.equal(updatedButton["aria-pressed"], "true");
  assert.match(harness.status.textContent, /Client notified/);
});

test("shared branding exposes activity likes on responsive web surfaces", () => {
  assert.match(coach, /Recent client activity/);
  assert.match(coach, /data-web-notification-preference="client_achievements"/);
  assert.match(coach, /web-notifications\.js\?v=coach-activity-likes-1/);
  assert.match(client, /Coach replies, likes \+ form reviews/);
  assert.match(client, /web-notifications\.js\?v=coach-activity-likes-1/);
  assert.match(styles, /\.web-notification-like\s*\{[\s\S]*?min-height:\s*44px/);
  assert.match(styles, /@media \(max-width: 600px\)[\s\S]*?\.web-notification-item\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(modernPush, /coach_reaction:\s*"coach_replies"/);
  assert.match(modernPush, /achievement:\s*"client_achievements"/);
});
