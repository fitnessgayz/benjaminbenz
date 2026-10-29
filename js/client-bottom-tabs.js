(function (root) {
  "use strict";

  const defaults = ["home", "workouts", "logs", "progress", "notifications"];
  const labels = { home: "Home", workouts: "Workouts", logs: "Logs", progress: "Progress", notifications: "Settings" };
  const storagePrefix = "fwb_client_bottom_tabs_v1:";
  let state = normalize();
  let accountId = "";
  let originalTabs = null;
  let originalChildren = null;
  let drag = null;

  function normalize(value = {}) {
    if (!value || typeof value !== "object") value = {};
    const requestedOrder = Array.isArray(value.order) ? value.order : defaults;
    const order = [...new Set(requestedOrder.filter((id) => defaults.includes(id)))];
    defaults.forEach((id) => { if (!order.includes(id)) order.push(id); });
    const requestedHidden = Array.isArray(value.hidden) ? value.hidden : [];
    const hidden = [...new Set(requestedHidden.filter((id) => defaults.includes(id) && id !== "notifications"))];
    return { order, hidden };
  }

  function moveRelative(value, id, targetId, after = false) {
    const next = normalize(value);
    if (id === targetId || !next.order.includes(id) || !next.order.includes(targetId)) return next;
    next.order.splice(next.order.indexOf(id), 1);
    next.order.splice(next.order.indexOf(targetId) + (after ? 1 : 0), 0, id);
    return next;
  }

  function toggleHidden(value, id) {
    const next = normalize(value);
    if (id === "notifications" || !next.order.includes(id)) return next;
    next.hidden = next.hidden.includes(id) ? next.hidden.filter((item) => item !== id) : [...next.hidden, id];
    return next;
  }

  function storageKey() { return `${storagePrefix}${accountId}`; }

  function load() {
    if (!accountId) return normalize();
    try { return normalize(JSON.parse(root.localStorage.getItem(storageKey()) || "null") || {}); }
    catch (_error) { return normalize(); }
  }

  function save() {
    if (!accountId) return;
    try { root.localStorage.setItem(storageKey(), JSON.stringify(state)); }
    catch (_error) { setStatus("Layout changed for this visit, but browser storage is unavailable."); }
  }

  function setStatus(message) {
    const status = root.document?.querySelector("[data-client-bottom-tabs-status]");
    if (status) status.textContent = message;
  }

  function navigation() { return root.document?.querySelector(".client-dashboard-tabs"); }

  function tabNodes() {
    const nav = navigation();
    if (!nav) return new Map();
    if (!originalTabs) {
      originalChildren = Array.from(nav.children);
      originalTabs = Array.from(nav.querySelectorAll("[data-client-dashboard-tab]"));
    }
    return new Map(originalTabs.map((node) => [node.dataset.clientDashboardTab, node]));
  }

  function visibleIds() { return state.order.filter((id) => !state.hidden.includes(id)); }

  function apply() {
    const nav = navigation();
    if (!nav) return;
    const nodes = tabNodes();
    const mobile = root.matchMedia?.("(max-width: 900px)")?.matches ?? false;
    const orderedTabs = mobile
      ? [...state.order.map((id) => nodes.get(id)).filter(Boolean), ...originalTabs.filter((node) => !defaults.includes(node.dataset.clientDashboardTab))]
      : originalTabs;
    const orderedChildren = originalChildren.flatMap((node) => {
      if (node === originalTabs[0]) return orderedTabs;
      return originalTabs.includes(node) ? [] : [node];
    });
    nav.replaceChildren(...orderedChildren);
    defaults.forEach((id) => nodes.get(id)?.classList.toggle("is-mobile-tab-hidden", state.hidden.includes(id)));
    nav.style.setProperty("--client-visible-tab-count", String(visibleIds().length));
  }

  function element(tag, className, text) {
    const item = root.document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = text;
    return item;
  }

  function iconFor(id) {
    const source = tabNodes().get(id)?.querySelector(".client-dashboard-tab-icon");
    const icon = source?.cloneNode(true) || element("span", "client-bottom-tab-icon", "•");
    icon.className = "client-bottom-tab-icon";
    icon.setAttribute("aria-hidden", "true");
    return icon;
  }

  function actionButton(text, id, action, label) {
    const button = element("button", "client-bottom-tab-action", text);
    button.type = "button";
    button.dataset.clientBottomTabId = id;
    button.dataset.clientBottomTabAction = action;
    button.setAttribute("aria-label", label);
    return button;
  }

  function rowFor(id, shown, visible) {
    const row = element("div", "client-bottom-tab-row");
    row.dataset.clientBottomTabRow = id;
    row.append(iconFor(id), element("strong", "client-bottom-tab-name", labels[id]));
    const controls = element("div", "client-bottom-tab-controls");
    if (shown) {
      if (id === "notifications") {
        controls.append(element("span", "client-bottom-tab-always", "Always shown"));
      } else {
        controls.append(actionButton("Hide", id, "toggle", `Hide ${labels[id]} from bottom tabs`));
      }
      const position = visible.indexOf(id);
      const up = actionButton("↑", id, "up", `Move ${labels[id]} left`);
      const down = actionButton("↓", id, "down", `Move ${labels[id]} right`);
      up.disabled = position === 0;
      down.disabled = position === visible.length - 1;
      const handle = actionButton("☰", id, "handle", `Drag to reorder ${labels[id]}`);
      handle.classList.add("client-bottom-tab-handle");
      controls.append(up, down, handle);
    } else {
      controls.append(actionButton("Show", id, "toggle", `Show ${labels[id]} in bottom tabs`));
    }
    row.append(controls);
    return row;
  }

  function render() {
    const shown = root.document?.querySelector("[data-client-bottom-tabs-shown]");
    const hidden = root.document?.querySelector("[data-client-bottom-tabs-hidden]");
    const preview = root.document?.querySelector("[data-client-bottom-tabs-preview]");
    if (!shown || !hidden || !preview) return;
    const visible = visibleIds();
    shown.replaceChildren(...visible.map((id) => rowFor(id, true, visible)));
    const hiddenIds = state.order.filter((id) => state.hidden.includes(id));
    hidden.replaceChildren(...(hiddenIds.length
      ? hiddenIds.map((id) => rowFor(id, false, visible))
      : [element("p", "client-bottom-tabs-empty", "All tabs are visible.")]));
    const previewTabs = visible.map((id) => {
      const item = element("span", "client-bottom-tab-preview-item");
      item.append(iconFor(id), element("span", "", labels[id]));
      return item;
    });
    preview.replaceChildren(...previewTabs);
    preview.style.setProperty("--client-preview-tab-count", String(visible.length));
  }

  function update(next, message, focusAction, focusId) {
    state = normalize(next);
    save();
    apply();
    render();
    setStatus(message);
    if (focusAction && focusId) {
      root.document.querySelector(`[data-client-bottom-tab-action="${focusAction}"][data-client-bottom-tab-id="${focusId}"]`)?.focus({ preventScroll: true });
    }
  }

  function setAccount(id) {
    const nextId = String(id || "").trim();
    if (accountId === nextId && originalTabs) return;
    accountId = nextId;
    state = load();
    apply();
    render();
  }

  function init() {
    const view = root.document?.getElementById("client-settings-bottom-tabs");
    if (!view || view.dataset.clientBottomTabsBound === "true") return;
    view.dataset.clientBottomTabsBound = "true";
    apply();
    render();
    if (root.FWB_CLIENT_BOTTOM_TABS_USER_ID) setAccount(root.FWB_CLIENT_BOTTOM_TABS_USER_ID);
    const media = root.matchMedia?.("(max-width: 900px)");
    media?.addEventListener?.("change", apply);

    view.addEventListener("click", (event) => {
      const button = event.target instanceof root.Element ? event.target.closest("[data-client-bottom-tab-action]") : null;
      if (button) {
        const id = button.dataset.clientBottomTabId;
        const action = button.dataset.clientBottomTabAction;
        if (action === "toggle") {
          const hidden = !state.hidden.includes(id);
          update(toggleHidden(state, id), `${labels[id]} ${hidden ? "hidden from" : "shown in"} the bottom bar.`, "toggle", id);
        } else if (action === "up" || action === "down") {
          const visible = visibleIds();
          const index = visible.indexOf(id);
          const target = visible[index + (action === "up" ? -1 : 1)];
          if (target) update(moveRelative(state, id, target, action === "down"), `${labels[id]} moved ${action === "up" ? "left" : "right"}.`, action, id);
        }
        return;
      }
      if (event.target instanceof root.Element && event.target.closest("[data-client-bottom-tabs-reset]")) {
        state = normalize();
        if (accountId) {
          try { root.localStorage.removeItem(storageKey()); }
          catch (_error) { /* The default still applies for this visit. */ }
        }
        apply();
        render();
        setStatus("Default bottom tabs restored.");
        event.target.focus({ preventScroll: true });
      }
    });

    view.addEventListener("pointerdown", (event) => {
      const handle = event.target instanceof root.Element ? event.target.closest("[data-client-bottom-tab-action=handle]") : null;
      if (!handle || event.isPrimary === false) return;
      drag = { id: handle.dataset.clientBottomTabId, pointerId: event.pointerId };
      handle.setPointerCapture?.(event.pointerId);
      handle.closest("[data-client-bottom-tab-row]")?.classList.add("is-dragging");
    });
    view.addEventListener("pointerup", (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const sourceId = drag.id;
      drag = null;
      view.querySelector(".is-dragging")?.classList.remove("is-dragging");
      const target = root.document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-client-bottom-tab-row]");
      const targetId = target?.dataset.clientBottomTabRow;
      if (!targetId || targetId === sourceId || state.hidden.includes(targetId)) return;
      const bounds = target.getBoundingClientRect();
      update(moveRelative(state, sourceId, targetId, event.clientY > bounds.top + bounds.height / 2), `${labels[sourceId]} moved.`, "handle", sourceId);
    });
    view.addEventListener("pointercancel", () => {
      drag = null;
      view.querySelector(".is-dragging")?.classList.remove("is-dragging");
    });
  }

  const api = { normalize, moveRelative, toggleHidden, setAccount, init };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FWB_CLIENT_BOTTOM_TABS = api;
  if (root.document) init();
})(typeof window === "undefined" ? globalThis : window);
