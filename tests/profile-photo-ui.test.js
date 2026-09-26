const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const source = read("js/profile-photo.js");
const html = read("client-dashboard.html");
const portal = read("js/client-portal.js");
const user = { id: "11111111-1111-4111-8111-111111111111", email: "client@example.com" };
const originalBlob = { photo: "original" };
const original = { path: `${user.id}/profile/22222222-2222-4222-8222-222222222222.jpg`, blob: originalBlob };
const flush = () => new Promise(setImmediate);
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function element() {
  const listeners = new Map();
  return {
    hidden: false, disabled: false, open: false, value: "", files: [], textContent: "", innerHTML: "", attributes: {}, focusCount: 0,
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; delete this[name]; },
    addEventListener(name, listener) { listeners.set(name, listener); },
    removeEventListener(name, listener) { if (listeners.get(name) === listener) listeners.delete(name); },
    emit(name, event = { preventDefault() {} }) { return listeners.get(name)?.(event); },
    click() { if (!this.disabled) return this.emit("click"); },
    focus() { this.focusCount++; },
    showModal() { this.open = true; },
    close() { if (this.open) { this.open = false; this.emit("close"); } }
  };
}

function fixture(options = {}) {
  const names = ["open", "email", "label", "image", "placeholder", "status", "retry", "dialog", "preview", "preview-placeholder", "file", "choose", "editor-status", "confirm", "keep", "confirm-remove", "editor-actions", "cancel", "save", "remove"];
  const nodes = Object.fromEntries(names.map((name) => [name, element()]));
  const root = element();
  const panel = { hidden: false };
  root.hidden = true;
  root.querySelector = (selector) => nodes[selector.match(/^\[data-profile-(.*)\]$/)[1]];
  root.closest = () => panel;
  const document = element();
  document.querySelector = () => options.missingRoot ? null : root;
  document.visibilityState = "visible";
  const calls = [];
  const urls = [];
  const revoked = [];
  const timers = new Map();
  let nextTimer = 0;
  let authCallback;
  let unsubscribed = 0;
  const invoke = async (name, ...args) => {
    calls.push({ name, args });
    if (options[name]) return options[name](...args);
    if (name === "load") return options.initial || original;
    if (name === "prepare") return { photo: "prepared", type: "image/jpeg" };
    if (name === "save") return { path: `${user.id}/profile/33333333-3333-4333-8333-333333333333.jpg`, blob: args[0] };
  };
  const global = {
    document,
    URL: {
      createObjectURL(blob) { const url = `blob:photo-${urls.length + 1}`; urls.push({ url, blob }); return url; },
      revokeObjectURL(url) { revoked.push(url); }
    },
    setTimeout(handler) { const id = ++nextTimer; timers.set(id, handler); return id; },
    clearTimeout(id) { timers.delete(id); },
    FWB_PROFILE_PHOTO_STORE: { createStore(settings) { calls.push({ name: "createStore", args: [settings] }); return {
      load: () => invoke("load"), save: (blob) => invoke("save", blob), remove: () => invoke("remove")
    }; } },
    FWB_PROFILE_PHOTO_PROCESSOR: { prepare: (file) => invoke("prepare", file) }
  };
  const client = { auth: { onAuthStateChange(callback) { authCallback = callback; return { data: { subscription: { unsubscribe() { unsubscribed++; } } } }; } } };
  vm.runInNewContext(source, { window: global });
  const controller = global.FWB_PROFILE_PHOTO.createController({ supabaseClient: client, user: options.user === undefined ? user : options.user, isPreview: options.preview });
  return {
    controller, nodes, root, panel, document, calls, urls, revoked, timers,
    get unsubscribed() { return unsubscribed; },
    auth(event, session = { user }) { return authCallback?.(event, session); },
    async runTimers() { const ready = [...timers.values()]; timers.clear(); ready.forEach((handler) => handler()); await flush(); },
    async select(file = { name: "portrait.jpg" }) { nodes.file.files = [file]; return nodes.file.emit("change"); },
    count(name) { return calls.filter((call) => call.name === name).length; }
  };
}

test("Settings loads the account photo and safely renders the current account email", async () => {
  const email = '<img src=x onerror="alert(1)">@example.com';
  const h = fixture({ user: { ...user, email } });
  assert.equal(h.root.hidden, false);
  assert.equal(h.nodes.email.textContent, email);
  assert.equal(h.nodes.email.innerHTML, "");
  await h.controller.initialize();
  assert.equal(h.calls[0].args[0].userId, user.id);
  assert.equal(h.nodes.image.src, "blob:photo-1");
  assert.equal(h.nodes.placeholder.hidden, true);
  assert.equal(h.nodes.label.textContent, "Change profile photo");
  assert.equal(h.nodes.open.disabled, false);
  assert.equal(h.root.attributes["aria-busy"], "false");
  await h.nodes.open.click();
  assert.equal(h.nodes.dialog.open, true);
  assert.equal(h.nodes.preview.src, h.nodes.image.src);
  assert.equal(h.nodes.choose.focusCount, 1);
  assert.equal(h.nodes.save.disabled, true);
});

test("choosing a photo previews locally and saves only on explicit Save", async () => {
  const h = fixture({ initial: { path: null, blob: null } });
  await h.controller.initialize();
  assert.equal(h.nodes.label.textContent, "Add profile photo");
  await h.nodes.open.click();
  let pickerOpened = 0;
  h.nodes.file.click = () => pickerOpened++;
  await h.nodes.choose.click();
  assert.equal(pickerOpened, 1);
  await h.select();
  assert.equal(h.nodes.preview.src, "blob:photo-1");
  assert.equal(h.nodes.image.hidden, true);
  assert.equal(h.nodes.save.disabled, false);
  assert.equal(h.count("save"), 0);
  assert.equal(h.count("remove"), 0);
  await h.nodes.save.click();
  assert.equal(h.count("save"), 1);
  assert.equal(h.nodes.image.src, "blob:photo-2");
  assert.equal(h.urls[1].blob, h.urls[0].blob);
  assert.equal(h.nodes.dialog.open, false);
  assert.equal(h.nodes.label.textContent, "Change profile photo");
  assert.match(h.nodes.status.textContent, /saved/i);
  assert.deepEqual(h.revoked, ["blob:photo-1"]);
});

test("Cancel discards the draft, revokes its URL, and retains the saved account photo", async () => {
  const h = fixture();
  await h.controller.initialize();
  await h.nodes.open.click();
  await h.select();
  assert.equal(h.nodes.preview.src, "blob:photo-2");
  await h.nodes.cancel.click();
  assert.equal(h.nodes.dialog.open, false);
  assert.equal(h.nodes.image.src, "blob:photo-1");
  assert.deepEqual(h.revoked, ["blob:photo-2"]);
  assert.equal(h.count("save"), 0);
  await h.nodes.open.click();
  assert.equal(h.nodes.preview.src, "blob:photo-1");
  assert.equal(h.nodes.save.disabled, true);
});

test("a failed save retains the original picture and draft and allows retry", async () => {
  let failing = true;
  const h = fixture({ save(blob) { if (failing) throw new Error("private backend details"); return { path: "saved-profile-path", blob }; } });
  await h.controller.initialize();
  await h.nodes.open.click();
  await h.select();
  await h.nodes.save.click();
  assert.equal(h.nodes.dialog.open, true);
  assert.equal(h.nodes.image.src, "blob:photo-1");
  assert.equal(h.nodes.preview.src, "blob:photo-2");
  assert.equal(h.nodes.save.disabled, false);
  assert.equal(h.revoked.length, 0);
  assert.match(h.nodes["editor-status"].textContent, /could not confirm.*saved/i);
  assert.doesNotMatch(h.nodes["editor-status"].textContent, /private backend/);
  failing = false;
  await h.nodes.save.click();
  assert.equal(h.count("save"), 2);
  assert.equal(h.nodes.dialog.open, false);
  assert.deepEqual(h.revoked, ["blob:photo-1", "blob:photo-2"]);
});

test("Remove requires confirmation; Keep does not write; a failed removal can retry", async () => {
  let failing = true;
  const h = fixture({ remove() { if (failing) throw new Error("offline"); } });
  await h.controller.initialize();
  await h.nodes.open.click();
  await h.nodes.remove.click();
  assert.equal(h.nodes.confirm.hidden, false);
  assert.equal(h.nodes["editor-actions"].hidden, true);
  assert.equal(h.count("remove"), 0);
  await h.nodes.keep.click();
  assert.equal(h.nodes.confirm.hidden, true);
  assert.equal(h.count("remove"), 0);
  await h.nodes.remove.click();
  await h.nodes["confirm-remove"].click();
  assert.equal(h.nodes.image.src, "blob:photo-1");
  assert.equal(h.nodes.dialog.open, true);
  assert.equal(h.nodes.confirm.hidden, false);
  assert.equal(h.nodes["confirm-remove"].disabled, false);
  assert.match(h.nodes["editor-status"].textContent, /could not confirm.*removed/i);
  failing = false;
  await h.nodes["confirm-remove"].click();
  assert.equal(h.count("remove"), 2);
  assert.equal(h.nodes.dialog.open, false);
  assert.equal(h.nodes.image.hidden, true);
  assert.equal(h.nodes.image.src, undefined);
  assert.equal(h.nodes.placeholder.hidden, false);
  assert.equal(h.nodes.label.textContent, "Add profile photo");
  assert.deepEqual(h.revoked, ["blob:photo-1"]);
});

test("a pending write disables controls and rejects Escape or Cancel until it completes", async () => {
  const saving = deferred();
  const h = fixture({ save: () => saving.promise });
  await h.controller.initialize();
  await h.nodes.open.click();
  await h.select();
  const pending = h.nodes.save.click();
  assert.equal(h.nodes.dialog.attributes["aria-busy"], "true");
  for (const name of ["choose", "save", "cancel", "remove"]) assert.equal(h.nodes[name].disabled, true, name);
  await h.nodes.cancel.emit("click");
  let prevented = false;
  h.nodes.dialog.emit("cancel", { preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(h.nodes.dialog.open, true);
  await h.nodes.save.emit("click");
  assert.equal(h.count("save"), 1);
  const draftBlob = h.urls[1].blob;
  saving.resolve({ path: "new-profile-path", blob: draftBlob });
  await pending;
  assert.equal(h.nodes.dialog.open, false);
  assert.equal(h.nodes.image.src, "blob:photo-3");
});

test("preparation that finishes after Cancel or destroy cannot create or show a stale preview", async () => {
  for (const end of ["cancel", "destroy"]) {
    const prepared = deferred();
    const h = fixture({ prepare: () => prepared.promise });
    await h.controller.initialize();
    await h.nodes.open.click();
    const pending = h.select();
    assert.equal(h.nodes.choose.disabled, true);
    assert.equal(h.nodes.cancel.disabled, false);
    if (end === "cancel") await h.nodes.cancel.click();
    else h.controller.destroy();
    prepared.resolve({ photo: "late" });
    await pending;
    assert.equal(h.urls.length, 1, end);
    assert.equal(h.count("save"), 0);
    assert.equal(h.nodes.dialog.open, false);
    assert.equal(h.nodes.image.src, end === "cancel" ? "blob:photo-1" : undefined);
  }
});

test("a failed photo refresh retains the current image and offers a working Retry", async () => {
  let failing = false;
  const h = fixture({ load() { if (failing) throw new Error("offline"); return original; } });
  await h.controller.initialize();
  failing = true;
  await h.controller.refresh();
  assert.equal(h.nodes.image.src, "blob:photo-1");
  assert.equal(h.nodes.retry.hidden, false);
  assert.equal(h.nodes.retry.disabled, false);
  assert.match(h.nodes.status.textContent, /could not load/i);
  failing = false;
  await h.nodes.retry.click();
  assert.equal(h.nodes.retry.hidden, true);
  assert.equal(h.nodes.status.textContent, "");
  assert.equal(h.nodes.image.src, "blob:photo-2");
  assert.deepEqual(h.revoked, ["blob:photo-1"]);
});

test("destroy prevents late loads, removes listeners, and clears private image and account text", async () => {
  const loading = deferred();
  const h = fixture({ load: () => loading.promise });
  const pending = h.controller.initialize();
  h.controller.destroy();
  loading.resolve(original);
  await pending;
  await h.controller.refresh();
  await h.nodes.open.click();
  assert.equal(h.count("load"), 1);
  assert.equal(h.urls.length, 0);
  assert.equal(h.root.hidden, true);
  assert.equal(h.nodes.email.textContent, "");
  assert.equal(h.nodes.dialog.open, false);
  assert.equal(h.unsubscribed, 1);
  h.controller.destroy();
  assert.equal(h.unsubscribed, 1);
});

test("sign-out and account changes immediately destroy the previous account controller", async () => {
  for (const [event, session] of [["SIGNED_OUT", null], ["SIGNED_IN", { user: { ...user, id: "other-account" } }]]) {
    const h = fixture();
    await h.controller.initialize();
    await h.nodes.open.click();
    await h.select();
    h.auth(event, session);
    assert.equal(h.root.hidden, true);
    assert.equal(h.nodes.image.src, undefined);
    assert.equal(h.nodes.preview.src, undefined);
    assert.equal(h.nodes.email.textContent, "");
    assert.equal(h.nodes.dialog.open, false);
    assert.deepEqual(h.revoked.sort(), ["blob:photo-1", "blob:photo-2"]);
    assert.equal(h.unsubscribed, 1);
    await h.nodes.save.emit("click");
    assert.equal(h.count("save"), 0);
  }
});

test("USER_UPDATED defers auth reads until the callback returns and cancels queued work on destroy", async () => {
  const h = fixture();
  await h.controller.initialize();
  const result = h.auth("USER_UPDATED");
  assert.equal(result, undefined, "auth callback must stay synchronous");
  assert.equal(h.count("load"), 1, "do not call Auth while Supabase holds its callback lock");
  h.auth("USER_UPDATED");
  assert.equal(h.timers.size, 1, "coalesce pending account refreshes");
  await h.runTimers();
  assert.equal(h.count("load"), 2);
  h.auth("USER_UPDATED");
  h.controller.destroy();
  await h.runTimers();
  assert.equal(h.count("load"), 2);
});

test("visibility refreshes only visible Settings and never overwrites an open photo editor", async () => {
  const h = fixture();
  await h.controller.initialize();
  h.panel.hidden = true;
  h.document.emit("visibilitychange");
  await flush();
  assert.equal(h.count("load"), 1);
  h.panel.hidden = false;
  h.document.emit("visibilitychange");
  await flush();
  assert.equal(h.count("load"), 2);
  await h.nodes.open.click();
  await h.select();
  h.document.emit("visibilitychange");
  await h.controller.refresh();
  assert.equal(h.count("load"), 2);
  assert.equal(h.nodes.preview.src, "blob:photo-3");
});

test("coach preview, a missing account, or absent Settings does not initialize backend access", () => {
  for (const options of [{ preview: true }, { user: null }, { user: { email: "missing-id@example.com" } }, { missingRoot: true }]) {
    const h = fixture(options);
    assert.equal(h.controller, null);
    assert.equal(h.root.hidden, true);
    assert.equal(h.calls.length, 0);
  }
});

test("dashboard includes accessible profile controls and loads dependencies before the portal", () => {
  const settingsStart = html.indexOf('data-client-dashboard-panel="notifications"');
  const photoStart = html.indexOf('data-profile-photo');
  assert.ok(settingsStart >= 0 && photoStart > settingsStart);
  assert.match(html, /href="css\/profile-photo\.css\?v=/);
  const dependencies = ["profile-photo-store.js", "profile-photo-processor.js", "profile-photo.js", "client-portal.js"];
  const positions = dependencies.map((name) => html.indexOf(`src="js/${name}`));
  assert.ok(positions.every((position, index) => position >= 0 && (!index || position > positions[index - 1])));
  assert.match(html, /data-profile-dialog aria-labelledby="profile-photo-title" aria-describedby="profile-photo-help"/);
  assert.match(html, /data-profile-editor-status role="status" aria-live="polite"/);
  assert.match(html, /data-profile-status role="status" aria-live="polite"/);
  assert.match(html, /data-profile-file[^>]+accept="image\/jpeg,image\/png/);
  const styles = read("css/profile-photo.css");
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /min-height: 48px/);
});

test("portal setup replaces the previous controller and passes the signed-in account and preview flag", () => {
  const functionSource = portal.match(/function configureClientProfilePhoto\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(functionSource);
  const events = [];
  const client = {};
  const previous = { destroy() { events.push("destroy"); } };
  const next = { initialize() { events.push("initialize"); } };
  const context = {
    clientProfilePhotoController: previous, supabaseClient: client,
    activeDashboardUser: user, isCoachDashboardPreview: true,
    window: { FWB_PROFILE_PHOTO: { createController(settings) {
      events.push("create");
      assert.equal(settings.supabaseClient, client);
      assert.equal(settings.user, user);
      assert.equal(settings.isPreview, true);
      return next;
    } } }
  };
  vm.runInNewContext(`${functionSource}\nconfigureClientProfilePhoto();`, context);
  assert.deepEqual(events, ["destroy", "create", "initialize"]);
  assert.equal(context.clientProfilePhotoController, next);
  assert.match(portal, /if \(nextTab === "notifications"\) \{\s*void clientProfilePhotoController\?\.refresh\(\)/);
  assert.match(portal, /async function loadDashboard\(\)[\s\S]*?clientProfilePhotoController\?\.destroy\(\);[\s\S]*?configureClientProfilePhoto\(\);/);
  assert.match(portal, /async function handleSignOut\(\)[\s\S]*?clientProfilePhotoController\?\.destroy\(\);[\s\S]*?clientProfilePhotoController = null;[\s\S]*?auth\.signOut\(\)/);
});
