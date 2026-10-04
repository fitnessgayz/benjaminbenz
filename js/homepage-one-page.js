(() => {
  const year = document.querySelector("#home-year");
  if (year) year.textContent = new Date().getFullYear();

  const artwork = [
    "curl.png",
    "squat-fibers-forward-head.png",
    "running-fibers.png",
    "martial-arts-fibers.png",
    "female-lunge-fibers.png",
    "shoulder-press-fibers.png",
    "torso-front-study.png",
    "torso-back-study.png",
    "torso-side-study.png",
    "legs-study.png",
    "quads-study.png",
    "glutes-hamstrings-study.png",
    "calves-study.png"
  ];
  const artworkImage = document.querySelector("#home-art-image");
  let previousArtwork = null;
  try {
    const saved = window.sessionStorage.getItem("fwb-home-artwork");
    if (saved !== null) previousArtwork = Number(saved);
  } catch (_error) {
    // The initial artwork still works when session storage is unavailable.
  }
  const choices = artwork.map((_, index) => index).filter(index => index !== previousArtwork);
  const selectedArtwork = previousArtwork === null ? 0 : choices[Math.floor(Math.random() * choices.length)];
  if (artworkImage) artworkImage.src = `images/home/anatomy/${artwork[selectedArtwork]}`;
  try {
    window.sessionStorage.setItem("fwb-home-artwork", String(selectedArtwork));
  } catch (_error) {
    // Artwork rotation is optional when browser storage is unavailable.
  }

  const form = document.querySelector("#home-login-form");
  const status = document.querySelector("#home-login-status");
  const submit = form?.querySelector('button[type="submit"]');
  const reset = document.querySelector("#home-reset-password");
  const config = window.FWB_SUPABASE_CONFIG || {};
  const configured = Boolean(config.url && config.anonKey &&
    !config.url.includes("PASTE_") && !config.anonKey.includes("PASTE_") &&
    window.supabase && window.FWB_AUTH_SESSION);
  const auth = configured
    ? window.supabase.createClient(config.url, config.anonKey, {
        auth: {
          storage: window.FWB_AUTH_SESSION.storage,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false
        }
      })
    : null;

  if (!form || !status || !submit || !reset) return;
  if (auth) form.elements.remember_me.checked = window.FWB_AUTH_SESSION.getRememberMe();
  else status.textContent = "Client login is temporarily unavailable. Please try the client login page.";

  let busy = false;
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy) return;
    if (!auth) {
      window.location.href = "client-login.html";
      return;
    }

    busy = true;
    submit.disabled = true;
    status.textContent = "Signing in...";
    try {
      await auth.auth.initialize();
      window.FWB_AUTH_SESSION.setRememberMe(Boolean(form.elements.remember_me.checked));
      const data = new FormData(form);
      const result = await auth.auth.signInWithPassword({
        email: String(data.get("email") || "").trim(),
        password: String(data.get("password") || "")
      });
      if (result.error) {
        status.textContent = "That email or password did not work. Please try again.";
        return;
      }
      const email = String(result.data.user?.email || "").toLowerCase();
      window.location.href = email === "benjaminbenz.fit@gmail.com"
        ? "coach-admin.html?v=invite-list-layout-fix-1"
        : "client-dashboard.html?v=manual-sessions-1";
    } catch (error) {
      status.textContent = error.message || "Could not sign in. Please try again.";
    } finally {
      busy = false;
      submit.disabled = false;
    }
  });

  reset.addEventListener("click", async () => {
    if (!auth) {
      window.location.href = "client-login.html";
      return;
    }
    const email = String(form.elements.email.value || "").trim().toLowerCase();
    if (!email) {
      status.textContent = "Enter your email first, then request a reset link.";
      form.elements.email.focus();
      return;
    }
    reset.disabled = true;
    status.textContent = "Sending password reset link...";
    try {
      const { error } = await auth.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/client-invite.html`
      });
      status.textContent = error
        ? "Could not send a reset link. Please try again."
        : "If that account exists, a password reset link was sent.";
    } catch (_error) {
      status.textContent = "Could not send a reset link. Please try again.";
    } finally {
      reset.disabled = false;
    }
  });
})();
