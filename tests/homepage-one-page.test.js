const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const homepage = fs.readFileSync(path.join(root, "index.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "css/homepage-gold-blue.css"), "utf8");
const script = fs.readFileSync(path.join(root, "js/homepage-one-page.js"), "utf8");

test("keeps the one-page layout usable on a phone", () => {
  assert.match(homepage, /class="page-shell"/);
  assert.match(homepage, /id="training"[\s\S]*?id="start"[\s\S]*?id="client-login"/);
  assert.match(styles, /@media \(max-width: 850px\)[\s\S]*?\.page-shell \{ display: block; \}/);
  assert.match(homepage, /<main id="top" class="page-shell">\s*<section id="training" class="hero"/);
  assert.match(styles, /\.hero \{[^}]*background: linear-gradient\(135deg/);
  assert.match(homepage, /href="questionnaire\.html"/);
  assert.match(homepage, /href="coach-login\.html"/);
  assert.match(homepage, /href="fwb-training-privacy\.html"/);
});

test("uses blue and gold without a dark homepage background", () => {
  assert.match(styles, /--blue: #2878ff;/);
  assert.match(styles, /--gold: #ffd526;/);
  assert.match(styles, /--cream: #faf9f4;/);
  assert.match(homepage, /images\/home\/fwb-logo-transparent\.svg/);
  assert.match(homepage, /theme-color" content="#2878ff"/);
});

test("ships every rotating anatomy image referenced by the homepage", () => {
  const names = [...script.matchAll(/^    "([\w-]+\.png)"/gm)].map(match => match[1]);
  assert.equal(names.length, 13);
  for (const name of names) {
    assert.ok(fs.existsSync(path.join(root, "images/home/anatomy", name)), `${name} is missing`);
  }
});

test("homepage sign-in uses the shared session choice and routes clients to their dashboard", async () => {
  const handlers = {};
  const form = {
    elements: { remember_me: { checked: false }, email: { value: "client@example.com" } },
    querySelector: () => submit,
    addEventListener: (name, handler) => { handlers[name] = handler; }
  };
  const submit = { disabled: false };
  const status = { textContent: "" };
  const reset = { disabled: false, addEventListener: (name, handler) => { handlers[`reset-${name}`] = handler; } };
  const nodes = {
    "#home-year": { textContent: "" },
    "#home-art-image": { src: "" },
    "#home-login-form": form,
    "#home-login-status": status,
    "#home-reset-password": reset
  };
  const calls = [];
  const auth = {
    initialize: async () => {},
    signInWithPassword: async credentials => {
      calls.push(["sign-in", credentials]);
      return { data: { user: { email: credentials.email } }, error: null };
    },
    resetPasswordForEmail: async () => ({ error: null })
  };
  const window = {
    sessionStorage: { getItem: () => null, setItem: () => {} },
    FWB_SUPABASE_CONFIG: { url: "https://example.supabase.co", anonKey: "public-key" },
    FWB_AUTH_SESSION: {
      storage: {},
      getRememberMe: () => true,
      setRememberMe: value => calls.push(["remember", value])
    },
    supabase: { createClient: () => ({ auth }) },
    location: { href: "", origin: "https://benjaminbenz.com" }
  };
  const document = { querySelector: selector => nodes[selector] || null };
  const FormData = class { get(name) { return name === "email" ? "client@example.com" : "password"; } };

  vm.runInNewContext(script, { window, document, FormData, Date, Math });
  assert.equal(form.elements.remember_me.checked, true);
  await handlers.submit({ preventDefault() {} });
  assert.deepEqual(calls.map(([name]) => name), ["remember", "sign-in"]);
  assert.equal(calls[0][1], true);
  assert.equal(calls[1][1].email, "client@example.com");
  assert.equal(window.location.href, "client-dashboard.html?v=manual-sessions-1");
});
