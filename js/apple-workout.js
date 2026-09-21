/* Apple Workout screenshots stay private; extracted values are reviewed before saving. */
(() => {
  "use strict";

  const bucket = "apple-workouts";
  const table = "client_apple_workouts";
  const maxFileBytes = 8 * 1024 * 1024;
  const metricKeys = ["workout_date", "activity_type", "duration_seconds", "elapsed_seconds", "active_calories", "total_calories", "average_heart_rate", "started_at_local", "ended_at_local"];
  const imageTypes = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));

  function optionalNumber(value, label, maximum, minimum = 0) {
    if (value === null || value === undefined || String(value).trim() === "") return null;
    const number = Number(value);
    if (!Number.isFinite(number) || number < minimum || number > maximum) {
      throw new Error(`${label} must be a number from ${minimum} to ${maximum}.`);
    }
    return number;
  }

  function parseDuration(value, label = "Duration") {
    if (value === null || value === undefined || String(value).trim() === "") return null;
    const text = String(value).trim();
    if (/^\d+(?:\.\d+)?$/.test(text)) {
      const seconds = Math.round(Number(text) * 60);
      if (seconds <= 604800) return seconds;
    }
    const match = text.match(/^(\d{1,3}):([0-5]\d):([0-5]\d)$/);
    if (match) {
      const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
      if (seconds <= 604800) return seconds;
    }
    throw new Error(`${label}: enter minutes (for example, 45) or H:MM:SS (0:45:00).`);
  }

  function formatDuration(value) {
    if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) return "—";
    const seconds = Math.max(0, Math.round(Number(value)));
    return `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function validDate(value) {
    const text = String(value || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
    const date = new Date(`${text}T12:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
  }

  function localTime(value, label) {
    if (value === null || value === undefined || String(value).trim() === "") return null;
    const text = String(value).trim();
    const match = text.match(/^(?:\d{4}-\d{2}-\d{2}T)?([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
    if (!match) throw new Error(`${label} must be a local time, such as 09:30.`);
    return `${match[1]}:${match[2]}:${match[3] || "00"}`;
  }

  function validateMetrics(values) {
    if (!validDate(values.workout_date)) throw new Error("Choose a valid Apple Workout date.");
    const activity = String(values.activity_type || "").trim();
    if (activity.length > 160) throw new Error("Keep the activity name under 160 characters.");
    const result = {
      workout_date: values.workout_date,
      activity_type: activity || null,
      duration_seconds: parseDuration(values.duration_seconds, "Workout time"),
      elapsed_seconds: parseDuration(values.elapsed_seconds, "Elapsed time"),
      active_calories: optionalNumber(values.active_calories, "Active calories", 100000),
      total_calories: optionalNumber(values.total_calories, "Total calories", 100000),
      average_heart_rate: optionalNumber(values.average_heart_rate, "Average heart rate", 300, 20),
      started_at_local: localTime(values.started_at_local, "Start time"),
      ended_at_local: localTime(values.ended_at_local, "End time")
    };
    if (result.duration_seconds !== null && result.elapsed_seconds !== null && result.elapsed_seconds < result.duration_seconds) {
      throw new Error("Elapsed time must be at least as long as workout time.");
    }
    if (result.active_calories !== null && result.total_calories !== null && result.total_calories < result.active_calories) {
      throw new Error("Total calories must be at least as high as active calories.");
    }
    return result;
  }

  function validateFile(file) {
    if (!file || !imageTypes[file.type]) throw new Error("Choose a JPG, PNG, or WebP screenshot.");
    if (!Number.isFinite(file.size) || file.size <= 0 || file.size >= maxFileBytes) throw new Error("Choose a screenshot smaller than 8 MB.");
    return imageTypes[file.type];
  }

  function extractedFields(workout = {}) {
    const result = {};
    metricKeys.forEach((key) => {
      const value = workout[key];
      if (value === null || value === undefined || value === "") result[key] = "";
      else if (key === "duration_seconds" || key === "elapsed_seconds") {
        result[key] = Number.isFinite(Number(value)) && Number(value) >= 0 ? formatDuration(value) : "";
      } else if (key === "started_at_local" || key === "ended_at_local") {
        try { result[key] = localTime(value, key) || ""; } catch (_error) { result[key] = ""; }
      } else if (key === "workout_date") result[key] = validDate(value) ? value : "";
      else result[key] = String(value);
    });
    return result;
  }

  function extractionUpdates(workout, dirtyFields) {
    return Object.fromEntries(Object.entries(extractedFields(workout)).filter(([key]) => !dirtyFields.has(key)));
  }

  function bounded(promise, milliseconds, controller) {
    let timer;
    return Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        timer = setTimeout(() => { controller?.abort(); reject(new Error("The request took too long. Please try again.")); }, milliseconds);
      })
    ]).finally(() => clearTimeout(timer));
  }

  function signInError(message = "Your sign-in has expired. Sign in again, then retry Apple Workout.") {
    const error = new Error(message);
    error.code = "APPLE_WORKOUT_SIGN_IN_REQUIRED";
    return error;
  }

  async function requireSession(client, userId, clientEmail) {
    try {
      if (!client?.auth?.getSession) throw signInError();
      // The page's user can outlive the shared session, especially after another
      // tab signs out. Check the session used by database/storage requests first.
      let result = await bounded(client.auth.getSession(), 12000);
      if (result.error) throw result.error;
      let session = result.data?.session;
      const checkIdentity = () => {
        if (!session?.access_token || !session.user?.id) throw signInError();
        if ((userId && session.user.id !== userId) || (clientEmail && String(session.user.email || "").trim().toLowerCase() !== String(clientEmail).trim().toLowerCase())) {
          throw signInError("Your signed-in account changed. Sign in again with this workout’s account, then retry Apple Workout.");
        }
      };
      checkIdentity();
      // getSession refreshes expired tokens; also cover tokens close to expiry
      // before a screenshot read/upload that may take longer than a minute.
      if (Number(session.expires_at) <= Date.now() / 1000 + 90) {
        result = await bounded(client.auth.refreshSession(), 12000);
        if (result.error) throw result.error;
        session = result.data?.session;
        checkIdentity();
        if (Number(session.expires_at) <= Date.now() / 1000) throw signInError();
      }
      return session;
    } catch (error) {
      if (error?.code === "APPLE_WORKOUT_SIGN_IN_REQUIRED") throw error;
      if (globalThis.window?.FWB_AUTH_SESSION?.requiresLogin?.(error) || error?.name === "AuthSessionMissingError" || [401, 403].includes(error?.status) || ["session_not_found", "session_expired", "refresh_token_not_found", "refresh_token_already_used", "bad_jwt"].includes(error?.code)) throw signInError();
      const unavailable = new Error("We couldn’t confirm your sign-in. Check your connection and try again.");
      unavailable.code = "APPLE_WORKOUT_AUTH_UNAVAILABLE";
      throw unavailable;
    }
  }

  function authenticationError(error) {
    return ["APPLE_WORKOUT_SIGN_IN_REQUIRED", "APPLE_WORKOUT_AUTH_UNAVAILABLE"].includes(error?.code);
  }

  async function findRecord(client, clientEmail, historyKey) {
    const result = await client.from(table).select("*").eq("client_email", clientEmail).eq("history_key", historyKey).maybeSingle();
    if (result.error) throw result.error;
    return result.data;
  }

  async function removeFile(client, path) {
    if (!path) return true;
    try {
      const result = await client.storage.from(bucket).remove([path]);
      return !result.error;
    } catch (_error) { return false; }
  }

  function sameMetrics(record, payload) {
    return metricKeys.every((key) => {
      if (key === "started_at_local" || key === "ended_at_local") {
        try { return localTime(record[key], key) === localTime(payload[key], key); } catch (_error) { return false; }
      }
      return String(record[key] ?? "") === String(payload[key] ?? "");
    });
  }

  async function persistRecord({ client, userId, clientEmail, historyKey, metrics, file, existing, pendingUpload }) {
    if (!userId || !clientEmail || !historyKey) throw new Error("Sign in and select a saved workout before saving.");
    if (!existing && !file) throw new Error("Choose an Apple Workout screenshot first.");
    try { await requireSession(client, userId, clientEmail); }
    catch (error) { error.pendingUpload = pendingUpload || null; throw error; }
    const current = await findRecord(client, clientEmail, historyKey);
    if (pendingUpload && current?.storage_path === pendingUpload.path && sameMetrics(current, metrics)) {
      if (existing?.storage_path && existing.storage_path !== current.storage_path) await removeFile(client, existing.storage_path);
      return current;
    }
    if ((!existing && current) || (existing && (!current || current.id !== existing.id || (existing.updated_at && current.updated_at !== existing.updated_at)))) {
      throw new Error("This workout’s Apple details changed elsewhere. Close this form, refresh the workout, and edit its saved Apple Workout.");
    }

    let uploaded = pendingUpload || null;
    if (file && (!uploaded || uploaded.file !== file)) {
      if (uploaded && current?.storage_path !== uploaded.path) await removeFile(client, uploaded.path);
      const extension = validateFile(file);
      const storagePath = `${userId}/${globalThis.crypto.randomUUID()}.${extension}`;
      const upload = await client.storage.from(bucket).upload(storagePath, file, { contentType: file.type, cacheControl: "3600", upsert: false });
      if (upload.error) throw new Error("The screenshot could not be uploaded. Your entries are still here; try again.");
      uploaded = { path: storagePath, file };
    }
    const payload = {
      ...metrics,
      owner_user_id: userId,
      client_email: clientEmail,
      history_key: historyKey,
      storage_path: uploaded?.path || existing?.storage_path,
      original_filename: file?.name || existing?.original_filename,
      mime_type: file?.type || existing?.mime_type,
      file_size_bytes: file?.size ?? existing?.file_size_bytes
    };

    let saved;
    try {
      let query = existing
        ? client.from(table).update(payload).eq("id", existing.id)
        : client.from(table).upsert(payload, { onConflict: "client_email,history_key", ignoreDuplicates: true });
      if (existing?.updated_at) query = query.eq("updated_at", existing.updated_at);
      const result = await query.select("*").maybeSingle();
      if (result.error) throw result.error;
      if (!result.data || Array.isArray(result.data)) throw new Error("This workout already has Apple details or was updated elsewhere. Refresh it before editing.");
      saved = result.data;
    } catch (error) {
      // A lost response can follow a committed write. Never delete its screenshot.
      let verified;
      try { verified = await findRecord(client, clientEmail, historyKey); }
      catch (_verificationError) {
        const uncertain = new Error("We couldn’t confirm the save. Keep this form open and retry; your screenshot and entries are retained.");
        uncertain.pendingUpload = uploaded;
        throw uncertain;
      }
      if (verified?.storage_path === payload.storage_path && sameMetrics(verified, payload)) saved = verified;
      else {
        if (uploaded && uploaded.path !== verified?.storage_path) await removeFile(client, uploaded.path);
        throw new Error(error?.message || "Apple Workout could not be saved. Your entries are still here; try again.");
      }
    }
    if (uploaded && existing?.storage_path && existing.storage_path !== saved.storage_path) await removeFile(client, existing.storage_path);
    return saved;
  }

  let configuration = { readOnly: true, automaticReading: false, getWorkouts: () => [] };
  let generation = 0;
  let loadRequest = 0;
  let loadState = "idle";
  let loadError = null;
  let records = new Map();
  let dialog;
  let draft;
  let nextDraft = 0;
  const attachedRoots = new WeakSet();

  function editable() { return !configuration.readOnly && Boolean(configuration.user?.id); }
  function workouts() {
    const seen = new Set();
    return (configuration.getWorkouts?.() || []).filter((workout) => {
      if (!workout?.history_key || seen.has(workout.history_key)) return false;
      seen.add(workout.history_key);
      return true;
    });
  }

  function workoutLabel(workout, list = workouts()) {
    const duplicates = list.filter((item) => item.entry_date === workout.entry_date && item.workout_title === workout.workout_title);
    const base = `${workout.workout_title} · ${workout.entry_date}`;
    if (duplicates.length < 2) return base;
    const completed = new Date(workout.completed_at || "");
    const time = Number.isNaN(completed.getTime()) ? "" : `${completed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · `;
    return `${base} · ${time}Session ${duplicates.findIndex((item) => item.history_key === workout.history_key) + 1}`;
  }

  function releasePreview(item) {
    if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
    if (item) item.previewUrl = null;
  }

  function configure(options = {}) {
    const clientEmail = String(options.clientEmail || "").trim().toLowerCase();
    const readOnly = options.readOnly !== false;
    const automaticReading = options.automaticReading === true;
    const changed = clientEmail !== configuration.clientEmail || options.supabaseClient !== configuration.supabaseClient || options.user?.id !== configuration.user?.id || readOnly !== configuration.readOnly || automaticReading !== configuration.automaticReading;
    configuration = { getWorkouts: () => [], ...options, clientEmail, readOnly, automaticReading };
    if (changed) {
      generation += 1;
      loadRequest += 1;
      loadState = "idle";
      loadError = null;
      records = new Map();
      releasePreview(draft);
      draft = null;
      if (dialog?.open) dialog.close();
    }
  }

  async function load() {
    const token = ++loadRequest;
    const epoch = generation;
    const context = configuration;
    if (!context.supabaseClient || !context.clientEmail) return { count: 0 };
    loadState = "loading";
    loadError = null;
    try {
      await requireSession(context.supabaseClient, context.user?.id, context.readOnly ? null : context.clientEmail);
      if (epoch !== generation || token !== loadRequest) return { stale: true };
      const loaded = [];
      const deadline = Date.now() + 12000;
      for (let offset = 0; ; offset += 500) {
        const controller = new AbortController();
        let query = context.supabaseClient.from(table).select("*").eq("client_email", context.clientEmail).order("created_at", { ascending: false }).range(offset, offset + 499);
        if (query.abortSignal) query = query.abortSignal(controller.signal);
        const result = await bounded(query, Math.max(1, deadline - Date.now()), controller);
        if (result.error) throw result.error;
        if (epoch !== generation || token !== loadRequest) return { stale: true };
        loaded.push(...(result.data || []));
        if ((result.data || []).length < 500) break;
      }
      records = new Map(loaded.map((record) => [record.history_key, record]));
      loadState = "ready";
      return { count: records.size };
    } catch (error) {
      if (epoch !== generation || token !== loadRequest) return { stale: true };
      loadState = "error";
      loadError = error;
      return { error };
    }
  }

  function metric(label, value, unit = "", className = "") {
    return `<div class="${className}"><dt>${escapeHtml(label)}</dt><dd>${value === null || value === undefined || value === "" ? "—" : escapeHtml(value)}${value !== null && value !== undefined && value !== "" && unit ? ` <small>${escapeHtml(unit)}</small>` : ""}</dd></div>`;
  }

  function getShareStats(historyKey) {
    const record = records.get(historyKey);
    if (!record || loadState !== "ready") return null;
    const stats = {};
    for (const [key, maximum] of [["duration_seconds", 604800], ["active_calories", 100000], ["total_calories", 100000], ["average_heart_rate", 300]]) {
      const value = record[key];
      const number = value === null || value === undefined || typeof value === "boolean" || String(value).trim() === "" ? NaN : Number(value);
      stats[key] = Number.isFinite(number) && number >= (key === "average_heart_rate" ? 20 : 0) && number <= maximum ? number : null;
    }
    return Object.values(stats).some((value) => value !== null) ? stats : null;
  }

  function markup(historyKey) {
    const record = records.get(historyKey);
    const key = escapeHtml(historyKey);
    if (!record && loadState !== "ready") {
      return `<div class="apple-workout-empty"><p>${loadState === "error" ? escapeHtml(authenticationError(loadError) ? loadError.message : "Apple Workout details are unavailable.") : "Loading Apple Workout details…"}</p>${loadState === "error" ? '<button type="button" data-apple-workout-action="retry">Retry</button>' : ""}</div>`;
    }
    if (!record) return editable() ? `<div class="apple-workout-empty"><button type="button" data-apple-workout-action="open" data-apple-workout-key="${key}">+ Add Apple Workout</button></div>` : "";
    return `<section class="apple-workout-summary" aria-label="Apple Workout details">
      <header><div><span class="apple-workout-eyebrow">Apple Workout</span>${record.activity_type ? `<p>${escapeHtml(record.activity_type)}</p>` : ""}</div>${editable() ? `<button type="button" data-apple-workout-action="open" data-apple-workout-key="${key}">Edit</button>` : ""}</header>
      <dl class="apple-workout-metrics">${metric("Workout time", formatDuration(record.duration_seconds), "", "apple-workout-duration")}${metric("Active energy", record.active_calories, "kcal")}${metric("Average heart rate", record.average_heart_rate, "bpm")}</dl>
      <details><summary>Details</summary><dl class="apple-workout-details">${metric("Date", record.workout_date)}${metric("Elapsed time", formatDuration(record.elapsed_seconds))}${metric("Total energy", record.total_calories, "kcal")}${metric("Local start", record.started_at_local)}${metric("Local end", record.ended_at_local)}</dl><button type="button" data-apple-workout-action="view" data-apple-workout-key="${key}">View original screenshot</button><span class="apple-workout-link-status" role="status"></span></details>
    </section>`;
  }

  function field(name, label, type = "text", extra = "") {
    return `<label class="apple-workout-field"><span>${label}</span><input type="${type}" name="${name}" ${extra}></label>`;
  }

  function ensureDialog() {
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.className = "apple-workout-dialog";
    dialog.setAttribute("aria-labelledby", "apple-workout-dialog-title");
    dialog.innerHTML = `<form class="apple-workout-form" novalidate>
      <header><div><span class="apple-workout-eyebrow">Apple Workout</span><h2 id="apple-workout-dialog-title">Review your workout</h2></div><button type="button" class="apple-workout-close" data-apple-dialog-close aria-label="Close Apple Workout">×</button></header>
      <p class="apple-workout-disclosure">After you save, the image and stats are visible to your coach. Enter the details below.</p>
      <label class="apple-workout-field"><span>Workout to link</span><select name="history_key" required></select></label>
      <p class="apple-workout-selection" data-apple-selection></p>
      <label class="apple-workout-file"><span>Apple Workout screenshot</span><input type="file" name="photo" accept="image/jpeg,image/png,image/webp"><small>JPG, PNG, or WebP · under 8 MB</small></label>
      <button type="button" data-apple-preview-saved hidden>Review saved screenshot</button>
      <details class="apple-workout-preview" data-apple-preview hidden><summary>Review original screenshot</summary><img alt="Your Apple Workout screenshot for comparison" data-apple-preview-image></details>
      <p class="apple-workout-read-status" data-apple-read-status role="status"></p>
      <div class="apple-workout-suggestions" data-apple-date-suggestions></div>
      <p class="apple-workout-warning" data-apple-warning hidden></p>
      <div class="apple-workout-review-grid">
        ${field("workout_date", "Apple Workout date", "date", "required")}
        ${field("activity_type", "Activity (optional)", "text", 'maxlength="160" placeholder="Strength training"')}
        ${field("duration_seconds", "Workout time · minutes or H:MM:SS", "text", 'placeholder="45 or 0:45:00" inputmode="text"')}
        ${field("elapsed_seconds", "Elapsed time · minutes or H:MM:SS", "text", 'placeholder="50 or 0:50:00" inputmode="text"')}
        ${field("active_calories", "Active energy (kcal)", "number", 'min="0" max="100000" step="any" inputmode="decimal"')}
        ${field("total_calories", "Total energy (kcal)", "number", 'min="0" max="100000" step="any" inputmode="decimal"')}
        ${field("average_heart_rate", "Average heart rate (bpm)", "number", 'min="20" max="300" step="any" inputmode="decimal"')}
        ${field("started_at_local", "Local start time (optional)", "time", 'step="1"')}
        ${field("ended_at_local", "Local end time (optional)", "time", 'step="1"')}
      </div>
      <p class="apple-workout-help">Leave any unreadable value empty. Zero calories is a valid value.</p>
      <label class="apple-workout-confirm"><input type="checkbox" name="confirm_link"><span data-apple-confirm-label>I reviewed the details and want to link them to this workout.</span></label>
      <p class="apple-workout-save-status" data-apple-save-status role="status"></p>
      <footer><button type="button" data-apple-dialog-close>Cancel</button><button type="submit" class="apple-workout-save">Save Apple Workout</button></footer>
    </form>`;
    document.body.append(dialog);
    const form = dialog.querySelector("form");
    form.addEventListener("input", (event) => {
      if (!draft) return;
      if (metricKeys.includes(event.target.name)) draft.dirtyFields.add(event.target.name);
      if (event.target.name === "workout_date") updateDateSuggestions();
    });
    form.addEventListener("change", (event) => {
      if (!draft) return;
      if (event.target.name === "photo") {
        releasePreview(draft);
        draft.file = event.target.files?.[0] || null;
        draft.ocrToken += 1;
        draft.extracting = false;
        form.elements.confirm_link.checked = false;
        const preview = dialog.querySelector("[data-apple-preview]");
        preview.hidden = true;
        dialog.querySelector("[data-apple-preview-image]").removeAttribute("src");
        if (draft.file) {
          try {
            validateFile(draft.file);
            draft.previewUrl = URL.createObjectURL(draft.file);
            dialog.querySelector("[data-apple-preview-image]").src = draft.previewUrl;
            preview.hidden = false;
          } catch (_error) { /* File validation feedback is provided by readScreenshot. */ }
          readScreenshot();
        }
        else {
          setStatus("[data-apple-read-status]", draft.existing ? "The saved screenshot will stay attached." : "Choose a screenshot to read its details.");
          setBusy(draft);
        }
      } else if (event.target.name === "history_key") {
        draft.historyKey = event.target.value;
        draft.explicitSelection = true;
        form.elements.confirm_link.checked = false;
        updateSelection();
      }
    });
    form.addEventListener("submit", (event) => { event.preventDefault(); save(); });
    dialog.addEventListener("click", (event) => {
      if (event.target.closest("[data-apple-dialog-close]") && !draft?.saving) dialog.close();
      if (event.target.closest("[data-apple-preview-saved]") && draft && !draft.saving) previewSavedScreenshot();
      const suggestion = event.target.closest("[data-apple-suggest-key]");
      if (suggestion && draft && !draft.existing && !draft.saving) {
        form.elements.history_key.value = suggestion.dataset.appleSuggestKey;
        form.elements.history_key.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    dialog.addEventListener("cancel", (event) => { if (draft?.saving) event.preventDefault(); });
    dialog.addEventListener("close", () => {
      // A queued close event from a previous opening must not dismiss a new form.
      if (dialog.open) return;
      const previous = draft;
      draft = null;
      if (previous) {
        releasePreview(previous);
        previous.ocrToken += 1;
        const visible = (element) => element?.isConnected && !element.closest("[hidden], dialog:not([open])") && element.getClientRects().length;
        const fallback = Array.from(document.querySelectorAll('[data-apple-workout-action="open"]')).find((button) => button.dataset.appleWorkoutKey === previous.historyKey && visible(button));
        const target = visible(previous.returnFocus) ? previous.returnFocus : fallback;
        target?.focus({ preventScroll: true });
        if (previous.savedRecord && previous.generation === generation) previous.afterSave?.(previous.savedRecord);
      }
    });
    return dialog;
  }

  function currentDraft(item) { return draft === item && item.generation === generation && dialog?.open; }
  function formElement() { return dialog.querySelector("form"); }
  function setStatus(selector, message) { dialog.querySelector(selector).textContent = message; }

  function updateSelection() {
    if (!draft) return;
    const selected = workouts().find((workout) => workout.history_key === draft.historyKey);
    const text = selected ? workoutLabel(selected) : "Select a saved workout.";
    setStatus("[data-apple-selection]", text);
    setStatus("[data-apple-confirm-label]", `I reviewed these details and want to link them to ${text}`);
    updateDateSuggestions();
  }

  function updateDateSuggestions() {
    if (!draft) return;
    const form = formElement();
    const date = form.elements.workout_date.value;
    const selected = workouts().find((workout) => workout.history_key === draft.historyKey);
    const choices = workouts().filter((workout) => workout.entry_date === date && workout.history_key !== draft.historyKey && !records.has(workout.history_key));
    const container = dialog.querySelector("[data-apple-date-suggestions]");
    container.innerHTML = !draft.existing && date && selected?.entry_date !== date && choices.length
      ? `<p>Saved workouts matching the screenshot date:</p>${choices.map((workout) => `<button type="button" data-apple-suggest-key="${escapeHtml(workout.history_key)}">Use ${escapeHtml(workoutLabel(workout))}</button>`).join("")}`
      : "";
    if (selected && date && selected.entry_date !== date) {
      container.insertAdjacentHTML("afterbegin", '<p>The Apple Workout date differs from the selected session. Confirm the link below if this is the right workout.</p>');
    }
  }

  function setBusy(item) {
    if (!currentDraft(item)) return;
    const form = formElement();
    form.querySelector('[type="submit"]').disabled = item.saving || item.extracting;
    form.querySelector('[type="submit"]').textContent = item.saving ? "Saving…" : "Save Apple Workout";
    form.querySelectorAll("input, select, [data-apple-dialog-close], [data-apple-suggest-key]").forEach((control) => {
      control.disabled = item.saving || (control.name === "history_key" && Boolean(item.existing));
    });
    dialog.querySelector("[data-apple-read-status]").setAttribute("aria-busy", item.extracting ? "true" : "false");
  }

  function open(historyKey, options = {}) {
    if (!editable() || loadState !== "ready") return false;
    const selected = workouts().find((workout) => workout.history_key === historyKey);
    if (!selected) return false;
    const element = ensureDialog();
    if (element.open) {
      if (draft?.saving) return false;
      releasePreview(draft);
      element.close();
    }
    const existing = records.get(historyKey) || null;
    draft = { id: ++nextDraft, generation, historyKey, existing, file: null, pendingUpload: null, explicitSelection: true, dirtyFields: new Set(), ocrToken: 0, extracting: false, saving: false, returnFocus: document.activeElement, afterSave: typeof options.onSaved === "function" ? options.onSaved : null };
    const form = formElement();
    form.reset();
    form.elements.history_key.innerHTML = workouts().map((workout) => `<option value="${escapeHtml(workout.history_key)}" ${workout.history_key === historyKey ? "selected" : ""} ${records.has(workout.history_key) && workout.history_key !== historyKey ? "disabled" : ""}>${escapeHtml(workoutLabel(workout))}${records.has(workout.history_key) && workout.history_key !== historyKey ? " · Apple Workout added" : ""}</option>`).join("");
    const fields = extractedFields(existing || { workout_date: selected.entry_date });
    metricKeys.forEach((key) => { form.elements[key].value = fields[key]; });
    setStatus(".apple-workout-disclosure", configuration.automaticReading
      ? "OpenAI reads your screenshot to fill these fields. After you save, the image and stats are visible to your coach."
      : "Your screenshot and stats will be saved privately and visible to your coach. Enter the details below.");
    setStatus("[data-apple-read-status]", existing ? "The saved screenshot will stay attached unless you choose a replacement." : configuration.automaticReading ? "Choose a screenshot to read its details, then review every field." : "Choose a screenshot, then enter and review its details below.");
    setStatus("[data-apple-save-status]", "");
    dialog.querySelector("[data-apple-warning]").hidden = true;
    dialog.querySelector("[data-apple-preview]").hidden = true;
    dialog.querySelector("[data-apple-preview]").open = false;
    dialog.querySelector("[data-apple-preview-image]").removeAttribute("src");
    dialog.querySelector("[data-apple-preview-saved]").hidden = !existing?.storage_path;
    updateSelection();
    element.showModal();
    setBusy(draft);
    form.elements[existing ? "workout_date" : "photo"].focus({ preventScroll: true });
    element.scrollTop = 0;
    return true;
  }

  async function readScreenshot() {
    const item = draft;
    if (!item || item.saving) return;
    const token = ++item.ocrToken;
    item.extracting = false;
    try { validateFile(item.file); }
    catch (error) { setStatus("[data-apple-read-status]", error.message); setBusy(item); return; }
    const file = item.file;
    const context = configuration;
    if (!context.automaticReading) {
      setStatus("[data-apple-read-status]", "Screenshot selected. Enter and review its details below before saving.");
      setBusy(item);
      return;
    }
    item.extracting = true;
    setStatus("[data-apple-read-status]", "Reading screenshot… You can still enter or correct details below.");
    setStatus("[data-apple-save-status]", "");
    dialog.querySelector("[data-apple-warning]").hidden = true;
    setBusy(item);
    const body = new FormData();
    body.append("photo", file);
    body.append("workout_date", workouts().find((workout) => workout.history_key === item.historyKey)?.entry_date || "");
    try {
      await requireSession(context.supabaseClient, context.user?.id, context.clientEmail);
      if (!currentDraft(item) || token !== item.ocrToken || file !== item.file) return;
      const controller = new AbortController();
      const result = await bounded(context.supabaseClient.functions.invoke("extract-apple-workout", { body, signal: controller.signal }), 70000, controller);
      if (!currentDraft(item) || token !== item.ocrToken || file !== item.file) return;
      if (result.error || !result.data?.workout) throw result.error || new Error("No readable workout details were returned.");
      const updates = extractionUpdates(result.data.workout, item.dirtyFields);
      Object.entries(updates).forEach(([key, value]) => { formElement().elements[key].value = value; });
      const warningMessages = Array.isArray(result.data.warnings) ? result.data.warnings.filter((message) => typeof message === "string") : [];
      if (result.data.confidence === "low" || (typeof result.data.confidence === "number" && result.data.confidence < .7)) warningMessages.unshift("Some details were hard to read. Check the screenshot before saving.");
      const warning = dialog.querySelector("[data-apple-warning]");
      warning.textContent = warningMessages.join(" ");
      warning.hidden = !warningMessages.length;
      setStatus("[data-apple-read-status]", "Screenshot read. Review the details, then confirm which workout to link.");
      updateDateSuggestions();
    } catch (error) {
      if (currentDraft(item) && token === item.ocrToken) setStatus("[data-apple-read-status]", authenticationError(error) ? error.message : "We couldn’t read this screenshot. Enter the details manually below; you can still save the original image.");
    } finally {
      if (currentDraft(item) && token === item.ocrToken) { item.extracting = false; setBusy(item); }
    }
  }

  async function previewSavedScreenshot() {
    const item = draft;
    if (!item?.existing?.storage_path) return;
    const button = dialog.querySelector("[data-apple-preview-saved]");
    const context = configuration;
    const file = item.file;
    button.disabled = true;
    try {
      await requireSession(context.supabaseClient, context.user?.id, context.readOnly ? null : context.clientEmail);
      if (!currentDraft(item) || item.file !== file) return;
      const result = await bounded(context.supabaseClient.storage.from(bucket).createSignedUrl(item.existing.storage_path, 300), 12000);
      if (!currentDraft(item) || item.file !== file) return;
      const url = new URL(result.data?.signedUrl || "");
      if (result.error || !["https:", "http:"].includes(url.protocol)) throw new Error("Screenshot unavailable.");
      dialog.querySelector("[data-apple-preview-image]").src = url.href;
      const preview = dialog.querySelector("[data-apple-preview]");
      preview.hidden = false;
      preview.open = true;
    } catch (error) {
      if (currentDraft(item)) setStatus("[data-apple-read-status]", authenticationError(error) ? error.message : "The saved screenshot could not be opened. Try again.");
    } finally { if (currentDraft(item)) button.disabled = false; }
  }

  async function save() {
    const item = draft;
    if (!item || item.saving || item.extracting || !editable()) return;
    const form = formElement();
    const context = configuration;
    let metrics;
    try {
      if (!workouts().some((workout) => workout.history_key === item.historyKey)) throw new Error("Select an existing saved workout.");
      if (!form.elements.confirm_link.checked) throw new Error("Confirm the selected workout before saving.");
      if (!item.existing && !item.file) throw new Error("Choose an Apple Workout screenshot first.");
      if (item.file) validateFile(item.file);
      metrics = validateMetrics(Object.fromEntries(metricKeys.map((key) => [key, form.elements[key].value])));
    } catch (error) { setStatus("[data-apple-save-status]", error.message); return; }
    item.saving = true;
    item.ocrToken += 1;
    setStatus("[data-apple-save-status]", "Saving Apple Workout…");
    setBusy(item);
    try {
      const record = await persistRecord({ client: context.supabaseClient, userId: context.user.id, clientEmail: context.clientEmail, historyKey: item.historyKey, metrics, file: item.file, existing: item.existing, pendingUpload: item.pendingUpload });
      if (!currentDraft(item)) return;
      loadRequest += 1;
      loadState = "ready";
      records.set(record.history_key, record);
      item.saving = false;
      item.savedRecord = record;
      dialog.close();
      try { await context.onSaved?.(record); } catch (_error) { /* The saved record remains authoritative if its parent view cannot refresh. */ }
    } catch (error) {
      if (!currentDraft(item)) return;
      item.pendingUpload = error.pendingUpload || null;
      setStatus("[data-apple-save-status]", error.message || "Apple Workout could not be saved. Your entries are still here.");
    } finally {
      if (currentDraft(item)) { item.saving = false; setBusy(item); }
    }
  }

  async function viewScreenshot(button) {
    const record = records.get(button.dataset.appleWorkoutKey);
    if (!record?.storage_path || button.disabled) return;
    const context = configuration;
    const epoch = generation;
    const status = button.parentElement.querySelector(".apple-workout-link-status");
    const popup = window.open("", "_blank");
    if (popup) popup.opener = null;
    button.disabled = true;
    if (status) status.textContent = "Opening screenshot…";
    try {
      await requireSession(context.supabaseClient, context.user?.id, context.readOnly ? null : context.clientEmail);
      if (epoch !== generation) { popup?.close(); return; }
      const result = await context.supabaseClient.storage.from(bucket).createSignedUrl(record.storage_path, 300);
      if (epoch !== generation) { popup?.close(); return; }
      const url = new URL(result.data?.signedUrl || "");
      if (result.error || !["https:", "http:"].includes(url.protocol)) throw result.error || new Error("Invalid screenshot link.");
      if (popup) { popup.location.replace(url.href); if (status) status.textContent = ""; }
      else if (status) status.innerHTML = `<a href="${escapeHtml(url.href)}" target="_blank" rel="noopener noreferrer">Open screenshot</a>`;
    } catch (error) {
      popup?.close();
      if (epoch === generation && status) status.textContent = authenticationError(error) ? error.message : "The screenshot could not be opened. Try again.";
    } finally { button.disabled = false; }
  }

  function attach(root = document) {
    if (!root || attachedRoots.has(root)) return;
    attachedRoots.add(root);
    root.addEventListener("click", (event) => {
      const button = event.target.closest?.("[data-apple-workout-action]");
      if (!button || event.__appleWorkoutHandled) return;
      event.__appleWorkoutHandled = true;
      event.preventDefault();
      if (button.dataset.appleWorkoutAction === "open") open(button.dataset.appleWorkoutKey);
      else if (button.dataset.appleWorkoutAction === "view") viewScreenshot(button);
      else if (button.dataset.appleWorkoutAction === "retry") {
        const context = configuration;
        const epoch = generation;
        button.disabled = true;
        load().then(() => { if (epoch === generation) context.onSaved?.(); }).finally(() => { button.disabled = false; });
      }
    });
  }

  const api = { configure, load, markup, open, attach, getShareStats };
  if (typeof window !== "undefined") window.FWBAppleWorkout = api;
  if (typeof module !== "undefined" && module.exports) module.exports = { api, optionalNumber, parseDuration, formatDuration, validDate, localTime, validateMetrics, validateFile, extractedFields, extractionUpdates, persistRecord, workoutLabel, bounded };
})();
