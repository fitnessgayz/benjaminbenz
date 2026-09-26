const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/client-portal.js"), "utf8");

function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} must exist`);
  const tail = source.slice(start);
  const next = tail.slice(1).search(/\n(?:async )?function /);
  return next < 0 ? tail : tail.slice(0, next + 1);
}

function fixture({ mobile = true, hidden = false, loading = false } = {}) {
  let mobileMatches = mobile;
  let moveCount = 0;
  let commentCount = 0;
  let document;
  const breakpointListeners = [];
  const mobileQuery = {
    get matches() { return mobileMatches; },
    addEventListener(type, listener) { if (type === "change") breakpointListeners.push(listener); }
  };

  function element(name, attributes = {}, nodeType = 1) {
    const attrs = new Map(Object.entries(attributes));
    const classes = new Set((attributes.class || "").split(/\s+/).filter(Boolean));
    const listeners = new Map();
    const node = {
      name, nodeType, parentNode: null, childNodes: [], hidden: false, disabled: false,
      inert: false, scrollLeft: 0,
      focusCount: 0,
      get parentElement() { return node.parentNode?.nodeType === 1 ? node.parentNode : null; },
      get children() { return node.childNodes.filter((child) => child.nodeType === 1); },
      get nextSibling() {
        return node.parentNode?.childNodes[node.parentNode.childNodes.indexOf(node) + 1] || null;
      },
      get isConnected() { return node === body || Boolean(node.parentNode?.isConnected); },
      classList: {
        contains: (value) => classes.has(value), add: (value) => classes.add(value), remove: (value) => classes.delete(value),
        toggle(value, force) { if (force ?? !classes.has(value)) classes.add(value); else classes.delete(value); }
      },
      setAttribute: (key, value) => attrs.set(key, String(value)),
      getAttribute: (key) => attrs.get(key) ?? null,
      removeAttribute: (key) => attrs.delete(key),
      matches(selector) {
        if (nodeType !== 1) return false;
        if (selector.startsWith(".")) return classes.has(selector.slice(1));
        if (selector.startsWith("#")) return attrs.get("id") === selector.slice(1);
        const attribute = selector.match(/^\[([^=\]]+)(?:=["']([^"']*)["'])?\]$/);
        return attribute ? attrs.has(attribute[1]) && (attribute[2] === undefined || attrs.get(attribute[1]) === attribute[2]) : name === selector;
      },
      querySelectorAll(selector) {
        const selectors = selector.split(",").map((item) => item.trim());
        return node.childNodes.flatMap((child) => [child, ...child.querySelectorAll("*")])
          .filter((child) => selector === "*" || selectors.some((item) => child.matches(item)));
      },
      querySelector(selector) { return node.querySelectorAll(selector)[0] || null; },
      contains(other) { return other === node || node.childNodes.some((child) => child.contains(other)); },
      focus(options) { node.focusCount++; node.focusOptions = options; document.activeElement = node; },
      append(...nodes) { for (const child of nodes) node.insertBefore(child, null); },
      appendChild(child) { node.append(child); return child; },
      insertBefore(child, reference) {
        if (child === reference) return child;
        if (document && child.parentNode && child.contains(document.activeElement)) document.activeElement = body;
        if (child.parentNode) child.parentNode.childNodes.splice(child.parentNode.childNodes.indexOf(child), 1);
        const index = reference ? node.childNodes.indexOf(reference) : node.childNodes.length;
        assert.ok(index >= 0, "The insertion reference must belong to this parent");
        node.childNodes.splice(index, 0, child);
        child.parentNode = node;
        moveCount++;
        return child;
      },
      before(other) { node.parentNode?.insertBefore(other, node); },
      after(other) { node.parentNode?.insertBefore(other, node.nextSibling); },
      addEventListener(type, listener) { listeners.set(type, listener); },
      fire(type) { listeners.get(type)?.({ target: node }); },
      cloneNode() { assert.fail("Mounting the dock must preserve its existing DOM nodes"); }
    };
    return node;
  }

  const body = element("body", { class: "dashboard-page client-dashboard-page" });
  if (loading) body.classList.add("is-loading");
  const main = element("main", { class: "dashboard-shell" });
  const loadingPanel = element("section", { id: "dashboard-loading" });
  const content = element("div", { id: "dashboard-content" });
  content.hidden = hidden;
  const grid = element("section", { id: "client-dashboard-grid" });
  const before = element("before");
  const toggle = element("button", { "data-client-mobile-nav-toggle": "" });
  const navigation = element("nav", { class: "client-dashboard-tabs" });
  const fade = element("span", { "data-client-nav-scroll-fade": "" });
  const cue = element("span", { "data-client-nav-scroll-cue": "" });
  const unread = element("span", { id: "client-notification-unread-status" });
  const panel = element("section", { "data-client-dashboard-panel": "home" });
  const footer = element("footer");
  grid.append(before, toggle, navigation, fade, cue, unread, panel);
  content.append(grid);
  main.append(loadingPanel, content);
  body.append(main, footer);
  const originalOrder = [...grid.children];
  const dock = [navigation, toggle, fade, cue];
  document = {
    body,
    documentElement: { style: { setProperty() {} } },
    activeElement: body,
    querySelector: (selector) => body.matches(selector) ? body : body.querySelector(selector),
    querySelectorAll: (selector) => body.querySelectorAll(selector),
    getElementById: (id) => body.querySelector(`#${id}`),
    createComment(text) { commentCount++; return element(text, {}, 8); },
    addEventListener() {}
  };
  const context = vm.createContext({
    document, window: { innerHeight: 844, matchMedia: () => mobileQuery }, setText() {}
  });
  vm.runInContext([
    "syncClientDashboardMobileNavigationMount", "syncClientDashboardVisualViewportBottom",
    "setDashboardMessage", "showDashboardContent"
  ].map(functionSource).join("\n"), context);
  moveCount = 0;
  return {
    context, document, element, body, main, content, grid, loadingPanel, dock, navigation, toggle, fade, cue, unread, panel,
    originalOrder,
    mount: () => context.syncClientDashboardMobileNavigationMount(),
    setMobile(value) { mobileMatches = value; },
    breakpoint(value) { mobileMatches = value; breakpointListeners.forEach((listener) => listener({ matches: value })); },
    get moveCount() { return moveCount; },
    get commentCount() { return commentCount; }
  };
}

test("mobile mounting moves the four existing dock nodes outside scrolling containers", () => {
  const h = fixture();
  let clicks = 0;
  h.navigation.addEventListener("click", () => clicks++);
  h.mount();
  assert.ok(h.dock.every((node) => node.parentNode === h.body));
  assert.equal(h.grid.children.includes(h.navigation), false);
  assert.equal(h.unread.parentNode, h.grid);
  assert.equal(h.panel.parentNode, h.grid);
  assert.equal(h.commentCount, 4);
  h.navigation.fire("click");
  assert.equal(clicks, 1, "Existing listeners remain attached to the same node");
});

test("returning to desktop restores exact sidebar DOM order, then mobile reuses the same nodes", () => {
  const h = fixture();
  h.mount();
  h.setMobile(false);
  h.mount();
  assert.deepEqual(h.grid.children, h.originalOrder);
  assert.ok(h.dock.every((node) => node.parentNode === h.grid));
  assert.equal(h.body.children.filter((node) => h.dock.includes(node)).length, 0);
  h.setMobile(true);
  h.mount();
  assert.ok(h.dock.every((node) => node.parentNode === h.body));
  assert.equal(h.commentCount, 4, "Breakpoint changes reuse the original anchors");
});

test("initial auth loading and hidden content keep navigation within the hidden dashboard", () => {
  for (const state of [{ hidden: true }, { loading: true }, { hidden: true, loading: true }]) {
    const h = fixture(state);
    h.mount();
    assert.deepEqual(h.grid.children, h.originalOrder);
    assert.ok(h.dock.every((node) => node.parentNode === h.grid));
    h.context.showDashboardContent();
    assert.equal(h.content.hidden, false);
    assert.equal(h.body.classList.contains("is-loading"), false);
    assert.ok(h.dock.every((node) => node.parentNode === h.body));
  }
});

test("an error or later loading state immediately restores the dock inside hidden content", () => {
  const h = fixture();
  h.mount();
  h.context.setDashboardMessage("Could not load", "Please retry");
  assert.equal(h.content.hidden, true);
  assert.equal(h.loadingPanel.hidden, false);
  assert.equal(h.body.classList.contains("is-loading"), true);
  assert.deepEqual(h.grid.children, h.originalOrder);
  h.context.showDashboardContent();
  assert.ok(h.dock.every((node) => node.parentNode === h.body));
  h.content.hidden = true;
  h.mount();
  assert.deepEqual(h.grid.children, h.originalOrder);
  h.content.hidden = false;
  h.body.classList.add("is-loading");
  h.mount();
  assert.deepEqual(h.grid.children, h.originalOrder);
});

test("repeated resize or tab refresh mounting creates no duplicate anchors or needless moves", () => {
  const h = fixture();
  h.mount();
  const movesAfterMount = h.moveCount;
  for (let index = 0; index < 5; index++) h.mount();
  assert.equal(h.commentCount, 4);
  assert.equal(h.moveCount, movesAfterMount);
  assert.equal(h.body.children.filter((node) => h.dock.includes(node)).length, 4);
  h.setMobile(false);
  h.mount();
  const movesAfterRestore = h.moveCount;
  for (let index = 0; index < 5; index++) h.mount();
  assert.equal(h.moveCount, movesAfterRestore);
  assert.deepEqual(h.grid.children, h.originalOrder);
});

test("mounting preserves collapsed state, scroll position, accessibility attributes, and fade visibility", () => {
  const h = fixture();
  h.navigation.inert = true;
  h.navigation.setAttribute("aria-hidden", "true");
  h.navigation.scrollLeft = 220;
  h.toggle.hidden = false;
  h.toggle.setAttribute("aria-expanded", "false");
  h.fade.hidden = true;
  h.cue.hidden = true;
  for (const mobile of [true, false, true]) {
    h.setMobile(mobile);
    h.mount();
    assert.equal(h.navigation.inert, true);
    assert.equal(h.navigation.getAttribute("aria-hidden"), "true");
    assert.equal(h.navigation.scrollLeft, 220);
    assert.equal(h.toggle.hidden, false);
    assert.equal(h.toggle.getAttribute("aria-expanded"), "false");
    assert.equal(h.fade.hidden, true);
    assert.equal(h.cue.hidden, true);
  }
});

test("initialization and media-query changes actually mount and restore the dock", () => {
  const h = fixture({ hidden: true, loading: true });
  const expanded = [];
  h.context.syncClientDashboardMobileNavigationIcon = () => {};
  h.context.setClientDashboardMobileNavigationExpanded = (value) => expanded.push(value);
  h.context.syncClientDashboardMobileNavigationScrollCue = () => {};
  vm.runInContext(functionSource("handleClientDashboardMobileNavigation"), h.context);
  h.context.handleClientDashboardMobileNavigation();
  assert.deepEqual(h.grid.children, h.originalOrder);
  h.context.showDashboardContent();
  assert.ok(h.dock.every((node) => node.parentNode === h.body));
  h.breakpoint(false);
  assert.deepEqual(h.grid.children, h.originalOrder);
  h.breakpoint(true);
  assert.ok(h.dock.every((node) => node.parentNode === h.body));
  assert.deepEqual(expanded, [true, false, true]);
  assert.equal(h.commentCount, 4);
});

test("moving a focused dock control preserves focus without scrolling and never refocuses hidden content", () => {
  const h = fixture();
  const tab = h.element("button");
  h.navigation.append(tab);
  tab.focus();
  for (const mobile of [true, false, true]) {
    h.setMobile(mobile);
    h.mount();
    assert.equal(h.document.activeElement, tab);
    assert.equal(tab.focusOptions.preventScroll, true);
  }
  assert.equal(tab.focusCount, 4, "The fixture loses focus on each real DOM move, then the helper restores it");
  h.mount();
  assert.equal(tab.focusCount, 4, "No focus call is needed when the node was already mounted");
  h.context.setDashboardMessage("Loading", "Checking access");
  assert.equal(h.document.activeElement, h.body);
  assert.equal(tab.focusCount, 4, "A hidden or signed-out dashboard must not receive restored focus");
});

test("mounting leaves a focused workout input and its typed value untouched", () => {
  const h = fixture();
  const input = h.element("input");
  input.value = "17.5";
  h.panel.append(input);
  input.focus();
  for (const mobile of [true, false, true]) {
    h.setMobile(mobile);
    h.mount();
    assert.equal(h.document.activeElement, input);
    assert.equal(input.value, "17.5");
    assert.equal(input.parentNode, h.panel);
  }
  assert.equal(input.focusCount, 1);
});
