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
let passwordFlow = "invite";

function setInviteStatus(message) {
  const status = document.getElementById("client-invite-status");

  if (status) {
    status.textContent = message;
  }
}

async function notifyPasswordCreated() {
  if (!inviteSupabase || !inviteConfig.url || !inviteConfig.anonKey) {
    return;
  }

  const { data } = await inviteSupabase.auth.getSession();
  const token = data.session?.access_token;

  if (!token) {
    return;
  }

  try {
    await fetch(`${inviteConfig.url}/functions/v1/notify-client-password-set`, {
      method: "POST",
      headers: {
        "apikey": inviteConfig.anonKey,
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    });
  } catch (error) {
    console.warn("Could not send password-created notification.", error);
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
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const code = params.get("code");
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");
  const authType = params.get("type") || hashParams.get("type") || "";
  const inviteError = params.get("error_description") || hashParams.get("error_description");

  if (authType === "recovery") {
    passwordFlow = "recovery";
  }

  if (inviteError) {
    setInviteStatus(inviteError);
    return;
  }

  if (code) {
    const { error } = await inviteSupabase.auth.exchangeCodeForSession(code);

    if (error) {
      setInviteStatus(error.message);
      return;
    }
  } else if (accessToken && refreshToken) {
    const { error } = await inviteSupabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken
    });

    if (error) {
      setInviteStatus(error.message);
      return;
    }
  }

  const { data } = await inviteSupabase.auth.getSession();

  if (!data.session) {
    setInviteStatus("Open this page from the invite email link.");
    return;
  }

  form.hidden = false;
  window.history.replaceState({}, document.title, window.location.pathname);
  setInviteStatus(passwordFlow === "recovery"
    ? "Choose a new password with at least 8 characters."
    : "Choose a password with at least 8 characters.");
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

    if (passwordFlow === "recovery") {
      setInviteStatus("Password saved. Return to login with your new password.");
      window.location.href = "client-login.html";
      return;
    }

    setInviteStatus("Password saved. Opening dashboard...");
    await notifyPasswordCreated();
    window.location.href = "client-dashboard.html";
  });
}

prepareInviteSession();
handleInvitePassword();
