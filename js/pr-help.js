/* Personal-record help is informational and never edits workout values. */
(() => {
  "use strict";
  const tooltipId = "pr-help-tooltip";
  let tooltip = null;
  let activeTrigger = null;
  let pinned = false;
  let hoveringTrigger = false;
  let hoveringTooltip = false;
  let dismissTimer = null;
  let detachObserver = null;
  let initialized = false;

  function clearDismissTimer() {
    if (dismissTimer !== null) clearTimeout(dismissTimer);
    dismissTimer = null;
  }

  function close() {
    clearDismissTimer();
    if (tooltip) tooltip.hidden = true;
    if (activeTrigger) {
      activeTrigger.setAttribute("aria-expanded", "false");
      const descriptions = (activeTrigger.getAttribute("aria-describedby") || "").split(/\s+/)
        .filter((id) => id && id !== tooltipId);
      if (descriptions.length) activeTrigger.setAttribute("aria-describedby", descriptions.join(" "));
      else activeTrigger.removeAttribute("aria-describedby");
    }
    detachObserver?.disconnect();
    activeTrigger = null;
    pinned = false;
    hoveringTrigger = false;
    hoveringTooltip = false;
  }

  function dismissAfterPointerLeaves() {
    clearDismissTimer();
    dismissTimer = setTimeout(() => {
      dismissTimer = null;
      if (!activeTrigger?.isConnected) return close();
      if (!pinned && !hoveringTrigger && !hoveringTooltip && !activeTrigger.contains(document.activeElement)) close();
    }, 170);
  }

  function ensureTooltip() {
    if (tooltip?.isConnected) return tooltip;
    tooltip = document.getElementById(tooltipId) || document.createElement("div");
    tooltip.id = tooltipId;
    tooltip.className = "pr-help-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.textContent = "Personal record";
    tooltip.hidden = true;
    if (!tooltip.isConnected) document.body.append(tooltip);
    return tooltip;
  }

  function positionTooltip(trigger) {
    const anchor = trigger.getBoundingClientRect();
    const bounds = tooltip.getBoundingClientRect();
    const width = document.documentElement.clientWidth || window.innerWidth;
    const height = window.innerHeight || document.documentElement.clientHeight;
    const margin = 8;
    const left = Math.max(margin, Math.min(width - bounds.width - margin, anchor.left + anchor.width / 2 - bounds.width / 2));
    const above = anchor.top - bounds.height - margin;
    const top = Math.max(margin, Math.min(height - bounds.height - margin, above >= margin ? above : anchor.bottom + margin));
    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
  }

  function open(trigger, options = {}) {
    if (typeof document === "undefined" || !trigger?.isConnected || trigger.disabled) return false;
    clearDismissTimer();
    if (activeTrigger !== trigger) {
      close();
      activeTrigger = trigger;
    }
    if (options.pin) pinned = true;
    const element = ensureTooltip();
    const descriptions = new Set((trigger.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean));
    descriptions.add(tooltipId);
    trigger.setAttribute("aria-describedby", [...descriptions].join(" "));
    trigger.setAttribute("aria-expanded", "true");
    element.hidden = false;
    positionTooltip(trigger);
    if (typeof MutationObserver !== "undefined") {
      detachObserver ||= new MutationObserver(() => {
        if (activeTrigger && !activeTrigger.isConnected) close();
      });
      detachObserver.observe(document.body, { childList: true, subtree: true });
    }
    return true;
  }

  function initialize() {
    if (initialized || typeof document === "undefined") return;
    initialized = true;
    document.addEventListener("pointerover", (event) => {
      if (tooltip?.contains(event.target)) {
        hoveringTooltip = true;
        clearDismissTimer();
        return;
      }
      const trigger = event.target.closest?.("[data-pr-help]");
      if (trigger && open(trigger)) hoveringTrigger = true;
    });
    document.addEventListener("pointerout", (event) => {
      if (activeTrigger?.contains(event.target)) {
        if (activeTrigger.contains(event.relatedTarget)) return;
        hoveringTrigger = false;
      } else if (tooltip?.contains(event.target)) {
        if (tooltip.contains(event.relatedTarget)) return;
        hoveringTooltip = false;
      } else return;
      dismissAfterPointerLeaves();
    });
    document.addEventListener("focusin", (event) => {
      const trigger = event.target.closest?.("[data-pr-help]");
      if (trigger) open(trigger);
    });
    document.addEventListener("focusout", (event) => {
      if (activeTrigger?.contains(event.target) && !activeTrigger.contains(event.relatedTarget)) {
        pinned = false;
        dismissAfterPointerLeaves();
      }
    });
    document.addEventListener("click", (event) => {
      const trigger = event.target.closest?.("[data-pr-help]");
      if (trigger) {
        if (activeTrigger === trigger && pinned) close();
        else open(trigger, { pin: true });
      } else if (!tooltip?.contains(event.target)) close();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && activeTrigger && !tooltip?.hidden) {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    }, true);
    document.addEventListener("scroll", close, { capture: true, passive: true });
    window.addEventListener("resize", close, { passive: true });
  }

  const api = { open, close, initialize };
  if (typeof window !== "undefined") window.FWBPrHelp = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  initialize();
})();
