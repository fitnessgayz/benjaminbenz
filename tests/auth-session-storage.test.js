const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/auth-session.js"), "utf8");
const projectUrl = "https://fwbtest.supabase.co";
const tokenKey = "sb-fwbtest-auth-token";
const preferenceKey = "fwb_keep_me_logged_in";
const modeKey = "fwb_auth_storage_mode";
const sessionValues = {
  [tokenKey]: JSON.stringify({ access_token: "access-1", refresh_token: "refresh-1" }),
  [`${tokenKey}-code-verifier`]: "pkce-verifier",
  [`${tokenKey}-user`]: JSON.stringify({ id: "client-1" })
};

function makeStorage(initial = {}) {
  const values = new Map(Object.entries(initial).map(([key, value]) => [key, String(value)]));
  return {
    get length() { return values.size; },
    key(index) { return Array.from(values.keys())[index] ?? null; },
    getItem(key) { return values.get(String(key)) ?? null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
    clear() { values.clear(); }
  };
}

function loadPage({ localStorage = makeStorage(), sessionStorage = makeStorage() } = {}) {
  const window = { localStorage, sessionStorage, FWB_SUPABASE_CONFIG: { url: projectUrl } };
  vm.runInNewContext(source, { window, URL }, { filename: "auth-session.js" });
  return { ...window.FWB_AUTH_SESSION, localStorage, sessionStorage };
}

test("existing local sessions remain available without a saved preference", () => {
  const localStorage = makeStorage({ ...sessionValues, "unrelated-setting": "keep" });
  const page = loadPage({ localStorage });

  assert.equal(page.getRememberMe(), true);
  for (const [key, value] of Object.entries(sessionValues)) {
    assert.equal(page.storage.getItem(key), value);
  }
  assert.equal(localStorage.getItem(preferenceKey), null);
  assert.equal(localStorage.getItem("unrelated-setting"), "keep");
});

test("remembered sessions survive page reloads and a new browser tab", () => {
  const login = loadPage();
  login.setRememberMe(true);
  login.storage.setItem(tokenKey, sessionValues[tokenKey]);

  const reload = loadPage(login);
  const newTab = loadPage({ localStorage: login.localStorage });
  for (const page of [reload, newTab]) {
    assert.equal(page.getRememberMe(), true);
    assert.equal(page.storage.getItem(tokenKey), sessionValues[tokenKey]);
  }
  assert.equal(login.sessionStorage.getItem(tokenKey), null);
});

test("temporary sessions survive navigation in the same tab but are absent in a fresh tab", () => {
  const login = loadPage();
  login.setRememberMe(false);
  login.storage.setItem(tokenKey, sessionValues[tokenKey]);

  const dashboard = loadPage(login);
  assert.equal(dashboard.getRememberMe(), false);
  assert.equal(dashboard.storage.getItem(tokenKey), sessionValues[tokenKey]);
  assert.equal(login.localStorage.getItem(tokenKey), null);

  const freshTab = loadPage({ localStorage: login.localStorage });
  assert.equal(freshTab.getRememberMe(), false);
  assert.equal(freshTab.storage.getItem(tokenKey), null);
});

test("a fresh tab restores a saved session even when the last checkbox preference was temporary", () => {
  const page = loadPage({
    localStorage: makeStorage({ [preferenceKey]: "false", [tokenKey]: sessionValues[tokenKey] })
  });

  assert.equal(page.getRememberMe(), false);
  assert.equal(page.storage.getItem(tokenKey), sessionValues[tokenKey]);
});

test("temporary and remembered sessions in separate tabs remain isolated during refresh and sign-out", () => {
  const temporaryTab = loadPage();
  temporaryTab.setRememberMe(false);
  temporaryTab.storage.setItem(tokenKey, "temporary-user-token");

  const rememberedTab = loadPage({ localStorage: temporaryTab.localStorage });
  rememberedTab.setRememberMe(true);
  rememberedTab.storage.setItem(tokenKey, "remembered-user-token");

  temporaryTab.storage.setItem(tokenKey, "temporary-user-refreshed");
  rememberedTab.storage.setItem(tokenKey, "remembered-user-refreshed");
  assert.equal(temporaryTab.getRememberMe(), false);
  assert.equal(rememberedTab.getRememberMe(), true);
  assert.equal(temporaryTab.localStorage.getItem(tokenKey), "remembered-user-refreshed");
  assert.equal(temporaryTab.sessionStorage.getItem(tokenKey), "temporary-user-refreshed");
  assert.equal(loadPage(temporaryTab).storage.getItem(tokenKey), "temporary-user-refreshed");
  assert.equal(loadPage(rememberedTab).storage.getItem(tokenKey), "remembered-user-refreshed");

  temporaryTab.storage.removeItem(tokenKey);
  assert.equal(temporaryTab.storage.getItem(tokenKey), null);
  assert.equal(rememberedTab.storage.getItem(tokenKey), "remembered-user-refreshed");

  temporaryTab.storage.setItem(tokenKey, "temporary-user-signed-in-again");
  rememberedTab.storage.removeItem(tokenKey);
  assert.equal(rememberedTab.storage.getItem(tokenKey), null);
  assert.equal(temporaryTab.storage.getItem(tokenKey), "temporary-user-signed-in-again");
});

for (const remember of [false, true]) {
  test(`switching to ${remember ? "remembered" : "temporary"} login moves the session and PKCE data`, () => {
    const localStorage = makeStorage({ [preferenceKey]: String(!remember), "unrelated-setting": "local" });
    const sessionStorage = makeStorage({ [modeKey]: remember ? "session" : "local", "unrelated-setting": "tab" });
    const previous = remember ? sessionStorage : localStorage;
    const target = remember ? localStorage : sessionStorage;
    for (const [key, value] of Object.entries(sessionValues)) previous.setItem(key, value);
    const page = loadPage({ localStorage, sessionStorage });

    page.setRememberMe(remember);

    assert.equal(page.getRememberMe(), remember);
    for (const [key, value] of Object.entries(sessionValues)) {
      assert.equal(target.getItem(key), value);
      assert.equal(previous.getItem(key), null);
      assert.equal(page.storage.getItem(key), value);
    }
    assert.equal(localStorage.getItem("unrelated-setting"), "local");
    assert.equal(sessionStorage.getItem("unrelated-setting"), "tab");
  });

  test(`token refresh writes to ${remember ? "localStorage" : "sessionStorage"} without altering another login`, () => {
    const page = loadPage({
      localStorage: makeStorage({ [preferenceKey]: String(remember), [tokenKey]: "old-local-token" }),
      sessionStorage: makeStorage({ [modeKey]: remember ? "local" : "session", [tokenKey]: "old-tab-token" })
    });
    const refreshedToken = JSON.stringify({ access_token: "access-2", refresh_token: "refresh-2" });

    page.storage.setItem(tokenKey, refreshedToken);

    const target = remember ? page.localStorage : page.sessionStorage;
    const other = remember ? page.sessionStorage : page.localStorage;
    assert.equal(target.getItem(tokenKey), refreshedToken);
    assert.equal(other.getItem(tokenKey), remember ? "old-tab-token" : "old-local-token");
    assert.equal(loadPage(page).storage.getItem(tokenKey), refreshedToken);
  });

  test(`sign-out clears matching session copies from both stores when remember me is ${remember}`, () => {
    const page = loadPage({
      localStorage: makeStorage({ ...sessionValues, [preferenceKey]: String(remember), "unrelated-setting": "keep" }),
      sessionStorage: makeStorage({ ...sessionValues, [modeKey]: remember ? "local" : "session" })
    });

    for (const key of Object.keys(sessionValues)) page.storage.removeItem(key);

    for (const key of Object.keys(sessionValues)) {
      assert.equal(page.localStorage.getItem(key), null);
      assert.equal(page.sessionStorage.getItem(key), null);
    }
    assert.equal(page.localStorage.getItem(preferenceKey), String(remember));
    assert.equal(page.localStorage.getItem("unrelated-setting"), "keep");
  });

  test(`switching to ${remember ? "remembered" : "temporary"} login clears destination keys absent from the source`, () => {
    const localStorage = makeStorage({ [preferenceKey]: String(!remember) });
    const sessionStorage = makeStorage({ [modeKey]: remember ? "session" : "local" });
    const previous = remember ? sessionStorage : localStorage;
    const target = remember ? localStorage : sessionStorage;
    previous.setItem(tokenKey, sessionValues[tokenKey]);
    for (const key of Object.keys(sessionValues)) target.setItem(key, "stale-destination-data");
    const page = loadPage({ localStorage, sessionStorage });

    page.setRememberMe(remember);

    assert.equal(target.getItem(tokenKey), sessionValues[tokenKey]);
    assert.equal(target.getItem(`${tokenKey}-code-verifier`), null);
    assert.equal(target.getItem(`${tokenKey}-user`), null);
    for (const key of Object.keys(sessionValues)) assert.equal(previous.getItem(key), null);
  });

  test(`partial migration to ${remember ? "remembered" : "temporary"} storage rolls back when quota runs out`, () => {
    const originalMode = remember ? "session" : "local";
    const localStorage = makeStorage({ [preferenceKey]: String(!remember) });
    const sessionStorage = makeStorage({ [modeKey]: originalMode });
    const previous = remember ? sessionStorage : localStorage;
    const target = remember ? localStorage : sessionStorage;
    for (const [key, value] of Object.entries(sessionValues)) previous.setItem(key, value);
    target.setItem(tokenKey, "previous-destination-token");
    target.setItem(`${tokenKey}-user`, "previous-destination-user");
    const write = target.setItem.bind(target);
    target.setItem = (key, value) => {
      if (key === `${tokenKey}-code-verifier` && value === sessionValues[key]) {
        throw new Error("QuotaExceededError");
      }
      write(key, value);
    };
    const page = loadPage({ localStorage, sessionStorage });

    assert.throws(() => page.setRememberMe(remember), /Allow browser storage for this site/);

    assert.equal(page.getRememberMe(), !remember);
    assert.equal(localStorage.getItem(preferenceKey), String(!remember));
    assert.equal(sessionStorage.getItem(modeKey), originalMode);
    for (const [key, value] of Object.entries(sessionValues)) {
      assert.equal(previous.getItem(key), value);
      assert.equal(page.storage.getItem(key), value);
    }
    assert.equal(target.getItem(tokenKey), "previous-destination-token");
    assert.equal(target.getItem(`${tokenKey}-code-verifier`), null);
    assert.equal(target.getItem(`${tokenKey}-user`), "previous-destination-user");
    assert.equal(loadPage(page).storage.getItem(tokenKey), sessionValues[tokenKey]);
  });
}

test("failure to save the preference rolls back the tab mode and migrated tokens", () => {
  const localStorage = makeStorage({ ...sessionValues, [preferenceKey]: "true" });
  const sessionStorage = makeStorage();
  const write = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (key, value) => {
    if (key === preferenceKey) throw new Error("QuotaExceededError");
    write(key, value);
  };
  const page = loadPage({ localStorage, sessionStorage });

  assert.throws(() => page.setRememberMe(false), /Allow browser storage for this site/);

  assert.equal(page.getRememberMe(), true);
  assert.equal(sessionStorage.getItem(modeKey), null);
  assert.equal(localStorage.getItem(preferenceKey), "true");
  for (const [key, value] of Object.entries(sessionValues)) {
    assert.equal(localStorage.getItem(key), value);
    assert.equal(sessionStorage.getItem(key), null);
  }
  assert.equal(loadPage(page).storage.getItem(tokenKey), sessionValues[tokenKey]);
});

test("definitive missing or invalid session errors require login", () => {
  const page = loadPage();
  for (const error of [
    { name: "AuthSessionMissingError" },
    { status: 401 },
    { status: 403 },
    ...["session_not_found", "session_expired", "refresh_token_not_found",
      "refresh_token_already_used", "bad_jwt", "user_not_found", "user_banned"]
      .map(code => ({ name: "AuthApiError", status: 400, code }))
  ]) {
    assert.equal(page.requiresLogin(error), true, JSON.stringify(error));
  }
});

test("temporary service, network, and timeout errors preserve the session", () => {
  const page = loadPage();
  for (const error of [
    null,
    undefined,
    { name: "AuthRetryableFetchError", status: 0 },
    { name: "AuthApiError", status: 429 },
    { name: "AuthApiError", status: 500 },
    { name: "AuthApiError", status: 503 },
    new TypeError("Failed to fetch"),
    new Error("Access check timed out.")
  ]) {
    assert.equal(page.requiresLogin(error), false, JSON.stringify(error));
  }
});

for (const remember of [false, true]) {
  test(`blocked ${remember ? "persistent" : "temporary"} storage produces actionable sign-in feedback`, () => {
    const localStorage = makeStorage({ [preferenceKey]: String(!remember) });
    const sessionStorage = makeStorage({ [modeKey]: remember ? "session" : "local" });
    const previous = remember ? sessionStorage : localStorage;
    const target = remember ? localStorage : sessionStorage;
    previous.setItem(tokenKey, sessionValues[tokenKey]);
    target.setItem = () => { throw new Error("Storage access denied"); };
    const page = loadPage({ localStorage, sessionStorage });

    assert.throws(() => page.setRememberMe(remember), /Allow browser storage for this site, then try signing in again/);
    assert.equal(previous.getItem(tokenKey), sessionValues[tokenKey]);
    assert.equal(localStorage.getItem(preferenceKey), String(!remember));
  });
}

test("blocked storage reads do not crash restoration, and sign-in reports the storage requirement", () => {
  const context = { window: { FWB_SUPABASE_CONFIG: { url: projectUrl } }, URL };
  for (const name of ["localStorage", "sessionStorage"]) {
    Object.defineProperty(context.window, name, {
      get() { throw new Error("Storage is disabled"); }
    });
  }
  vm.runInNewContext(source, context);
  const page = context.window.FWB_AUTH_SESSION;

  assert.equal(page.storage.getItem(tokenKey), null);
  assert.doesNotThrow(() => page.storage.removeItem(tokenKey));
  assert.throws(() => page.setRememberMe(true), /Allow browser storage for this site/);
  assert.throws(() => page.setRememberMe(false), /Allow browser storage for this site/);
});
