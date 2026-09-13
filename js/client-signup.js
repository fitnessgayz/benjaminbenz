const accountSetupConfig = window.FWB_SUPABASE_CONFIG || {};
const accountSetupConfigured = Boolean(
  accountSetupConfig.url &&
  accountSetupConfig.anonKey &&
  !accountSetupConfig.url.includes("PASTE_") &&
  !accountSetupConfig.anonKey.includes("PASTE_")
);
const accountSetupSupabase = accountSetupConfigured && window.supabase
  ? window.supabase.createClient(accountSetupConfig.url, accountSetupConfig.anonKey)
  : null;

function accountSetupRedirectUrl() {
  return `${window.location.origin}/client-invite.html?flow=account-setup`;
}

function setAccountSetupStatus(message) {
  const status = document.getElementById("account-setup-status");
  if (status) status.textContent = message;
}

function handleClientAccountSetup() {
  const form = document.getElementById("client-account-setup-form");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = String(form.elements.email?.value || "").trim().toLowerCase();
    const button = form.querySelector('button[type="submit"]');
    if (!email) {
      setAccountSetupStatus("Enter the email your coach has on file.");
      form.elements.email?.focus();
      return;
    }
    if (!accountSetupSupabase) {
      setAccountSetupStatus("Client account setup is not connected yet.");
      return;
    }

    if (button) button.disabled = true;
    setAccountSetupStatus("Sending your secure account setup link...");

    const { error } = await accountSetupSupabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: accountSetupRedirectUrl()
      }
    });

    if (error) {
      setAccountSetupStatus(error.message || "Could not send the setup link. Try again.");
      if (button) button.disabled = false;
      return;
    }

    setAccountSetupStatus("If that email matches a client account, a secure setup link was sent. Check your inbox.");
    if (button) button.disabled = false;
  });
}

handleClientAccountSetup();
