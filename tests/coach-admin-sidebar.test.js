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
  assert.match(styleSource, /@media \(max-width: 900px\)[\s\S]*?body\.coach-admin-page\s*\{[^}]*--coach-mobile-dock-height:\s*90px[^}]*padding-bottom:\s*calc\(var\(--coach-mobile-dock-height\) \+ env\(safe-area-inset-bottom\) \+ 24px\)/s);
  assert.match(styleSource, /@media \(max-width: 900px\)[\s\S]*?\.coach-admin-sidebar\s*\{[\s\S]*?position:\s*fixed[\s\S]*?inset:\s*auto 0 0[\s\S]*?width:\s*100%[\s\S]*?border-radius:\s*0/);
  assert.match(styleSource, /@media \(max-width: 900px\)[\s\S]*?\.coach-admin-sidebar\s*\{[\s\S]*?background:\s*rgba\(247, 248, 245, \.64\)[\s\S]*?backdrop-filter:\s*blur\(20px\) saturate\(175%\)/);
  assert.match(styleSource, /@media \(max-width: 900px\)[\s\S]*?\.coach-admin-page \.admin-tabs\s*\{[\s\S]*?display:\s*flex[\s\S]*?overflow-x:\s*auto[\s\S]*?scroll-snap-type:\s*x proximity/);
  assert.match(styleSource, /\.coach-admin-page \.admin-tabs::-webkit-scrollbar\s*\{[^}]*display:\s*none/s);
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

  assert.equal((navMarkup.match(/<svg class="admin-nav-icon/g) || []).length, 14);
  assert.match(navMarkup, /data-admin-tab="inbox"[^>]*aria-label="Inbox"/);
  assert.doesNotMatch(navMarkup, /<span class="admin-nav-icon"[^>]*>(?:SL|CL|PR|PG|WO|EX|AL|FD|PS|NT|LG|SE)<\/span>/);
  assert.match(styleSource, /\.coach-admin-page \.admin-tab\.is-active \.admin-nav-icon\s*\{[\s\S]*?background:\s*var\(--lime\)[\s\S]*?border-radius:\s*13px[\s\S]*?box-shadow:\s*none[\s\S]*?transform:\s*none/);
  assert.match(styleSource, /\.coach-admin-page \.admin-tab\.is-active::after\s*\{[^}]*background:\s*var\(--lime\)[^}]*box-shadow:\s*none/s);
  assert.match(styleSource, /\.coach-admin-page \.admin-tab\.is-active \.admin-nav-label\s*\{[^}]*color:\s*#344000[^}]*font-weight:\s*900[^}]*text-shadow:\s*none/s);
  assert.match(styleSource, /\.coach-admin-page \.admin-workspace\.is-sidebar-collapsed \.admin-nav-label,[\s\S]*?display:\s*block/);
});

test("coach desktop sidebar uses the client rail measurements", () => {
  assert.match(styleSource, /\.coach-admin-page \.admin-workspace\s*\{[^}]*grid-template-columns:\s*240px minmax\(0, 1fr\)[^}]*gap:\s*24px/s);
  assert.match(styleSource, /\.coach-admin-sidebar\s*\{[^}]*top:\s*88px[^}]*max-height:\s*calc\(100dvh - 104px\)/s);
  assert.match(styleSource, /\.coach-admin-page \.admin-tabs\s*\{[^}]*gap:\s*5px/s);
});

test("coach mobile dock uses the same final surface and compact breakpoint as the client dock", () => {
  assert.match(styleSource, /\.coach-admin-sidebar\s*\{[\s\S]*?z-index:\s*1000[\s\S]*?box-shadow:\s*0 -10px 30px rgba\(20, 24, 20, \.08\)/);
  assert.match(styleSource, /@media \(max-width: 420px\)\s*\{[\s\S]*?body\.coach-admin-page\s*\{[^}]*--coach-mobile-dock-height:\s*88px/);
  assert.match(styleSource, /@media \(max-width: 420px\)[\s\S]*?\.coach-admin-page \.admin-nav-icon,[\s\S]*?width:\s*30px[^}]*height:\s*30px[^}]*padding:\s*2px/s);
});

test("Session Logger is distinct without looking like the selected admin section", () => {
  const sessionStyle = styleSource.match(/\.coach-admin-page \.admin-tab-session-logger\s*\{([^}]*)\}/)?.[1] || "";

  assert.doesNotMatch(sessionStyle, /background:\s*var\(--lime\)/);
  assert.match(sessionStyle, /border-color:\s*rgba\(215, 255, 63,/);
});

test("selected client summary reserves readable identity space beside its actions", () => {
  assert.match(styleSource, /\.selected-client-panel\s*\{[^}]*grid-template-columns:\s*minmax\(280px, \.8fr\) minmax\(420px, 1\.2fr\)[^}]*grid-template-areas:\s*"identity actions"\s*"meta actions"/s);
  assert.match(styleSource, /\.selected-client-copy\s*\{[^}]*grid-area:\s*identity[^}]*min-width:\s*0/s);
  assert.match(styleSource, /\.selected-client-copy h2\s*\{[^}]*overflow-wrap:\s*normal[^}]*word-break:\s*normal/s);
  assert.match(styleSource, /@media \(max-width: 1180px\)[\s\S]*?\.selected-client-panel\s*\{[^}]*grid-template-columns:\s*1fr[^}]*grid-template-areas:\s*"identity"\s*"meta"\s*"actions"/s);
});
