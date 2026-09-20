const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const adminSource = fs.readFileSync(path.join(root, "js/coach-admin.js"), "utf8");
const workoutSource = fs.readFileSync(path.join(root, "js/coach-workout-log.js"), "utf8");

function functionSource(source, name) {
  const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, "m"));
  assert.ok(start >= 0, `${name} exists`);
  const rest = source.slice(start);
  const next = rest.slice(1).search(/\n(?:async )?function /);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

function restorationFixture(kind, response, { thrown = false, requiresLogin = false } = {}) {
  const events = [];
  const restoreName = kind === "admin" ? "restoreCoachAdminUser" : "restoreCoachWorkoutUser";
  const auth = {
    async getSession() {
      if (thrown) throw response;
      return response;
    },
    async getUser() {
      if (thrown) throw response;
      return response;
    },
    async signOut() { events.push("signOut"); }
  };
  const context = vm.createContext({
    window: {
      FWB_AUTH_SESSION: {
        requiresLogin(error) {
          assert.equal(error, thrown ? response : response.error);
          return requiresLogin;
        }
      }
    },
    coachSupabase: { auth },
    coachWorkoutSupabase: { auth },
    withRequestTimeout: promise => promise,
    sendToCoachLogin: () => events.push("redirect"),
    redirectToCoachWorkoutLogin: () => events.push("redirect"),
    showCoachAccessError: () => events.push("retry"),
    setCoachWorkoutAccessStatus(message, isError) {
      assert.match(message, /connection.*refresh/);
      assert.equal(isError, true);
      events.push("retry");
    }
  });
  vm.runInContext(functionSource(kind === "admin" ? adminSource : workoutSource, restoreName), context);
  return { events, restore: () => context[restoreName]() };
}

for (const kind of ["admin", "workout"]) {
  test(`${kind} restores a valid coach without redirecting or signing out`, async () => {
    const user = { id: "coach-1", email: "benjaminbenz.fit@gmail.com" };
    const response = kind === "admin" ? { data: { session: { user } } } : { data: { user } };
    const fixture = restorationFixture(kind, response);
    assert.equal(await fixture.restore(), user);
    assert.deepEqual(fixture.events, []);
  });

  test(`${kind} sends a missing session to login`, async () => {
    const fixture = restorationFixture(kind, { data: { session: null, user: null } });
    assert.equal(await fixture.restore(), null);
    assert.deepEqual(fixture.events, ["redirect"]);
  });

  test(`${kind} preserves sign-in when restoration encounters a temporary error`, async () => {
    for (const error of [
      { name: "AuthRetryableFetchError", status: 0 },
      { name: "AuthApiError", status: 503 },
      { name: "AuthApiError", status: 429 },
      new Error("Access check timed out.")
    ]) {
      for (const thrown of [false, true]) {
        const fixture = restorationFixture(kind, thrown ? error : { error, data: null }, { thrown });
        assert.equal(await fixture.restore(), null);
        assert.deepEqual(fixture.events, ["retry"]);
      }
    }
  });

  test(`${kind} redirects only when restoration reports an invalid session`, async () => {
    const error = { name: "AuthApiError", code: "session_expired", status: 400 };
    for (const thrown of [false, true]) {
      const fixture = restorationFixture(kind, thrown ? error : { error, data: null }, {
        thrown,
        requiresLogin: true
      });
      assert.equal(await fixture.restore(), null);
      assert.deepEqual(fixture.events, ["redirect"]);
    }
  });
}

test("coach admin displays restoration errors outside the hidden private workspace", () => {
  const elements = new Map();
  const inserted = [];
  const workspace = { hidden: true, before: element => { inserted.push(element); elements.set(element.id, element); } };
  elements.set("coach-admin-workspace", workspace);
  const context = vm.createContext({
    document: {
      getElementById: id => elements.get(id),
      createElement: () => ({ setAttribute(name, value) { this[name] = value; } })
    }
  });
  vm.runInContext(functionSource(adminSource, "showCoachAccessError"), context);
  context.showCoachAccessError();
  context.showCoachAccessError();
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].role, "status");
  assert.equal(inserted[0].hidden, false);
  assert.match(inserted[0].textContent, /connection.*refresh/);
  assert.equal(workspace.hidden, true);
});
