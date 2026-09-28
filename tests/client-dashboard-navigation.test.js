const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.resolve(__dirname, "..");
const dashboardHtml = fs.readFileSync(path.join(projectRoot, "client-dashboard.html"), "utf8");
const portalSource = fs.readFileSync(path.join(projectRoot, "js/client-portal.js"), "utf8");
const styleSource = fs.readFileSync(path.join(projectRoot, "css/style.css"), "utf8");
const designSystemSource = fs.readFileSync(path.join(projectRoot, "css/fwb-design-system.css"), "utf8");

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

test("scopes the client navigation styles and cache-busts dashboard assets", () => {
  assert.match(dashboardHtml, /<body class="dashboard-page client-dashboard-page is-loading">/);
  assert.match(dashboardHtml, /href="css\/style\.css\?v=[^"\s]+"/);
  assert.match(dashboardHtml, /src="js\/client-portal\.js\?v=[^"\s]+"/);
  assert.match(styleSource, /body\.client-dashboard-page\s*\{[^}]*padding-bottom:\s*0;/s);
  assert.match(dashboardHtml, /css\/style\.css\?v=workout-preview-1/);
  assert.match(dashboardHtml, /js\/client-portal\.js\?[^"\s]*viewport-dock=\d+/);
});

test("renders nine labeled client destinations in order with current-page semantics", () => {
  const navStart = dashboardHtml.indexOf('<nav class="client-dashboard-tabs"');
  const navEnd = dashboardHtml.indexOf("</nav>", navStart);
  const navMarkup = dashboardHtml.slice(navStart, navEnd);
  const buttons = [...navMarkup.matchAll(/<button\b([^>]*data-client-dashboard-tab="([^"]+)"[^>]*)>([\s\S]*?)<\/button>/g)];

  assert.ok(navStart >= 0);
  assert.equal(buttons.length, 9);
  assert.deepEqual(buttons.map((match) => match[2]), [
    "home",
    "workouts",
    "logs",
    "progress",
    "stats",
    "nutrition",
    "questionnaire",
    "sessions",
    "notifications"
  ]);
  assert.deepEqual(buttons.map((match) => match[1].match(/aria-label="([^"]+)"/)?.[1]), [
    "Home",
    "Workouts",
    "Logs",
    "Progress",
    "Stats and measurements",
    "Food",
    "PAR-Q",
    "Sessions",
    "Settings"
  ]);
  assert.deepEqual(buttons.map((match) => match[3].match(/client-dashboard-tab-label">([^<]+)</)?.[1]), [
    "Home",
    "Workouts",
    "Logs",
    "Progress",
    "Stats",
    "Food",
    "PAR-Q",
    "Sessions",
    "Settings"
  ]);
  assert.equal(buttons.filter((match) => /aria-current="page"/.test(match[1])).length, 1);
  assert.equal(buttons.find((match) => /aria-current="page"/.test(match[1]))?.[2], "home");
  assert.doesNotMatch(navMarkup, /aria-selected=/);
  assert.match(navMarkup, /data-client-dashboard-tab="notifications"[\s\S]*?client-dashboard-settings-icon/);
  assert.equal((dashboardHtml.match(/data-client-notification-unread hidden/g) || []).length, 3);
  assert.equal((dashboardHtml.match(/aria-describedby="client-notification-unread-status"/g) || []).length, 2);
  assert.match(dashboardHtml, /data-client-notification-unread-status aria-live="polite">0 unread notifications/);
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

test("uses a permanent six-destination frosted safe-area dock on mobile", () => {
  const mobileStyles = sourceBetween("@media (max-width: 900px)", "@media (max-width: 420px)");

  assert.match(mobileStyles, /body\.client-dashboard-page\s*\{[^}]*--client-mobile-dock-height:\s*90px[^}]*min-height:\s*100dvh[^}]*padding-bottom:\s*calc\(var\(--client-bottom-dock-clearance\) \+ 24px\)/s);
  assert.match(mobileStyles, /\.client-dashboard-page \.dashboard-shell\s*\{[^}]*padding-top:\s*10px/s);
  assert.match(mobileStyles, /\.client-dashboard-page \.dashboard-grid\s*\{[^}]*padding-top:\s*0/s);
  assert.match(mobileStyles, /\.dashboard-page \.client-dashboard-tabs\s*\{[^}]*position:\s*fixed[^}]*inset:\s*auto 0 0[^}]*z-index:\s*1000[^}]*grid-template-columns:\s*repeat\(6, minmax\(0, 1fr\)\)[^}]*width:\s*100%[^}]*overflow:\s*visible/s);
  assert.match(mobileStyles, /background:\s*rgba\(247, 248, 245, \.64\)[^}]*border-top:\s*1px solid rgba\(255, 255, 255, \.72\)[^}]*box-shadow:\s*0 -10px 30px rgba\(20, 24, 20, \.08\)/s);
  assert.match(mobileStyles, /backdrop-filter:\s*blur\(20px\) saturate\(175%\)/);
  assert.match(mobileStyles, /-webkit-backdrop-filter:\s*blur\(20px\) saturate\(175%\)/);
  assert.match(mobileStyles, /padding:[^;]*env\(safe-area-inset-right\)[^;]*env\(safe-area-inset-bottom\)[^;]*env\(safe-area-inset-left\)/);
  assert.match(mobileStyles, /data-client-dashboard-tab="questionnaire"[\s\S]*?data-client-dashboard-tab="sessions"[\s\S]*?data-client-dashboard-tab="notifications"[\s\S]*?display:\s*none !important/);
  assert.doesNotMatch(mobileStyles, /data-client-dashboard-tab="nutrition"[^}]*display:\s*none/);
  assert.match(mobileStyles, /\.client-dashboard-tab\.is-active \.client-dashboard-tab-icon\s*\{[^}]*color:\s*var\(--black\)[^}]*background:\s*var\(--lime\)[^}]*border-radius:\s*13px[^}]*box-shadow:\s*none/s);
  assert.match(mobileStyles, /\.client-dashboard-tab\.is-active \.client-dashboard-tab-label\s*\{[^}]*color:\s*#344000[^}]*font-weight:\s*900[^}]*text-shadow:\s*none/s);
  assert.match(mobileStyles, /\.client-dashboard-tab-label\s*\{[^}]*display:\s*block !important[^}]*font-size:\s*\.52rem/s);
  assert.match(mobileStyles, /\.client-dashboard-nav-title,[\s\S]*?\.client-dashboard-sidebar-toggle\s*\{[^}]*display:\s*none !important/s);
});

test("uses dynamic viewport sizing and a single bottom-clearance contract", () => {
  const mobileStyles = sourceBetween("@media (max-width: 900px)", "@media (max-width: 420px)");
  const handlerSource = sourceForFunction("handleClientDashboardMobileNavigation");

  assert.ok((mobileStyles.match(/100dvh/g) || []).length >= 2);
  assert.match(mobileStyles, /--client-bottom-dock-clearance:\s*calc\(var\(--client-mobile-dock-height\) \+ env\(safe-area-inset-bottom\)\)/);
  assert.doesNotMatch(mobileStyles, /100vh|100svh/);
  assert.doesNotMatch(handlerSource, /visualViewport/);
  assert.doesNotMatch(styleSource, /--client-visual-viewport-bottom/);
});

test("removes mobile scrolling, the arrow cue, and the dark capsule", () => {
  const mobileStyles = sourceBetween("@media (max-width: 900px)", "@media (max-width: 420px)");
  const mobileHandler = sourceForFunction("handleClientDashboardMobileNavigation");

  assert.doesNotMatch(dashboardHtml, /data-client-nav-scroll-(?:fade|cue)/);
  assert.doesNotMatch(mobileStyles, /overflow-x:\s*auto|scroll-snap-type|rgba\(23, 26, 23, \.98\)|border-radius:\s*34px/);
  assert.doesNotMatch(mobileHandler, /addEventListener\("scroll"/);
  assert.match(dashboardHtml, /fwb-design-system\.css\?v=reference-overhaul-4/);
  assert.match(designSystemSource, /@media \(max-width: 900px\)[\s\S]*?:root body\.client-dashboard-page \.client-dashboard-tabs \{[\s\S]*?background:\s*rgba\(247, 248, 245, \.64\)[\s\S]*?border-radius:\s*0 !important/);
  assert.doesNotMatch(designSystemSource, /@media \(max-width: 900px\)[\s\S]*?client-dashboard-tabs \{\s*border-radius:\s*34px !important/);
});

test("keeps mobile navigation permanently expanded while preserving selected-tab routing", () => {
  const mobileStyles = sourceBetween("@media (max-width: 900px)", "@media (max-width: 420px)");
  const setMobileSource = sourceForFunction("setClientDashboardMobileNavigationExpanded");
  const handlerSource = sourceForFunction("handleClientDashboardMobileNavigation");
  const tabHandlerSource = sourceForFunction("handleClientDashboardTabs");

  assert.match(dashboardHtml, /class="client-dashboard-mobile-nav-toggle"[\s\S]*?aria-label="Open navigation, Home selected"[\s\S]*?aria-controls="client-dashboard-navigation"[\s\S]*?data-client-mobile-nav-toggle/);
  assert.match(dashboardHtml, /<nav class="client-dashboard-tabs" id="client-dashboard-navigation"/);
  assert.match(mobileStyles, /\.dashboard-page \.client-dashboard-mobile-nav-toggle\s*\{[^}]*display:\s*none !important/s);
  assert.match(setMobileSource, /const isExpanded = mobileNavigation/);
  assert.match(setMobileSource, /toggle\.hidden = true/);
  assert.match(setMobileSource, /navigation\.inert = false/);
  assert.match(setMobileSource, /navigation\.removeAttribute\("aria-hidden"\)/);
  assert.match(handlerSource, /setClientDashboardMobileNavigationExpanded\(true\);/);
  assert.match(tabHandlerSource, /clientDashboardMobileTabPressAction\(/);
  assert.doesNotMatch(tabHandlerSource, /setClientDashboardMobileNavigationExpanded\(false/);
  assert.match(portalSource, /handleClientDashboardMobileNavigation\(\);/);
});

test("uses large, flat, evenly sized icons and legible labels in the mobile dock", () => {
  const mobileStyles = sourceBetween("@media (max-width: 900px)", "@media (max-width: 420px)");
  const narrowStyles = sourceBetween("@media (max-width: 420px)", "@media (prefers-reduced-motion: reduce)");

  assert.match(mobileStyles, /\.client-dashboard-tab-icon\s*\{[^}]*width:\s*32px[^}]*height:\s*32px[^}]*padding:\s*3px[^}]*background:\s*transparent[^}]*box-shadow:\s*none/s);
  assert.match(mobileStyles, /\.client-dashboard-tab\[data-client-dashboard-tab\]\s*\{[^}]*width:\s*100% !important[^}]*min-width:\s*0 !important[^}]*max-width:\s*none !important/s);
  assert.match(mobileStyles, /\.client-dashboard-tab\.is-active \.client-dashboard-tab-icon\s*\{[^}]*width:\s*42px[^}]*height:\s*42px[^}]*padding:\s*8px/s);
  assert.match(narrowStyles, /\.client-dashboard-tab-icon\s*\{[^}]*width:\s*30px[^}]*height:\s*30px/s);
  assert.match(narrowStyles, /\.client-dashboard-tab\.is-active \.client-dashboard-tab-icon\s*\{[^}]*width:\s*40px[^}]*height:\s*40px/s);
});

test("keeps PAR-Q and Sessions available from Settings", () => {
  const tabHandlerSource = sourceForFunction("handleClientDashboardTabs");

  assert.match(dashboardHtml, /class="client-settings-shortcuts"[\s\S]*?data-client-settings-destination="questionnaire"[\s\S]*?<strong>PAR-Q<\/strong>/);
  assert.match(dashboardHtml, /data-client-settings-destination="sessions"[\s\S]*?<strong>Sessions<\/strong>/);
  assert.match(dashboardHtml, /class="client-settings-shortcut"[^>]*data-message-coach disabled[\s\S]*?<strong>Direct messages<\/strong>/);
  assert.match(tabHandlerSource, /settingsDestination\.dataset\.clientSettingsDestination/);
  assert.match(tabHandlerSource, /setClientDashboardTab\(settingsDestination\.dataset\.clientSettingsDestination\)/);
});

test("lets the Workouts tab open the active exercise list", () => {
  const tabHandlerSource = sourceForFunction("handleClientDashboardTabs");

  assert.match(tabHandlerSource, /activeClientDashboardTab === "workouts"[\s\S]*?WorkoutExerciseDock\?\.toggle\(\)/);
  assert.match(tabHandlerSource, /setClientDashboardTab\(tabName\)[\s\S]*?tabName === "workouts"[\s\S]*?WorkoutExerciseDock\?\.open\?\.\(\)/);
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
