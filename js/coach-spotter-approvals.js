(() => {
  const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

  function create({ root, client, userId, onAccessLost }) {
    const refreshButton = root.querySelector("[data-spotter-approvals-refresh]");
    const queueStatus = root.querySelector("[data-spotter-approvals-status]");
    const queue = root.querySelector("[data-spotter-approvals-list]");
    const dialog = root.querySelector("[data-spotter-approval-dialog]");
    const dialogTitle = dialog.querySelector("[data-spotter-approval-title]");
    const scope = dialog.querySelector("[data-spotter-approval-scope]");
    const reviewStatus = dialog.querySelector("[data-spotter-approval-status]");
    const preview = dialog.querySelector("[data-spotter-approval-image]");
    const closeButton = dialog.querySelector("[data-spotter-approval-close]");
    const approveButton = dialog.querySelector("[data-spotter-approval-approve]");
    const rejectButton = dialog.querySelector("[data-spotter-approval-reject]");
    const links = document.querySelectorAll("[data-spotter-approvals-access]");
    let authorized = false;
    let active = false;
    let cancelled = false;
    let queueVersion = 0;
    let previewVersion = 0;
    let previewUrl = null;
    let selected = null;
    let returnFocus = null;
    let saving = false;

    function setAccess(allowed) {
      authorized = allowed;
      links.forEach((link) => { link.hidden = !allowed; });
    }

    function releaseImage() {
      preview.hidden = true;
      preview.removeAttribute("src");
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    }

    function closeReview(restoreFocus = false) {
      const previous = returnFocus;
      previewVersion++;
      selected = null;
      returnFocus = null;
      saving = false;
      if (dialog.open) dialog.close();
      releaseImage();
      dialogTitle.textContent = "Review Spotter photo";
      scope.textContent = "";
      reviewStatus.textContent = "";
      if (restoreFocus && previous?.isConnected) previous.focus();
    }

    function clearQueue() {
      queueVersion++;
      closeReview();
      queue.replaceChildren();
      queueStatus.textContent = "";
    }

    function revokeAccess() {
      const hadAccess = authorized;
      cancelled = true;
      active = false;
      setAccess(false);
      clearQueue();
      if (hadAccess) onAccessLost?.();
    }

    async function checkAccess() {
      if (cancelled) return;
      try {
        const { data, error } = await client.rpc("spotter_can_review_photos");
        if (!cancelled) setAccess(!error && data === true);
      } catch {
        if (!cancelled) setAccess(false);
      }
    }

    function labels(row) {
      return {
        member: row.display_name || "Spotter member",
        photo: row.slot === 0 ? "Profile photo" : `Gallery photo ${row.slot}`,
        scope: row.slot === 0 ? "After approval, this photo can show in Discover." :
          "After approval, this photo is visible only to accepted connections."
      };
    }

    function renderRow(row) {
      const label = labels(row);
      const item = document.createElement("li");
      const detail = document.createElement("div");
      const member = document.createElement("strong");
      member.textContent = label.member;
      const description = document.createElement("p");
      description.textContent = label.photo;
      const submitted = new Date(row.submitted_at);
      if (!Number.isNaN(submitted.getTime())) {
        const timestamp = document.createElement("time");
        timestamp.dateTime = row.submitted_at;
        timestamp.textContent = dateFormatter.format(submitted);
        description.append(" · ", timestamp);
      }
      detail.append(member, description);
      const review = document.createElement("button");
      review.type = "button";
      review.className = "button button-ghost";
      review.textContent = "Review photo";
      review.setAttribute("aria-label", `Review ${label.photo.toLowerCase()} for ${label.member}`);
      review.addEventListener("click", () => openReview(row, review));
      item.append(detail, review);
      return item;
    }

    async function refresh(message = "") {
      if (!active || !authorized) return;
      const version = ++queueVersion;
      refreshButton.disabled = true;
      queueStatus.textContent = message || "Loading pending photos…";
      try {
        const { data, error } = await client.rpc("spotter_list_pending_photo_reviews");
        if (version !== queueVersion) return;
        if (error?.code === "42501") return revokeAccess();
        if (error || !Array.isArray(data)) throw error || new Error();
        queue.replaceChildren(...data.map(renderRow));
        const summary = data.length ? `${data.length} ${data.length === 1 ? "photo" : "photos"} awaiting review.` : "No Spotter photos awaiting review.";
        queueStatus.textContent = [message, summary].filter(Boolean).join(" ");
      } catch {
        if (version !== queueVersion) return;
        queue.replaceChildren();
        queueStatus.textContent = "Couldn’t load pending photos. Refresh to try again.";
      } finally {
        if (version === queueVersion) refreshButton.disabled = false;
      }
    }

    async function openReview(row, button) {
      if (!active || !authorized || dialog.open) return;
      const version = ++previewVersion;
      selected = row;
      returnFocus = button;
      const label = labels(row);
      dialogTitle.textContent = `${label.member} · ${label.photo}`;
      scope.textContent = label.scope;
      reviewStatus.textContent = "Loading private photo…";
      approveButton.disabled = true;
      rejectButton.disabled = true;
      closeButton.disabled = false;
      dialog.showModal();
      closeButton.focus();

      try {
        const { data, error } = await client.storage.from("spotter-profile-photos").download(row.path);
        if (version !== previewVersion) return;
        if (error || !data?.size) throw error || new Error();
        previewUrl = URL.createObjectURL(data);
        preview.src = previewUrl;
        await preview.decode();
        if (version !== previewVersion) return;
        preview.hidden = false;
        reviewStatus.textContent = "";
        approveButton.disabled = false;
        rejectButton.disabled = false;
      } catch {
        if (version !== previewVersion) return;
        releaseImage();
        reviewStatus.textContent = "Couldn’t open this photo. Close and refresh the queue to try again.";
      }
    }

    async function decide(approve) {
      if (!authorized || !active || !selected || saving || preview.hidden) return;
      const version = previewVersion;
      saving = true;
      approveButton.disabled = true;
      rejectButton.disabled = true;
      closeButton.disabled = true;
      reviewStatus.textContent = "Saving your decision…";
      try {
        const { data, error } = await client.rpc("spotter_review_photo", {
          p_upload_id: selected.upload_id,
          p_approve: approve
        });
        if (version !== previewVersion) return;
        if (error?.code === "42501") return revokeAccess();
        if (error || typeof data !== "boolean") throw error || new Error();
        closeReview();
        root.querySelector("h2")?.focus();
        await refresh(data ? (approve ? "Photo approved." : "Photo rejected.") : "This photo has already been reviewed or replaced.");
      } catch {
        if (version !== previewVersion) return;
        saving = false;
        approveButton.disabled = false;
        rejectButton.disabled = false;
        closeButton.disabled = false;
        reviewStatus.textContent = "Couldn’t save your decision. Try again.";
      }
    }

    function setActive(nextActive) {
      const next = authorized && nextActive;
      if (next === active) return;
      active = next;
      if (active) refresh();
      else clearQueue();
    }

    function restorePage(event) {
      if (event.persisted) refresh();
    }

    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (session?.user?.id && session.user.id !== userId)) revokeAccess();
    });
    window.addEventListener("pagehide", clearQueue);
    window.addEventListener("pageshow", restorePage);
    refreshButton.addEventListener("click", () => refresh());
    closeButton.addEventListener("click", () => closeReview(true));
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      if (!saving) closeReview(true);
    });
    approveButton.addEventListener("click", () => decide(true));
    rejectButton.addEventListener("click", () => decide(false));

    return {
      get authorized() { return authorized; },
      checkAccess,
      setActive,
      destroy() {
        subscription.unsubscribe();
        window.removeEventListener("pagehide", clearQueue);
        window.removeEventListener("pageshow", restorePage);
        revokeAccess();
      }
    };
  }

  window.FWBSpotterApprovals = { create };
})();
