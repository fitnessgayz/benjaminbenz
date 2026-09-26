(function (global, factory) {
  "use strict";
  const api = factory(global);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (global) global.FWB_PROFILE_PHOTO_STORE = api;
})(typeof window !== "undefined" ? window : globalThis, function (global) {
  "use strict";

  const BUCKET = "progress-photos";
  const METADATA_KEY = "profile_photo_path";
  const MAX_PHOTO_BYTES = 1024 * 1024;
  const MAX_DOWNLOAD_BYTES = 6 * 1024 * 1024;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  function photoError(code, message, cause) {
    const error = new Error(message);
    error.name = "ProfilePhotoError";
    error.code = code;
    if (cause) error.cause = cause;
    return error;
  }

  function accountID(value) {
    return typeof value === "string" ? value.toLowerCase() : "";
  }

  function isValidProfilePhotoPath(path, userId) {
    if (typeof path !== "string") return false;
    const id = accountID(userId);
    const parts = path.split("/");
    return UUID.test(id) && parts.length === 3 && parts[0] === id && parts[1] === "profile"
      && parts[2].endsWith(".jpg") && UUID.test(parts[2].slice(0, -4));
  }

  function newPhotoID() {
    if (typeof global.crypto?.randomUUID === "function") return global.crypto.randomUUID().toLowerCase();
    if (typeof global.crypto?.getRandomValues !== "function") {
      throw photoError("UNAVAILABLE", "Profile photos are unavailable in this browser.");
    }
    const bytes = global.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function createStore({ supabaseClient: client, userId } = {}) {
    const id = accountID(userId);
    if (!UUID.test(id) || !client?.auth?.getUser || !client?.auth?.updateUser || !client?.storage?.from) {
      throw photoError("UNAVAILABLE", "Sign in to manage your profile photo.");
    }
    let mutationPending = false;
    let generation = 0;

    function record(user) {
      if (!user || accountID(user.id) !== id) {
        throw photoError("ACCOUNT_CHANGED", "Your account changed. Sign in again to manage your photo.");
      }
      // This user-editable metadata only identifies a photo. Auth and Storage
      // policies authorize access using the authenticated account ID.
      return { path: user.user_metadata?.[METADATA_KEY] ?? null };
    }

    async function verifiedProfile() {
      let result;
      try { result = await client.auth.getUser(); }
      catch (cause) { throw photoError("AUTH", "Your account could not be verified. Try again.", cause); }
      if (result?.error) throw photoError("AUTH", "Your account could not be verified. Try again.", result.error);
      return record(result?.data?.user);
    }

    async function storageRequest(action, path, blob) {
      if (!isValidProfilePhotoPath(path, id)) throw photoError("INVALID_PATH", "Your profile photo could not be loaded.");
      await verifiedProfile();
      let result;
      try {
        const bucket = client.storage.from(BUCKET);
        if (action === "upload") result = await bucket.upload(path, blob, { contentType: "image/jpeg", cacheControl: "3600", upsert: false });
        else if (action === "download") result = await bucket.download(path);
        else result = await bucket.remove([path]);
      } catch (cause) { throw photoError(action.toUpperCase(), "Your profile photo could not be updated. Try again.", cause); }
      if (result?.error) throw photoError(action.toUpperCase(), "Your profile photo could not be updated. Try again.", result.error);
      return result?.data;
    }

    async function cleanUp(path) {
      if (!isValidProfilePhotoPath(path, id)) return;
      try {
        // Another device may have changed the photo since this operation began.
        // Never delete an object currently referenced by the account.
        const current = await verifiedProfile();
        if (current.path === path) return;
        await storageRequest("remove", path);
      } catch (_error) {
        // Best-effort cleanup must not undo a committed profile change.
      }
    }

    async function updateMetadata(desiredPath, uploadedPath) {
      try {
        await verifiedProfile();
        const result = await client.auth.updateUser({ data: { [METADATA_KEY]: desiredPath } });
        if (result?.error) throw result.error;
        const saved = record(result?.data?.user);
        if (saved.path !== desiredPath) throw photoError("NOT_CONFIRMED", "Your profile photo change was not confirmed.");
      } catch (cause) {
        // The request can commit even when its response is lost. Read back
        // before treating it as a failure or deleting the newly uploaded file.
        let confirmed;
        try { confirmed = await verifiedProfile(); }
        catch (_error) { throw photoError("METADATA", "Your profile photo change could not be confirmed. Try again.", cause); }
        if (confirmed.path === desiredPath) return;
        if (uploadedPath) await cleanUp(uploadedPath);
        throw photoError("METADATA", "Your profile photo could not be saved. Try again.", cause);
      }
    }

    function beginMutation() {
      if (mutationPending) throw photoError("BUSY", "Your profile photo is still saving.");
      mutationPending = true;
      generation += 1;
    }

    async function load() {
      if (mutationPending) throw photoError("BUSY", "Your profile photo is still saving.");
      const operation = ++generation;
      const profile = await verifiedProfile();
      let blob = null;
      if (profile.path !== null) {
        blob = await storageRequest("download", profile.path);
        if (!blob || !Number.isFinite(blob.size) || blob.size <= 0 || blob.size > MAX_DOWNLOAD_BYTES) {
          throw photoError("DOWNLOAD", "Your profile photo could not be loaded.");
        }
      }
      await verifiedProfile();
      if (operation !== generation) throw photoError("SUPERSEDED", "A newer profile photo change is available.");
      return { path: profile.path, blob };
    }

    async function save(jpegBlob) {
      if (!jpegBlob || jpegBlob.type !== "image/jpeg" || !Number.isFinite(jpegBlob.size)
        || jpegBlob.size <= 0 || jpegBlob.size > MAX_PHOTO_BYTES || typeof jpegBlob.arrayBuffer !== "function") {
        throw photoError("INVALID_PHOTO", "Choose a photo that can be prepared as a JPEG under 1 MB.");
      }
      beginMutation();
      try {
        const previous = await verifiedProfile();
        const path = `${id}/profile/${newPhotoID()}.jpg`;
        await storageRequest("upload", path, jpegBlob);
        await updateMetadata(path, path);
        await cleanUp(previous.path);
        return { path, blob: jpegBlob };
      } finally { mutationPending = false; }
    }

    async function remove() {
      beginMutation();
      try {
        const previous = await verifiedProfile();
        await updateMetadata(null, null);
        await cleanUp(previous.path);
      } finally { mutationPending = false; }
    }

    return { load, save, remove };
  }

  return { createStore, isValidProfilePhotoPath, BUCKET, METADATA_KEY, MAX_PHOTO_BYTES };
});
