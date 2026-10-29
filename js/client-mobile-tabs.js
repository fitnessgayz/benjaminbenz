(function (root) {
  "use strict";

  const DEFAULT = ["home", "workouts", "logs", "progress", "notifications"];
  const LABELS = { home: "Home", workouts: "Workouts", logs: "Logs", progress: "Progress", notifications: "Settings" };
  const keyFor = (userId) => `fwb_mobile_tabs_v1:${String(userId || "").trim()}`;

  function normalize(value) {
    const order = Array.isArray(value?.order) ? value.order.filter((tab) => DEFAULT.includes(tab)) : DEFAULT;
    const unique = [...new Set(order.filter((tab) => tab !== "notifications"))];
    const hidden = Array.isArray(value?.hidden) ? value.hidden.filter((tab) => unique.includes(tab)) : [];
    return { order: [...unique, ...DEFAULT.filter((tab) => tab !== "notifications" && !unique.includes(tab)), "notifications"], hidden: [...new Set(hidden)] };
  }

  function moveShown(order, hidden, name, direction) {
    const shown = order.filter((tab) => tab !== "notifications" && !hidden.includes(tab));
    const index = shown.indexOf(name);
    const neighbor = shown[index + direction];
    if (!neighbor) return [...order];
    const next = [...order];
    const from = next.indexOf(name), to = next.indexOf(neighbor);
    [next[from], next[to]] = [next[to], next[from]];
    return next;
  }

  function mount({ userId, onHiddenActive } = {}) {
    const nav = root.document?.querySelector(".client-dashboard-tabs");
    const view = root.document?.querySelector('[data-client-settings-view="bottom-tabs"]');
    if (!nav || !view || !userId) return null;
    if (nav.__fwbMobileTabs?.userId === userId) return nav.__fwbMobileTabs;
    nav.__fwbMobileTabs?.dispose();
    const listeners = new AbortController();
    const buttons = new Map(DEFAULT.map((name) => [name, nav.querySelector(`[data-client-dashboard-tab="${name}"]`)]));
    const originals = Array.from(nav.querySelectorAll("[data-client-dashboard-tab]"));
    const sidebarToggle = nav.querySelector(".client-dashboard-sidebar-toggle");
    let state;
    try { state = normalize(JSON.parse(root.localStorage.getItem(keyFor(userId)))); }
    catch (_) { state = normalize(null); }
    const shown = view.querySelector("[data-mobile-tabs-shown]");
    const hidden = view.querySelector("[data-mobile-tabs-hidden]");
    const preview = view.querySelector("[data-mobile-tabs-preview]");
    let dragged = "";
    const iconFor = (name) => {
      const icon = buttons.get(name)?.querySelector(".client-dashboard-tab-icon")?.cloneNode(true);
      if (icon) icon.setAttribute("aria-hidden", "true");
      return icon;
    };

    const save = () => {
      try { root.localStorage.setItem(keyFor(userId), JSON.stringify(state)); }
      catch (_) { /* The controls still work for this session. */ }
    };
    const apply = () => {
      const mobile = root.matchMedia?.("(max-width: 900px)")?.matches ?? false;
      if (mobile) {
        state.order.forEach((name) => nav.insertBefore(buttons.get(name), sidebarToggle));
        nav.style.setProperty("--client-mobile-tab-count", String(state.order.length - state.hidden.length));
      } else originals.forEach((button) => nav.insertBefore(button, sidebarToggle));
      DEFAULT.forEach((name) => {
        const button = buttons.get(name);
        if (!button) return;
        button.toggleAttribute("data-mobile-tab-hidden", mobile && state.hidden.includes(name));
      });
      if (mobile && state.hidden.some((name) => buttons.get(name)?.classList.contains("is-active"))) {
        onHiddenActive?.(state.order.find((name) => !state.hidden.includes(name)) || "notifications");
      }
    };
    const render = () => {
      shown.replaceChildren(); hidden.replaceChildren(); preview.replaceChildren();
      preview.style.setProperty("--client-mobile-tab-count", String(state.order.length - state.hidden.length));
      const shownOrder = state.order.filter((tab) => tab !== "notifications" && !state.hidden.includes(tab));
      state.order.forEach((name) => {
        const isHidden = state.hidden.includes(name);
        const row = root.document.createElement("li");
        row.className = "mobile-tab-settings-row";
        row.dataset.tabName = name;
        row.draggable = name !== "notifications" && !isHidden;
        const icon = iconFor(name);
        if (icon) row.append(icon);
        const label = root.document.createElement("span");
        label.textContent = LABELS[name];
        row.append(label);
        if (name === "notifications") {
          const note = root.document.createElement("small"); note.textContent = "Always shown"; row.append(note);
        } else {
          const controls = root.document.createElement("span"); controls.className = "mobile-tab-settings-controls";
          for (const [action, text] of isHidden ? [["show", "Show"]] : [["up", "↑"], ["down", "↓"], ["hide", "Hide"]]) {
            const button = root.document.createElement("button");
            button.type = "button"; button.dataset.mobileTabAction = action;
            button.textContent = text; button.setAttribute("aria-label", `${text === "↑" ? "Move" : text === "↓" ? "Move" : text} ${LABELS[name]}${action === "up" ? " up" : action === "down" ? " down" : ""}`);
            if (action === "up") button.disabled = shownOrder.indexOf(name) === 0;
            if (action === "down") button.disabled = shownOrder.indexOf(name) === shownOrder.length - 1;
            controls.append(button);
          }
          row.append(controls);
        }
        (isHidden ? hidden : shown).append(row);
        if (!isHidden) {
          const item = root.document.createElement("span");
          item.className = "mobile-tab-settings-preview-item";
          const previewIcon = iconFor(name);
          if (previewIcon) item.append(previewIcon);
          const text = root.document.createElement("span");
          text.textContent = LABELS[name];
          item.append(text);
          preview.append(item);
        }
      });
      view.querySelector("[data-mobile-tabs-hidden-empty]").hidden = state.hidden.length > 0;
    };
    const update = () => { state = normalize(state); save(); apply(); render(); };
    view.addEventListener("click", (event) => {
      const control = event.target.closest("[data-mobile-tab-action]");
      if (control) {
        const name = control.closest("[data-tab-name]")?.dataset.tabName;
        const action = control.dataset.mobileTabAction;
        if (!name || name === "notifications") return;
        if (action === "hide") state.hidden.push(name);
        if (action === "show") state.hidden = state.hidden.filter((tab) => tab !== name);
        if (action === "up" || action === "down") {
          state.order = moveShown(state.order, state.hidden, name, action === "up" ? -1 : 1);
        }
        update();
      }
      if (event.target.closest("[data-mobile-tabs-reset]")) { state = normalize(null); update(); }
    }, { signal: listeners.signal });
    shown.addEventListener("dragstart", (event) => { dragged = event.target.closest("[data-tab-name]")?.dataset.tabName || ""; }, { signal: listeners.signal });
    shown.addEventListener("dragover", (event) => { if (event.target.closest("[data-tab-name]") && dragged) event.preventDefault(); }, { signal: listeners.signal });
    shown.addEventListener("drop", (event) => {
      const target = event.target.closest("[data-tab-name]")?.dataset.tabName;
      if (!dragged || !target || target === "notifications" || dragged === target) return;
      event.preventDefault();
      state.order.splice(state.order.indexOf(dragged), 1);
      state.order.splice(state.order.indexOf(target), 0, dragged);
      dragged = ""; update();
    }, { signal: listeners.signal });
    root.addEventListener?.("resize", apply, { signal: listeners.signal });
    apply(); render();
    const controller = { userId, state: () => normalize(state), dispose: () => listeners.abort() };
    nav.__fwbMobileTabs = controller;
    return controller;
  }

  root.FWB_CLIENT_MOBILE_TABS = Object.freeze({ mount, normalize, moveShown });
  if (typeof module !== "undefined" && module.exports) module.exports = { normalize, moveShown };
})(typeof window === "undefined" ? globalThis : window);
