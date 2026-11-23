import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const consentScript = readFileSync(new URL("../js/oauth-consent.js", import.meta.url), "utf8");

async function renderConsent(clientName) {
  const elements = Object.fromEntries([
    "status", "approve", "deny", "client-name", "consent-title",
    "requested-actions", "consent-disclaimer", "requested-scopes",
  ].map((id) => [id, {
    textContent: "",
    children: [],
    replaceChildren() { this.children = []; },
    append(child) { this.children.push(child); },
    addEventListener() {},
  }]));
  elements["consent-title"].textContent = "Connect FWB Training Assistant?";
  elements["requested-actions"].children = [
    "Read your coaching profile, active program, and progress.",
    "Save check-ins or progress notes only when you ask.",
    "Queue a message for Benjamin only when you ask.",
  ].map((textContent) => ({ textContent }));

  const client = {
    auth: {
      getUser: async () => ({ data: { user: { id: "test-client" } } }),
      oauth: {
        getAuthorizationDetails: async () => ({ data: { authorization_id: "test", client: { name: clientName }, scope: "openid email" } }),
      },
    },
  };
  const window = {
    location: { search: "?authorization_id=test" },
    FWB_SUPABASE_CONFIG: { url: "https://example.supabase.co", anonKey: "test" },
    FWB_AUTH_SESSION: { storage: {} },
    supabase: { createClient: () => client },
  };
  const document = {
    title: "Connect FWB Training Assistant",
    querySelector: (selector) => elements[selector.slice(1)],
    createElement: () => ({ textContent: "" }),
  };
  runInNewContext(consentScript, { window, document, URLSearchParams });
  await new Promise((resolve) => setImmediate(resolve));
  return { document, elements };
}

test("GRUNTR OAuth consent describes ChatGPT history, logging, and routine previews", async () => {
  const { document, elements } = await renderConsent("FWB Training Client");
  assert.equal(document.title, "Connect GRUNTR to ChatGPT");
  assert.equal(elements["consent-title"].textContent, "Connect GRUNTR to ChatGPT?");
  assert.deepEqual(elements["requested-actions"].children.map((item) => item.textContent), [
    "Confirm your connected GRUNTR account and read your workout history, training program, and recent training check-ins.",
    "Save sets and completed workouts to your Logs when you ask.",
    "Prepare routine previews for your approval in GRUNTR.",
  ]);
});

test("other OAuth apps retain the existing coaching permission list", async () => {
  const { document, elements } = await renderConsent("ChatGPT");
  assert.equal(document.title, "Connect FWB Training Assistant");
  assert.equal(elements["requested-actions"].children.length, 3);
});
