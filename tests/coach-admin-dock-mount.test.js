const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../js/coach-admin.js"), "utf8");

function functionSource(name) {
  let start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} must exist`);
  if (source.slice(start - 6, start) === "async ") start -= 6;
  const tail = source.slice(start);
  const next = tail.slice(1).search(/\n(?:async )?function /);
  return next < 0 ? tail : tail.slice(0, next + 1);
}

function fixture({ mobile = true, hidden = false } = {}) {
  let document, moves = 0, comments = 0;
  const breakpointListeners = [];
  const query = { matches: mobile, addEventListener(type, listener) { if (type === "change") breakpointListeners.push(listener); } };
  function element(name, attributes = {}, nodeType = 1) {
    const attrs = new Map(Object.entries(attributes));
    const classes = new Set((attributes.class || "").split(" "));
    const listeners = new Map();
    const node = {
      nodeType, parentNode: null, childNodes: [], hidden: false, scrollLeft: 0, scrollTop: 0, focusCount: 0,
      get children() { return this.childNodes.filter(child => child.nodeType === 1); },
      get parentElement() { return this.parentNode?.nodeType === 1 ? this.parentNode : null; },
      get nextSibling() { return this.parentNode?.childNodes[this.parentNode.childNodes.indexOf(this) + 1] || null; },
      get isConnected() { return this === body || Boolean(this.parentNode?.isConnected); },
      classList: { contains: value => classes.has(value), add: value => classes.add(value), remove: value => classes.delete(value) },
      getAttribute: key => attrs.get(key) ?? null, setAttribute: (key, value) => attrs.set(key, String(value)),
      removeAttribute: key => attrs.delete(key),
      matches(selector) {
        if (nodeType !== 1) return false;
        if (selector[0] === ".") return classes.has(selector.slice(1));
        if (selector[0] === "#") return attrs.get("id") === selector.slice(1);
        const attr = selector.match(/^\[([^=\]]+)(?:=["']([^"']*)["'])?\]$/);
        return attr ? attrs.has(attr[1]) && (attr[2] === undefined || attrs.get(attr[1]) === attr[2]) : name === selector;
      },
      querySelectorAll(selector) {
        const selectors = selector.split(",").map(value => value.trim());
        return this.childNodes.flatMap(child => [child, ...child.querySelectorAll("*")])
          .filter(child => selector === "*" || selectors.some(value => child.matches(value)));
      },
      querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
      contains(other) { return this === other || this.childNodes.some(child => child.contains(other)); },
      insertBefore(child, reference) {
        if (document && child.parentNode) {
          if (child.contains(document.activeElement)) document.activeElement = body;
          // Simulate browser scroll loss on reparenting so restoration is observable.
          for (const moved of [child, ...child.querySelectorAll("*")]) moved.scrollLeft = moved.scrollTop = 0;
        }
        if (child.parentNode) child.parentNode.childNodes.splice(child.parentNode.childNodes.indexOf(child), 1);
        const index = reference ? this.childNodes.indexOf(reference) : this.childNodes.length;
        assert.ok(index >= 0);
        this.childNodes.splice(index, 0, child); child.parentNode = this; moves++; return child;
      },
      append(...nodes) { nodes.forEach(child => this.insertBefore(child, null)); },
      appendChild(child) { return this.insertBefore(child, null); },
      before(other) { this.parentNode?.insertBefore(other, this); },
      after(other) { this.parentNode?.insertBefore(other, this.nextSibling); },
      focus(options) { this.focusCount++; this.focusOptions = options; document.activeElement = this; },
      addEventListener: (type, listener) => listeners.set(type, listener),
      fire(type) { listeners.get(type)?.({ target: this }); },
      cloneNode() { assert.fail("Dock mounting must move existing nodes"); }
    };
    return node;
  }
  const body = element("body", { class: "coach-admin-page" });
  const workspace = element("section", { id: "coach-admin-workspace", "data-web-notifications": "" });
  workspace.hidden = hidden;
  const before = element("header"), sidebar = element("aside", { class: "coach-admin-sidebar" });
  const nav = element("nav", { class: "admin-tabs" });
  const tab = element("button", { "data-admin-tab": "notifications", "aria-current": "page" });
  const badge = element("span", { "data-web-notification-unread": "", "aria-label": "3 unread notifications" });
  badge.textContent = "3"; tab.append(badge); nav.append(tab); sidebar.append(nav);
  const toggle = element("button", { "data-admin-sidebar-toggle": "" }), editor = element("form");
  workspace.append(before, toggle, sidebar, editor); body.append(workspace);
  const originalOrder = [...workspace.children];
  document = {
    body, activeElement: body, getElementById: id => body.querySelector(`#${id}`),
    querySelector: selector => body.querySelector(selector), querySelectorAll: selector => body.querySelectorAll(selector),
    createComment(text) { comments++; return element(text, {}, 8); }, addEventListener() {}
  };
  const context = vm.createContext({
    document, window: { matchMedia: () => query, location: {}, localStorage: { getItem: () => null } },
    coachAdminSidebarStorageKey: "fixture-sidebar", coachLoginUrl: "client-login.html",
    setCoachAdminSidebarCollapsed() {}, closeCoachAdminSidebarDrawer() {}
  });
  vm.runInContext(["isCoachAdminSidebarMobile", "syncCoachAdminMobileNavigationMount", "sendToCoachLogin", "handleCoachAdminSidebar"].map(functionSource).join("\n"), context);
  moves = 0;
  return {
    context, document, body, workspace, sidebar, nav, tab, badge, editor, originalOrder, element,
    mount: () => context.syncCoachAdminMobileNavigationMount(),
    setMobile: value => { query.matches = value; },
    breakpoint(value) { query.matches = value; breakpointListeners.forEach(listener => listener({ matches: value })); },
    get moves() { return moves; }, get comments() { return comments; }
  };
}

test("mobile mounting moves the existing sidebar and preserves its badge, listeners and active tab", () => {
  const h = fixture(); let clicks = 0;
  h.tab.addEventListener("click", () => clicks++);
  h.mount(); h.tab.fire("click");
  assert.equal(h.sidebar.parentNode, h.body);
  assert.equal(h.badge.parentNode, h.tab);
  assert.equal(h.badge.textContent, "3");
  assert.equal(h.badge.getAttribute("aria-label"), "3 unread notifications");
  assert.equal(h.tab.getAttribute("aria-current"), "page");
  assert.equal(clicks, 1);
  assert.equal(h.comments, 1);
});

test("desktop restoration preserves exact order and repeated calls do not duplicate or remount", () => {
  const h = fixture(); h.mount();
  const mountedMoves = h.moves;
  for (let count = 0; count < 4; count++) h.mount();
  assert.equal(h.moves, mountedMoves);
  assert.equal(h.body.querySelectorAll(".coach-admin-sidebar").length, 1);
  h.setMobile(false); h.mount();
  assert.deepEqual(h.workspace.children, h.originalOrder);
  const restoredMoves = h.moves;
  h.mount(); assert.equal(h.moves, restoredMoves);
  h.setMobile(true); h.mount();
  assert.equal(h.sidebar.parentNode, h.body);
  assert.equal(h.comments, 1);
});

test("hidden workspaces keep the sidebar hidden and sign-out restores it before redirect", () => {
  const h = fixture({ hidden: true }); h.mount();
  assert.deepEqual(h.workspace.children, h.originalOrder);
  h.workspace.hidden = false; h.mount();
  h.tab.focus();
  h.context.sendToCoachLogin();
  assert.equal(h.workspace.hidden, true);
  assert.deepEqual(h.workspace.children, h.originalOrder);
  assert.equal(h.document.activeElement, h.body);
  assert.equal(h.tab.focusCount, 1, "Restoring hidden navigation must not focus it");
  assert.equal(h.context.window.location.href, "client-login.html");
});

test("actual sidebar moves preserve both navigation scroll axes and focused controls", () => {
  const h = fixture(); h.nav.scrollLeft = 140; h.nav.scrollTop = 280; h.tab.focus();
  for (const mobile of [true, false, true]) {
    h.setMobile(mobile); h.mount();
    assert.equal(h.nav.scrollLeft, 140); assert.equal(h.nav.scrollTop, 280);
    assert.equal(h.document.activeElement, h.tab);
    assert.equal(h.tab.focusOptions.preventScroll, true);
  }
  assert.equal(h.tab.focusCount, 4);
  h.mount(); assert.equal(h.tab.focusCount, 4);
});

test("moving the sidebar leaves focused editor inputs and typed values untouched", () => {
  const h = fixture(), input = h.element("input"); input.value = "Client note"; h.editor.append(input); input.focus();
  for (const mobile of [true, false, true]) {
    h.setMobile(mobile); h.mount();
    assert.equal(input.value, "Client note"); assert.equal(input.parentNode, h.editor);
    assert.equal(h.document.activeElement, input);
  }
  assert.equal(input.focusCount, 1);
});

test("sidebar initialization and breakpoint events mount and restore the dock", () => {
  const h = fixture(); h.context.handleCoachAdminSidebar();
  assert.equal(h.sidebar.parentNode, h.body);
  h.breakpoint(false); assert.deepEqual(h.workspace.children, h.originalOrder);
  h.breakpoint(true); assert.equal(h.sidebar.parentNode, h.body);
  assert.equal(h.comments, 1);
});

test("workspace reveal and notification setup account for the reparented navigation", () => {
  const show = functionSource("showAdminWorkspace");
  assert.match(show, /workspace\.hidden = false;\s*syncCoachAdminMobileNavigationMount\(\)/);
  assert.match(functionSource("initializeCoachNotifications"), /unreadBadges:\s*document\.querySelectorAll\(["']\[data-web-notification-unread\]["']\)/);
});
