// All portal pages use the same storage policy, including invitation and reset links.
(() => {
  const preferenceKey = "fwb_keep_me_logged_in";
  const modeKey = "fwb_auth_storage_mode";
  const config = window.FWB_SUPABASE_CONFIG || {};
  const storageKey = config.url
    ? `sb-${new URL(config.url).hostname.split(".")[0]}-auth-token`
    : "";
  const sessionKeys = [storageKey, `${storageKey}-code-verifier`, `${storageKey}-user`];

  function read(storageName, key) {
    try {
      return window[storageName].getItem(key);
    } catch (_error) {
      return null;
    }
  }

  function getRememberMe() {
    // Preserve existing saved sessions when upgrading the app.
    const mode = read("sessionStorage", modeKey);
    return mode ? mode === "local" : read("localStorage", preferenceKey) !== "false";
  }

  // Another tab may change the last-used checkbox preference, but must never
  // promote this tab's temporary session to persistent storage during refresh.
  let rememberSession = read("sessionStorage", modeKey) !== "session";

  function selectedStorage() {
    return rememberSession ? "localStorage" : "sessionStorage";
  }

  function removeFrom(storageName, key) {
    try {
      window[storageName].removeItem(key);
    } catch (_error) {
      // Storage may be disabled by browser privacy settings.
    }
  }

  const storage = {
    getItem(key) {
      return read(selectedStorage(), key);
    },
    setItem(key, value) {
      const target = selectedStorage();
      window[target].setItem(key, value);
    },
    removeItem(key) {
      const target = selectedStorage();
      const other = target === "localStorage" ? "sessionStorage" : "localStorage";
      const value = read(target, key);
      // Remove a matching leftover copy, without clearing a different tab's login.
      if (value !== null && read(other, key) === value) removeFrom(other, key);
      removeFrom(target, key);
    }
  };

  function setRememberMe(remember) {
    const target = remember ? "localStorage" : "sessionStorage";
    const previous = selectedStorage();
    const probe = `${preferenceKey}_test`;
    const previousTargetValues = sessionKeys.map((key) => read(target, key));
    const previousMode = read("sessionStorage", modeKey);
    try {
      window[target].setItem(probe, "1");
      window[target].removeItem(probe);
      if (target !== previous) {
        sessionKeys.forEach((key) => {
          const value = read(previous, key);
          if (value !== null) {
            window[target].setItem(key, value);
          } else {
            window[target].removeItem(key);
          }
        });
      }
      // Commit only after copying succeeds; a full store must not hide a valid session.
      // Only a preference is shared for a temporary session, never its tokens.
      window.sessionStorage.setItem(modeKey, remember ? "local" : "session");
      window.localStorage.setItem(preferenceKey, String(Boolean(remember)));
      rememberSession = Boolean(remember);
      if (target !== previous) {
        sessionKeys.forEach((key) => removeFrom(previous, key));
      }
    } catch (_error) {
      try {
        if (previousMode === null) window.sessionStorage.removeItem(modeKey);
        else window.sessionStorage.setItem(modeKey, previousMode);
      } catch (_rollbackError) {
        // Keep using the original in-memory mode if browser storage is unavailable.
      }
      if (target !== previous) {
        sessionKeys.forEach((key, index) => {
          try {
            const value = previousTargetValues[index];
            if (value === null) window[target].removeItem(key);
            else window[target].setItem(key, value);
          } catch (_rollbackError) {
            // The original session and preference still point to the previous store.
          }
        });
      }
      throw new Error("Allow browser storage for this site, then try signing in again.");
    }
  }

  function requiresLogin(error) {
    return Boolean(error && (
      error.name === "AuthSessionMissingError" ||
      [401, 403].includes(error.status) ||
      ["session_not_found", "session_expired", "refresh_token_not_found",
        "refresh_token_already_used", "bad_jwt", "user_not_found", "user_banned"].includes(error.code)
    ));
  }

  window.FWB_AUTH_SESSION = { storage, getRememberMe, setRememberMe, requiresLogin };
})();
