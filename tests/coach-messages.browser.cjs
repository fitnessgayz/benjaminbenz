// Run: NODE_PATH=<runtime node_modules> node tests/coach-messages.browser.cjs
// Uses an isolated browser and mock RPCs; never sends a real message.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const artifactDir = process.env.MESSAGING_SCREENSHOT_DIR || "/private/tmp/fwb-messaging-browser";
fs.mkdirSync(artifactDir, { recursive: true });

async function setup(browser, role, viewport) {
  const page = await browser.newPage({ viewport });
  const originalHTML = fs.readFileSync(path.join(root, role === "client" ? "client-dashboard.html" : "coach-admin.html"), "utf8");
  const localStyles = [...originalHTML.matchAll(/<link[^>]+href="([^"?]+\.css)(?:\?[^"]*)?"/g)].map(match => path.join(root, match[1].replace(/^\//, ""))).filter(file => fs.existsSync(file));
  const html = originalHTML
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<link\b[^>]*>/gi, "");
  await page.route("**/*", (route) => route.request().url() === "http://127.0.0.1:8769/messaging-test" ? route.fulfill({ status: 200, contentType: "text/html", body: html }) : route.abort());
  await page.goto("http://127.0.0.1:8769/messaging-test");
  for (const file of localStyles) await page.addStyleTag({ path: file });
  await page.addScriptTag({ path: path.join(root, "js/coach-messages.js") });
  await page.evaluate((role) => {
    window.calls = [];
    window.authChange = null;
    window.failSend = false;
    window.hidePage = false;
    window.rpcRows = Array.from({ length: 70 }, (_, i) => ({ id: i + 1, client_email: "client@example.com", sender_user_id: (i % 2 === 0) ? "client" : "coach", sender_role: (i % 2 === 0) ? "client" : "coach", body: `Message ${i + 1}: ${i === 69 ? '<img src=x onerror="window.xss=true">' : 'How is your training feeling today? Here is a useful update about the workout.'}`, created_at: "2026-09-26T10:00:00Z", request_id: `request-${i + 1}` }));
    window.backend = {
      auth: { onAuthStateChange(callback) { window.authChange = callback; return { data: { subscription: { unsubscribe() {} } } }; } },
      async rpc(name, args) {
        window.calls.push({ name, args });
        if (name === "messaging_inbox") return { data: [{ client_email: "client@example.com", client_name: "Alex Morgan", last_message_id: window.rpcRows.at(-1).id, last_message_body: window.rpcRows.at(-1).body, last_message_at: "2026-09-26T10:00:00Z", last_sender_role: "client", unread_count: 2 }] };
        if (name === "messaging_history") return { data: args.p_client_email === "empty@example.com" ? [] : window.rpcRows.filter((row) => !args.p_before_id || row.id < args.p_before_id).slice(-args.p_limit).reverse() };
        if (name === "messaging_send") {
          if (window.failSend) return { error: new Error("offline") };
          const existing = window.rpcRows.find((row) => row.request_id === args.p_request_id);
          if (existing) return { data: [existing] };
          const sent = { id: window.rpcRows.at(-1).id + 1, client_email: "client@example.com", sender_user_id: role, sender_role: role, body: args.p_body, created_at: "2026-09-26T10:00:00Z", request_id: args.p_request_id };
          window.rpcRows.push(sent); return { data: [sent] };
        }
        return { data: null };
      }
    };
    Object.defineProperty(document, "visibilityState", { get: () => window.hidePage ? "hidden" : "visible", configurable: true });
    document.body.classList.remove("is-loading");
    document.getElementById("dashboard-content")?.removeAttribute("hidden");
    if (document.getElementById("dashboard-loading")) document.getElementById("dashboard-loading").hidden = true;
    document.querySelector("#coach-admin-workspace")?.removeAttribute("hidden");
    const host = document.querySelector(role === "client" ? "[data-client-messages]" : "[data-coach-messages]");
    if (role === "coach") {
      document.querySelectorAll("[data-admin-panel]").forEach((el) => { el.hidden = el !== host; });
      host.hidden = false;
      document.querySelector('[data-admin-tab="home"]')?.classList.remove("is-active");
      document.querySelector('[data-admin-tab="inbox"]')?.classList.add("is-active");
    }
    window.controller = window.FWBCoachMessages.createController({ supabaseClient: window.backend, rpcTransport: window.backend, user: { id: role, email: role === "client" ? "client@example.com" : "coach@example.com" }, role, root: host, unreadBadges: document.querySelectorAll(role === "client" ? "[data-client-message-unread]" : "[data-coach-message-unread]"), openButtons: document.querySelectorAll("[data-message-coach]") });
  }, role);
  return page;
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "chrome" });
  try {
    const client = await setup(browser, "client", { width: 390, height: 844 });
    await client.getByRole("button", { name: /Message coach/ }).click();
    await client.waitForFunction(() => document.querySelectorAll(".fwb-message-bubble").length === 50);
    assert.equal(await client.locator(".fwb-message-bubble img").count(), 0);
    assert.equal(await client.evaluate(() => window.xss), undefined);
    assert.equal(await client.locator(".fwb-message-bubble").last().textContent().then((s) => s.includes("<img")), true);
    await client.waitForFunction(() => window.calls.some((call) => call.name === "messaging_mark_read" && call.args.p_through_message_id === 70));
    // Reading earlier history must not acknowledge a newly arrived message.
    await client.locator(".fwb-message-history").evaluate((el) => { el.scrollTop = 0; });
    const previousReadCount = await client.evaluate(() => window.calls.filter((call) => call.name === "messaging_mark_read").length);
    await client.evaluate(async () => { window.rpcRows.push({ ...window.rpcRows.at(-1), id: 71, body: "A new unread reply", request_id: "new-reply" }); await window.controller.refresh(); });
    assert.equal(await client.locator(".fwb-message-history").evaluate((el) => el.scrollTop), 0);
    assert.equal(await client.evaluate(() => window.calls.filter((call) => call.name === "messaging_mark_read").length), previousReadCount);
    assert.equal(await client.getByRole("button", { name: "New messages ↓" }).isVisible(), true);
    await client.getByRole("button", { name: "Load earlier messages" }).click();
    await client.waitForFunction(() => document.querySelectorAll(".fwb-message-bubble").length === 71);
    assert.ok(await client.locator(".fwb-message-history").evaluate((el) => el.scrollTop > 0));
    await client.getByRole("button", { name: "New messages ↓" }).click();
    await client.waitForFunction(() => window.calls.some((call) => call.name === "messaging_mark_read" && call.args.p_through_message_id === 71));
    await client.locator("#client-message-draft").fill("Question for my coach");
    await client.evaluate(() => { window.failSend = true; });
    await client.getByRole("button", { name: "Send", exact: true }).click();
    await client.getByRole("button", { name: "Retry send" }).waitFor();
    assert.equal(await client.locator("#client-message-draft").inputValue(), "Question for my coach");
    assert.equal(await client.locator("#client-message-draft").isDisabled(), true);
    await client.evaluate(() => { window.failSend = false; });
    await client.getByRole("button", { name: "Retry send" }).click();
    await client.waitForFunction(() => document.getElementById("client-message-draft").value === "");
    assert.equal(await client.evaluate(() => { const sends = window.calls.filter((call) => call.name === "messaging_send"); return sends[0].args.p_request_id === sends[1].args.p_request_id; }), true);
    await client.locator("#client-message-draft").fill("Draft survives closing");
    await client.getByRole("button", { name: "Close conversation" }).click();
    await client.getByRole("button", { name: /Message coach/ }).click();
    assert.equal(await client.locator("#client-message-draft").inputValue(), "Draft survives closing");
    assert.equal(await client.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await client.screenshot({ path: path.join(artifactDir, "client-mobile.png") });
    // Hidden pages make no polling/refresh reads, and account changes clear all private DOM.
    const callCount = await client.evaluate(() => window.calls.length);
    await client.evaluate(async () => { window.hidePage = true; document.dispatchEvent(new Event("visibilitychange")); await window.controller.refresh(); });
    assert.equal(await client.evaluate(() => window.calls.length), callCount);
    await client.evaluate(() => window.authChange("SIGNED_OUT", null));
    assert.equal(await client.locator(".fwb-message-bubble").count(), 0);
    assert.equal(await client.locator("#client-message-draft").count(), 0);
    await client.close();

    const coach = await setup(browser, "coach", { width: 1280, height: 900 });
    assert.equal(await coach.locator("[data-coach-messages]").evaluate(el => getComputedStyle(el).backgroundColor), "rgb(23, 27, 22)");
    await coach.locator("[data-client-email]").click();
    await coach.waitForFunction(() => document.querySelectorAll(".fwb-message-bubble").length === 50);
    await coach.locator("#coach-message-draft").fill("Thanks for the update. Let’s adjust your next workout.");
    await coach.getByRole("button", { name: "Send", exact: true }).click();
    await coach.waitForFunction(() => document.getElementById("coach-message-draft").value === "");
    assert.equal(await coach.evaluate(() => window.calls.find((call) => call.name === "messaging_send").args.p_client_email), "client@example.com");
    await coach.locator("[data-coach-messages]").evaluate(el => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 80, behavior: "instant" }));
    assert.ok((await coach.locator("#coach-inbox-title").boundingBox()).y >= 64);
    await coach.screenshot({ path: path.join(artifactDir, "coach-desktop.png") });
    await coach.setViewportSize({ width: 390, height: 844 });
    assert.equal(await coach.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await coach.locator("[data-coach-messages]").evaluate(el => el.scrollIntoView({block:"start"}));
    await coach.screenshot({ path: path.join(artifactDir, "coach-mobile.png") });
    await coach.evaluate(() => window.controller.open("empty@example.com", "New client"));
    await coach.getByText("No messages yet. Your client can start a conversation with Message coach.").waitFor();
    assert.equal(await coach.locator(".fwb-message-composer").isVisible(), false);
    await coach.close();
    console.log("Messaging browser flow passed: mobile/desktop, literal text safety, read visibility, history scroll, uncertain retry, drafts, sign-out, empty coach state.");
    console.log(`Screenshots: ${artifactDir}`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
