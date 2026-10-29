(function (root) {
  "use strict";
  const form = root.document?.getElementById("client-access-request-form");
  if (!form) return;
  const status = root.document.getElementById("client-access-request-status");
  const button = form.querySelector('button[type="submit"]');
  const config = root.FWB_SUPABASE_CONFIG || {};
  let submitting = false;

  function message(text) { if (status) status.textContent = text; }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting) return;
    const name = String(form.elements.name.value || "").trim();
    const email = String(form.elements.email.value || "").trim().toLowerCase();
    const phone = String(form.elements.phone.value || "").trim();
    const goals = String(form.elements.goals.value || "").trim();
    const website = String(form.elements.website.value || "").trim();
    if (name.length < 2 || !form.elements.email.validity.valid) {
      message("Add your name and a valid email.");
      return;
    }
    if (!/^https:\/\/[^/]+\.supabase\.co\/?$/.test(config.url || "") || !config.anonKey) {
      message("Sign-up requests are temporarily unavailable. Please try again later.");
      return;
    }

    submitting = true;
    button.disabled = true;
    message("Sending your request…");
    const controller = new AbortController();
    const timeout = root.setTimeout(() => controller.abort(), 12000);
    try {
      const response = await root.fetch(`${config.url.replace(/\/$/, "")}/functions/v1/request-client-access`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: config.anonKey,
          Authorization: `Bearer ${config.anonKey}`
        },
        body: JSON.stringify({ name, email, phone, goals, website }),
        signal: controller.signal
      });
      if (!response.ok) throw new Error("Request failed");
      form.reset();
      message("Your request was received. Benjamin will review it and send an account invitation if approved.");
    } catch (_error) {
      message("We couldn’t send your request. Check your connection and try again.");
    } finally {
      root.clearTimeout(timeout);
      button.disabled = false;
      submitting = false;
    }
  });
})(typeof window === "undefined" ? globalThis : window);
