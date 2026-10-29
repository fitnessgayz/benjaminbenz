(function (root) {
  "use strict";
  function requestDetails(form) {
    const name = String(form.elements.name?.value || "").trim();
    const email = String(form.elements.email?.value || "").trim().toLowerCase();
    const phone = String(form.elements.phone?.value || "").trim();
    const goals = String(form.elements.goals?.value || "").trim();
    const website = String(form.elements.website?.value || "").trim();
    if (name.length < 2 || name.length > 120 || email.length > 180 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || phone.length > 60 || goals.length > 2000) return null;
    return { name, email, phone, goals, website };
  }
  function mount() {
    const form = root.document?.getElementById("client-access-request-form");
    if (!form) return;
    const status = root.document.getElementById("client-access-request-status");
    const button = form.querySelector('button[type="submit"]');
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const details = requestDetails(form);
      if (!details) { status.textContent = "Add your name and a valid email."; return; }
      const config = root.FWB_SUPABASE_CONFIG || {};
      if (!/^https:\/\//.test(config.url || "") || !config.anonKey) {
        status.textContent = "Sign-up is temporarily unavailable. Please try again later.";
        return;
      }
      button.disabled = true;
      status.textContent = "Sending your request…";
      try {
        const response = await root.fetch(`${config.url.replace(/\/$/, "")}/functions/v1/request-client-access`, {
          method: "POST",
          headers: { apikey: config.anonKey, "Content-Type": "application/json" },
          body: JSON.stringify(details)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Could not send your request. Please try again.");
        form.hidden = true;
        const confirmation = root.document.createElement("p");
        confirmation.className = "access-request-confirmation";
        confirmation.setAttribute("role", "status");
        confirmation.textContent = "Request received. Benjamin will review it. If approved, you’ll get an email with a secure link to set up your account.";
        form.after(confirmation);
      } catch (error) { status.textContent = error.message || "Could not send your request. Please try again."; }
      finally { button.disabled = false; }
    });
  }
  root.FWB_CLIENT_ACCESS_REQUEST = Object.freeze({ requestDetails, mount });
  if (typeof module !== "undefined" && module.exports) module.exports = { requestDetails };
  if (root.document) mount();
})(typeof window === "undefined" ? globalThis : window);
