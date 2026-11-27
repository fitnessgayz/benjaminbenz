const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.resolve(__dirname, "..");
const adminHtml = fs.readFileSync(path.join(projectRoot, "coach-admin.html"), "utf8");
const adminSource = fs.readFileSync(path.join(projectRoot, "js/coach-admin.js"), "utf8");
const styleSource = fs.readFileSync(path.join(projectRoot, "css/style.css"), "utf8");
const workspaceStyles = fs.readFileSync(path.join(projectRoot, "css/coach-workspace.css"), "utf8");

function javascriptFunction(name) {
  const declaration = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const match = declaration.exec(adminSource);

  assert.ok(match, `${name} should exist`);
  const start = match.index;
  const remainder = adminSource.slice(start + match[0].length);
  const nextDeclaration = remainder.search(/\n(?:async\s+)?function\s+[A-Za-z0-9_$]+\s*\(/);
  const end = nextDeclaration >= 0 ? start + match[0].length + nextDeclaration : adminSource.length;
  return adminSource.slice(start, end);
}

test("Coach Home remains first in the sidebar and is the default view", () => {
  const navStart = adminHtml.indexOf('id="coach-admin-sidebar-nav"');
  const navEnd = adminHtml.indexOf("</nav>", navStart);
  const navigation = adminHtml.slice(navStart, navEnd);

  assert.ok(navigation.indexOf('data-admin-tab="home"') < navigation.indexOf('href="coach-workout-log.html"'));
  assert.match(navigation, /data-admin-tab="home"[^>]*aria-label="Home"[^>]*aria-current="page"/);
  assert.doesNotMatch(navigation, /data-admin-tab="notifications"[^>]*aria-current="page"/);
  assert.match(adminSource, /get\("tab"\) \|\| "home"/);
  assert.match(adminSource, /coachAdminTabNames\.has\(tabName\) \? tabName : "home"/);
});

test("Home keeps the quick actions and summary while Clients and Sessions own their tools", () => {
  const home = adminHtml.slice(adminHtml.indexOf('data-admin-panel="home"'), adminHtml.indexOf('data-admin-panel="inbox"'));
  const clients = adminHtml.slice(adminHtml.indexOf('data-admin-panel="clients"'), adminHtml.indexOf('data-admin-panel="session-counts"'));
  const sessions = adminHtml.slice(adminHtml.indexOf('data-admin-panel="session-counts"'), adminHtml.indexOf('data-admin-panel="home"'));

  assert.match(home, /data-coach-home-shortcut="workouts"/);
  assert.match(home, /id="new-client-button"/);
  assert.doesNotMatch(home, /<summary>|coach-exercise-library\.html|coach-community-wall\.html|coach-home-destination/);
  assert.match(clients, /<summary>Client follow-ups<\/summary>/);
  const roster = clients.slice(clients.indexOf('id="coach-clients-roster-panel"'), clients.indexOf('id="coach-clients-approvals-panel"'));
  const approvals = clients.slice(clients.indexOf('id="coach-clients-approvals-panel"'));
  assert.match(roster, /id="coach-client-roster"/);
  assert.match(approvals, /id="coach-access-request-list"/);
  assert.doesNotMatch(roster, /id="coach-access-request-list"|id="coach-home-session-alert-list"/);
  assert.doesNotMatch(approvals, /id="coach-client-roster"|id="coach-home-session-alert-list"/);
  assert.match(home, /data-coach-home-shortcut="approvals" hidden/);
  assert.deepEqual([...clients.matchAll(/data-coach-clients-section="([^"]+)"/g)].map(match => match[1]), ["roster", "approvals"]);
  assert.doesNotMatch(clients, /coach-clients-sessions-panel|coach-home-session-alert-list/);
  assert.match(sessions, /<summary id="coach-home-session-alert-title">Low or out of sessions<\/summary>[\s\S]*?id="coach-home-session-alert-list"/);
  assert.match(clients, /id="coach-home-inactive-list"/);
  assert.match(clients, /id="coach-access-request-list"/);
  assert.match(sessions, /<summary>Session sheets<\/summary>/);
  assert.match(sessions, /id="coach-home-sheet-list"/);
  assert.match(sessions, /Alex Fitness, B2 Master Session/);
});

test("old Clients session links open the dedicated Sessions tab", () => {
  const requestedTab = Function("window", "coachAdminTabNames", `
    ${javascriptFunction("requestedCoachAdminTab")}
    return requestedCoachAdminTab();
  `);
  const tabs = new Set(["home", "clients", "session-counts"]);
  assert.equal(requestedTab({ location: { search: "?tab=clients&section=sessions" } }, tabs), "session-counts");
  assert.equal(requestedTab({ location: { search: "?tab=clients&section=approvals" } }, tabs), "clients");
});

test("home summaries come from current programs and bounded workout-log history", () => {
  const loader = javascriptFunction("loadRecentTrainingLogs");
  const renderer = javascriptFunction("renderCoachHome");

  assert.match(loader, /\.from\("client_workout_logs"\)/);
  assert.match(loader, /\.not\("completed_at", "is", null\)/);
  assert.match(loader, /\.order\("completed_at", \{ ascending: false \}\)/);
  assert.match(loader, /\.limit\(1000\)/);
  assert.match(loader, /renderCoachHome\(\)/);
  assert.match(renderer, /activeClientPrograms\(\)/);
  assert.match(renderer, /latestWorkoutByClient\(\)/);
  assert.match(renderer, /daysSinceIsoDate\(workout\.entry_date\)/);
  assert.match(renderer, /workout\.completed_at/);
  assert.match(renderer, /daysSince >= 0 && daysSince < 7/);
  assert.match(renderer, /trustedSheetUrl\(program\.sheet_url\)/);
});

test("Sessions Left uses only the Alex Fitness Master summary", () => {
  const renderer = javascriptFunction("renderCoachHome");

  assert.match(adminSource, /const alexFitnessMasterSessions = Object\.freeze\(\{/);
  assert.match(adminSource, /used:\s*82/);
  assert.match(adminSource, /total:\s*100/);
  assert.match(renderer, /alexFitnessTotalSessions - alexFitnessUsedSessions/);
  assert.match(renderer, /Alex Fitness Master/);
  assert.doesNotMatch(renderer, /const activePackages = activeClients/);
  assert.match(adminHtml, /id="coach-home-session-total">Alex Fitness Master only/);
  assert.match(adminHtml, /coach-admin\.js\?[^"\s]*home-shortcuts=1/);
});

test("home flags empty or low packages and clients inactive for 14 days", () => {
  const alerts = javascriptFunction("coachHomeSessionAlerts");
  const inactive = javascriptFunction("coachHomeInactiveClients");

  assert.match(alerts, /remaining: Math\.max\(0, total - used\)/);
  assert.match(alerts, /entry\.total > 0 && entry\.remaining <= 3/);
  assert.match(inactive, /!entry\.workout \|\| entry\.daysSince === null \|\| entry\.daysSince >= 14/);
});

test("follow-up actions open the selected client's training logs, sessions, or profile", () => {
  const handler = javascriptFunction("handleCoachHomeActions");
  const opener = javascriptFunction("openCoachHomeClientSection");

  assert.match(handler, /data-coach-home-open-logs/);
  assert.match(handler, /data-coach-home-open-sessions/);
  assert.match(handler, /data-coach-home-open-membership/);
  assert.match(handler, /getElementById\("program-editor"\)/);
  assert.match(opener, /fillForm\(program\)/);
  assert.match(opener, /setAdminTab\(tabName\)/);
});

test("relocated tools remain compact on mobile", () => {
  assert.match(workspaceStyles, /\.coach-workspace-disclosure \.coach-home-module\s*\{[^}]*padding:\s*12px 0/s);
  assert.match(styleSource, /@media \(max-width: 480px\)[\s\S]*?\.coach-home-sheet-card\s*\{[^}]*grid-template-columns:\s*1fr/s);
});

test("summary metrics are four keyboard-accessible shortcuts", () => {
  const metrics = adminHtml.slice(adminHtml.indexOf('class="coach-home-metrics"'), adminHtml.indexOf('data-admin-panel="inbox"'));
  for (const destination of ["clients", "workouts", "sessions", "attention"]) {
    assert.match(metrics, new RegExp(`<button[^>]+type="button"[^>]+data-coach-home-shortcut="${destination}"`));
  }
  assert.doesNotMatch(metrics, /<article/);
});

test("summary shortcuts select active clients or open and focus the matching section", () => {
  const calls = [];
  const nodes = {};
  for (const id of ["client-search-input", "coach-home-sheets-title", "coach-home-session-alert-title", "coach-access-requests-title", "coach-home-membership-title"]) {
    const disclosure = { open: false };
    const insideDisclosure = ["coach-home-sheets-title", "coach-home-membership-title", "coach-home-session-alert-title"].includes(id);
    nodes[id] = {
      id,
      value: "Old search",
      closest: (selector) => selector === "details" && insideDisclosure ? disclosure : null,
      focus: () => calls.push(["focus", id, disclosure.open]),
      scrollIntoView: options => calls.push(["scroll", id, options.behavior])
    };
  }
  let reducedMotion = false;
  let hasMembershipRequests = false;
  const api = Function("document", "window", "closeClientSuggestions", "renderClientList", "setAdminTab", "openCoachActivity", `
    let showingArchivedClients = true;
    let clientSearchTerm = "Old search";
    ${javascriptFunction("openCoachHomeShortcut")}
    return {openCoachHomeShortcut, state: () => ({showingArchivedClients, clientSearchTerm})};
  `)(
    {getElementById: id => nodes[id], querySelector: () => hasMembershipRequests},
    {matchMedia: () => ({matches: reducedMotion})},
    () => calls.push(["close"]), () => calls.push(["render"]), (tab, options = {}) => calls.push(["tab", tab, options.clientSection]), () => calls.push(["activity"])
  );
  api.openCoachHomeShortcut("clients");
  assert.deepEqual(api.state(), {showingArchivedClients:false, clientSearchTerm:""});
  assert.equal(nodes["client-search-input"].value, "");
  assert.ok(calls.some(call => call[0] === "tab" && call[1] === "clients"));
  calls.length = 0;
  api.openCoachHomeShortcut("workouts");
  assert.deepEqual(calls, [["activity"]]);
  const cases = [
    ["sessions", "coach-home-sheets-title", "session-counts", undefined, true],
    ["attention", "coach-home-session-alert-title", "session-counts", undefined, true],
    ["approvals", "coach-access-requests-title", "clients", "approvals", false]
  ];
  for (const [destination, id, tab, section, expands] of cases) {
    calls.length = 0;
    api.openCoachHomeShortcut(destination);
    assert.deepEqual(calls, [["tab", tab, section], ["focus", id, expands], ["scroll", id, "smooth"]]);
  }
  hasMembershipRequests = true;
  calls.length = 0;
  api.openCoachHomeShortcut("attention");
  assert.deepEqual(calls, [["tab", "clients", "roster"], ["focus", "coach-home-membership-title", true], ["scroll", "coach-home-membership-title", "smooth"]]);
  reducedMotion = true;
  calls.length = 0;
  api.openCoachHomeShortcut("sessions");
  assert.equal(calls.at(-1)[2], "auto");
  calls.length = 0;
  api.openCoachHomeShortcut("unknown");
  assert.equal(calls.length, 0);
});
