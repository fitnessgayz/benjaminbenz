const test = require("node:test");
const assert = require("node:assert/strict");
const { createStore, isValidProfilePhotoPath, MAX_PHOTO_BYTES } = require("../js/profile-photo-store.js");

const USER_ID = "11111111-2222-4333-8444-555555555555";
const OTHER_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const OLD_PATH = `${USER_ID}/profile/66666666-7777-4888-8999-000000000000.jpg`;
const NEXT_PATH = `${USER_ID}/profile/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jpg`;
const jpeg = () => new Blob([new Uint8Array([255, 216, 255, 224, 1, 2, 3, 255, 217])], { type: "image/jpeg" });
const clone = (value) => JSON.parse(JSON.stringify(value));
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function fixture(options = {}) {
  const calls = [];
  const blobs = new Map([[OLD_PATH, jpeg()], [NEXT_PATH, jpeg()]]);
  const state = { user: { id: USER_ID, user_metadata: { display_name: "Client", profile_photo_path: options.path ?? null } } };
  const context = { calls, blobs, state, commit(path) { state.user.user_metadata.profile_photo_path = path; } };
  const client = {
    auth: {
      async getUser() {
        calls.push({ action: "getUser" });
        if (options.getUser) {
          const custom = await options.getUser(context);
          if (custom !== undefined) return custom;
        }
        return { data: { user: clone(state.user) }, error: null };
      },
      async updateUser(attributes) {
        calls.push({ action: "metadata", attributes });
        if (options.updateUser) {
          const custom = await options.updateUser(attributes, context);
          if (custom !== undefined) return custom;
        }
        Object.assign(state.user.user_metadata, attributes.data);
        return { data: { user: clone(state.user) }, error: null };
      }
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, "progress-photos");
        return {
          async upload(path, blob, uploadOptions) {
            calls.push({ action: "upload", path, blob, options: uploadOptions });
            if (options.upload) {
              const custom = await options.upload(path, blob, context);
              if (custom !== undefined) return custom;
            }
            blobs.set(path, blob);
            return { data: { path }, error: null };
          },
          async download(path) {
            calls.push({ action: "download", path });
            if (options.download) {
              const custom = await options.download(path, context);
              if (custom !== undefined) return custom;
            }
            return { data: blobs.get(path), error: blobs.has(path) ? null : new Error("Not found") };
          },
          async remove(paths) {
            calls.push({ action: "remove", paths });
            if (options.remove) {
              const custom = await options.remove(paths, context);
              if (custom !== undefined) return custom;
            }
            paths.forEach((path) => blobs.delete(path));
            return { data: [], error: null };
          }
        };
      }
    }
  };
  return { ...context, client, store: createStore({ supabaseClient: client, userId: options.userId || USER_ID }) };
}

test("profile paths match the native contract and reject other accounts or nonprofile scopes", () => {
  assert.equal(isValidProfilePhotoPath(OLD_PATH, USER_ID), true);
  assert.equal(isValidProfilePhotoPath(OLD_PATH, USER_ID.toUpperCase()), true);
  for (const path of [
    OLD_PATH.replace(USER_ID, OTHER_ID), OLD_PATH.replace("profile/", ""), OLD_PATH.replace("profile/", "progress/"),
    `${OLD_PATH}?download=1`, `${OLD_PATH}/anything`, OLD_PATH.replace(".jpg", ".jpeg"), OLD_PATH.toUpperCase(),
    `${USER_ID}/profile/../photo.jpg`, `${USER_ID}/profile/not-a-uuid.jpg`, `/${OLD_PATH}`, "", null, {}
  ]) assert.equal(isValidProfilePhotoPath(path, USER_ID), false, String(path));
});

test("loads an account without a photo without querying Storage", async () => {
  const h = fixture();
  assert.deepEqual(await h.store.load(), { path: null, blob: null });
  assert.ok(h.calls.every((call) => call.action === "getUser"));
});

test("downloads the private photo and refreshes metadata changed on iOS", async () => {
  const h = fixture({ path: OLD_PATH });
  assert.deepEqual(await h.store.load(), { path: OLD_PATH, blob: h.blobs.get(OLD_PATH) });
  h.commit(NEXT_PATH);
  assert.deepEqual(await h.store.load(), { path: NEXT_PATH, blob: h.blobs.get(NEXT_PATH) });
  h.commit(null);
  assert.deepEqual(await h.store.load(), { path: null, blob: null });
});

test("uses immutable JPEG uploads, updates only photo metadata, and deletes the previous photo afterward", async () => {
  const h = fixture({ path: OLD_PATH });
  const blob = jpeg();
  const saved = await h.store.save(blob);
  assert.equal(saved.blob, blob);
  assert.equal(isValidProfilePhotoPath(saved.path, USER_ID), true);
  assert.notEqual(saved.path, OLD_PATH);
  assert.equal(h.state.user.user_metadata.display_name, "Client");
  assert.equal(h.state.user.user_metadata.profile_photo_path, saved.path);
  const writes = h.calls.filter((call) => ["upload", "metadata", "remove"].includes(call.action));
  assert.deepEqual(writes.map((call) => call.action), ["upload", "metadata", "remove"]);
  assert.deepEqual(writes[0].options, { contentType: "image/jpeg", cacheControl: "3600", upsert: false });
  assert.deepEqual(writes[1].attributes, { data: { profile_photo_path: saved.path } });
  assert.deepEqual(writes[2].paths, [OLD_PATH]);
  assert.equal(h.blobs.has(OLD_PATH), false);
  assert.equal(h.blobs.get(saved.path), blob);
});

test("remove clears the account metadata before deleting the private file", async () => {
  const h = fixture({ path: OLD_PATH });
  assert.equal(await h.store.remove(), undefined);
  assert.deepEqual(h.calls.filter((call) => ["metadata", "remove"].includes(call.action)), [
    { action: "metadata", attributes: { data: { profile_photo_path: null } } },
    { action: "remove", paths: [OLD_PATH] }
  ]);
  assert.equal(h.state.user.user_metadata.profile_photo_path, null);
});

test("invalid metadata cannot download or delete another account's or progress photo", async () => {
  for (const path of [OLD_PATH.replace(USER_ID, OTHER_ID), `${USER_ID}/progress.jpg`, 123]) {
    const h = fixture({ path });
    await assert.rejects(h.store.load(), { code: "INVALID_PATH" });
    await h.store.remove();
    assert.equal(h.calls.some((call) => ["download", "remove"].includes(call.action)), false);
    assert.equal(h.state.user.user_metadata.profile_photo_path, null);
  }
});

test("a new valid photo repairs invalid metadata without deleting the untrusted path", async () => {
  const h = fixture({ path: OLD_PATH.replace(USER_ID, OTHER_ID) });
  const saved = await h.store.save(jpeg());
  assert.equal(h.state.user.user_metadata.profile_photo_path, saved.path);
  assert.equal(h.calls.some((call) => call.action === "remove"), false);
});

test("a different authenticated account is rejected before Storage or metadata access", async () => {
  const h = fixture({ path: OLD_PATH });
  h.state.user.id = OTHER_ID;
  await assert.rejects(h.store.load(), { code: "ACCOUNT_CHANGED" });
  await assert.rejects(h.store.save(jpeg()), { code: "ACCOUNT_CHANGED" });
  await assert.rejects(h.store.remove(), { code: "ACCOUNT_CHANGED" });
  assert.ok(h.calls.every((call) => call.action === "getUser"));
});

test("an account change during download cannot return another user's photo to the UI", async () => {
  const h = fixture({ path: OLD_PATH, download(path, { state, blobs }) {
    state.user.id = OTHER_ID;
    return { data: blobs.get(path), error: null };
  } });
  await assert.rejects(h.store.load(), { code: "ACCOUNT_CHANGED" });
});

test("signing out after upload prevents updating metadata or deleting account photos", async () => {
  const h = fixture({ path: OLD_PATH, upload(path, blob, { state, blobs }) {
    blobs.set(path, blob);
    state.user = null;
    return { data: { path }, error: null };
  } });
  await assert.rejects(h.store.save(jpeg()), { code: "METADATA" });
  assert.equal(h.calls.some((call) => call.action === "metadata" || call.action === "remove"), false);
  assert.equal(h.blobs.has(OLD_PATH), true);
});

test("empty, oversized, or non-JPEG input is rejected before any network request", async () => {
  const h = fixture();
  for (const blob of [null, new Blob([], { type: "image/jpeg" }), new Blob(["png"], { type: "image/png" }), new Blob([new Uint8Array(MAX_PHOTO_BYTES + 1)], { type: "image/jpeg" })]) {
    await assert.rejects(h.store.save(blob), { code: "INVALID_PHOTO" });
  }
  assert.equal(h.calls.length, 0);
});

test("an upload rejection preserves the previous photo and metadata", async () => {
  const h = fixture({ path: OLD_PATH, upload: () => ({ data: null, error: new Error("Offline") }) });
  await assert.rejects(h.store.save(jpeg()), { code: "UPLOAD" });
  assert.equal(h.state.user.user_metadata.profile_photo_path, OLD_PATH);
  assert.equal(h.blobs.has(OLD_PATH), true);
  assert.equal(h.calls.some((call) => call.action === "metadata" || call.action === "remove"), false);
});

test("a committed update with a lost response is confirmed by a fresh read and retained", async () => {
  const h = fixture({ path: OLD_PATH, updateUser(attributes, { commit }) {
    commit(attributes.data.profile_photo_path);
    throw new Error("Response lost");
  } });
  const saved = await h.store.save(jpeg());
  assert.equal(h.state.user.user_metadata.profile_photo_path, saved.path);
  assert.equal(h.blobs.has(saved.path), true);
  assert.equal(h.blobs.has(OLD_PATH), false);
});

test("a rejected metadata update deletes only the confirmed unreferenced new upload", async () => {
  const h = fixture({ path: OLD_PATH, updateUser: () => ({ data: null, error: new Error("Rejected") }) });
  await assert.rejects(h.store.save(jpeg()), { code: "METADATA" });
  const uploaded = h.calls.find((call) => call.action === "upload").path;
  assert.deepEqual(h.calls.filter((call) => call.action === "remove").map((call) => call.paths), [[uploaded]]);
  assert.equal(h.blobs.has(uploaded), false);
  assert.equal(h.blobs.has(OLD_PATH), true);
  assert.equal(h.state.user.user_metadata.profile_photo_path, OLD_PATH);
});

test("an uncertain metadata update and failed readback retain the possibly referenced upload", async () => {
  let readbackUnavailable = false;
  const h = fixture({ path: OLD_PATH,
    updateUser(attributes, { commit }) {
      commit(attributes.data.profile_photo_path);
      readbackUnavailable = true;
      return { data: null, error: new Error("Response lost") };
    },
    getUser() { if (readbackUnavailable) throw new Error("Offline"); }
  });
  await assert.rejects(h.store.save(jpeg()), { code: "METADATA" });
  const uploaded = h.calls.find((call) => call.action === "upload").path;
  assert.equal(h.blobs.has(uploaded), true);
  assert.equal(h.blobs.has(OLD_PATH), true);
  assert.equal(h.calls.some((call) => call.action === "remove"), false);
});

test("a committed removal with a lost response completes after readback", async () => {
  const h = fixture({ path: OLD_PATH, updateUser(attributes, { commit }) {
    commit(attributes.data.profile_photo_path);
    return { data: null, error: new Error("Response lost") };
  } });
  await h.store.remove();
  assert.equal(h.state.user.user_metadata.profile_photo_path, null);
  assert.equal(h.blobs.has(OLD_PATH), false);
});

test("failed removal preserves the previous photo", async () => {
  const h = fixture({ path: OLD_PATH, updateUser: () => ({ data: null, error: new Error("Rejected") }) });
  await assert.rejects(h.store.remove(), { code: "METADATA" });
  assert.equal(h.state.user.user_metadata.profile_photo_path, OLD_PATH);
  assert.equal(h.blobs.has(OLD_PATH), true);
  assert.equal(h.calls.some((call) => call.action === "remove"), false);
});

test("cleanup failures do not discard a successfully saved or removed photo", async () => {
  const h = fixture({ path: OLD_PATH, remove: () => ({ data: null, error: new Error("Cleanup unavailable") }) });
  const saved = await h.store.save(jpeg());
  assert.equal(h.state.user.user_metadata.profile_photo_path, saved.path);
  await h.store.remove();
  assert.equal(h.state.user.user_metadata.profile_photo_path, null);
});

test("cleanup retains an old photo that another device has selected again", async () => {
  let updated = false;
  const h = fixture({ path: OLD_PATH,
    updateUser(attributes, context) {
      context.commit(attributes.data.profile_photo_path);
      updated = true;
      return { data: { user: clone(context.state.user) }, error: null };
    },
    getUser({ commit }) { if (updated) commit(OLD_PATH); }
  });
  await h.store.save(jpeg());
  assert.equal(h.calls.some((call) => call.action === "remove"), false);
  assert.equal(h.blobs.has(OLD_PATH), true);
});

test("a load that finishes after a save cannot overwrite the new photo", async () => {
  const gate = deferred();
  const started = deferred();
  const h = fixture({ path: OLD_PATH, async download(path, { blobs }) {
    started.resolve();
    const blob = blobs.get(path);
    await gate.promise;
    return { data: blob, error: null };
  } });
  const loading = h.store.load();
  const checked = assert.rejects(loading, { code: "SUPERSEDED" });
  await started.promise;
  const saved = await h.store.save(jpeg());
  gate.resolve();
  await checked;
  assert.equal(h.state.user.user_metadata.profile_photo_path, saved.path);
});

test("parallel mutations and loads are rejected while an upload is in progress", async () => {
  const gate = deferred();
  const started = deferred();
  const h = fixture({ async upload() { started.resolve(); await gate.promise; } });
  const saving = h.store.save(jpeg());
  await started.promise;
  await assert.rejects(h.store.save(jpeg()), { code: "BUSY" });
  await assert.rejects(h.store.remove(), { code: "BUSY" });
  await assert.rejects(h.store.load(), { code: "BUSY" });
  gate.resolve();
  await saving;
  await h.store.remove();
  assert.equal(h.state.user.user_metadata.profile_photo_path, null);
});

test("failed downloads and failed account verification leave the store usable for retry", async () => {
  let unavailable = true;
  const h = fixture({ path: OLD_PATH, download() {
    if (unavailable) return { data: null, error: new Error("Offline") };
  } });
  await assert.rejects(h.store.load(), { code: "DOWNLOAD" });
  unavailable = false;
  assert.equal((await h.store.load()).path, OLD_PATH);
  const signedOut = fixture({ getUser: () => ({ data: { user: null }, error: new Error("Expired") }) });
  await assert.rejects(signedOut.store.save(jpeg()), { code: "AUTH" });
  await assert.rejects(signedOut.store.remove(), { code: "AUTH" });
});

test("oversized or empty downloaded objects are not passed to the display", async () => {
  for (const blob of [new Blob([]), new Blob([new Uint8Array(6 * 1024 * 1024 + 1)])]) {
    const h = fixture({ path: OLD_PATH, download: () => ({ data: blob, error: null }) });
    await assert.rejects(h.store.load(), { code: "DOWNLOAD" });
  }
});
