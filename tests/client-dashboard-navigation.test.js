const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.resolve(__dirname, "..");
const dashboardHtml = fs.readFileSync(path.join(projectRoot, "client-dashboard.html"), "utf8");
const portalSource = fs.readFileSync(path.join(projectRoot, "js/client-portal.js"), "utf8");
const styleSource = fs.readFileSync(path.join(projectRoot, "css/style.css"), "utf8");

function sourceForFunction(name) {
  const start = portalSource.indexOf(`function ${name}(`);
  const end = portalSource.indexOf("\nfunction ", start + 1);

  assert.ok(start >= 0, `Expected ${name} to exist`);
  return portalSource.slice(start, end >= 0 ? end : undefined);
}

function sourceBetween(startMarker, endMarker) {
  const start = styleSource.indexOf(startMarker);
  const end = styleSource.indexOf(endMarker, start + startMarker.length);

  assert.ok(start >= 0, `Expected ${startMarker} to exist`);
  assert.ok(end > start, `Expected ${endMarker} after ${startMarker}`);
  return styleSource.slice(start, end);
}

test("scopes the client navigation styles and cache-busts the workout deck update", () => {
  assert.match(dashboardHtml, /<body class="dashboard-page client-dashboard-page is-loading">/);
  assert.match(dashboardHtml, /href="css\/style\.css\?v=custom-workout-first-1"/);
  assert.match(dashboardHtml, /src="js\/client-portal\.js\?v=copy-workout-timer-fix-1"/);
  assert.match(styleSource, /body\.client-dashboard-page\s*\{[^}]*padding-bottom:\s*0;/s);
});

test("renders six labeled client destinations in order with current-page semantics", () => {
  const navStart = dashboardHtml.indexOf('<nav class="client-dashboard-tabs"');
  const navEnd = dashboardHtml.indexOf("</nav>", navStart);
  const navMarkup = dashboardHtml.slice(navStart, navEnd);
  const buttons = [...navMarkup.matchAll(/<button\b([^>]*data-client-dashboard-tab="([^"]+)"[^>]*)>([\s\S]*?)<\/button>/g)];

  assert.ok(navStart >= 0);
  assert.equal(buttons.length, 6);
  assert.deepEqual(buttons.map((match) => match[2]), [
    "home",
    "workouts",
    "logs",
    "nutrition",
    "progress",
    "sessions"
  ]);
  assert.deepEqual(buttons.map((match) => match[1].match(/aria-label="([^"]+)"/)?.[1]), [
    "Home",
    "Workouts",
    "Logs",
    "Food",
    "Profile and progress",
    "Sessions"
  ]);
  assert.deepEqual(buttons.map((match) => match[3].match(/client-dashboard-tab-label">([^<]+)</)?.[1]), [
    "Home",
    "Workouts",
    "Logs",
    "Food",
    "Progress",
    "Sessions"
  ]);
  assert.equal(buttons.filter((match) => /aria-current="page"/.test(match[1])).length, 1);
  assert.equal(buttons.find((match) => /aria-current="page"/.test(match[1]))?.[2], "home");
  assert.doesNotMatch(navMarkup, /aria-selected=/);
});

test("uses a sticky 240px desktop sidebar with a persistent 78px icon rail", () => {
  const desktopStyles = sourceBetween("@media (min-width: 901px)", "@media (max-width: 900px)");

  assert.match(desktopStyles, /\.client-dashboard-page \.dashboard-grid\s*\{[^}]*grid-template-columns:\s*240px minmax\(0, 1fr\)/s);
  assert.match(desktopStyles, /\.dashboard-grid\.is-client-sidebar-collapsed\s*\{[^}]*grid-template-columns:\s*78px minmax\(0, 1fr\)/s);
  assert.match(desktopStyles, /\.dashboard-page \.client-dashboard-tabs\s*\{[^}]*position:\s*sticky[^}]*max-height:\s*calc\(100dvh - 104px\)[^}]*overflow-y:\s*auto/s);
  assert.match(desktopStyles, /\.dashboard-grid > \[data-client-dashboard-panel\]\s*\{[^}]*grid-column:\s*2/s);
  assert.match(desktopStyles, /\.client-dashboard-tab[^\{]*\{[^}]*grid-template-columns:\s*38px minmax\(0, 1fr\)[^}]*min-width:\s*0/s);
  assert.match(desktopStyles, /is-client-sidebar-collapsed \.client-dashboard-tab-label[\s\S]*?display:\s*none !important/);

  assert.match(dashboardHtml, /class="client-dashboard-sidebar-toggle"[\s\S]*?type="button"[\s\S]*?aria-label="Minimize navigation"[\s\S]*?aria-controls="client-dashboard-grid"[\s\S]*?aria-expanded="true"[\s\S]*?data-client-sidebar-toggle/);
  assert.match(dashboardHtml, /client-dashboard-sidebar-toggle-label">Minimize</);
});

test("keeps the six-column safe-area bottom dock on mobile and hides desktop-only labels", () => {
  const mobileStyles = sourceBetween("@media (max-width: 900px)", "@media (max-width: 420px)");

  assert.match(mobileStyles, /body\.client-dashboard-page\s*\{[^}]*padding-bottom:\s*calc\(94px \+ env\(safe-area-inset-bottom\)\)/s);
  assert.match(mobileStyles, /\.dashboard-page \.client-dashboard-tabs\s*\{[^}]*position:\s*fixed[^}]*bottom:\s*calc\(10px \+ env\(safe-area-inset-bottom\)\)[^}]*grid-template-columns:\s*repeat\(6, minmax\(0, 1fr\)\)[^}]*width:\s*min\(720px, calc\(100% - 24px\)\)/s);
  assert.match(mobileStyles, /\.client-dashboard-tab\.is-active \.client-dashboard-tab-icon\s*\{[^}]*color:\s*var\(--lime\)[^}]*background:\s*var\(--black\)[^}]*border-radius:\s*50%/s);
  assert.match(mobileStyles, /\.client-dashboard-tab-label,[\s\S]*?\.client-dashboard-nav-title,[\s\S]*?\.client-dashboard-sidebar-toggle\s*\{[^}]*display:\s*none !important/s);
});

test("restores, persists, and exposes the desktop sidebar state accessibly", () => {
  const restoreSource = sourceForFunction("storedClientDashboardSidebarCollapsed");
  const persistSource = sourceForFunction("persistClientDashboardSidebarCollapsed");
  const setSource = sourceForFunction("setClientDashboardSidebarCollapsed");
  const handlerSource = sourceForFunction("handleClientDashboardSidebar");
  const tabSource = sourceForFunction("setClientDashboardTab");

  assert.match(portalSource, /const clientDashboardSidebarStorageKey = "fwb_client_dashboard_sidebar_collapsed_v1"/);
  assert.match(restoreSource, /localStorage\.getItem\(clientDashboardSidebarStorageKey\) === "true"/);
  assert.match(restoreSource, /catch \(_error\)\s*\{\s*return false;/s);
  assert.match(persistSource, /localStorage\.setItem\(clientDashboardSidebarStorageKey, String\(Boolean\(collapsed\)\)\)/);
  assert.match(persistSource, /catch \(_error\)/);
  assert.match(setSource, /matchMedia\?\.\("\(min-width: 901px\)"\)\?\.matches/);
  assert.match(setSource, /classList\.toggle\("is-client-sidebar-collapsed", isCollapsed\)/);
  assert.match(setSource, /setAttribute\("aria-expanded", String\(!isCollapsed\)\)/);
  assert.match(setSource, /setAttribute\("aria-label", isCollapsed \? "Expand navigation" : "Minimize navigation"\)/);
  assert.match(setSource, /toggleIcon\.textContent = isCollapsed \? "›" : "‹"/);
  assert.match(setSource, /toggleLabel\.textContent = isCollapsed \? "Expand" : "Minimize"/);
  assert.match(handlerSource, /setClientDashboardSidebarCollapsed\(storedClientDashboardSidebarCollapsed\(\)\)/);
  assert.match(handlerSource, /persistClientDashboardSidebarCollapsed\(nextCollapsed\)/);
  assert.match(handlerSource, /grid\.addEventListener\("transitionend"/);
  assert.match(handlerSource, /event\.propertyName === "grid-template-columns"/);
  assert.match(handlerSource, /applyWorkoutElapsedTimerPosition\(\)/);
  assert.match(handlerSource, /desktopQuery\.addEventListener\("change", handleDesktopChange\)/);
  assert.match(portalSource, /handleClientDashboardSidebar\(\);/);

  assert.match(tabSource, /button\.setAttribute\("aria-current", "page"\)/);
  assert.match(tabSource, /button\.removeAttribute\("aria-current"\)/);
  assert.doesNotMatch(tabSource, /aria-selected/);
});

test("timer avoids the mobile dock and cannot overlap the desktop sidebar", () => {
  const boundsSource = sourceForFunction("workoutElapsedTimerDragBounds");
  const applySource = sourceForFunction("applyWorkoutElapsedTimerPosition");
  const dragSource = sourceForFunction("bindWorkoutElapsedTimerDragging");

  assert.match(boundsSource, /const navigationIsBottomDock = Boolean\([\s\S]*?matchMedia\?\.\("\(max-width: 900px\)"\)\?\.matches[\s\S]*?\)/);
  assert.match(boundsSource, /const navigationMaxTop = navigationIsBottomDock\s*\? navigationRect\.top - rect\.height - gap\s*:\s*viewportMaxTop/);
  assert.match(boundsSource, /const sidebarMinLeft = navigationRect\?\.width > 0 && !navigationIsBottomDock\s*\? navigationRect\.right \+ gap\s*:\s*gap/);
  assert.match(boundsSource, /const minLeft = Math\.min\(maxLeft, Math\.max\(gap, sidebarMinLeft\)\)/);
  assert.match(boundsSource, /return \{[\s\S]*?minLeft,[\s\S]*?maxLeft,[\s\S]*?maxTop:/);
  assert.match(applySource, /position\.edge === "left" \? `\$\{bounds\.minLeft\}px` : "auto"/);
  assert.match(dragSource, /Math\.min\(bounds\.maxLeft, Math\.max\(bounds\.minLeft,/);
});
