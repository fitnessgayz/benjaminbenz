const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const dashboard = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");
const portal = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "css/style.css"), "utf8");
const worker = fs.readFileSync(path.join(root, "timer-notifications-sw.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "client.webmanifest"), "utf8"));
const pagesWorkflow = fs.readFileSync(path.join(root, ".github/workflows/pages.yml"), "utf8");

function sourceForFunction(name) {
  const start = portal.indexOf(`function ${name}(`);
  const end = portal.indexOf("\nfunction ", start + 1);

  assert.ok(start >= 0, `Expected ${name} to exist`);
  return portal.slice(start, end >= 0 ? end : undefined);
}

function createRestTimerHarness() {
  let now = 1_000;
  const harness = Function(
    "window",
    "navigator",
    "Date",
    `
      let restTimerDurationSeconds = 1;
      let restTimerRemainingSeconds = 1;
      let restTimerEndsAt = 0;
      let restTimerIntervalId = null;
      let restTimerRunSequence = 0;
      let restTimerActiveRunId = 0;
      let restTimerLastNotifiedRunId = 0;
      let notificationCount = 0;

      function renderRestTimer() {}
      function tickRestTimer() {}
      async function showRestTimerCompleteNotification() {
        notificationCount += 1;
        return true;
      }

      ${sourceForFunction("restTimerCompletionShouldNotify")}
      ${sourceForFunction("clearRestTimerInterval")}
      ${sourceForFunction("syncRestTimerRemaining")}
      ${sourceForFunction("startOrPauseRestTimer")}
      ${sourceForFunction("resetRestTimer")}

      return {
        startOrPauseRestTimer,
        resetRestTimer,
        syncRestTimerRemaining,
        state: () => ({
          restTimerEndsAt,
          restTimerRemainingSeconds,
          restTimerActiveRunId,
          restTimerLastNotifiedRunId,
          notificationCount
        })
      };
    `
  )(
    {
      setInterval: () => 1,
      clearInterval: () => {}
    },
    { vibrate: () => {} },
    { now: () => now }
  );

  return {
    ...harness,
    setNow(value) {
      now = value;
    }
  };
}

function createNotificationPreferenceHarness() {
  const storage = new Map();
  const registration = { showNotification: async () => {} };
  let permissionRequests = 0;
  let workerRegistrations = 0;
  const messageListeners = [];
  const timerButtons = Array.from({ length: 2 }, () => ({
    textContent: "",
    disabled: false,
    pressed: "false",
    enabledClass: false,
    classList: {
      toggle(_name, enabled) {
        this.owner.enabledClass = enabled;
      },
      owner: null
    },
    setAttribute(name, value) {
      if (name === "aria-pressed") {
        this.pressed = value;
      }
    }
  }));
  timerButtons.forEach((button) => {
    button.classList.owner = button;
  });
  const timerHelpItems = [{ textContent: "" }, { textContent: "" }];
  const Notification = {
    permission: "default",
    async requestPermission() {
      permissionRequests += 1;
      this.permission = "granted";
      return this.permission;
    }
  };
  const navigator = {
    userAgent: "test-browser",
    platform: "test-platform",
    maxTouchPoints: 0,
    serviceWorker: {
      ready: Promise.resolve(registration),
      register: async () => {
        workerRegistrations += 1;
        return registration;
      },
      addEventListener(type, listener) {
        if (type === "message") {
          messageListeners.push(listener);
        }
      }
    }
  };
  const window = {
    isSecureContext: true,
    Notification,
    navigator,
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, value);
      }
    },
    matchMedia: () => ({ matches: false })
  };
  const firstFunction = portal.indexOf("function isIosDevice(");
  const afterFunctions = portal.indexOf("\nfunction restTimerMarkup(", firstFunction);
  const notificationFunctions = portal.slice(firstFunction, afterFunctions);
  const api = Function(
    "window",
    "navigator",
    "document",
    `
      const restTimerNotificationPreferenceStorageKey = "test-rest-timer-notifications";
      const restTimerNotificationServiceWorkerUrl = "/timer-notifications-sw.js?v=test";
      let restTimerNotificationRegistrationPromise = null;
      let restTimerNotificationPreferenceFallback = false;
      function setClientDashboardTab() {}
      ${notificationFunctions}
      return { initializeRestTimerNotifications, toggleRestTimerNotifications };
    `
  )(window, navigator, {
    querySelectorAll(selector) {
      if (selector === "[data-rest-timer-notifications]") {
        return timerButtons;
      }
      if (selector === "[data-rest-timer-notification-help]") {
        return timerHelpItems;
      }
      return [];
    }
  });

  return {
    ...api,
    counts: () => ({ permissionRequests, workerRegistrations, messageListeners: messageListeners.length }),
    timerButtons,
    timerHelpItems
  };
}

function createServiceWorkerHarness(windowClients = []) {
  const listeners = new Map();
  const openedDestinations = [];
  const self = {
    location: { origin: "https://fitness.test" },
    registration: { showNotification: async () => {} },
    clients: {
      async matchAll() {
        return windowClients;
      },
      async openWindow(destination) {
        openedDestinations.push(destination);
        return { destination };
      }
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    }
  };

  vm.runInNewContext(worker, { self, URL, Date });
  return { listeners, openedDestinations };
}

test("offers an explicit, accessible timer-alert opt in", () => {
  const markup = sourceForFunction("restTimerMarkup");
  const interactions = sourceForFunction("handleWorkoutInteractions");

  assert.match(markup, /data-rest-timer-notifications aria-pressed="false"/);
  assert.match(markup, /data-rest-timer-notification-help/);
  assert.match(interactions, /restTimerNotificationButton[\s\S]*?await toggleRestTimerNotifications\(\)/);
  assert.match(styles, /\.rest-timer-notification-setting \{[\s\S]*?display: grid;[\s\S]*?border: 1px solid/);
  assert.match(styles, /\.rest-timer-notification-setting button \{[\s\S]*?min-height: 44px;/);
  assert.match(styles, /\.rest-timer-notification-setting button\.is-enabled \{[\s\S]*?background: var\(--lime\);/);
});

test("initialization does not request permission and explicit enable requests it once", async () => {
  const harness = createNotificationPreferenceHarness();
  const toggle = sourceForFunction("toggleRestTimerNotifications");
  const registration = sourceForFunction("restTimerNotificationRegistration");
  const support = sourceForFunction("restTimerNotificationSupport");
  const requestIndex = toggle.indexOf("await window.Notification.requestPermission()");
  const registerIndex = toggle.indexOf("await restTimerNotificationRegistration()");

  harness.initializeRestTimerNotifications();
  assert.deepEqual(harness.counts(), {
    permissionRequests: 0,
    workerRegistrations: 0,
    messageListeners: 1
  });
  harness.timerButtons.forEach((button) => {
    assert.equal(button.textContent, "Enable timer alerts");
    assert.equal(button.pressed, "false");
    assert.equal(button.enabledClass, false);
  });

  assert.equal(await harness.toggleRestTimerNotifications(), true);
  assert.deepEqual(harness.counts(), {
    permissionRequests: 1,
    workerRegistrations: 1,
    messageListeners: 1
  });
  harness.timerButtons.forEach((button) => {
    assert.equal(button.textContent, "Timer alerts on");
    assert.equal(button.pressed, "true");
    assert.equal(button.enabledClass, true);
  });

  assert.equal(await harness.toggleRestTimerNotifications(), false, "the second click disables alerts");
  harness.timerButtons.forEach((button) => {
    assert.equal(button.textContent, "Enable timer alerts");
    assert.equal(button.pressed, "false");
    assert.equal(button.enabledClass, false);
  });
  assert.equal(await harness.toggleRestTimerNotifications(), true, "alerts can be enabled again");
  assert.deepEqual(harness.counts(), {
    permissionRequests: 1,
    workerRegistrations: 1,
    messageListeners: 1
  });

  assert.ok(requestIndex >= 0 && requestIndex < registerIndex);
  assert.match(registration, /navigator\.serviceWorker[\s\S]*?\.register\(restTimerNotificationServiceWorkerUrl, \{ scope: "\/" \}\)/);
  assert.match(support, /isIosDevice\(\) && !isStandaloneWebApp\(\)/);
  assert.match(sourceForFunction("restTimerNotificationUiState"), /add FWB to your Home Screen/);
});

test("notifies exactly once for each completed timer run", () => {
  const timer = createRestTimerHarness();

  timer.startOrPauseRestTimer();
  timer.setNow(2_000);
  timer.syncRestTimerRemaining();
  timer.syncRestTimerRemaining();
  assert.equal(timer.state().notificationCount, 1);
  assert.equal(timer.state().restTimerActiveRunId, 0);

  timer.startOrPauseRestTimer();
  timer.setNow(3_000);
  timer.syncRestTimerRemaining();
  timer.syncRestTimerRemaining();
  assert.equal(timer.state().notificationCount, 2, "a restarted timer gets one new alert");
  assert.equal(timer.state().restTimerLastNotifiedRunId, 2);
});

test("pausing or resetting before zero prevents a completion alert", () => {
  const pausedTimer = createRestTimerHarness();

  pausedTimer.startOrPauseRestTimer();
  pausedTimer.setNow(1_999);
  pausedTimer.startOrPauseRestTimer();
  pausedTimer.setNow(3_000);
  pausedTimer.syncRestTimerRemaining();
  assert.equal(pausedTimer.state().notificationCount, 0);
  assert.equal(pausedTimer.state().restTimerActiveRunId, 0);

  const resetTimer = createRestTimerHarness();
  resetTimer.startOrPauseRestTimer();
  resetTimer.setNow(1_999);
  resetTimer.resetRestTimer();
  resetTimer.setNow(3_000);
  resetTimer.syncRestTimerRemaining();
  assert.equal(resetTimer.state().notificationCount, 0);
  assert.equal(resetTimer.state().restTimerRemainingSeconds, 1);
});

test("uses a system notification while preserving vibration and visibility catch-up", () => {
  const show = sourceForFunction("showRestTimerCompleteNotification");
  const sync = sourceForFunction("syncRestTimerRemaining");
  const interactions = sourceForFunction("handleWorkoutInteractions");

  assert.match(show, /registration\.showNotification\("Rest complete", options\)/);
  assert.match(show, /body: "Your next set is ready\."/);
  assert.match(show, /tag: "fwb-rest-timer-complete"/);
  assert.match(show, /data: \{ url: "\/client-dashboard\.html\?tab=workouts" \}/);
  assert.match(sync, /navigator\.vibrate\(\[200, 100, 200\]\)/);
  assert.match(interactions, /visibilitychange[\s\S]*?!document\.hidden && restTimerEndsAt[\s\S]*?tickRestTimer\(\)/);
});

test("service worker focuses an existing dashboard and tells it to open Workouts", async () => {
  const messages = [];
  let focusCount = 0;
  let closeCount = 0;
  let completion;
  const dashboardClient = {
    url: "https://fitness.test/client-dashboard.html?tab=home",
    postMessage(message) {
      messages.push(message);
    },
    async focus() {
      focusCount += 1;
      return this;
    }
  };
  const harness = createServiceWorkerHarness([dashboardClient]);
  const click = harness.listeners.get("notificationclick");

  click({
    notification: {
      data: { url: "/client-dashboard.html?tab=workouts" },
      close() {
        closeCount += 1;
      }
    },
    waitUntil(promise) {
      completion = promise;
    }
  });
  await completion;

  assert.equal(closeCount, 1);
  assert.equal(focusCount, 1);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, "FWB_OPEN_WORKOUTS");
  assert.deepEqual(harness.openedDestinations, []);
});

test("service worker opens a same-origin dashboard when no dashboard is open", async () => {
  let completion;
  const harness = createServiceWorkerHarness([{ url: "https://fitness.test/another-page.html" }]);
  const click = harness.listeners.get("notificationclick");

  click({
    notification: {
      data: { url: "https://attacker.test/redirect" },
      close() {},
    },
    waitUntil(promise) {
      completion = promise;
    }
  });
  await completion;

  assert.deepEqual(harness.openedDestinations, ["https://fitness.test/client-dashboard.html?tab=workouts"]);
});

test("service worker handles timer and dynamic same-origin pushes", () => {
  assert.match(worker, /addEventListener\("push"/);
  assert.match(worker, /self\.registration\.showNotification/);
  assert.match(worker, /timerNotificationContent\(event\)/);
  assert.match(worker, /showNotification\(content\.title/);
  assert.match(worker, /body: content\.body/);
  assert.match(worker, /tag: content\.tag/);
  assert.doesNotMatch(worker, /\.\.\..*value/);
  assert.match(worker, /addEventListener\("notificationclick"/);
  assert.match(worker, /destination\.origin === self\.location\.origin/);
  assert.match(worker, /includeUncontrolled: true/);
  assert.match(worker, /postMessage\(\{ type: "FWB_OPEN_WORKOUTS" \}\)/);
  assert.match(worker, /clients\.openWindow\(destination\)/);
  assert.match(sourceForFunction("initializeRestTimerNotifications"), /setClientDashboardTab\("workouts"\)/);
});

test("timer-alert copy explains that the web app must remain open", () => {
  assert.match(sourceForFunction("restTimerNotificationUiState"), /Keep FWB open while the timer runs/);
  assert.match(sourceForFunction("restTimerMarkup"), /keep FWB open while the timer runs/);
});

test("client PWA opens at the dashboard and cache-busts notification assets", () => {
  assert.equal(manifest.id, "/client-dashboard.html");
  assert.equal(manifest.start_url, "/client-dashboard.html");
  assert.equal(manifest.display, "standalone");
  assert.match(dashboard, /href="\/client\.webmanifest"/);
  assert.match(dashboard, /css\/style\.css\?v=client-notification-settings-1/);
  assert.match(dashboard, /js\/web-notifications\.js\?v=notification-default-on-1/);
  assert.match(dashboard, /js\/client-portal\.js\?v=group-defaults-1/);
});

test("Pages deployment includes the client manifest and timer service worker", () => {
  assert.match(pagesWorkflow, /cp -R[^\n]*\bclient\.webmanifest\b[^\n]*\btimer-notifications-sw\.js\b[^\n]*_site\//);
});

test("rest timer sheet remains reachable in short and safe-area viewports", () => {
  assert.match(
    styles,
    /\.rest-timer-sheet \{[\s\S]*?box-sizing: border-box;[\s\S]*?max-height: calc\([\s\S]*?100dvh[\s\S]*?max\(16px, env\(safe-area-inset-top\)\)[\s\S]*?max\(16px, env\(safe-area-inset-bottom\)\)[\s\S]*?overflow-y: auto;[\s\S]*?overscroll-behavior: contain;[\s\S]*?-webkit-overflow-scrolling: touch;/
  );
  assert.match(
    styles,
    /\.rest-timer-overlay \{[\s\S]*?padding:[\s\S]*?safe-area-inset-top[\s\S]*?safe-area-inset-right[\s\S]*?safe-area-inset-bottom[\s\S]*?safe-area-inset-left/
  );
});
