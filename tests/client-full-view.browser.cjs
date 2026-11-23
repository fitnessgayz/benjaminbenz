// Run with NODE_PATH pointing to the Playwright modules.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium, webkit } = require("playwright");

const root = path.join(__dirname, "..");
const origin = "https://gruntr-full-view.test";
const portal = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");

function productionFunction(name) {
  const start = portal.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  const source = portal.slice(start);
  const end = source.slice(1).search(/\n(?:async )?function /);
  return end < 0 ? source : source.slice(0, end + 1);
}

const navigationCode = [
  "workoutElapsedTimerDragBounds",
  "setClientDashboardMobileNavigationExpanded",
  "syncClientDashboardMobileNavigationMount",
  "handleClientDashboardMobileNavigation",
  "clientDashboardNavigationTab",
  "setClientDashboardTab",
  "setClientSettingsView"
].map(productionFunction).join("\n");

async function routeApp(page, appOrigin) {
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin !== appOrigin) return route.abort();
    const file = path.join(root, url.pathname);
    if (file.endsWith(".html")) {
      const body = fs.readFileSync(file, "utf8").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
      return route.fulfill({ contentType: "text/html; charset=utf-8", body });
    }
    if (fs.existsSync(file)) return route.fulfill({ path: file });
    return route.abort();
  });
}

async function panel(page, name) {
  await page.evaluate(tab => {
    document.activeElement.blur();
    window.setClientDashboardTab(tab);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, name);
}

async function flat(page, selector) {
  const style = await page.locator(selector).first().evaluate(node => {
    const css = getComputedStyle(node);
    return [css.borderInlineStartWidth, css.borderInlineEndWidth, css.borderRadius, css.boxShadow];
  });
  assert.deepEqual(style, ["0px", "0px", "0px", "none"], selector);
}

async function noOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), await page.evaluate(() => innerWidth));
}

async function initialize(page, appOrigin) {
  await page.goto(`${appOrigin}/client-dashboard.html`);
  await page.addScriptTag({ path: path.join(root, "js/client-settings-redesign.js") });
  await page.addScriptTag({ path: path.join(root, "js/client-workout-calendar.js") });
  await page.addScriptTag({ content: `
    let activeClientDashboardTab = "home", clientWorkoutPickerIsOpen = true, savedWorkoutScrollY = null;
    let clientWebNotificationController = null, clientProfilePhotoController = null;
    let clientAppleHealthController = null, clientGoogleHealthController = null;
    function applyWorkoutElapsedTimerPosition() {}
    function flushScheduledClientTrainingLogsRender() {}
    ${navigationCode}
    document.getElementById("dashboard-loading").hidden = true;
    document.getElementById("dashboard-content").hidden = false;
    document.body.classList.remove("is-loading");
    handleClientDashboardMobileNavigation();
  ` });
}

async function timerClears(page, control) {
  const controlTop = (await control.boundingBox()).y;
  const timerBottom = await page.evaluate(() => {
    const timer = document.createElement("div");
    timer.style.cssText = "position:fixed;width:44px;height:44px";
    document.body.append(timer);
    const { maxTop, height } = window.workoutElapsedTimerDragBounds(timer);
    timer.remove();
    return maxTop + height;
  });
  assert.ok(timerBottom <= controlTop - 8, "The elapsed timer must stay above the bottom control");
}

async function checkDock(page) {
  const dock = page.locator("#client-dashboard-navigation");
  const compact = page.getByRole("button", { name: "Expand navigation" });
  const toggle = page.locator("[data-client-mobile-nav-toggle]");
  const photo = toggle.locator("img");
  const icon = toggle.locator("svg");

  await dock.waitFor({ state: "visible" });
  assert.equal(await dock.getByRole("button").count(), 4);
  assert.equal(await dock.evaluate(node => node.parentElement.tagName), "BODY");
  const initial = await dock.boundingBox();
  assert.ok(initial.x >= 12 && initial.x + initial.width <= (await page.evaluate(() => innerWidth)) - 12);
  assert.match(await dock.evaluate(node => getComputedStyle(node).backdropFilter), /blur/);

  await page.locator(".client-home-panel").evaluate(home => {
    const end = document.createElement("button");
    end.textContent = "Last dashboard control";
    end.id = "full-view-last-control";
    end.style.marginBlockStart = "750px";
    home.append(end);
  });

  await page.evaluate(() => window.scrollTo({ top: 120, behavior: "instant" }));
  await compact.waitFor({ state: "visible" });
  assert.equal(await dock.evaluate(nav => nav.inert), true);
  assert.equal(await toggle.getAttribute("aria-expanded"), "false");
  assert.equal(await icon.isVisible(), true);
  assert.equal(await photo.isVisible(), false);
  const small = await compact.boundingBox();
  assert.ok(small.width >= 44 && small.width < initial.width / 2);
  await timerClears(page, compact);
  await page.evaluate(() => window.scrollTo({ top: 50, behavior: "instant" }));
  await dock.waitFor({ state: "visible" });
  assert.equal(await dock.evaluate(nav => nav.inert), false);

  await photo.evaluate(img => {
    img.src = "/images/gruntr/client-b45a7399/icon-32.png";
    img.hidden = false;
    img.previousElementSibling.hidden = true;
  });
  await photo.evaluate(img => img.decode());
  await page.evaluate(() => window.scrollTo({ top: 130, behavior: "instant" }));
  await compact.waitFor({ state: "visible" });
  assert.equal(await photo.isVisible(), true);
  assert.equal(await icon.isVisible(), false);
  await photo.evaluate(img => { img.src = "/missing-avatar.png"; });
  await icon.waitFor({ state: "visible" });

  await compact.tap();
  await dock.waitFor({ state: "visible" });
  assert.equal(await toggle.getAttribute("aria-expanded"), "true");
  assert.equal(await dock.locator('[aria-current="page"]').evaluate(node => node === document.activeElement), true);
  await page.evaluate(() => {
    document.activeElement.blur();
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
  });
  await compact.waitFor({ state: "visible" });
  const last = page.locator("#full-view-last-control");
  const lastBounds = await last.boundingBox();
  const compactBounds = await compact.boundingBox();
  assert.ok(lastBounds.y + lastBounds.height < compactBounds.y, JSON.stringify({ lastBounds, compactBounds }));
  await last.tap();

  await page.evaluate(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    const area = document.createElement("div");
    area.id = "full-view-nested";
    area.style.cssText = "height:90px;overflow:auto";
    area.innerHTML = '<div style="height:360px;width:700px"></div>';
    document.querySelector(".client-home-panel").prepend(area);
  });
  await dock.waitFor({ state: "visible" });
  const nested = page.locator("#full-view-nested");
  await nested.evaluate(node => { node.scrollLeft = 80; });
  await page.waitForFunction(() => document.querySelector("#full-view-nested").scrollLeft === 80);
  assert.equal(await dock.isVisible(), true);
  await nested.evaluate(node => { node.scrollTop = 80; });
  await compact.waitFor({ state: "visible" });
  await nested.evaluate(node => { node.scrollTop = 40; });
  await dock.waitFor({ state: "visible" });

  await page.locator(".client-home-panel").evaluate(home => {
    const dialog = document.createElement("dialog");
    dialog.id = "full-view-dialog";
    dialog.style.cssText = "height:110px;overflow:auto";
    dialog.innerHTML = '<button>Close</button><div style="height:450px"></div>';
    home.append(dialog);
    dialog.showModal();
  });
  await dock.waitFor({ state: "hidden" });
  await page.locator("#full-view-dialog").evaluate(dialog => { dialog.scrollTop = 100; });
  await page.locator("#full-view-dialog").evaluate(dialog => dialog.close());
  await dock.waitFor({ state: "visible" });

  await page.locator(".client-home-panel").evaluate(home => {
    const field = document.createElement("input");
    home.prepend(field);
    field.focus({ preventScroll: true });
    const viewport = window.visualViewport;
    Object.defineProperty(viewport, "height", { configurable: true, value: viewport.height - 280 });
    viewport.dispatchEvent(new Event("resize"));
  });
  await dock.waitFor({ state: "hidden" });
  assert.equal(await page.locator("body").evaluate(body => body.classList.contains("client-dock-keyboard-open")), true);
  await page.evaluate(() => {
    delete window.visualViewport.height;
    window.visualViewport.dispatchEvent(new Event("resize"));
  });
  await dock.waitFor({ state: "visible" });
}

async function checkSections(page) {
  await flat(page, ".client-home-next");
  await flat(page, ".client-home-planner");
  await panel(page, "community");
  await flat(page, ".client-community-wall");
  await page.locator("[data-community-wall-list]").evaluate(feed => {
    feed.innerHTML = '<article class="client-social-post"><h3>Strength workout</h3><button class="client-social-control">Props</button></article>';
  });
  await flat(page, ".client-social-post");
  await panel(page, "profile");
  await page.locator("[data-gruntr-profile-activity]").evaluate(feed => {
    feed.hidden = false;
    feed.querySelector("ol").innerHTML = "<li>Latest workout</li>";
  });
  await flat(page, "[data-gruntr-profile-activity] li");
  await panel(page, "workouts");
  const workouts = page.locator("#client-workouts-panel");
  await workouts.evaluate(node => {
    node.classList.add("is-choosing-workout");
    node.querySelector("#client-workout-tabs").innerHTML = `
      <div id="workout-hub-routines">
        <button class="workout-choice-card">Explore Routines</button>
        <button class="workout-choice-card">Previous workouts</button>
      </div>
      <section class="client-workout-routines">
        <details class="client-explore-program"><summary>Explore a routine</summary></details>
        <div class="client-at-home-grid"><details class="client-at-home-card"><summary>At home</summary></details></div>
      </section>`;
  });
  await flat(page, ".workout-choice-card");
  await flat(page, ".client-explore-program");
  await flat(page, ".client-at-home-card");
  await workouts.evaluate(node => {
    node.classList.remove("is-choosing-workout");
    node.querySelector("#client-workout-tabs").hidden = true;
    node.querySelector("#client-workout-panels").innerHTML = `
        <section class="client-workout-panel is-active" data-custom-workout-grouped="true">
          <div class="custom-workout-grouped-card"><div class="ios-log-exercise-card">
            <header class="ios-log-exercise-header">Bench press</header>
            <div class="set-table"><input type="number" aria-label="Reps"></div>
          </div></div>
          <button style="margin-top:600px" id="last-workout-control">Add exercise</button>
          <div class="workout-floating-finish"><button class="workout-floating-primary">Finish workout</button></div>
        </section>`;
  });
  await flat(page, ".ios-log-exercise-card");
  await flat(page, ".set-table");
  const finish = page.locator(".workout-floating-primary");
  await finish.waitFor({ state: "visible" });
  assert.equal(await page.locator("#client-dashboard-navigation").isVisible(), false);
  const finishBounds = await finish.boundingBox();
  assert.ok(finishBounds.y + finishBounds.height <= await page.evaluate(() => innerHeight));
  await timerClears(page, finish);
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
  const lastWorkoutControl = page.locator("#last-workout-control");
  assert.ok((await lastWorkoutControl.boundingBox()).y + (await lastWorkoutControl.boundingBox()).height < finishBounds.y);
  await lastWorkoutControl.tap();

  await page.evaluate(() => window.FWB_CLIENT_WORKOUT_CALENDAR.open({}));
  await page.locator(".client-workout-calendar").waitFor({ state: "visible" });
  await flat(page, "#client-workouts-panel");
  await noOverflow(page);

  await panel(page, "logs");
  await flat(page, ".client-saved-log-calendar");
  await page.locator("#client-logs-workouts").evaluate(logs => {
    logs.insertAdjacentHTML("beforeend", '<details class="client-logs-session"><summary>Previous workout</summary></details>');
  });
  await flat(page, ".client-logs-session");
  await page.locator("#client-logs-workouts").evaluate(logs => {
    logs.insertAdjacentHTML("beforeend", '<dialog class="client-exercise-history-dialog"><header class="client-exercise-history-header">Exercise history</header><div class="client-exercise-history-session">Set history</div></dialog>');
    logs.querySelector("dialog").showModal();
  });
  const history = page.locator(".client-exercise-history-dialog");
  const historyBounds = await history.boundingBox();
  assert.equal(historyBounds.width, await page.evaluate(() => innerWidth));
  await flat(page, ".client-exercise-history-session");
  await history.evaluate(dialog => dialog.close());

  await panel(page, "progress");
  await flat(page, '[data-client-dashboard-panel="progress"]');
  await panel(page, "stats");
  await flat(page, ".progress-dexa-card");
  await flat(page, ".progress-current-rmr");
  await panel(page, "notifications");
  await flat(page, ".client-settings-redesign-list");
  const logo = page.getByRole("img", { name: "GRUNTR", exact: true }).last();
  assert.equal(await logo.getAttribute("src"), "/images/gruntr/client-b45a7399/icon-192.png");
  await logo.evaluate(img => img.decode());

  const settingsViews = await page.locator(".client-settings-detail").evaluateAll(views => views.map(view => view.dataset.clientSettingsView));
  for (const view of settingsViews) {
    await page.evaluate(name => {
      document.querySelector(".client-settings-notification-root").hidden = false;
      window.setClientSettingsView(name, { scroll: false });
    }, view);
    assert.equal(await page.locator(`.client-settings-detail[data-client-settings-view="${view}"]`).isVisible(), true);
    await noOverflow(page);
  }
  for (const destination of ["nutrition", "sessions", "questionnaire"]) {
    await panel(page, destination);
    await flat(page, `[data-client-dashboard-panel="${destination}"]`);
    await noOverflow(page);
  }
}

async function checkViewport(page, useCDP, { appOrigin = origin, standalone = false } = {}) {
  page.setDefaultTimeout(5000);
  await routeApp(page, appOrigin);
  const cdp = useCDP ? await page.context().newCDPSession(page) : null;
  const insets = { top: 23, bottom: 34, left: 20, right: 16 };
  if (cdp) await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets });
  await initialize(page, appOrigin);
  assert.equal(await page.evaluate(() => matchMedia("(display-mode: standalone)").matches), standalone);
  if (cdp) {
    const geometry = await page.evaluate(() => ({
      shellTop: parseFloat(getComputedStyle(document.querySelector(".dashboard-shell")).paddingTop),
      dockBottom: parseFloat(getComputedStyle(document.querySelector(".client-dashboard-tabs")).bottom)
    }));
    assert.equal(geometry.shellTop, 10 + insets.top);
    assert.equal(geometry.dockBottom, 9 + insets.bottom);
  }
  const installedEntry = await page.evaluate(async () => {
    const manifest = await fetch(document.querySelector('link[rel="manifest"]').href).then(response => response.json());
    return { mode: manifest.display, start: manifest.start_url };
  });
  assert.deepEqual(installedEntry, { mode: "standalone", start: "/client-dashboard.html" });
  await checkDock(page);
  await checkSections(page);
  await page.goto(`${appOrigin}/client-login.html`);
  for (const selector of [".access-panel", ".access-demo"]) {
    await flat(page, selector);
    const verticalBorders = await page.locator(selector).evaluate(node => {
      const css = getComputedStyle(node);
      return [css.borderBlockStartWidth, css.borderBlockEndWidth];
    });
    assert.deepEqual(verticalBorders, ["0px", "0px"], selector);
  }
  await noOverflow(page);
  const form = page.locator("#client-login-form");
  const email = form.locator('input[type="email"]');
  assert.ok(parseFloat(await email.evaluate(input => getComputedStyle(input).borderInlineStartWidth)) > 0);
  await email.fill("test@example.invalid");
  await form.locator('input[type="password"]').fill("test-password");
  assert.equal(await form.getByRole("button", { name: "Sign in to GRUNTR" }).isEnabled(), true);
}

async function run(engine, name, dimensions) {
  const browser = await engine.launch();
  try {
    for (const [width, height] of dimensions) {
      const page = await browser.newPage({ viewport: { width, height }, screen: { width, height }, hasTouch: true, isMobile: true });
      await checkViewport(page, engine === chromium);
      await page.close();
      console.log(`${name} ${width}×${height}: dock, end controls, and full-view sections passed`);
    }
  } finally {
    await browser.close();
  }
}

async function runStandalone() {
  // Keep the app window on one origin. Chromium moves cross-origin navigation
  // from an app window into a regular tab.
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end("<!doctype html><title>GRUNTR browser fixture</title>");
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const appOrigin = `http://127.0.0.1:${server.address().port}`;
  const viewport = { width: 390, height: 844 };
  let context;
  try {
    context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      args: [`--app=${appOrigin}`],
      viewport,
      screen: viewport,
      hasTouch: true
    });
    await checkViewport(context.pages()[0], true, { appOrigin, standalone: true });
    console.log("Chromium standalone 390×844: dock, end controls, and full-view sections passed");
  } finally {
    await context?.close();
    server.close();
  }
}

(async () => {
  const checks = [];
  if (process.env.PLAYWRIGHT_BROWSER !== "chromium") checks.push(run(webkit, "iPhone WebKit", [[390, 844], [320, 568]]));
  if (process.env.PLAYWRIGHT_BROWSER !== "webkit") {
    checks.push(run(chromium, "Android Chromium", [[412, 915], [360, 740]]), runStandalone());
  }
  const results = await Promise.allSettled(checks);
  for (const result of results) {
    if (result.status === "rejected") {
      console.error(result.reason);
      process.exitCode = 1;
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
