const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(rootDir, file), "utf8");
const html = read("client-dashboard.html");
const portal = read("js/client-portal.js");
const migration = read("supabase/migrations/20260928224314_sync_client_email_changes.sql");
const { createController, normalizedEmail } = require("../js/client-account-settings.js");

class FakeControl {
  constructor(value = "") {
    this.value = value;
    this.disabled = false;
    this.textContent = "";
    this.listeners = new Map();
    this.attributes = new Map();
    this.classList = {
      values: new Set(),
      add: (...names) => names.forEach((name) => this.classList.values.add(name)),
      remove: (...names) => names.forEach((name) => this.classList.values.delete(name))
    };
  }
  addEventListener(name, handler) { this.listeners.set(name, handler); }
  removeEventListener(name) { this.listeners.delete(name); }
  setAttribute(name, value) { this.attributes.set(name, value); }
}

function fixture() {
  const nodes = {
    "[data-client-email-form]": new FakeControl(),
    "[data-client-email-input]": new FakeControl(),
    "[data-client-email-status]": new FakeControl(),
    "[data-client-account-email]": new FakeControl(),
    "[data-client-password-form]": new FakeControl(),
    "[data-client-current-password]": new FakeControl(),
    "[data-client-new-password]": new FakeControl(),
    "[data-client-confirm-password]": new FakeControl(),
    "[data-client-password-status]": new FakeControl()
  };
  for (const selector of ["[data-client-email-form]", "[data-client-password-form]"]) {
    const form = nodes[selector];
    form.reportValidity = () => true;
    form.reset = () => {
      form.elements.forEach((control) => { control.value = ""; });
    };
  }
  nodes["[data-client-email-form]"].elements = [nodes["[data-client-email-input]"]];
  nodes["[data-client-password-form]"].elements = [
    nodes["[data-client-current-password]"],
    nodes["[data-client-new-password]"],
    nodes["[data-client-confirm-password]"]
  ];
  const root = { hidden: true, querySelector: (selector) => nodes[selector] || null };
  const calls = [];
  const client = { auth: { updateUser: async (payload) => { calls.push(payload); return { error: null }; } } };
  const controller = createController({ root, supabaseClient: client, user: { id: "user-1", email: "OLD@Example.com" } });
  controller.initialize();
  return { root, nodes, calls, controller };
}

test("Settings contains accessible email, password, reset, and sign-out controls", () => {
  assert.match(html, /data-client-account-settings[^>]*hidden/);
  assert.match(html, /data-client-email-input type="email" autocomplete="email"/);
  assert.match(html, /data-client-current-password type="password" autocomplete="current-password"/);
  assert.equal((html.match(/autocomplete="new-password"/g) || []).length, 2);
  assert.match(html, /data-client-email-status role="status" aria-live="polite"/);
  assert.match(html, /href="css\/client-account-settings\.css\?v=1"/);
  assert.ok(html.indexOf("client-account-settings.js") < html.indexOf("client-portal.js"));
});

test("controller normalizes email changes and supplies current password", async () => {
  const h = fixture();
  assert.equal(h.root.hidden, false);
  assert.equal(h.nodes["[data-client-account-email]"].textContent, "old@example.com");
  assert.equal(normalizedEmail("  NEXT@Example.com "), "next@example.com");

  h.nodes["[data-client-email-input]"].value = " NEXT@Example.com ";
  await h.nodes["[data-client-email-form]"].listeners.get("submit")({ preventDefault() {} });
  assert.deepEqual(h.calls[0], { email: "next@example.com" });
  assert.match(h.nodes["[data-client-email-status]"].textContent, /confirmation instructions/);

  h.nodes["[data-client-current-password]"].value = "old-password";
  h.nodes["[data-client-new-password]"].value = "new-password";
  h.nodes["[data-client-confirm-password]"].value = "new-password";
  await h.nodes["[data-client-password-form]"].listeners.get("submit")({ preventDefault() {} });
  assert.deepEqual(h.calls[1], { password: "new-password", current_password: "old-password" });
  assert.equal(h.nodes["[data-client-current-password]"].value, "");
});

test("controller rejects previews and mismatched passwords without an auth request", async () => {
  assert.equal(createController({ root: {}, supabaseClient: { auth: {} }, user: { id: "1" }, isPreview: true }), null);
  const h = fixture();
  h.nodes["[data-client-current-password]"].value = "old-password";
  h.nodes["[data-client-new-password]"].value = "new-password";
  h.nodes["[data-client-confirm-password]"].value = "different-password";
  await h.nodes["[data-client-password-form]"].listeners.get("submit")({ preventDefault() {} });
  assert.equal(h.calls.length, 0);
  assert.match(h.nodes["[data-client-password-status]"].textContent, /do not match/);
});

test("portal initializes and destroys account settings with the signed-in user", () => {
  assert.match(portal, /function configureClientAccountSettings\(\)/);
  assert.match(portal, /FWB_CLIENT_ACCOUNT_SETTINGS\?\.createController/);
  assert.match(portal, /user: activeDashboardUser/);
  assert.match(portal, /isPreview: isCoachDashboardPreview/);
  assert.match(portal, /FWB_CLIENT_ACCOUNT_SETTINGS_CONTROLLER\?\.destroy\(\)/);
});

test("migration uses a narrow confirmed-email trigger and explicit table allowlist", () => {
  assert.match(migration, /after update of email on auth\.users/);
  assert.match(migration, /when \(old\.email is distinct from new\.email\)/);
  assert.match(migration, /security definer[\s\S]*?set search_path = ''/);
  assert.doesNotMatch(migration, /information_schema|pg_catalog|for .* in select/i);
  for (const table of [
    "client_programs", "client_progress", "client_workout_logs", "client_food_logs",
    "client_progress_photos", "client_dexa_reports", "client_fitness_questionnaires",
    "client_google_health_connections", "client_apple_health_settings"
  ]) assert.match(migration, new RegExp(`update public\\.${table}`));
  assert.match(migration, /update messaging_private\.conversations/);
  assert.match(migration, /update fwb_workout_private\.deleted_sessions/);
});
