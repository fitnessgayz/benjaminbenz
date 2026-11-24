(function (global) {
  "use strict";

  function create({ dialog, send, onSent, fallbackFocus, requestId = () => global.crypto.randomUUID() }) {
    if (!dialog?.showModal) return null;
    dialog.innerHTML = `
      <form>
        <h2 id="coach-comment-title">Comment</h2>
        <p class="coach-comment-recipient" data-coach-comment-recipient></p>
        <p class="coach-comment-detail" data-coach-comment-detail></p>
        <p id="coach-comment-delivery">Only the client will receive this in their GRUNTR notifications.</p>
        <label for="coach-comment-input">Your comment</label>
        <textarea id="coach-comment-input" rows="4" maxlength="500" required placeholder="Write a private comment…"></textarea>
        <p class="coach-comment-status" data-coach-comment-status role="status"></p>
        <div class="coach-comment-actions">
          <button type="button" data-coach-comment-cancel>Cancel</button>
          <button type="submit">Send</button>
        </div>
      </form>`;
    const form = dialog.querySelector("form");
    const input = form.querySelector("textarea");
    const recipient = form.querySelector("[data-coach-comment-recipient]");
    const detail = form.querySelector("[data-coach-comment-detail]");
    const status = form.querySelector("[data-coach-comment-status]");
    const cancel = form.querySelector("[data-coach-comment-cancel]");
    const submit = form.querySelector('[type="submit"]');
    let source = null;
    let trigger = null;
    let sending = false;
    let lastAttempt = null;

    cancel.addEventListener("click", () => dialog.close());
    dialog.addEventListener("cancel", (event) => { if (sending) event.preventDefault(); });
    dialog.addEventListener("close", () => {
      source = null;
      lastAttempt = null;
      (trigger?.isConnected ? trigger : fallbackFocus)?.focus({ preventScroll: true });
      trigger = null;
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const body = input.value.trim();
      if (!source || sending) return;
      if (!body || Array.from(body).length > 500) {
        status.textContent = "Enter a comment between 1 and 500 characters.";
        return;
      }
      if (lastAttempt?.body !== body) lastAttempt = { body, id: requestId() };
      sending = true;
      input.readOnly = submit.disabled = cancel.disabled = true;
      status.textContent = "Sending…";
      try {
        const { data, error } = await send({
          p_notification_id: source.notificationId ?? null,
          p_workout_log_id: source.workoutLogId ?? null,
          p_wall_event_id: source.wallEventId ?? null,
          p_body: body,
          p_request_id: lastAttempt.id
        });
        if (error || data !== true) throw error || new Error("Missing delivery receipt");
        dialog.close();
        onSent?.();
      } catch (error) {
        status.textContent = error?.code === "P0002"
          ? "This activity or client account is no longer available."
          : "Could not confirm delivery. Your comment is still here; try Send again.";
      } finally {
        sending = false;
        input.readOnly = submit.disabled = cancel.disabled = false;
      }
    });
    return ({ clientName, activity, button }) => {
      if (dialog.open || sending) return;
      source = activity;
      trigger = button;
      input.value = "";
      recipient.textContent = `To: ${clientName}`;
      detail.textContent = activity.context;
      status.textContent = "";
      dialog.showModal();
      input.focus();
    };
  }

  global.FWBCoachFeedComment = Object.freeze({ create });
})(window);
