(() => {
  "use strict";

  const tabs = new Set(["discover", "groups", "matches", "profile", "inbox", "requests"]);
  const photoBucket = "spotter-profile-photos";
  const pageSize = 25;
  const genders = [["", "Everyone"], ["woman", "Women"], ["man", "Men"], ["nonbinary", "Nonbinary"]];
  const goals = ["Build strength", "Gain muscle", "Improve endurance", "Stay consistent", "Improve overall fitness", "Manage weight"];
  const days = [["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"], ["thu", "Thursday"], ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"]];
  const periods = [["morning", "Morning"], ["afternoon", "Afternoon"], ["evening", "Evening"]];
  const dayLabels = Object.fromEntries(days);
  const bodyTypeHelp = {
    Ectomorph: "A leaner build with a narrower frame.",
    Mesomorph: "A naturally muscular build.",
    Endomorph: "A broader or rounder build.",
    Mixed: "A combination of traits."
  };
  const demos = [
    ["Mateo", "man", "Build strength", "I’m on a four-day strength split and usually train after work.", "demo-mateo.jpg", "5 ft 10 in", "181 lb", "Mesomorph", "Four-day upper/lower strength", "A regular workout buddy", "M · W · F evenings, 6–8 PM", "Northside Strength · Harbor Barbell", ["mon", "wed", "fri"], ["evening"]],
    ["Janelle", "woman", "Build strength", "I’m getting ready for my first meet and looking for an early-morning training partner.", "demo-janelle.jpg", "5 ft 7 in", "150 lb", "Mixed", "Powerlifting meet prep", "A training partner for meet prep", "T · Th mornings, 6:30–8 AM", "Iron Yard", ["tue", "thu"], ["morning"]],
    ["Ari", "nonbinary", "Improve overall fitness", "I mix pickup games with two full-body gym sessions each week.", null, "5 ft 9 in", "162 lb", "Ectomorph", "Basketball strength and mobility", "Pick-up games and gym sessions", "W · F evenings, 6–8 PM", "Court Lab", ["wed", "fri"], ["evening"]],
    ["Theo", "man", "Improve endurance", "I’m building up to a half marathon and do a strength session on Saturdays.", null, "6 ft 1 in", "176 lb", "Ectomorph", "Half marathon + full-body strength", "A weekend running partner", "Sa · Su mornings, 8–10 AM", "", ["sat", "sun"], ["morning"]]
  ].map(([name, gender, goal, about, image, height, weight, bodyType, program, preference, schedule, gyms, availabilityDays, availabilityPeriods]) => ({
    id: "demo-" + name.toLowerCase(),
    demo: true, name, gender, goals: [goal], about, image, height, weight, bodyType, program, schedule, gyms,
    preferences: [preference], availabilityDays, availabilityPeriods, availability: []
  }));

  const discover = document.querySelector("[data-spotter-discover]");
  const profileRoot = document.querySelector("[data-spotter-profile]");
  const networkRoot = document.querySelector("[data-spotter-network]");
  const nav = document.querySelector("[data-spotter-navigation]");
  const status = document.querySelector("[data-spotter-loading]");
  const notice = document.querySelector("[data-spotter-notice]");
  const dialog = document.querySelector("[data-spotter-dialog]");
  const dialogTitle = dialog.querySelector("[data-spotter-dialog-title]");
  const dialogContent = dialog.querySelector("[data-spotter-dialog-content]");
  const auth = window.FWB_AUTH_SESSION;
  let client, user, profile, preferences, profileView, networkView;
  let tab, members = [], nextOffset = 0, more = false, cursor = 0, discoveryVersion = 0;
  let discoveryLoading = false, discoveryError = "", working = false, closed = false;
  let activeDialog = 0;
  let dockScrollAnchor = Math.max(0, window.scrollY);
  const imageURLs = new Map();

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function button(label, action, className = "spotter-secondary") {
    const node = element("button", label, className);
    node.type = "button";
    node.addEventListener("click", action);
    return node;
  }

  function iconButton(label, path, action, className) {
    const control = button("", action, className);
    control.setAttribute("aria-label", label);
    control.title = label;
    const namespace = "http://www.w3.org/2000/svg";
    const icon = document.createElementNS(namespace, "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    const stroke = document.createElementNS(namespace, "path");
    stroke.setAttribute("d", path);
    icon.append(stroke);
    control.append(icon);
    return control;
  }

  function notify(message = "", error = false) {
    notice.textContent = message;
    notice.classList.toggle("spotter-error", error);
  }

  function cleanGender(value) {
    return genders.some(([key]) => key === value) ? value : "";
  }

  function readPreferences() {
    try {
      const saved = JSON.parse(localStorage.getItem("fwb-spotter-web-v1:" + user.id) || "{}");
      return {
        hidden: new Set(Array.isArray(saved.hidden) ? saved.hidden.filter(value => typeof value === "string") : []),
        demos: saved.demos !== false,
        gender: cleanGender(saved.gender || ""),
        filters: saved.filters && typeof saved.filters === "object" ? saved.filters : {}
      };
    } catch (_) {
      return { hidden: new Set(), demos: true, gender: "", filters: {} };
    }
  }

  function savePreferences() {
    try {
      localStorage.setItem("fwb-spotter-web-v1:" + user.id, JSON.stringify({
        hidden: [...preferences.hidden], demos: preferences.demos, gender: preferences.gender, filters: preferences.filters
      }));
    } catch (_) { /* Preferences still apply for this visit. */ }
  }

  function clearImages() {
    for (const url of imageURLs.values()) URL.revokeObjectURL(url);
    imageURLs.clear();
  }

  function closePage() {
    if (closed) return;
    closed = true;
    discoveryVersion++;
    activeDialog++;
    if (dialog.open) dialog.close();
    clearImages();
    profileView?.dispose?.();
    networkView?.dispose?.();
    for (const node of [discover, profileRoot, networkRoot]) node.replaceChildren();
    nav.hidden = true;
  }

  function goToLogin() {
    closePage();
    const destination = "/client-spotter.html" + window.location.hash;
    window.location.replace("/client-login.html?return_to=" + encodeURIComponent(destination));
  }

  async function scoped(operation) {
    if (closed || !user) throw new Error("Spotter is closed.");
    const result = await auth.withAccount(client, { id: user.id }, operation);
    if (closed) throw new Error("Spotter is closed.");
    if (result.error) throw result.error;
    return result.data;
  }

  function rpc(name, parameters = {}) {
    return scoped(() => client.rpc(name, parameters));
  }

  async function loadWorkoutRows() {
    const email = user.email?.trim().toLowerCase();
    if (!email) return [];
    const rows = [];
    const limit = 500;
    const columns = "id,set_id,session_id,entry_date,completed_at,set_number,set_type,exercise_code,exercise_name,workout_title,reps,weight_used,duration_seconds";
    for (let from = 0; ; from += limit) {
      const batch = await scoped(() => client.from("client_workout_logs")
        .select(columns).eq("client_email", email).not("completed_at", "is", null)
        .order("entry_date", { ascending: true }).order("id", { ascending: true }).range(from, from + limit - 1));
      rows.push(...(batch || []));
      if (!batch || batch.length < limit) return rows;
    }
  }

  function updateProfile(updated) {
    profile = updated;
    discoveryVersion++;
    discoveryLoading = false;
    working = false;
    nextOffset = 0;
    discoveryError = "";
    members = [];
    more = false;
    cursor = 0;
    clearImages();
    nav.hidden = profile?.active !== true;
    if (profile?.active !== true && tab !== "profile") showTab("profile");
  }

  function currentRequestedTab() {
    const value = window.location.hash.slice(1);
    return tabs.has(value) ? value : "discover";
  }

  function showTab(value) {
    if (closed || !profileView || !networkView) return;
    const next = profile?.active === true && tabs.has(value) ? value : "profile";
    if (next !== tab) {
      if (dialog.open) dialog.close();
      if (tab === "discover") clearImages();
      if (tab && !["profile", "discover"].includes(tab)) networkView.dispose?.();
      if (tab) {
        window.scrollTo(0, 0);
        nav.removeAttribute("data-compact");
        dockScrollAnchor = 0;
      }
    }
    tab = next;
    nav.hidden = profile?.active !== true;
    nav.querySelectorAll("[data-spotter-tab]").forEach(node => {
      if (node.dataset.spotterTab === (next === "requests" ? "profile" : next)) node.setAttribute("aria-current", "page");
      else node.removeAttribute("aria-current");
    });
    discover.hidden = next !== "discover";
    profileRoot.hidden = next !== "profile";
    networkRoot.hidden = !discover.hidden || !profileRoot.hidden;
    const fragment = next === "discover" ? "" : "#" + next;
    if (location.hash !== fragment) history.replaceState(null, "", location.pathname + location.search + fragment);
    if (next === "profile") {
      profileView.render();
    } else if (next === "discover") {
      renderDiscover();
      if (nextOffset === 0 && !discoveryLoading) void loadMembers(true);
    } else {
      networkView.render(next);
    }
  }

  async function loadMembers(reset = false, advance = false) {
    if (closed || profile?.active !== true || (discoveryLoading && !reset)) return;
    const version = ++discoveryVersion;
    const previous = visibleMembers()[cursor]?.id;
    if (reset) {
      clearImages();
      nextOffset = 0;
      members = [];
      cursor = 0;
      more = false;
    }
    discoveryLoading = true;
    discoveryError = "";
    if (tab === "discover") renderDiscover();
    try {
      const currentFilters = filters();
      const page = await rpc("spotter_discover_filtered", { p_filters: currentFilters, p_offset: nextOffset });
      if (version !== discoveryVersion) return;
      if (!Array.isArray(page)) throw new Error("Invalid discovery results.");
      const unique = new Map(members.map(member => [member.id, member]));
      for (const candidate of page) if (candidate?.id) unique.set(candidate.id, candidate);
      members = [...unique.values()];
      nextOffset += page.length;
      more = page.length === pageSize;
      if (advance) {
        const list = visibleMembers();
        const oldIndex = list.findIndex(member => member.id === previous);
        cursor = Math.min(Math.max(0, oldIndex + 1), Math.max(0, list.length - 1));
      }
    } catch (_) {
      if (version === discoveryVersion) discoveryError = "Discover couldn’t refresh. Try again.";
    } finally {
      if (version === discoveryVersion) {
        discoveryLoading = false;
        if (tab === "discover") renderDiscover();
      }
    }
  }

  function filters() {
    return {
      gender: preferences.gender || null,
      photos_only: preferences.filters.photos_only === true,
      gym: typeof preferences.filters.gym === "string" ? preferences.filters.gym.slice(0, 80) : "",
      goals: goals.filter(item => Array.isArray(preferences.filters.goals) && preferences.filters.goals.includes(item)),
      days: days.map(([key]) => key).filter(item => Array.isArray(preferences.filters.days) && preferences.filters.days.includes(item)),
      periods: periods.map(([key]) => key).filter(item => Array.isArray(preferences.filters.periods) && preferences.filters.periods.includes(item))
    };
  }

  function visibleMembers() {
    const options = filters();
    const filteredDemos = preferences.demos ? demos.filter(member =>
      (!options.gender || options.gender === member.gender) &&
      (!options.photos_only || member.image) &&
      (!options.gym || member.gyms.toLowerCase().includes(options.gym.toLowerCase())) &&
      (!options.goals.length || options.goals.some(item => member.goals.includes(item))) &&
      (!options.days.length || options.days.some(item => member.availabilityDays.includes(item))) &&
      (!options.periods.length || options.periods.some(item => member.availabilityPeriods.includes(item)))
    ) : [];
    return [...members, ...filteredDemos].filter(member => !preferences.hidden.has(member.id));
  }

  function browse(delta) {
    const list = visibleMembers();
    if (delta > 0 && more) {
      const next = list[cursor + 1];
      if ((!next || next.demo) && !list[cursor]?.demo) {
        if (!discoveryLoading) void loadMembers(false, true);
        return;
      }
    }
    cursor = Math.max(0, Math.min(cursor + delta, list.length - 1));
    renderDiscover();
  }

  function portrait(member) {
    const figure = element("figure", null, "spotter-portrait");
    figure.setAttribute("aria-hidden", "true");
    figure.append(element("span", String(member.name || "?").slice(0, 1).toUpperCase()));
    if (member.image) {
      addPortrait(figure, "/images/spotter/" + member.image);
    } else if (member.portrait_path) {
      void showStoredPhoto(figure, member.portrait_path);
    }
    return figure;
  }

  function addPortrait(container, source) {
    const image = element("img");
    image.alt = "";
    image.src = source;
    image.addEventListener("error", () => image.remove(), { once: true });
    if (container.classList.contains("spotter-portrait")) {
      image.addEventListener("load", () => container.replaceChildren(image), { once: true });
      if (image.complete && image.naturalWidth) container.replaceChildren(image);
    } else {
      container.append(image);
    }
  }

  async function showStoredPhoto(container, path) {
    try {
      let url = imageURLs.get(path);
      if (!url) {
        const blob = await scoped(() => client.storage.from(photoBucket).download(path));
        if (!container.isConnected || closed || !blob) return;
        url = imageURLs.get(path);
        if (!url) {
          url = URL.createObjectURL(blob);
          imageURLs.set(path, url);
        }
      }
      if (container.isConnected && !closed) addPortrait(container, url);
    } catch (_) { /* Profiles without an accessible photo keep their initials. */ }
  }

  function renderDiscover() {
    const list = visibleMembers();
    cursor = Math.min(cursor, Math.max(0, list.length - 1));
    const member = list[cursor];
    const heading = element("div", null, "spotter-heading-row");
    heading.append(element("h2", "Discover"), button("Filters", openFilters));
    discover.replaceChildren(heading);
    if (discoveryLoading && !member) discover.append(element("p", "Finding workout partners…", "spotter-muted"));
    if (discoveryError) discover.append(element("p", discoveryError, "spotter-error"));
    if (!member) {
      if (!discoveryLoading) {
        const empty = element("div", null, "spotter-card");
        empty.append(element("p", "No profiles match your filters right now."),
          button(more ? "Load more" : "Refresh", () => loadMembers(!more)));
        discover.append(empty);
      }
      return;
    }

    const card = element("article", null, "spotter-card spotter-discover-card");
    const visual = portrait(member);
    const content = element("div", null, "spotter-stack");
    let start;
    visual.addEventListener("pointerdown", event => { start = { x: event.clientX, y: event.clientY }; });
    visual.addEventListener("pointercancel", () => { start = undefined; });
    visual.addEventListener("pointerup", event => {
      if (!start) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      start = undefined;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) browse(dx < 0 ? 1 : -1);
    });
    if (member.demo) {
      const label = element("div");
      label.append(element("span", "Demo", "spotter-demo-label"));
      content.append(label);
    }
    content.append(element("h3", member.name || "Spotter member"));
    const meta = [...(member.goals || []), ...(member.availability || [])].filter(Boolean).join(" · ");
    if (meta) content.append(element("p", meta, "spotter-meta"));
    if (member.about) content.append(element("p", member.about));
    content.append(button("View profile", () => showMember(member)));
    const media = element("div", null, "spotter-discover-media");
    const previous = iconButton("Previous", "m15 18-6-6 6-6", () => browse(-1), "spotter-deck-arrow spotter-deck-previous");
    previous.disabled = cursor <= 0;
    const next = iconButton("Next", "m9 18 6-6-6-6", () => browse(1), "spotter-deck-arrow spotter-deck-next");
    next.disabled = (cursor >= list.length - 1 && !more) || discoveryLoading;
    media.append(visual, previous, next);
    card.append(media, content);

    const decisions = element("div", null, "spotter-actions spotter-discover-decisions");
    const hide = button("Hide", () => {
      preferences.hidden.add(member.id);
      savePreferences();
      renderDiscover();
      if (!visibleMembers().length && more) void loadMembers();
    });
    const refresh = iconButton("Refresh", "M20 11a8 8 0 1 1-2.2-5.5L21 8m0-5v5h-5", () => loadMembers(true), "spotter-secondary spotter-icon-button");
    const connect = button("Connect", () => connectMember(member), "spotter-primary");
    connect.disabled = hide.disabled = working;
    refresh.disabled = discoveryLoading;
    decisions.append(hide, refresh, connect);
    discover.append(card, decisions);
  }

  async function connectMember(member) {
    if (member.demo) {
      notify("This is a demo profile. Connect sends requests to real Spotter members.");
      return;
    }
    if (working) return;
    working = true;
    renderDiscover();
    try {
      if (await rpc("spotter_connect", { p_member_id: member.id }) !== true) throw new Error();
      members = members.filter(candidate => candidate.id !== member.id);
      notify("Connection request sent.");
      await loadMembers(true);
    } catch (_) {
      notify("This connection request couldn’t be sent. Try again.", true);
    } finally {
      working = false;
      if (tab === "discover") renderDiscover();
    }
  }

  function openDialog(title) {
    const request = ++activeDialog;
    dialogTitle.textContent = title;
    dialogContent.replaceChildren();
    if (!dialog.open) dialog.showModal();
    return request;
  }

  function labeled(label, input) {
    const field = element("label", null, "spotter-field");
    field.append(element("span", label), input);
    return field;
  }

  function checkbox(label, value, checked, name) {
    const input = element("input");
    input.type = "checkbox";
    input.value = value;
    input.name = name;
    input.checked = checked;
    const field = element("label", null, "spotter-check");
    field.append(input, element("span", label));
    return field;
  }

  function openFilters() {
    openDialog("Discovery filters");
    const current = filters();
    const form = element("form", null, "spotter-stack");
    const gender = element("select");
    gender.name = "gender";
    for (const [value, label] of genders) {
      const option = element("option", label);
      option.value = value;
      option.selected = value === preferences.gender;
      gender.append(option);
    }
    const gym = element("input");
    gym.name = "gym";
    gym.maxLength = 80;
    gym.value = current.gym;
    form.append(checkbox("Profiles with a photo only", "1", current.photos_only, "photos_only"),
      labeled("Partner gender", gender), labeled("Shared gym name", gym));
    for (const [title, name, choices] of [
      ["Goals", "goals", goals.map(goal => [goal, goal])], ["Days available", "days", days], ["Times available", "periods", periods]
    ]) {
      const set = element("fieldset");
      set.append(element("legend", title));
      for (const [value, label] of choices) set.append(checkbox(label, value, current[name].includes(value), name));
      form.append(set);
    }
    form.append(checkbox("Show demo profiles", "1", preferences.demos, "demos"));
    let restore = false;
    if (demos.some(member => preferences.hidden.has(member.id))) {
      const restoreButton = button("Restore hidden demo profiles", () => {
        restore = true;
        form.elements.demos.checked = true;
        restoreButton.textContent = "Demo profiles will be restored";
        restoreButton.disabled = true;
      });
      form.append(restoreButton);
    }
    const actions = element("div", null, "spotter-actions");
    const apply = element("button", "Apply filters", "spotter-primary");
    apply.type = "submit";
    actions.append(apply, button("Reset filters", () => {
      for (const input of form.querySelectorAll("input[name], select[name]")) {
        if (input.type === "checkbox" && input.name !== "demos") input.checked = false;
        else if (input.name === "gender" || input.name === "gym") input.value = "";
      }
    }));
    form.append(actions);
    form.addEventListener("submit", event => {
      event.preventDefault();
      const data = new FormData(form);
      preferences.gender = cleanGender(data.get("gender"));
      preferences.filters = { photos_only: data.has("photos_only"), gym: gym.value.trim(),
        goals: data.getAll("goals"), days: data.getAll("days"), periods: data.getAll("periods") };
      preferences.demos = data.has("demos");
      if (restore) for (const member of demos) preferences.hidden.delete(member.id);
      savePreferences();
      dialog.close();
      void loadMembers(true);
    });
    dialogContent.append(form);
  }

  function detailsRow(list, label, value) {
    if (value == null || value === "") return;
    const item = element("div");
    item.append(element("dt", label), element("dd", value));
    list.append(item);
  }

  function appendBodyType(list, bodyType) {
    if (!bodyType) return;
    const readable = bodyType[0].toUpperCase() + bodyType.slice(1);
    detailsRow(list, "Body type", readable);
    if (Object.hasOwn(bodyTypeHelp, readable)) {
      const explanation = element("details");
      explanation.append(element("summary", "What does " + readable.toLowerCase() + " mean?"), element("p", bodyTypeHelp[readable]));
      list.lastElementChild.lastElementChild.append(explanation);
    }
  }

  function metadataRows(member) {
    const list = element("dl");
    detailsRow(list, "Looking for", member.preferences?.join(" · "));
    detailsRow(list, "Availability", member.schedule || member.availability?.join(" · "));
    detailsRow(list, "Training level", member.level);
    detailsRow(list, "Sessions per week", member.frequency);
    return list;
  }

  function scheduleText(slots) {
    if (!Array.isArray(slots) || !slots.length) return "";
    const clock = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
    return slots.map(slot => {
      const times = Number.isInteger(slot.start_minute) && Number.isInteger(slot.end_minute)
        ? " " + clock.format(new Date(2000, 0, 1, 0, slot.start_minute)) + "–" + clock.format(new Date(2000, 0, 1, 0, slot.end_minute)) : "";
      return [dayLabels[slot.day] || slot.day, ...(slot.periods || [])].join(" ") + times;
    }).join(" · ");
  }

  async function showMember(member) {
    const request = openDialog(member.name || "Spotter profile");
    const summary = element("section", null, "spotter-stack");
    summary.append(portrait(member));
    if (member.demo) summary.append(element("p", "Demo profile", "spotter-muted"));
    if (member.about) summary.append(element("p", member.about));
    const list = metadataRows(member);
    summary.append(list);
    const actions = element("div", null, "spotter-actions");
    if (!member.demo) {
      actions.append(button("Report profile", () => report(member)), button("Block member", async () => {
        if (!window.confirm("Block this member on Spotter?")) return;
        try {
          if (await rpc("spotter_block", { p_member_id: member.id }) !== true) throw new Error();
          dialog.close();
          notify("Member blocked.");
          void loadMembers(true);
        } catch (_) { notify("This member couldn’t be blocked. Try again.", true); }
      }));
    }
    dialogContent.append(summary, actions);
    if (member.demo) {
      detailsRow(list, "Height", member.height);
      detailsRow(list, "Weight", member.weight);
      appendBodyType(list, member.bodyType);
      detailsRow(list, "Current program", member.program);
      detailsRow(list, "Gyms", member.gyms);
      return;
    }
    try {
      const details = await rpc("spotter_profile_details", { p_member_id: member.id });
      if (activeDialog !== request || !dialog.open || !details) return;
      if (details.height_inches != null) detailsRow(list, "Height", Math.floor(details.height_inches / 12) + " ft " + details.height_inches % 12 + " in");
      if (details.weight_lb != null) detailsRow(list, "Weight", details.weight_lb + " lb");
      appendBodyType(list, details.body_type);
      detailsRow(list, "Current program", details.current_program);
      detailsRow(list, "Current supplements", details.supplements);
      detailsRow(list, "Schedule", scheduleText(details.availability_schedule));
      detailsRow(list, "Gyms", details.gym_names?.join(" · "));
      detailsRow(list, "Workouts", details.shared_stats?.workouts);
      detailsRow(list, "Working sets", details.shared_stats?.working_sets);
      detailsRow(list, "Streak weeks", details.shared_stats?.streak_weeks);
      const gallery = element("div", null, "spotter-gallery");
      for (const photo of details.photos || []) {
        if (photo.status !== "approved" || !photo.path) continue;
        const card = element("figure", null, "spotter-stack");
        card.append(button("Report photo", () => report(member, photo.path)));
        gallery.append(card);
        if (photo.path !== member.portrait_path) void showStoredPhoto(card, photo.path);
      }
      if (gallery.children.length) summary.append(gallery);
    } catch (_) { /* The discovery profile remains available if optional details fail. */ }
  }

  function report(member, photoPath) {
    openDialog(photoPath ? "Report photo" : "Report profile");
    const form = element("form", null, "spotter-stack");
    const reason = element("textarea");
    reason.required = true;
    reason.maxLength = 500;
    const submit = element("button", "Send report", "spotter-primary");
    submit.type = "submit";
    const error = element("p", "", "spotter-error");
    error.setAttribute("role", "status");
    form.append(labeled("Reason for reporting", reason), submit, error);
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const value = reason.value.trim();
      if (!value || submit.disabled) return;
      submit.disabled = true;
      try {
        const result = photoPath ? await rpc("spotter_report_photo", { p_path: photoPath, p_reason: value })
          : await rpc("spotter_report", { p_member_id: member.id, p_reason: value, p_message_id: null });
        if (result !== true) throw new Error();
        dialog.close();
        notify("Report sent.");
      } catch (_) {
        error.textContent = "Your report couldn’t be sent. Try again.";
        submit.disabled = false;
      }
    });
    dialogContent.append(form);
  }

  async function start() {
    try {
      const config = window.FWB_SUPABASE_CONFIG;
      if (!config?.url || !config.anonKey || !auth || !window.supabase
          || !window.FWBSpotterProfile || !window.FWBSpotterConnections) throw new Error("Spotter could not start.");
      client = window.supabase.createClient(config.url, config.anonKey, {
        auth: { storage: auth.storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
      });
      const { data, error } = await client.auth.getUser();
      if (auth.requiresLogin(error) || (!error && !data?.user)) return goToLogin();
      if (error) throw error;
      user = data.user;
      preferences = readPreferences();
      client.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_OUT" || (session?.user?.id && session.user.id !== user.id)) {
          queueMicrotask(goToLogin);
        }
      });
      profile = await rpc("spotter_get_profile");
      const context = { client, rpc, user, getProfile: () => profile, showTab };
      profileView = window.FWBSpotterProfile.create({ ...context, root: profileRoot, updateProfile,
        getPreferredGender: () => preferences.gender,
        setPreferredGender: value => { preferences.gender = cleanGender(value); savePreferences(); },
        notify, loadWorkoutRows
      });
      networkView = window.FWBSpotterConnections.create({ ...context, root: networkRoot });
      status.hidden = true;
      showTab(currentRequestedTab());
    } catch (error) {
      if (auth?.requiresLogin(error)) return goToLogin();
      status.textContent = "Spotter couldn’t load.";
      status.append(" ", button("Try again", () => window.location.reload()));
    }
  }

  nav.addEventListener("click", event => {
    const target = event.target.closest?.("[data-spotter-tab]");
    if (target) { notify(); showTab(target.dataset.spotterTab); }
  });
  window.addEventListener("scroll", () => {
    if (nav.hidden) return;
    const scrollTop = Math.max(0, window.scrollY);
    const delta = scrollTop - dockScrollAnchor;
    if (scrollTop <= 24 || Math.abs(delta) >= 24) {
      nav.toggleAttribute("data-compact", scrollTop > 24 && delta > 0);
      dockScrollAnchor = scrollTop;
    }
  }, { passive: true });
  dialog.addEventListener("close", () => { activeDialog++; dialogContent.replaceChildren(); });
  window.addEventListener("hashchange", () => { if (location.hash !== "#spotter-content") showTab(currentRequestedTab()); });
  window.addEventListener("pagehide", closePage);
  window.addEventListener("pageshow", event => { if (event.persisted) window.location.reload(); });
  void start();
})();
