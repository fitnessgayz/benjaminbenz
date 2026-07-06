const inviteConfig = window.FWB_SUPABASE_CONFIG || {};
const inviteConfigured = Boolean(
  inviteConfig.url &&
  inviteConfig.anonKey &&
  !inviteConfig.url.includes("PASTE_") &&
  !inviteConfig.anonKey.includes("PASTE_")
);
const inviteSupabase = inviteConfigured && window.supabase
  ? window.supabase.createClient(inviteConfig.url, inviteConfig.anonKey)
  : null;

function setInviteStatus(message) {
  const status = document.getElementById("client-invite-status");

  if (status) {
    status.textContent = message;
  }
}

async function prepareInviteSession() {
  const form = document.getElementById("client-invite-form");

  if (!form) {
    return;
  }

  if (!inviteSupabase) {
    setInviteStatus("Client login is not connected yet.");
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");

  if (code) {
    await inviteSupabase.auth.exchangeCodeForSession(code);
  }

  const { data } = await inviteSupabase.auth.getSession();

  if (!data.session) {
    setInviteStatus("Open this page from the invite email link.");
    return;
  }

  form.hidden = false;
  setInviteStatus("Choose a password with at least 8 characters.");
}

function handleInvitePassword() {
  const form = document.getElementById("client-invite-form");

  if (!form || !inviteSupabase) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const data = new FormData(form);
    const password = String(data.get("password") || "");
    const confirmPassword = String(data.get("confirm_password") || "");

    if (password.length < 8) {
      setInviteStatus("Use at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setInviteStatus("Passwords do not match.");
      return;
    }

    setInviteStatus("Saving password...");

    const { error } = await inviteSupabase.auth.updateUser({ password });

    if (error) {
      setInviteStatus(error.message);
      return;
    }

    setInviteStatus("Password saved. Opening dashboard...");
    window.location.href = "client-dashboard.html";
  });
}

prepareInviteSession();
handleInvitePassword();
