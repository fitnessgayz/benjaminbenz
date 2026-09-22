/* RIR help is informational: opening or closing it never changes a workout. */
(() => {
  "use strict";
  let dialog = null;
  let returnFocus = null;
  let initialized = false;

  function helpContext(trigger) {
    const group = trigger?.closest('[data-custom-workout-grouped="true"]');
    if (!group) return { maxValue: 4, action: "Save RIR", usesPicker: true };
    const warmup = Boolean(trigger.closest('[data-kind="warmup"]'));
    return {
      maxValue: 5,
      action: warmup ? "Log warm-up" : group.dataset.customWorkoutFormat === "single" ? "Log set" : "Log round",
      usesPicker: false
    };
  }

  function markup() {
    return `
      <dialog class="rir-help-dialog" data-rir-help-dialog aria-labelledby="rir-help-title" aria-describedby="rir-help-definition">
        <header class="rir-help-heading">
          <div><p class="kicker">Set effort</p><h2 id="rir-help-title">What is RIR?</h2></div>
          <button class="rir-help-close" type="button" data-rir-help-close aria-label="Close RIR explanation">×</button>
        </header>
        <p class="rir-help-definition" id="rir-help-definition"><strong>RIR means reps in reserve.</strong> It’s how many more reps you could have done with good form when you finished your set.</p>
        <p class="rir-help-definition"><strong>Why record it?</strong> It tells your coach how hard the set felt so they can adjust your weight and reps. A lower RIR means a harder set.</p>
        <div class="rir-help-scale" data-rir-help-scale aria-label="Reps in reserve guide"></div>
        <p class="rir-help-example">Finished <strong>8 reps</strong> and could do <strong>2 more</strong>? That’s <strong>2 RIR</strong>.</p>
        <div class="rir-help-next"><h3>What to do next</h3><ol data-rir-help-next></ol></div>
        <p class="rir-help-optional">An estimate is enough. RIR is optional; leave it blank if you’re unsure.</p>
        <button class="rir-help-done" type="button" data-rir-help-close>Got it</button>
      </dialog>
    `;
  }

  function close() {
    if (dialog?.open) dialog.close();
  }

  function ensureDialog() {
    if (dialog?.isConnected) return dialog;
    document.body.insertAdjacentHTML("beforeend", markup());
    dialog = document.querySelector("[data-rir-help-dialog]");
    dialog.addEventListener("click", (event) => {
      if (event.target.closest?.("[data-rir-help-close]")) {
        close();
      } else if (event.target === dialog) {
        const bounds = dialog.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
      }
    });
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      close();
    });
    dialog.addEventListener("keydown", (event) => {
      if (event.key !== "Tab") return;
      const buttons = Array.from(dialog.querySelectorAll("button:not([disabled])"));
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    });
    dialog.addEventListener("close", () => {
      // Ignore a queued close event if the dialog has already been reopened.
      if (dialog.open) return;
      document.body.classList.remove("rir-help-open");
      const target = returnFocus;
      returnFocus = null;
      if (target?.isConnected && !target.disabled && target.getClientRects().length) target.focus({ preventScroll: true });
    });
    return dialog;
  }

  function open(trigger) {
    if (!trigger || trigger.disabled || typeof document === "undefined") return false;
    const element = ensureDialog();
    if (element.open || typeof element.showModal !== "function") return false;
    const context = helpContext(trigger);
    const labels = ["No reps left", "1 more rep", "2 more reps", "3 more reps", "4 more reps", "5 or more reps"];
    element.querySelector("[data-rir-help-scale]").innerHTML = Array.from({ length: context.maxValue + 1 }, (_, value) => {
      const label = value === context.maxValue ? `${value} or more reps` : labels[value];
      return `<div><strong>${value}${value === context.maxValue ? "+" : ""}</strong><span>${label}</span></div>`;
    }).join("");
    const steps = context.usesPicker
      ? ["After your set, tap its RIR box and choose how many more reps you had left.", "Tap Save RIR, then log your set as usual and follow your coach’s rest time."]
      : ["After your set, enter 0–5 in its RIR field. Use 5 for five or more reps left.", `Tap ${context.action} when your entries are ready, then follow your coach’s rest time.`];
    element.querySelector("[data-rir-help-next]").innerHTML = steps.map((step) => `<li>${step}</li>`).join("");
    returnFocus = trigger;
    element.showModal();
    document.body.classList.add("rir-help-open");
    element.querySelector("[data-rir-help-close]")?.focus({ preventScroll: true });
    return true;
  }

  function initialize() {
    if (initialized || typeof document === "undefined") return;
    initialized = true;
    document.addEventListener("click", (event) => {
      const trigger = event.target.closest?.("[data-rir-help]");
      if (trigger) open(trigger);
    });
  }

  const api = { markup, helpContext, open, close, initialize };
  if (typeof window !== "undefined") window.FWBRirHelp = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  initialize();
})();
