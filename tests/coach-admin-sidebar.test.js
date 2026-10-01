const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.resolve(__dirname, "..");
const adminHtml = fs.readFileSync(path.join(projectRoot, "coach-admin.html"), "utf8");
const adminSource = fs.readFileSync(path.join(projectRoot, "js/coach-admin.js"), "utf8");
const styleSource = fs.readFileSync(path.join(projectRoot, "css/style.css"), "utf8");

test("puts Session Logger first in the coach admin sidebar", () => {
  const navigationStart = adminHtml.indexOf('id="coach-admin-sidebar-nav"');
  const sessionLogger = adminHtml.indexOf('href="coach-workout-log.html"', navigationStart);
  const firstEditorTab = adminHtml.indexOf("data-admin-tab=", navigationStart);

  assert.ok(navigationStart >= 0);
  assert.ok(sessionLogger > navigationStart);
  assert.ok(sessionLogger < firstEditorTab);
  assert.doesNotMatch(adminHtml, /href="coach-workout-log\.html"[^>]*target="_blank"/);
});

test("coach admin sidebar can collapse and remembers the preference", () => {
  assert.match(adminHtml, /data-admin-sidebar-toggle/);
  assert.match(adminSource, /coachAdminSidebarStorageKey/);
  assert.match(adminSource, /classList\.toggle\("is-sidebar-collapsed", isCollapsed\)/);
  assert.match(adminSource, /localStorage\.setItem\(coachAdminSidebarStorageKey/);
  assert.match(styleSource, /\.coach-admin-page \.admin-workspace\.is-sidebar-collapsed\s*\{[^}]*grid-template-columns:\s*78px minmax\(0, 1fr\)/s);
});

test("coach admin navigation becomes a five-destination branded dock on smaller screens", () => {
  assert.match(adminSource, /matchMedia\("\(max-width: 900px\)"\)/);
  assert.match(styleSource, /@media \(max-width: 900px\)[\s\S]*?body\.coach-admin-page\s*\{[^}]*--coach-mobile-dock-bottom-gap:\s*calc\(8px \+ env\(safe-area-inset-bottom\)\)[^}]*--coach-mobile-dock-height:\s*74px/s);
  assert.match(styleSource, /@media \(max-width: 900px\)[\s\S]*?\.coach-admin-sidebar\s*\{[\s\S]*?position:\s*fixed[\s\S]*?top:\s*calc\(100svh - var\(--coach-mobile-dock-height\) - var\(--coach-mobile-dock-bottom-gap\)\)[\s\S]*?border-radius:\s*22px/);
  assert.match(styleSource, /@media \(max-width: 900px\)[\s\S]*?\.coach-admin-page \.admin-tabs\s*\{[\s\S]*?display:\s*flex[\s\S]*?overflow:\s*hidden/);
  assert.match(styleSource, /\.admin-tab\[data-admin-tab="home"\]\s*\{\s*order:\s*1/);
  assert.match(styleSource, /\.admin-tab\[data-admin-tab="clients"\]\s*\{\s*order:\s*2/);
  assert.match(styleSource, /\.admin-tab-session-logger\s*\{\s*order:\s*3/);
  assert.match(styleSource, /\.admin-tab\[data-admin-tab="inbox"\]\s*\{\s*order:\s*4/);
  assert.match(styleSource, /\.admin-tab-more\s*\{\s*order:\s*5/);
  assert.match(styleSource, /body\.coach-admin-page\s*\{[^}]*padding-bottom:\s*calc\(98px \+ env\(safe-area-inset-bottom\)\)/s);
  assert.match(styleSource, /html:has\(> body\.coach-admin-page\)\s*\{[^}]*overflow-x:\s*clip[^}]*overscroll-behavior-y:\s*none/s);
});

test("collapsed sidebar controls retain accessible names and navigation state semantics", () => {
  const navStart = adminHtml.indexOf('id="coach-admin-sidebar-nav"');
  const navEnd = adminHtml.indexOf("</nav>", navStart);
  const navMarkup = adminHtml.slice(navStart, navEnd);

  assert.doesNotMatch(navMarkup, /aria-selected=/);
  assert.match(navMarkup, /data-admin-tab="home"[^>]*aria-label="Home"[^>]*aria-current="page"/);
  assert.match(navMarkup, /data-admin-tab="clients"[^>]*aria-label="Clients"/);
  assert.match(navMarkup, /data-admin-tab="sessions"[^>]*aria-label="Sessions"/);
  assert.match(adminSource, /button\.setAttribute\("aria-current", "page"\)/);
  assert.match(adminSource, /button\.removeAttribute\("aria-current"\)/);
});

test("mobile coach tabs use client-style icons, labels, and selected state", () => {
  const navStart = adminHtml.indexOf('id="coach-admin-sidebar-nav"');
  const navEnd = adminHtml.indexOf("</nav>", navStart);
  const navMarkup = adminHtml.slice(navStart, navEnd);

  assert.equal((navMarkup.match(/<svg class="admin-nav-icon/g) || []).length, 15);
  assert.match(navMarkup, /data-admin-tab="inbox"[^>]*aria-label="Inbox"/);
  assert.match(navMarkup, /data-coach-mobile-more-toggle/);
  assert.doesNotMatch(navMarkup, /<span class="admin-nav-icon"[^>]*>(?:SL|CL|PR|PG|WO|EX|AL|FD|PS|NT|LG|SE)<\/span>/);
  assert.match(styleSource, /\.coach-admin-page \.admin-tab\.is-active,[\s\S]*?background:\s*var\(--lime\)/);
  assert.match(styleSource, /\.coach-admin-page \.admin-tab\.is-active \.admin-nav-icon\s*\{[\s\S]*?width:\s*24px[\s\S]*?transform:\s*none/);
  assert.match(styleSource, /\.coach-admin-page \.admin-workspace\.is-sidebar-collapsed \.admin-nav-label,[\s\S]*?display:\s*block/);
});

test("More exposes secondary coach tools without horizontal tab scrolling", () => {
  const moreStart = adminHtml.indexOf('id="coach-mobile-more"');
  const moreEnd = adminHtml.indexOf('<form class="admin-editor"', moreStart);
  const moreMarkup = adminHtml.slice(moreStart, moreEnd);

  assert.ok(moreStart >= 0);
  for (const tab of ["profile", "program", "workouts", "nutrition", "progress", "notes", "logs", "sessions", "library", "notifications"]) {
    assert.match(moreMarkup, new RegExp(`data-admin-tab="${tab}"`));
  }
  assert.match(adminSource, /function handleCoachMobileMore\(\)/);
  assert.match(adminSource, /coachAdminMoreTabNames\.has\(nextTab\)/);
  assert.match(adminSource, /closeCoachMobileMore\(\{ restoreFocus: true \}\)/);
  assert.match(styleSource, /\.coach-mobile-more-panel\s*\{[\s\S]*?background:\s*var\(--surface, #fff\)/);
});

test("Session Logger is distinct without looking like the selected admin section", () => {
  const sessionStyle = styleSource.match(/\.coach-admin-page \.admin-tab-session-logger\s*\{([^}]*)\}/)?.[1] || "";

  assert.doesNotMatch(sessionStyle, /background:\s*var\(--lime\)/);
  assert.match(sessionStyle, /border-color:\s*rgba\(215, 255, 63,/);
});
