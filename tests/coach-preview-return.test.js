const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");
const html = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");
const css = fs.readFileSync(path.join(root, "css/coach-preview.css"), "utf8");
const allowlistDeclaration = source.match(/^const coachPortalEmails = .*;$/m)?.[0];
assert.ok(allowlistDeclaration, "Expected the existing coach email allowlist");

function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Expected ${name}`);
  const rest = source.slice(start);
  const next = rest.slice(1).search(/\n(?:async )?function /);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

function fixture(user = null) {
  const toolbar = { hidden: true };
  const link = {
    attributes: { href: "coach-admin.html?tab=clients" },
    get href() { return this.attributes.href || ""; },
    set href(value) { this.attributes.href = String(value); },
    getAttribute(name) { return this.attributes[name] ?? null; },
    removeAttribute(name) { delete this.attributes[name]; }
  };
  const elements = { "coach-preview-toolbar": toolbar, "coach-preview-return": link };
  const context = vm.createContext({
    activeDashboardUser: user,
    document: { getElementById: (id) => elements[id] || null },
    window: { location: { search: "?client=benjaminbenz.fit%40gmail.com&coach=true" } }
  });
  vm.runInContext([
    allowlistDeclaration,
    ...["isCoachPortalEmail", "normalizeClientEmail", "renderCoachPreviewReturn"].map(functionSource)
  ].join("\n"), context);
  return { context, toolbar, link, elements, render: (program) => context.renderCoachPreviewReturn(program) };
}

const coach = { email: "benjaminbenz.fit@gmail.com" };

test("unknown and ordinary viewers cannot reveal a coach return link through preview parameters", () => {
  for (const user of [null, undefined, {}, { email: "" }, { email: "client@example.com" }, { email: "unknown@example.com" }]) {
    const h = fixture(user);
    h.render({ id: "selected-program", client_email: coach.email });
    assert.equal(h.toolbar.hidden, true);
    assert.equal(h.link.getAttribute("href"), null);
  }
});

test("the authenticated coach gets a normalized, usable fallback before a program loads", () => {
  const h = fixture({ email: "  BENJAMINBENZ.FIT@GMAIL.COM  " });
  h.render();
  assert.equal(h.toolbar.hidden, false);
  assert.equal(h.link.href, "coach-admin.html?tab=clients");
});

test("return destinations encode the selected program ID rather than its client email", () => {
  const h = fixture(coach);
  const id = "program/one + two&tab=home?#";
  h.render({ id, client_email: "client+one@example.com" });
  assert.equal(h.toolbar.hidden, false);
  assert.equal(h.link.href, `coach-admin.html?client=${encodeURIComponent(id)}&tab=profile`);
  const destination = new URL(h.link.href, "https://benjaminbenz.com/");
  assert.equal(destination.pathname, "/coach-admin.html");
  assert.equal(destination.searchParams.get("client"), id);
  assert.equal(destination.searchParams.get("tab"), "profile");
  assert.equal(destination.hash, "");
  assert.doesNotMatch(h.link.href, /client%2Bone%40example/);
});

test("program changes and missing programs cannot retain a stale client destination", () => {
  const h = fixture(coach);
  h.render({ id: "program-a" });
  assert.equal(h.link.href, "coach-admin.html?client=program-a&tab=profile");
  h.render({ id: "program-b" });
  assert.equal(h.link.href, "coach-admin.html?client=program-b&tab=profile");
  for (const program of [null, undefined, {}, { id: "", client_email: "client@example.com" }]) {
    h.render(program);
    assert.equal(h.link.href, "coach-admin.html?tab=clients");
    assert.equal(h.toolbar.hidden, false);
  }
});

test("changing to a non-coach user hides the toolbar and removes its previous destination", () => {
  const h = fixture(coach);
  for (const user of [{ email: "client@example.com" }, null]) {
    h.context.activeDashboardUser = coach;
    h.render({ id: "program-a" });
    assert.equal(h.toolbar.hidden, false);
    h.context.activeDashboardUser = user;
    h.render({ id: "program-a" });
    assert.equal(h.toolbar.hidden, true);
    assert.equal(h.link.getAttribute("href"), null);
  }
});

test("shared portal code tolerates pages without either coach preview element", () => {
  for (const missing of ["coach-preview-toolbar", "coach-preview-return"]) {
    const h = fixture(coach);
    delete h.elements[missing];
    assert.doesNotThrow(() => h.render({ id: "program-a" }));
  }
});

test("dashboard initializes the shortcut after successful session checks and before client loading", () => {
  const load = functionSource("loadDashboard");
  const noUserGuard = load.indexOf("if (sessionError || !user)");
  const assignment = load.indexOf("activeDashboardUser = user;");
  const render = load.indexOf("renderCoachPreviewReturn();");
  const targetClient = load.indexOf("const targetClientEmail");
  assert.ok(noUserGuard >= 0 && noUserGuard < assignment);
  assert.match(load.slice(noUserGuard, assignment), /return;/);
  assert.match(load.slice(assignment, render), /^activeDashboardUser = user;\s*$/);
  assert.ok(render < targetClient, "Coach navigation remains available when no preview client is selected");
  assert.match(functionSource("renderProgram"), /^function renderProgram\(program\)\s*\{\s*renderCoachPreviewReturn\(program\);/);
});

test("initial navigation is hidden and remains outside the dashboard loading and content regions", () => {
  const toolbar = html.match(/<nav\b[^>]*id="coach-preview-toolbar"[^>]*>[\s\S]*?<\/nav>/)?.[0];
  assert.ok(toolbar);
  assert.match(toolbar, /<nav\b[^>]*\bhidden(?:\s|>)/);
  assert.match(toolbar, /aria-label="Coach navigation"/);
  assert.match(toolbar, /id="coach-preview-return"/);
  assert.match(toolbar, /Return to coach page/);
  assert.doesNotMatch(toolbar, /target="_blank"|onclick=/);
  const toolbarEnd = html.indexOf(toolbar) + toolbar.length;
  assert.ok(toolbarEnd < html.indexOf('id="dashboard-loading"'));
  assert.ok(toolbarEnd < html.indexOf('id="dashboard-content"'));
  assert.match(html, /<link\b[^>]*href="css\/coach-preview\.css\?[^\"]+"/);
});

test("preview styling preserves the hidden gate and accessible mobile navigation", () => {
  assert.match(css, /\.coach-preview-toolbar\[hidden\]\s*\{\s*display:\s*none\s*!important;/);
  assert.match(css, /\.coach-preview-return\s*\{[^}]*min-height:\s*44px;/);
  assert.match(css, /\.coach-preview-return:focus-visible\s*\{[^}]*outline:\s*3px/);
  assert.match(css, /@media\s*\(max-width:\s*600px\)\s*\{\s*\.client-dashboard-page \.coach-preview-return\s*\{\s*width:\s*100%;/);
});
