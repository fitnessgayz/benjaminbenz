(function attachClientAccountSettings(global) {
  "use strict";

  function normalizedEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function createController({ root, supabaseClient, user, isPreview = false } = {}) {
    if (!root || !supabaseClient?.auth || !user?.id || isPreview) return null;

    const emailForm = root.querySelector("[data-client-email-form]");
    const emailInput = root.querySelector("[data-client-email-input]");
    const emailStatus = root.querySelector("[data-client-email-status]");
    const emailDisplay = root.querySelector("[data-client-account-email]");
    const passwordForm = root.querySelector("[data-client-password-form]");
    const currentPasswordInput = root.querySelector("[data-client-current-password]");
    const newPasswordInput = root.querySelector("[data-client-new-password]");
    const confirmPasswordInput = root.querySelector("[data-client-confirm-password]");
    const passwordStatus = root.querySelector("[data-client-password-status]");
    let currentEmail = normalizedEmail(user.email);
    let destroyed = false;

    function setStatus(element, message = "", kind = "") {
      if (!element) return;
      element.textContent = message;
      element.classList.remove("is-error", "is-success");
      if (kind) element.classList.add(`is-${kind}`);
    }

    function setBusy(form, busy) {
      if (!form) return;
      form.setAttribute("aria-busy", String(busy));
      Array.from(form.elements || []).forEach((control) => {
        control.disabled = busy;
      });
    }

    async function updateEmail(event) {
      event.preventDefault();
      if (!emailForm?.reportValidity()) return;
      const nextEmail = normalizedEmail(emailInput?.value);
      if (nextEmail === currentEmail) {
        setStatus(emailStatus, "Enter a different email address.", "error");
        return;
      }

      setBusy(emailForm, true);
      setStatus(emailStatus, "Sending confirmation instructions…");
      try {
        const { error } = await supabaseClient.auth.updateUser({ email: nextEmail });
        if (error) throw error;
        if (emailInput) emailInput.value = "";
        setStatus(
          emailStatus,
          `Check ${nextEmail} for confirmation instructions. Keep using ${currentEmail} until the change is confirmed.`,
          "success"
        );
      } catch (error) {
        setStatus(emailStatus, error?.message || "Your email could not be updated. Try again.", "error");
      } finally {
        if (!destroyed) setBusy(emailForm, false);
      }
    }

    async function updatePassword(event) {
      event.preventDefault();
      if (!passwordForm?.reportValidity()) return;
      const currentPassword = String(currentPasswordInput?.value || "");
      const nextPassword = String(newPasswordInput?.value || "");
      const confirmation = String(confirmPasswordInput?.value || "");

      if (nextPassword.length < 8) {
        setStatus(passwordStatus, "Use at least 8 characters for your new password.", "error");
        return;
      }
      if (nextPassword !== confirmation) {
        setStatus(passwordStatus, "The new passwords do not match.", "error");
        return;
      }
      if (nextPassword === currentPassword) {
        setStatus(passwordStatus, "Choose a password you are not currently using.", "error");
        return;
      }

      setBusy(passwordForm, true);
      setStatus(passwordStatus, "Updating password…");
      try {
        const { error } = await supabaseClient.auth.updateUser({
          password: nextPassword,
          current_password: currentPassword
        });
        if (error) throw error;
        passwordForm.reset();
        setStatus(passwordStatus, "Password updated.", "success");
      } catch (error) {
        setStatus(passwordStatus, error?.message || "Your password could not be updated. Try again.", "error");
      } finally {
        if (!destroyed) setBusy(passwordForm, false);
      }
    }

    function initialize() {
      if (!emailForm || !passwordForm) return;
      root.hidden = false;
      if (emailDisplay) emailDisplay.textContent = currentEmail;
      emailForm.addEventListener("submit", updateEmail);
      passwordForm.addEventListener("submit", updatePassword);
    }

    function destroy() {
      destroyed = true;
      emailForm?.removeEventListener("submit", updateEmail);
      passwordForm?.removeEventListener("submit", updatePassword);
      passwordForm?.reset();
      root.hidden = true;
    }

    return { initialize, destroy };
  }

  global.FWB_CLIENT_ACCOUNT_SETTINGS = { createController, normalizedEmail };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = global.FWB_CLIENT_ACCOUNT_SETTINGS;
  }
})(typeof window !== "undefined" ? window : globalThis);
