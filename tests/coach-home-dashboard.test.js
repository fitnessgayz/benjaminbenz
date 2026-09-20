const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.resolve(__dirname, "..");
const adminHtml = fs.readFileSync(path.join(projectRoot, "coach-admin.html"), "utf8");
const adminSource = fs.readFileSync(path.join(projectRoot, "js/coach-admin.js"), "utf8");
const styleSource = fs.readFileSync(path.join(projectRoot, "css/style.css"), "utf8");

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

test("Coach Home is the default destination directly after Session Logger", () => {
  const navStart = adminHtml.indexOf('id="coach-admin-sidebar-nav"');
  const navEnd = adminHtml.indexOf("</nav>", navStart);
  const navigation = adminHtml.slice(navStart, navEnd);

  assert.ok(navigation.indexOf('href="coach-workout-log.html"') < navigation.indexOf('data-admin-tab="home"'));
  assert.match(navigation, /data-admin-tab="home"[^>]*aria-label="Home"[^>]*aria-current="page"/);
  assert.match(adminSource, /get\("tab"\) \|\| "home"/);
  assert.match(adminSource, /coachAdminTabNames\.has\(tabName\) \? tabName : "home"/);
});

test("Coach Home exposes live workout, schedule, session, sheet, and follow-up modules", () => {
  const homeStart = adminHtml.indexOf('data-admin-panel="home"');
  const homeEnd = adminHtml.indexOf('data-admin-client-context', homeStart);
  const home = adminHtml.slice(homeStart, homeEnd);

  assert.match(home, /id="coach-home-recent-list"/);
  assert.match(home, /id="coach-home-calendar"/);
  assert.match(home, /id="coach-home-calendar-status"/);
  assert.match(home, /data-coach-home-refresh-calendar/);
  assert.match(home, /Open calendar/);
  assert.match(home, /id="coach-home-schedule-list"/);
  assert.match(home, /id="coach-home-sheet-list"/);
  assert.match(home, /Alex Fitness, B2 Master Session/);
  assert.match(home, /id="coach-home-session-alert-list"/);
  assert.match(home, /id="coach-home-inactive-list"/);
  assert.match(home, /id="new-client-button"/);
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

test("home actions open the selected client's training logs or sessions", () => {
  const handler = javascriptFunction("handleCoachHomeActions");
  const opener = javascriptFunction("openCoachHomeClientSection");

  assert.match(handler, /data-coach-home-open-logs/);
  assert.match(handler, /data-coach-home-open-sessions/);
  assert.match(handler, /data-coach-home-tab/);
  assert.match(handler, /data-coach-home-refresh-calendar/);
  assert.match(opener, /fillForm\(program\)/);
  assert.match(opener, /setAdminTab\(tabName\)/);
});

test("home dashboard adapts its cards and lists for phone screens", () => {
  assert.match(styleSource, /\.coach-home-dashboard-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s);
  assert.match(styleSource, /@media \(max-width: 720px\)[\s\S]*?\.coach-home-dashboard-grid\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(styleSource, /@media \(max-width: 480px\)[\s\S]*?\.coach-home-sheet-card\s*\{[^}]*grid-template-columns:\s*1fr/s);
});

test("summary cards are four keyboard-accessible buttons rather than static articles", () => {
  const metrics = adminHtml.slice(adminHtml.indexOf('class="coach-home-metrics"'), adminHtml.indexOf('class="coach-home-dashboard-grid"'));
  for (const destination of ["clients", "workouts", "sessions", "attention"]) {
    assert.match(metrics, new RegExp(`<button[^>]+type="button"[^>]+data-coach-home-shortcut="${destination}"`));
  }
  assert.doesNotMatch(metrics, /<article/);
});

test("summary shortcuts select active clients or focus and scroll to the matching section", () => {
  const calls = [];
  const nodes = {};
  for (const id of ["client-search-input", "coach-home-recent-title", "coach-home-sheets-title", "coach-home-session-alert-title"]) {
    nodes[id] = {value: "Old search", focus: () => calls.push(["focus", id]), scrollIntoView: options => calls.push(["scroll", id, options.behavior])};
  }
  let reducedMotion = false;
  const api = Function("document", "window", "closeClientSuggestions", "renderClientList", "setAdminTab", `
    let showingArchivedClients = true;
    let clientSearchTerm = "Old search";
    ${javascriptFunction("openCoachHomeShortcut")}
    return {openCoachHomeShortcut, state: () => ({showingArchivedClients, clientSearchTerm})};
  `)(
    {getElementById: id => nodes[id]},
    {matchMedia: () => ({matches: reducedMotion})},
    () => calls.push(["close"]), () => calls.push(["render"]), tab => calls.push(["tab", tab])
  );
  api.openCoachHomeShortcut("clients");
  assert.deepEqual(api.state(), {showingArchivedClients:false, clientSearchTerm:""});
  assert.equal(nodes["client-search-input"].value, "");
  assert.ok(calls.some(call => call[0] === "tab" && call[1] === "clients"));
  for (const [destination,id] of [["workouts","coach-home-recent-title"],["sessions","coach-home-sheets-title"],["attention","coach-home-session-alert-title"]]) {
    calls.length = 0;
    api.openCoachHomeShortcut(destination);
    assert.deepEqual(calls, [["focus",id],["scroll",id,"smooth"]]);
  }
  reducedMotion = true;
  calls.length = 0;
  api.openCoachHomeShortcut("workouts");
  assert.equal(calls.at(-1)[2], "auto");
  calls.length = 0;
  api.openCoachHomeShortcut("unknown");
  assert.equal(calls.length, 0);
});
