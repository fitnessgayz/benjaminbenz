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

test("coach admin navigation becomes a scrollable client-style bottom dock on smaller screens", () => {
  assert.match(adminSource, /matchMedia\("\(max-width: 900px\)"\)/);
  assert.match(styleSource, /@media \(max-width: 900px\)[\s\S]*?\.coach-admin-sidebar\s*\{[\s\S]*?position:\s*fixed[\s\S]*?bottom:\s*calc\(10px \+ env\(safe-area-inset-bottom\)\)[\s\S]*?border-radius:\s*34px/);
  assert.match(styleSource, /@media \(max-width: 900px\)[\s\S]*?\.coach-admin-page \.admin-tabs\s*\{[\s\S]*?display:\s*flex[\s\S]*?overflow-x:\s*auto[\s\S]*?scroll-snap-type:\s*x proximity/);
  assert.match(styleSource, /body\.coach-admin-page\s*\{[^}]*padding-bottom:\s*calc\(116px \+ env\(safe-area-inset-bottom\)\)/s);
});

test("collapsed sidebar controls retain accessible names and navigation state semantics", () => {
  const navStart = adminHtml.indexOf('id="coach-admin-sidebar-nav"');
  const navEnd = adminHtml.indexOf("</nav>", navStart);
  const navMarkup = adminHtml.slice(navStart, navEnd);

  assert.doesNotMatch(navMarkup, /aria-selected=/);
  assert.match(navMarkup, /data-admin-tab="clients"[^>]*aria-label="Clients"[^>]*aria-current="page"/);
  assert.match(navMarkup, /data-admin-tab="sessions"[^>]*aria-label="Sessions"/);
  assert.match(adminSource, /button\.setAttribute\("aria-current", "page"\)/);
  assert.match(adminSource, /button\.removeAttribute\("aria-current"\)/);
});

test("mobile coach tabs use client-style icons, labels, and selected state", () => {
  const navStart = adminHtml.indexOf('id="coach-admin-sidebar-nav"');
  const navEnd = adminHtml.indexOf("</nav>", navStart);
  const navMarkup = adminHtml.slice(navStart, navEnd);

  assert.equal((navMarkup.match(/<svg class="admin-nav-icon/g) || []).length, 12);
  assert.doesNotMatch(navMarkup, /<span class="admin-nav-icon"[^>]*>(?:SL|CL|PR|PG|WO|EX|AL|FD|PS|NT|LG|SE)<\/span>/);
  assert.match(styleSource, /\.coach-admin-page \.admin-tab\.is-active \.admin-nav-icon\s*\{[\s\S]*?background:\s*var\(--lime\)[\s\S]*?border-radius:\s*50%/);
  assert.match(styleSource, /\.coach-admin-page \.admin-workspace\.is-sidebar-collapsed \.admin-nav-label,[\s\S]*?display:\s*block/);
});

test("Session Logger is distinct without looking like the selected admin section", () => {
  const sessionStyle = styleSource.match(/\.coach-admin-page \.admin-tab-session-logger\s*\{([^}]*)\}/)?.[1] || "";

  assert.doesNotMatch(sessionStyle, /background:\s*var\(--lime\)/);
  assert.match(sessionStyle, /border-color:\s*rgba\(215, 255, 63,/);
});
