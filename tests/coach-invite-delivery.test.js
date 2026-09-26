const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/coach-admin.js"), "utf8");
const inviteUrl = "https://test.supabase.co/auth/v1/verify?token=test-only&type=invite";

function functionSource(name) {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start >= 0, `Missing function ${name}`);
  const rest = source.slice(start);
  const end = rest.slice(1).search(/\n(?:async )?function /);
  return end < 0 ? rest : rest.slice(0, end + 1);
}

function element(tag = "button") {
  return {
    tag, children: [], handlers: {}, disabled: false, value: "", textContent: "",
    append(...children) { this.children.push(...children); },
    addEventListener(event, handler) { this.handlers[event] = handler; },
    focus() { this.focused = true; },
    reportValidity() { return false; }
  };
}

function fixture(options = {}) {
  const email = element("input"); email.value = "client@example.com";
  const name = element("input"); name.value = "Sam & Jo";
  const phone = element("input"); phone.value = options.phone ?? "+1 (415) 555-0123";
  const form = { elements: { invite_client_email: email, invite_client_name: name, invite_client_phone: phone } };
  const elements = {
    "program-editor": form,
    "send-invite-button": element(),
    "text-invite-button": element(),
    "save-client-button": element(),
    "invite-status": element("p"),
    "invite-client-modal": { hidden: false }
  };
  const closes = [element(), element()];
  const calls = { saved: 0, requests: [], closed: 0, copied: [], admin: [] };
  const context = vm.createContext({
    navigator: {
      userAgent: options.userAgent || "Android",
      clipboard: { writeText: async (text) => { calls.copied.push(text); } }
    },
    document: {
      getElementById: (id) => elements[id] || null,
      querySelectorAll: () => closes,
      createElement: element,
      body: { classList: { remove() {} } }
    },
    window: { requestAnimationFrame: (callback) => callback() },
    coachConfig: { url: "https://test.supabase.co", anonKey: "test-anon" },
    coachSupabase: { auth: { getSession: async () => options.session
      ? options.session()
      : { data: { session: { access_token: "test-coach" } } } } },
    normalizeEmail: (value) => String(value || "").trim().toLowerCase(),
    formValue: (form, name) => form.elements[name].value.trim(),
    saveNewClientFromInvite: async () => {
      calls.saved++;
      return options.saveResult || { data: { id: "program-1", client_email: email.value, client_name: name.value, client_phone: phone.value } };
    },
    withSlowStatus: (promise) => promise,
    withRequestTimeout: (promise) => promise,
    inviteRedirectUrl: () => "https://benjaminbenz.com/client-invite.html",
    fetchWithTimeout: async (_url, request) => {
      calls.requests.push(JSON.parse(request.body));
      if (options.fetchError) throw options.fetchError;
      return {
        ok: options.ok !== false,
        json: async () => options.response || { manualInviteUrl: inviteUrl, email: email.value, message: "Invite ready." }
      };
    },
    adminStatus: (message) => calls.admin.push(message),
    closeInviteClientModal: () => { calls.closed++; },
    inviteClientSavedProgram: null,
    inviteClientReturnFocus: null
  });
  vm.runInContext([
    "isValidEmail", "readableInviteMessage", "readableClientRequestError", "invitePhoneNumber",
    "textInviteHref", "inviteStatus", "setClientInviteBusy", "validateClientDetails", "handleSendInvite"
  ].map(functionSource).join("\n"), context);
  context.handleSendInvite();
  return {
    context, elements, closes, form, calls,
    click: (channel) => elements[channel === "text" ? "text-invite-button" : "send-invite-button"].handlers.click(),
    status: () => elements["invite-status"].children.at(-1)?.textContent || "",
    actions: () => elements["invite-status"].children.at(-1)?.children || []
  };
}

test("text prepares a link for the saved recipient and leaves the composer choice open", async () => {
  const h = fixture();
  await h.click("text");
  assert.equal(h.calls.saved, 1);
  assert.equal(h.calls.requests[0].delivery, "link");
  assert.equal(h.calls.requests[0].email, "client@example.com");
  assert.equal(h.calls.closed, 0);
  const [text, copy] = h.actions();
  assert.equal(text.textContent, "Open text message");
  assert.ok(text.href.startsWith("sms:+14155550123?body="));
  assert.ok(decodeURIComponent(text.href).includes(`Hi Sam & Jo! You're invited to Fitness with Benjamin.`));
  assert.ok(decodeURIComponent(text.href).endsWith(inviteUrl));
  await copy.handlers.click();
  assert.deepEqual(h.calls.copied, [inviteUrl]);
  assert.equal(h.elements["text-invite-button"].disabled, false);
});

test("Apple Messages gets its body separator and international phone numbers retain +", () => {
  const h = fixture({ userAgent: "iPhone" });
  assert.equal(h.context.invitePhoneNumber(" +44 (20) 7946-0123 "), "+442079460123");
  assert.match(h.context.textInviteHref("+44 20 7946 0123", "Sam", inviteUrl), /^sms:\+442079460123&body=/);
  for (const phone of ["", "123", "4155550123?body=wrong", "1;234567890", "12+34567890", "1234567890123456"]) {
    assert.equal(h.context.textInviteHref(phone, "Sam", inviteUrl), "");
  }
});

test("text requires a valid phone before saving; email works without a phone", async () => {
  const h = fixture({ phone: "" });
  await h.click("text");
  assert.equal(h.calls.saved, 0);
  assert.equal(h.calls.requests.length, 0);
  assert.equal(h.form.elements.invite_client_phone.focused, true);
  assert.match(h.status(), /valid client phone/);
  await h.click("email");
  assert.equal(h.calls.requests[0].delivery, "email");
  assert.equal(h.calls.closed, 1);
});

test("email and client name remain required for text account invitations", async () => {
  for (const field of ["invite_client_email", "invite_client_name"]) {
    const h = fixture(); h.form.elements[field].value = "";
    await h.click("text");
    assert.equal(h.calls.saved, 0);
    assert.equal(h.calls.requests.length, 0);
  }
});

test("pending invitations freeze fields and all actions, preventing a second request", async () => {
  let resolveSession;
  const h = fixture({ session: () => new Promise((resolve) => { resolveSession = resolve; }) });
  const pending = h.click("text");
  for (const id of ["text-invite-button", "send-invite-button", "save-client-button"]) assert.equal(h.elements[id].disabled, true);
  for (const input of Object.values(h.form.elements)) assert.equal(input.disabled, true);
  assert.ok(h.closes.every((button) => button.disabled));
  await h.click("email");
  resolveSession({ data: { session: { access_token: "test-coach" } } });
  await pending;
  assert.equal(h.calls.requests.length, 1);
  assert.ok(h.closes.every((button) => !button.disabled));
  assert.ok(Object.values(h.form.elements).every((input) => !input.disabled));
});

test("failed login or profile save prevents invitation creation and unlocks the form", async () => {
  for (const options of [
    { session: async () => ({ data: { session: null } }) },
    { saveResult: { error: { message: "Profile could not be saved." } } },
    { session: async () => { throw new Error("offline"); } }
  ]) {
    const h = fixture(options);
    await h.click("text");
    assert.equal(h.calls.requests.length, 0);
    assert.equal(h.calls.closed, 0);
    assert.equal(h.elements["text-invite-button"].disabled, false);
  }
});

test("missing links and network errors keep the modal open with an actionable error", async () => {
  for (const [options, message] of [
    [{ response: { message: "Unexpected success" } }, /link was not returned/],
    [{ fetchError: new Error("Failed to fetch") }, /Could not prepare the text invite/]
  ]) {
    const h = fixture(options);
    await h.click("text");
    assert.match(h.status(), message);
    assert.equal(h.calls.closed, 0);
    assert.equal(h.actions().length, 0);
  }
});

test("failed email delivery exposes the returned link for text or copying", async () => {
  const h = fixture({ ok: false, response: { error: "Email unavailable.", manualInviteUrl: inviteUrl } });
  await h.click("email");
  assert.equal(h.calls.closed, 0);
  assert.equal(h.actions()[0].textContent, "Open text message");
  await h.actions()[1].handlers.click();
  assert.deepEqual(h.calls.copied, [inviteUrl]);
});

test("Escape and backdrop dismissal cannot close a pending invite; saved clients are acknowledged", () => {
  const h = fixture();
  vm.runInContext(functionSource("closeInviteClientModal"), h.context);
  h.elements["save-client-button"].disabled = true;
  h.context.closeInviteClientModal();
  assert.equal(h.elements["invite-client-modal"].hidden, false);
  h.elements["save-client-button"].disabled = false;
  h.context.inviteClientSavedProgram = { id: "saved" };
  h.context.closeInviteClientModal();
  assert.equal(h.elements["invite-client-modal"].hidden, true);
  assert.equal(h.calls.admin.at(-1), "Client saved.");
});

test("text followed by email reuses the profile; existing active workouts stay intact", async () => {
  for (const existing of [null, { id: "existing", active: true, client_email: "client@example.com", client_name: "Old name", workouts: [{ title: "Keep my workouts" }] }]) {
    const h = fixture();
    const saves = [];
    Object.assign(h.context, {
      programs: existing ? [existing] : [],
      selectedProgramId: "",
      newClientProgramFromInvite: () => ({ client_email: "client@example.com", client_name: "Sam", client_phone: "+14155550123", active: true, workouts: [] }),
      saveClientProgramWithCoachAccess: async (payload, id) => {
        saves.push({ payload, id });
        return { data: { ...payload, id: id || "new-profile" } };
      },
      fillForm() {}, renderClientList() {}, renderProgramHistory() {}
    });
    vm.runInContext(functionSource("saveNewClientFromInvite"), h.context);
    await h.click("text");
    await h.click("email");
    assert.equal(saves.length, 2);
    assert.equal(saves[0].id, existing?.id || "");
    assert.equal(saves[1].id, existing?.id || "new-profile");
    assert.equal(h.context.programs.length, 1);
    assert.equal(saves[1].payload.client_name, "Sam");
    if (existing) assert.deepEqual(saves[1].payload.workouts, existing.workouts);
  }
});
