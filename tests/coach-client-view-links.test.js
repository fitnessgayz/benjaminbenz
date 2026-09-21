const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const adminSource = fs.readFileSync(path.join(root, "js/coach-admin.js"), "utf8");
const loggerSource = fs.readFileSync(path.join(root, "js/coach-workout-log.js"), "utf8");

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Expected ${name}`);
  const rest = source.slice(start);
  const next = rest.slice(1).search(/\n(?:async )?function /);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

function anchor(id) {
  return {
    id, hidden: false, tabIndex: 0, attributes: {},
    get href() { return this.attributes.href || ""; },
    set href(value) { this.attributes.href = value; },
    getAttribute(name) { return this.attributes[name] ?? null; },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (name.toLowerCase() === "tabindex") this.tabIndex = Number(value);
    },
    removeAttribute(name) {
      delete this.attributes[name];
      if (name.toLowerCase() === "tabindex") this.tabIndex = 0;
    }
  };
}

function adminFixture() {
  const header = anchor("client-view-link");
  const selected = anchor("selected-client-view-link");
  selected.target = "_blank";
  const elements = { "client-view-link": header, "selected-client-view-link": selected };
  let program;
  const context = vm.createContext({
    document: { getElementById: (id) => elements[id] || null },
    selectedProgram: () => program
  });
  vm.runInContext(["normalizeEmail", "clientViewUrl", "updateClientViewLink"]
    .map((name) => functionSource(adminSource, name)).join("\n"), context);
  return {
    context, header, selected, elements,
    select(next) { program = next; context.updateClientViewLink(); }
  };
}

function loggerFixture(programs = [
  { client_name: "Rakesh", client_email: "rakesh+gym@example.com", active: true },
  { client_name: "Aaron", client_email: "aaron@example.com", active: true }
]) {
  const link = anchor("coach-workout-client-view");
  const select = { value: "" };
  const nameInput = { value: "" };
  const elements = {
    "coach-workout-client-view": link,
    "coach-workout-client": select,
    "coach-workout-client-name": nameInput
  };
  const context = vm.createContext({
    coachWorkoutPrograms: programs,
    document: { getElementById: (id) => elements[id] || null }
  });
  vm.runInContext(["normalizeCoachWorkoutEmail", "activeCoachWorkoutClients", "updateCoachWorkoutClientViewLink"]
    .map((name) => functionSource(loggerSource, name)).join("\n"), context);
  return {
    context, link, select, nameInput, elements,
    choose(email) { select.value = email; context.updateCoachWorkoutClientViewLink(); }
  };
}

function assertUnavailable(link, hidden = true, disabled = true) {
  assert.equal(link.getAttribute("href"), null, "Unavailable links must not retain a stale client destination");
  if (disabled) {
    assert.equal(link.getAttribute("aria-disabled"), "true");
    assert.equal(link.tabIndex, -1);
  }
  assert.equal(link.hidden, hidden);
  assert.equal(link.getAttribute("aria-label"), null);
}

test("admin desktop and selected-client links follow selection and encode normalized emails", () => {
  const h = adminFixture();
  h.select({ client_name: "Rakesh", client_email: " RAKESH+GYM@EXAMPLE.COM " });
  for (const link of [h.header, h.selected]) {
    assert.equal(link.href, "client-dashboard.html?v=manual-sessions-1&client=rakesh%2Bgym%40example.com");
    assert.equal(link.getAttribute("aria-disabled"), "false");
    assert.equal(link.tabIndex, 0);
    assert.match(link.getAttribute("aria-label"), /Rakesh/);
  }
  assert.equal(h.selected.hidden, false);
  assert.match(h.selected.getAttribute("aria-label"), /opens in a new tab/);
  h.select({ client_name: "Aaron", client_email: "aaron@example.com" });
  assert.equal(h.header.href, "client-dashboard.html?v=manual-sessions-1&client=aaron%40example.com");
  assert.equal(h.selected.href, h.header.href);
  assert.match(h.selected.getAttribute("aria-label"), /Aaron/);
  assert.doesNotMatch(h.selected.getAttribute("aria-label"), /Rakesh/);
});

test("clearing the admin selection disables both links and hides the mobile-accessible shortcut", () => {
  const h = adminFixture();
  h.select({ client_name: "Rakesh", client_email: "rakesh@example.com" });
  for (const empty of [undefined, {}, { client_name: "Unsaved client", client_email: "  " }]) {
    h.select(empty);
    assertUnavailable(h.header, false);
    assertUnavailable(h.selected);
  }
  h.select({ client_name: "Aaron", client_email: "aaron@example.com" });
  assert.equal(h.selected.hidden, false);
  assert.equal(h.selected.tabIndex, 0);
});

test("admin client destinations use email, including when the selected record has a program ID", () => {
  const h = adminFixture();
  h.select({ id: "program-uuid", client_email: "coach-test+one@example.com" });
  const destination = new URL(h.selected.href, "https://benjaminbenz.com/");
  assert.equal(destination.pathname, "/client-dashboard.html");
  assert.equal(destination.searchParams.get("client"), "coach-test+one@example.com");
  assert.doesNotMatch(h.selected.href, /program-uuid/);
});

test("admin helpers tolerate missing alternate link surfaces", () => {
  const h = adminFixture();
  delete h.elements["selected-client-view-link"];
  assert.doesNotThrow(() => h.select({ client_email: "client@example.com" }));
  assert.match(h.header.href, /client=client%40example.com/);
  delete h.elements["client-view-link"];
  assert.doesNotThrow(() => h.select({}));
});

test("logger links track the selected active client rather than unconfirmed name text", () => {
  const h = loggerFixture();
  h.nameInput.value = "Someone unselected";
  h.choose("RAKESH+GYM@EXAMPLE.COM");
  assert.equal(h.link.href, "client-dashboard.html?v=manual-sessions-1&client=rakesh%2Bgym%40example.com");
  assert.match(h.link.getAttribute("aria-label"), /Rakesh/);
  assert.doesNotMatch(h.link.getAttribute("aria-label"), /Someone unselected/);
  assert.equal(h.link.hidden, false);
  assert.equal(h.link.tabIndex, 0);
  h.choose("aaron@example.com");
  assert.equal(h.link.href, "client-dashboard.html?v=manual-sessions-1&client=aaron%40example.com");
  assert.match(h.link.getAttribute("aria-label"), /Aaron/);
  h.choose("");
  assertUnavailable(h.link, true, false);
});

test("logger hides stale links for archived, inactive or unknown client selections", () => {
  const h = loggerFixture([
    { client_name: "Active", client_email: "active@example.com", active: true },
    { client_name: "Inactive", client_email: "inactive@example.com", active: false },
    { client_name: "Archived", client_email: "archived@example.com", active: true, client_archived: true }
  ]);
  for (const email of ["inactive@example.com", "archived@example.com", "unknown@example.com", ""]) {
    h.choose("active@example.com");
    assert.equal(h.link.hidden, false);
    h.choose(email);
    assertUnavailable(h.link, true, false);
  }
  h.choose("active@example.com");
  h.context.coachWorkoutPrograms[0].client_archived = true;
  h.context.updateCoachWorkoutClientViewLink();
  assertUnavailable(h.link, true, false);
});

test("logger uses the latest active record for duplicate normalized emails", () => {
  const h = loggerFixture([
    { client_name: "Old name", client_email: "CLIENT@example.com", active: true, updated_at: "2026-09-01" },
    { client_name: "Current name", client_email: "client@example.com", active: true, updated_at: "2026-09-20" },
    { client_name: "Archived name", client_email: "client@example.com", client_archived: true, updated_at: "2026-09-21" }
  ]);
  h.choose("client@example.com");
  assert.match(h.link.getAttribute("aria-label"), /Current name/);
  assert.doesNotMatch(h.link.getAttribute("aria-label"), /Old name|Archived name/);
  assert.equal(h.link.hidden, false);
});

test("logger helpers tolerate missing selectors and links without keeping a destination", () => {
  const h = loggerFixture();
  h.choose("aaron@example.com");
  delete h.elements["coach-workout-client"];
  assert.doesNotThrow(() => h.context.updateCoachWorkoutClientViewLink());
  assertUnavailable(h.link, true, false);
  delete h.elements["coach-workout-client-view"];
  assert.doesNotThrow(() => h.context.updateCoachWorkoutClientViewLink());
});

test("mobile-accessible links open separate client pages and hidden links stay out of layout", () => {
  const adminHtml = fs.readFileSync(path.join(root, "coach-admin.html"), "utf8");
  const loggerHtml = fs.readFileSync(path.join(root, "coach-workout-log.html"), "utf8");
  const styles = fs.readFileSync(path.join(root, "css/style.css"), "utf8");
  for (const [html, id] of [[adminHtml, "selected-client-view-link"], [loggerHtml, "coach-workout-client-view"]]) {
    const markup = html.match(new RegExp(`<a\\b[^>]*\\bid="${id}"[^>]*>`))?.[0];
    assert.ok(markup, `Expected ${id} anchor`);
    assert.match(markup, /class="[^"]*coach-client-view-link/);
    assert.match(markup, /target="_blank"/);
    assert.match(markup, /rel="[^"]*noopener/);
    assert.match(markup, /\bhidden\b/);
  }
  assert.match(styles, /\.coach-client-view-link\[hidden\]\s*\{\s*display:\s*none\s*!important/);
});
