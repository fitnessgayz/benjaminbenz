(() => {
  const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
  const photoBucket = "spotter-profile-photos";
  const screeningLabels = {
    flagged: "Possible explicit content",
    uncertain: "Needs a closer look",
    no_signal: "No explicit signal detected"
  };
  const screeningPriority = { flagged: 0, uncertain: 1 };

  function button(label, style) {
    const element = document.createElement("button");
    element.type = "button";
    element.className = style;
    element.textContent = label;
    return element;
  }

  function photoLabels(row) {
    return {
      member: row.display_name || "Spotter member",
      photo: row.slot === 0 ? "Profile photo" : `Gallery photo ${row.slot}`,
      scope: row.slot === 0 ? "After approval, this photo can show in Discover." :
        "After approval, this photo is visible only to accepted connections."
    };
  }

  function create({ root, client, userId, onAccessLost }) {
    const refreshButton = root.querySelector("[data-spotter-approvals-refresh]");
    const approveUnflaggedButton = root.querySelector("[data-spotter-approve-unflagged]");
    const screenButton = root.querySelector("[data-spotter-screen-photos]");
    const screeningStatus = root.querySelector("[data-spotter-screening-status]");
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
    const cards = new Map();
    let authorized = false;
    let active = false;
    let cancelled = false;
    let queueVersion = 0;
    let screeningVersion = 0;
    let screening = false;
    let completedScan = false;
    let bulkApproval = null;
    let queueRows = [];
    let selected = null;

    const observer = typeof IntersectionObserver === "function" ? new IntersectionObserver((items) => {
      for (const item of items) {
        if (!item.isIntersecting) continue;
        observer.unobserve(item.target);
        const card = cards.get(item.target.dataset.uploadId);
        if (card) loadPhoto(card);
      }
    }, { rootMargin: "120px" }) : null;

    function setAccess(allowed) {
      authorized = allowed;
      links.forEach((link) => { link.hidden = !allowed; });
    }

    function closeReview(restoreFocus = false) {
      const previous = selected;
      selected = null;
      if (dialog.open) dialog.close();
      preview.hidden = true;
      preview.removeAttribute("src");
      reviewStatus.textContent = "";
      if (restoreFocus && previous?.thumb.isConnected) previous.thumb.focus();
    }

    function removeCard(card, moveFocus = false) {
      const nextCard = card.item.nextElementSibling || card.item.previousElementSibling;
      const hadFocus = selected === card || card.item.contains(document.activeElement);
      if (selected === card) closeReview();
      observer?.unobserve(card.item);
      cards.delete(card.row.upload_id);
      card.image.removeAttribute("src");
      if (card.url) URL.revokeObjectURL(card.url);
      card.item.remove();
      if (moveFocus && hadFocus) {
        const next = nextCard?.querySelector(".coach-approval-thumb:not(:disabled)") || root.querySelector("h2");
        next?.focus();
      }
    }

    function clearQueue() {
      queueVersion++;
      screeningVersion++;
      queueRows = [];
      screening = false;
      completedScan = false;
      bulkApproval = null;
      screenButton.disabled = true;
      approveUnflaggedButton.hidden = true;
      approveUnflaggedButton.disabled = true;
      screeningStatus.textContent = "";
      closeReview();
      for (const card of cards.values()) removeCard(card);
      queueStatus.textContent = "";
      refreshButton.disabled = false;
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

    function updateActions(card) {
      const disabled = card.state !== "ready" || card.saving || Boolean(bulkApproval);
      card.approve.disabled = disabled;
      card.reject.disabled = disabled;
      if (selected === card) {
        approveButton.disabled = disabled;
        rejectButton.disabled = disabled;
        closeButton.disabled = card.saving;
      }
    }

    function renderCard(row) {
      const label = photoLabels(row);
      const item = document.createElement("li");
      item.className = "coach-approval-card";
      item.dataset.uploadId = row.upload_id;
      const thumb = button("", "coach-approval-thumb");
      thumb.disabled = true;
      const image = document.createElement("img");
      image.alt = "";
      image.hidden = true;
      const placeholder = document.createElement("span");
      placeholder.textContent = "Loading photo…";
      thumb.append(image, placeholder);

      const detail = document.createElement("div");
      detail.className = "coach-approval-card-detail";
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
      const signal = document.createElement("p");
      signal.className = "coach-approval-signal";
      signal.hidden = true;
      detail.append(member, description, signal);

      const actions = document.createElement("div");
      actions.className = "coach-approval-card-actions";
      const approve = button("Approve", "button button-dark");
      const reject = button("Reject", "button button-ghost");
      approve.setAttribute("aria-label", `Approve ${label.photo.toLowerCase()} for ${label.member}`);
      reject.setAttribute("aria-label", `Reject ${label.photo.toLowerCase()} for ${label.member}`);
      actions.append(reject, approve);
      item.append(thumb, detail, actions);

      const card = {
        row, label, item, thumb, image, placeholder, approve, reject, signal,
        state: "queued", url: null, loading: null, saving: false, result: null
      };
      updateActions(card);
      thumb.addEventListener("click", () => {
        if (card.state === "failed") loadPhoto(card);
        else openReview(card);
      });
      approve.addEventListener("click", () => decide(card, true));
      reject.addEventListener("click", () => decide(card, false));
      return card;
    }

    function loadPhoto(card) {
      if (card.loading) return card.loading;
      if (!active || !authorized || !["queued", "failed"].includes(card.state)) return;
      card.loading = fetchPhoto(card).finally(() => { card.loading = null; });
      return card.loading;
    }

    async function fetchPhoto(card) {
      card.state = "loading";
      card.thumb.disabled = true;
      card.placeholder.textContent = "Loading photo…";
      card.thumb.removeAttribute("aria-label");
      try {
        const { data, error } = await client.storage.from(photoBucket).download(card.row.path);
        if (cards.get(card.row.upload_id) !== card) return;
        if (error || !data?.size) throw error || new Error();
        card.url = URL.createObjectURL(data);
        card.image.src = card.url;
        await card.image.decode();
        if (cards.get(card.row.upload_id) !== card) return;
        card.state = "ready";
        card.image.hidden = false;
        card.placeholder.hidden = true;
        card.thumb.setAttribute("aria-label", `Enlarge ${card.label.photo.toLowerCase()} for ${card.label.member}`);
        card.thumb.disabled = false;
        updateActions(card);
      } catch {
        if (cards.get(card.row.upload_id) !== card) return;
        card.image.removeAttribute("src");
        if (card.url) URL.revokeObjectURL(card.url);
        card.url = null;
        card.state = "failed";
        card.placeholder.textContent = "Retry photo";
        card.thumb.setAttribute("aria-label", `Retry ${card.label.photo.toLowerCase()} for ${card.label.member}`);
        card.thumb.disabled = false;
      }
    }

    function unflaggedCards() {
      if (!completedScan) return [];
      return Array.from(cards.values()).filter((card) =>
        card.result === "no_signal" && card.state === "ready" && !card.saving
      );
    }

    function updateToolbar() {
      screenButton.disabled = screening || Boolean(bulkApproval) ||
        typeof window.FWBSpotterScreening?.screen !== "function" ||
        !Array.from(cards.values()).some((card) => !card.result);
      const count = unflaggedCards().length;
      approveUnflaggedButton.hidden = !bulkApproval && !count;
      approveUnflaggedButton.disabled = !count || screening || Boolean(bulkApproval) ||
        refreshButton.disabled || Array.from(cards.values()).some((card) => card.saving);
      approveUnflaggedButton.textContent = bulkApproval ? `Approving (${bulkApproval.count})…` :
        `Approve all unflagged (${count})`;
    }

    function renderQueue(rows) {
      const focused = queue.contains(document.activeElement) ? document.activeElement : null;
      const pending = new Set(rows.map((row) => row.upload_id));
      for (const card of cards.values()) {
        if (!pending.has(card.row.upload_id)) removeCard(card, true);
      }
      const priority = (row) => screeningPriority[cards.get(row.upload_id)?.result] ?? 2;
      [...rows].sort((first, second) => priority(first) - priority(second)).forEach((row, index) => {
        let card = cards.get(row.upload_id);
        if (!card) {
          card = renderCard(row);
          cards.set(row.upload_id, card);
          queue.insertBefore(card.item, queue.children[index] || null);
          if (observer) observer.observe(card.item);
          else loadPhoto(card);
        } else if (queue.children[index] !== card.item) {
          queue.insertBefore(card.item, queue.children[index] || null);
        }
      });
      if (focused?.isConnected && focused !== document.activeElement) focused.focus({ preventScroll: true });
      updateToolbar();
    }

    async function screenPhotos() {
      const engine = window.FWBSpotterScreening;
      if (!authorized || !active || screening || bulkApproval || !engine) return;
      const version = ++screeningVersion;
      const toScreen = Array.from(cards.values()).filter((card) => !card.result);
      if (!toScreen.length) return;
      screening = true;
      updateToolbar();
      screeningStatus.textContent = "Screening pending photos…";
      let screened = 0;
      let needsReview = 0;
      let unavailable = 0;
      try {
        for (const card of toScreen) {
          if (version !== screeningVersion) return;
          if (cards.get(card.row.upload_id) !== card || card.saving) continue;
          await loadPhoto(card);
          if (version !== screeningVersion) return;
          if (cards.get(card.row.upload_id) !== card || card.saving) continue;
          if (card.state !== "ready") {
            unavailable++;
            continue;
          }
          let result;
          try {
            result = await engine.screen(card.image);
          } catch (error) {
            if (version !== screeningVersion) return;
            if (cards.get(card.row.upload_id) !== card) continue;
            throw error;
          }
          if (version !== screeningVersion) return;
          if (cards.get(card.row.upload_id) !== card) continue;
          if (!Object.hasOwn(screeningLabels, result)) {
            unavailable++;
            continue;
          }
          card.result = result;
          card.signal.dataset.result = result;
          card.signal.textContent = screeningLabels[result];
          card.signal.hidden = false;
          screened++;
          if (result !== "no_signal") needsReview++;
        }
        const count = `${screened} ${screened === 1 ? "photo" : "photos"} screened.`;
        const followUp = needsReview ? ` ${needsReview} flagged for a closer look and shown first.` : "";
        const retry = unavailable ? ` ${unavailable} couldn’t be screened.` : "";
        completedScan = true;
        screeningStatus.textContent = count + followUp + retry;
      } catch {
        if (version !== screeningVersion) return;
        screeningStatus.textContent = "Couldn’t finish screening. Try again or review the photos manually.";
      } finally {
        if (version === screeningVersion) {
          screening = false;
          renderQueue(queueRows);
        }
      }
    }

    async function refresh(message = "") {
      if (!active || !authorized || bulkApproval) return;
      const version = ++queueVersion;
      refreshButton.disabled = true;
      updateToolbar();
      queueStatus.textContent = message || "Loading pending photos…";
      try {
        const { data, error } = await client.rpc("spotter_list_pending_photo_reviews");
        if (version !== queueVersion) return;
        if (error?.code === "42501") return revokeAccess();
        if (error || !Array.isArray(data)) throw error || new Error();
        queueRows = data;
        renderQueue(queueRows);
        const summary = !data.length ? "No Spotter photos awaiting review." :
          data.length === 30 ? "Showing the oldest 30 pending photos." :
          `${data.length} ${data.length === 1 ? "photo" : "photos"} awaiting review.`;
        queueStatus.textContent = [message, summary].filter(Boolean).join(" ");
      } catch {
        if (version !== queueVersion) return;
        queueStatus.textContent = [message, "Couldn’t refresh pending photos. Try again."].filter(Boolean).join(" ");
      } finally {
        if (version === queueVersion) {
          refreshButton.disabled = false;
          updateToolbar();
        }
      }
    }

    function openReview(card) {
      if (!active || !authorized || dialog.open || card.state !== "ready") return;
      selected = card;
      dialogTitle.textContent = `${card.label.member} · ${card.label.photo}`;
      scope.textContent = card.label.scope;
      preview.alt = `${card.label.photo} submitted by ${card.label.member}`;
      preview.src = card.url;
      preview.hidden = false;
      updateActions(card);
      dialog.showModal();
      closeButton.focus();
    }

    async function saveDecision(card, approve) {
      const { data, error } = await client.rpc("spotter_review_photo", {
        p_upload_id: card.row.upload_id,
        p_approve: approve
      });
      if (error || typeof data !== "boolean") throw error || new Error("Unexpected photo review response");
      return data;
    }

    function forgetDecision(card) {
      queueRows = queueRows.filter((row) => row.upload_id !== card.row.upload_id);
      if (cards.get(card.row.upload_id) === card) removeCard(card, true);
    }

    async function decide(card, approve) {
      if (!authorized || !active || bulkApproval || !card || card.saving || card.state !== "ready") return;
      const focusWasInCard = card.item.contains(document.activeElement);
      card.saving = true;
      updateActions(card);
      updateToolbar();
      if (selected === card) reviewStatus.textContent = "Saving your decision…";
      try {
        const saved = await saveDecision(card, approve);
        if (!active || !authorized) return;
        if (focusWasInCard && document.activeElement === document.body) card.thumb.focus();
        forgetDecision(card);
        await refresh(saved ? (approve ? "Photo approved." : "Photo rejected.") : "This photo has already been reviewed or replaced.");
      } catch (error) {
        if (!active || !authorized) return;
        if (error?.code === "42501") return revokeAccess();
        if (cards.get(card.row.upload_id) !== card) return;
        card.saving = false;
        updateActions(card);
        updateToolbar();
        const status = selected === card ? reviewStatus : queueStatus;
        status.textContent = "Couldn’t save your decision. Try again.";
      }
    }

    async function approveUnflagged() {
      if (!active || !authorized || approveUnflaggedButton.disabled) return;
      const photos = unflaggedCards();
      if (!photos.length) return;

      const startedFromButton = document.activeElement === approveUnflaggedButton;
      const batch = { count: photos.length };
      bulkApproval = batch;
      refreshButton.disabled = true;
      for (const card of cards.values()) updateActions(card);
      updateToolbar();
      queueStatus.textContent = `Approving ${photos.length} unflagged ${photos.length === 1 ? "photo" : "photos"}…`;
      let approved = 0;
      let alreadyReviewed = 0;
      let unconfirmed = 0;
      for (const card of photos) {
        if (bulkApproval !== batch) return;
        try {
          const saved = await saveDecision(card, true);
          if (bulkApproval !== batch) return;
          if (saved) approved++;
          else alreadyReviewed++;
          forgetDecision(card);
        } catch (error) {
          if (bulkApproval !== batch) return;
          if (error?.code === "42501") return revokeAccess();
          unconfirmed++;
        }
      }

      bulkApproval = null;
      for (const card of cards.values()) updateActions(card);
      const message = [
        `Approved ${approved} ${approved === 1 ? "photo" : "photos"}.`,
        alreadyReviewed ? `${alreadyReviewed} already reviewed or replaced.` : "",
        unconfirmed ? `Couldn’t confirm ${unconfirmed}. You can retry any photos still in the queue.` : ""
      ].filter(Boolean).join(" ");
      const refreshed = refresh(message);
      const version = queueVersion;
      await refreshed;
      if (!active || !authorized || queueVersion !== version) return;
      if (startedFromButton && (document.activeElement === document.body ||
          document.activeElement === approveUnflaggedButton)) {
        const target = approveUnflaggedButton.hidden ? root.querySelector("h2") : approveUnflaggedButton;
        target?.focus();
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
    screenButton.addEventListener("click", screenPhotos);
    approveUnflaggedButton.addEventListener("click", approveUnflagged);
    closeButton.addEventListener("click", () => closeReview(true));
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      if (!selected?.saving) closeReview(true);
    });
    approveButton.addEventListener("click", () => decide(selected, true));
    rejectButton.addEventListener("click", () => decide(selected, false));

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
