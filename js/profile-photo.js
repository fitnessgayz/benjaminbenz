(function (global) {
  "use strict";

  function createController(options) {
    const document = global.document;
    const root = options.root || document.querySelector("[data-profile-photo]");
    if (!root || options.isPreview || !options.user?.id) return null;
    const store = global.FWB_PROFILE_PHOTO_STORE.createStore({ supabaseClient: options.supabaseClient, userId: options.user.id });
    const nodes = Object.fromEntries([
      "open", "email", "label", "image", "placeholder", "status", "retry", "dialog", "preview",
      "preview-placeholder", "file", "choose", "editor-status", "confirm", "keep", "confirm-remove",
      "editor-actions", "cancel", "save", "remove"
    ].map((name) => [name, root.querySelector(`[data-profile-${name}]`)]));
    const badgeImages = Array.from(document.querySelectorAll?.("[data-profile-badge-image]") || []);
    const badgePlaceholders = Array.from(document.querySelectorAll?.("[data-profile-badge-placeholder]") || []);
    let destroyed = false;
    let loading = false;
    let writing = false;
    let processing = false;
    let confirming = false;
    let generation = 0;
    let selection = 0;
    let current = { path: null, url: "" };
    let draft = null;
    let draftURL = "";
    let authTimer = null;
    let subscription = null;
    const listeners = [];

    function on(node, event, handler) {
      node.addEventListener(event, handler);
      listeners.push(() => node.removeEventListener(event, handler));
    }
    function picture(node, placeholder, url) {
      node.hidden = !url;
      if (url) node.src = url;
      else node.removeAttribute("src");
      placeholder.hidden = Boolean(url);
    }
    function badgePictures(url) {
      badgeImages.forEach((image) => {
        image.hidden = !url;
        if (url) image.src = url;
        else image.removeAttribute("src");
      });
      badgePlaceholders.forEach((placeholder) => { placeholder.hidden = Boolean(url); });
    }
    function render() {
      if (destroyed) return;
      root.setAttribute("aria-busy", String(loading || writing));
      nodes.dialog.setAttribute("aria-busy", String(writing || processing));
      nodes.open.disabled = loading || writing;
      nodes.label.textContent = current.path ? "Change profile photo" : "Add profile photo";
      picture(nodes.image, nodes.placeholder, current.url);
      picture(nodes.preview, nodes["preview-placeholder"], draftURL || current.url);
      badgePictures(current.url);
      nodes.choose.disabled = writing || processing || confirming;
      nodes.save.disabled = writing || processing || !draft;
      nodes.save.textContent = writing ? "Saving…" : "Save photo";
      nodes.cancel.disabled = writing;
      nodes.remove.hidden = !current.path || confirming;
      nodes.remove.disabled = writing || processing;
      nodes.confirm.hidden = !confirming;
      nodes["editor-actions"].hidden = confirming;
      nodes.keep.disabled = writing;
      nodes["confirm-remove"].disabled = writing;
      nodes["confirm-remove"].textContent = writing ? "Removing…" : "Remove photo";
      nodes.retry.disabled = loading || writing;
    }
    function discardDraft() {
      selection++;
      if (draftURL) global.URL.revokeObjectURL(draftURL);
      draftURL = "";
      draft = null;
      processing = false;
      confirming = false;
      nodes.file.value = "";
    }
    function replaceCurrent(result) {
      const url = result.blob ? global.URL.createObjectURL(result.blob) : "";
      if (current.url) global.URL.revokeObjectURL(current.url);
      current = { path: result.path, url };
    }
    async function refresh() {
      if (destroyed || loading || writing || nodes.dialog.open) return;
      const request = ++generation;
      loading = true;
      nodes.retry.hidden = true;
      nodes.status.textContent = "Loading profile photo…";
      render();
      try {
        const result = await store.load();
        if (destroyed || request !== generation) return;
        replaceCurrent(result);
        nodes.status.textContent = "";
      } catch (_error) {
        if (destroyed || request !== generation) return;
        nodes.status.textContent = "Could not load your profile photo. Check your connection and try again.";
        nodes.retry.hidden = false;
      } finally {
        if (!destroyed && request === generation) { loading = false; render(); }
      }
    }
    function open() {
      if (destroyed || loading || writing) return;
      discardDraft();
      nodes["editor-status"].textContent = "";
      render();
      nodes.dialog.showModal();
      nodes.choose.focus();
    }
    function close() {
      if (writing) return;
      nodes.dialog.close();
      discardDraft();
      render();
    }
    async function choose() {
      const file = nodes.file.files?.[0];
      if (!file || destroyed || writing) return;
      const request = ++selection;
      processing = true;
      nodes["editor-status"].textContent = "Preparing photo…";
      render();
      try {
        const blob = await global.FWB_PROFILE_PHOTO_PROCESSOR.prepare(file);
        if (destroyed || request !== selection) return;
        if (draftURL) global.URL.revokeObjectURL(draftURL);
        draftURL = global.URL.createObjectURL(blob);
        draft = blob;
        nodes["editor-status"].textContent = "Ready to save.";
      } catch (error) {
        if (destroyed || request !== selection) return;
        nodes["editor-status"].textContent = error.message || "Could not open this photo. Try a JPEG or PNG image.";
      } finally {
        if (!destroyed && request === selection) { processing = false; nodes.file.value = ""; render(); }
      }
    }
    async function write(remove) {
      if (destroyed || writing || processing || (!remove && !draft)) return;
      writing = true;
      generation++;
      nodes["editor-status"].textContent = remove ? "Removing photo…" : "Saving photo…";
      render();
      try {
        const result = remove ? (await store.remove(), { path: null, blob: null }) : await store.save(draft);
        if (destroyed) return;
        replaceCurrent(result);
        nodes.retry.hidden = true;
        nodes.status.textContent = remove ? "Profile photo removed." : "Profile photo saved.";
        writing = false;
        close();
      } catch (_error) {
        if (!destroyed) nodes["editor-status"].textContent = remove
          ? "Could not confirm your photo was removed. Check your connection and try again."
          : "Could not confirm your photo was saved. Check your connection and try again.";
      } finally { writing = false; render(); }
    }
    function destroy() {
      if (destroyed) return;
      destroyed = true;
      generation++;
      discardDraft();
      if (current.url) global.URL.revokeObjectURL(current.url);
      current = { path: null, url: "" };
      picture(nodes.image, nodes.placeholder, "");
      picture(nodes.preview, nodes["preview-placeholder"], "");
      badgePictures("");
      nodes.email.textContent = "";
      root.hidden = true;
      nodes.dialog.close();
      listeners.forEach((remove) => remove());
      global.clearTimeout(authTimer);
      subscription?.unsubscribe();
    }

    nodes.email.textContent = options.user.email || "Your account";
    root.hidden = false;
    on(nodes.open, "click", open);
    on(nodes.retry, "click", refresh);
    on(nodes.choose, "click", () => nodes.file.click());
    on(nodes.file, "change", choose);
    on(nodes.cancel, "click", close);
    on(nodes.dialog, "cancel", (event) => { event.preventDefault(); close(); });
    on(nodes.dialog, "close", () => { discardDraft(); render(); });
    on(nodes.save, "click", () => write(false));
    on(nodes.remove, "click", () => { confirming = true; render(); nodes.keep.focus(); });
    on(nodes.keep, "click", () => { confirming = false; render(); nodes.remove.focus(); });
    on(nodes["confirm-remove"], "click", () => write(true));
    on(document, "visibilitychange", () => {
      if (document.visibilityState === "visible" && !root.closest("[data-client-dashboard-panel]")?.hidden) void refresh();
    });
    // Auth callbacks stay synchronous: starting an Auth request inside them can deadlock the SDK.
    subscription = options.supabaseClient.auth.onAuthStateChange?.((event, session) => {
      if (event === "SIGNED_OUT" || (session?.user && session.user.id !== options.user.id)) { destroy(); return; }
      if (event === "USER_UPDATED" && !writing) {
        global.clearTimeout(authTimer);
        authTimer = global.setTimeout(() => { void refresh(); }, 0);
      }
    })?.data?.subscription;
    render();
    return { initialize: refresh, refresh, destroy };
  }

  global.FWB_PROFILE_PHOTO = { createController };
})(window);
