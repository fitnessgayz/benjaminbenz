(function (root) {
  "use strict";

  const storagePrefix = "fwb_gym_checkin_prompt_v1";

  function createGymCheckinPrompt({ window: view, document: page, activity }) {
    const seenInMemory = new Set();
    let pendingKey = "";
    let dialog = null;
    let requestId = 0;

    function promptKey(context) {
      const identity = String(context.user?.id || context.email || "").trim().toLowerCase();
      const day = String(context.day || "");
      return identity && /^\d{4}-\d{2}-\d{2}$/.test(day) ? `${storagePrefix}:${identity}:${day}` : "";
    }

    function hasSeen(key) {
      if (seenInMemory.has(key)) return true;
      try { return view.localStorage?.getItem(key) === "seen"; }
      catch (_error) { return false; }
    }

    function remember(key) {
      seenInMemory.add(key);
      try { view.localStorage?.setItem(key, "seen"); }
      catch (_error) { /* This tab still remembers the dismissal. */ }
    }

    function close() {
      if (dialog?.open) dialog.close();
    }

    async function maybeShow(context) {
      const key = promptKey(context || {});
      if (!key || pendingKey === key || dialog || hasSeen(key) || page.visibilityState === "hidden"
          || page.querySelector("dialog[open]") || !context.client || !activity?.checkIn || !activity?.readRows) return false;
      if (activity.isCheckedIn?.()) return false;
      pendingKey = key;
      const request = ++requestId;
      let visits;
      try {
        visits = await activity.readRows(context.client, "client_gym_checkins", "entry_date", context.email,
          { start: context.day, end: context.day });
      } catch (_error) {
        // Do not consume today's prompt when the check-in state is unknown.
        if (pendingKey === key) pendingKey = "";
        return false;
      }
      if (pendingKey === key) pendingKey = "";
      if (request !== requestId || visits.length || hasSeen(key) || activity.isCheckedIn?.()
          || page.visibilityState === "hidden" || page.querySelector("dialog[open]")
          || context.isCurrent?.() === false) return false;

      const popup = page.createElement("dialog");
      popup.className = "client-gym-checkin-prompt";
      popup.setAttribute("aria-modal", "true");
      popup.setAttribute("aria-labelledby", "client-gym-checkin-prompt-title");
      popup.setAttribute("aria-describedby", "client-gym-checkin-prompt-description");
      popup.innerHTML = `
        <button class="client-gym-checkin-prompt-close" type="button" data-gym-prompt-close aria-label="Close gym check-in">×</button>
        <p class="client-gym-checkin-prompt-kicker">TODAY AT A GLANCE</p>
        <h2 id="client-gym-checkin-prompt-title">At the gym today?</h2>
        <p id="client-gym-checkin-prompt-description">Check in to track your gym visits. You can also check in from Home anytime.</p>
        <p class="client-gym-checkin-prompt-status" role="status" aria-live="polite" data-gym-prompt-status></p>
        <div class="client-gym-checkin-prompt-actions">
          <button type="button" data-gym-prompt-checkin>Check in at the gym</button>
          <button type="button" data-gym-prompt-later>Maybe later</button>
        </div>`;
      const status = popup.querySelector("[data-gym-prompt-status]");
      const checkin = popup.querySelector("[data-gym-prompt-checkin]");
      popup.addEventListener("click", async (event) => {
        if (event.target.closest("[data-gym-prompt-close], [data-gym-prompt-later]")) {
          popup.close();
          return;
        }
        if (!event.target.closest("[data-gym-prompt-checkin]") || checkin.disabled) return;
        checkin.disabled = true;
        status.textContent = "Saving gym check-in…";
        try {
          const message = await activity.checkIn();
          if (context.isCurrent?.() === false) {
            if (popup.open) popup.close();
            return;
          }
          if (message && popup.open) popup.close();
          else status.textContent = "Gym check-in wasn’t saved. Try again.";
        } catch (_error) {
          status.textContent = "Gym check-in couldn’t be saved. Please try again.";
        } finally {
          checkin.disabled = false;
        }
      });
      popup.addEventListener("close", () => {
        if (dialog === popup) dialog = null;
        popup.remove();
        context.returnFocus?.focus?.({ preventScroll: true });
      });
      page.body.append(popup);
      try {
        popup.showModal();
      } catch (_error) {
        popup.remove();
        return false;
      }
      dialog = popup;
      remember(key); // Showing the prompt counts, including Escape or Maybe later.
      checkin.focus();
      return true;
    }

    page.addEventListener("fwb:gym-checkin-saved", close);
    return { maybeShow, close, promptKey, hasSeen };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { createGymCheckinPrompt };
  }
  if (root?.document) {
    root.FWB_GYM_CHECKIN_PROMPT = createGymCheckinPrompt({
      window: root,
      document: root.document,
      activity: root.FWB_WEEKLY_ACTIVITY
    });
  }
})(typeof window === "undefined" ? null : window);
