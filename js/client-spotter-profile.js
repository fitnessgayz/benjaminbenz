(() => {
  "use strict";

  const photoBucket = "spotter-profile-photos";
  const waiverVersion = "spotter-waiver-v1";
  const goals = ["Build strength", "Gain muscle", "Improve endurance", "Stay consistent", "Improve overall fitness", "Manage weight"];
  const preferences = ["Accountability", "A regular workout buddy", "Shared motivation", "Learning from each other"];
  const levels = ["Beginner", "Intermediate", "Advanced"];
  const gymOptions = ["I have a gym membership", "I’m open to any gym", "Home or outdoors"];
  const frequencies = ["1 session", "2 sessions", "3 sessions", "4 or more sessions"];
  const genders = [["undisclosed", "Prefer not to say"], ["woman", "Female"], ["man", "Male"], ["nonbinary", "Nonbinary"]];
  const partnerGenders = [["", "Everyone"], ["woman", "Women"], ["man", "Men"], ["nonbinary", "Nonbinary"]];
  const days = [["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"], ["thu", "Thursday"], ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"]];
  const periods = ["morning", "afternoon", "evening"];
  const bodyTypes = [
    ["", "Prefer not to say", "Leave body type off your Spotter profile."],
    ["ectomorph", "Ectomorph", "A more slender build, with a narrower frame."],
    ["mesomorph", "Mesomorph", "A more muscular build, with a sturdier frame."],
    ["endomorph", "Endomorph", "A fuller, rounder build."],
    ["mixed", "Mixed", "A combination of traits from more than one body type."]
  ];
  const metrics = [
    ["workouts", "Strength workouts in the last 30 days"],
    ["working_sets", "Working sets in the last 30 days"],
    ["streak_weeks", "Current training streak in weeks"]
  ];
  const steps = ["Training goals", "Partner preferences", "Availability", "Training level", "Gym preferences", "Training location", "Sessions per week", "Your Spotter profile"];
  const storeDefaults = () => ({ name: "", about: "", goals: [], preferences: [], availability: [], level: "", gym: "", gym_name: "", other_gym: false, zip: "", search_area: "same_zip", radius: 5, frequency: "", gender: "undisclosed" });
  const formatClock = minutes => Number.isInteger(minutes)
    ? `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}` : "";
  const parseClock = value => value ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : null;
  const dayLabel = code => days.find(([value]) => value === code)?.[1];
  const capitalize = value => value.charAt(0).toUpperCase() + value.slice(1);
  const finiteCount = value => Number.isInteger(value) && value >= 0 && value < 1e9;

  function legacyAvailability(schedule) {
    const labels = schedule.flatMap(({ day, periods }) => periods.map(period => `${["sat", "sun"].includes(day) ? "Weekend" : "Weekday"} ${period}s`));
    return [...new Set(labels)];
  }

  function draftDetails(details = {}) {
    const schedule = new Map((details.availability_schedule || []).map(slot => [slot.day, slot]));
    return {
      ...details,
      shared_stats: { ...details.shared_stats },
      gym_names: [...(details.gym_names || [])],
      availability_schedule: days.map(([day]) => ({
        day, periods: [...(schedule.get(day)?.periods || [])],
        start: formatClock(schedule.get(day)?.start_minute), end: formatClock(schedule.get(day)?.end_minute)
      }))
    };
  }

  function schedulePayload(draft) {
    return draft.availability_schedule.filter(slot => slot.periods.length).map(slot => ({
      day: slot.day, periods: slot.periods, start_minute: parseClock(slot.start), end_minute: parseClock(slot.end)
    }));
  }

  function validSchedule(schedule) {
    return schedule.every(({ start_minute: start, end_minute: end }) => (
      (start === null && end === null) || (Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end < 1440 && start < end)
    ));
  }

  function localDateKey(date) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  }

  function summarizeWorkoutRows(rows, now = new Date()) {
    const today = localDateKey(now);
    const eligible = rows.filter(row => row.entry_date && row.entry_date <= today);
    const normalizedType = row => String(row.set_type || "").toLowerCase().replaceAll("-", "").replaceAll("_", "");
    const exerciseCode = row => String(row.exercise_code || "").toUpperCase();
    const isWarmup = row => Number(row.set_number) >= 1000 || normalizedType(row) === "warmup" || exerciseCode(row) === "WARMUP";
    const isTimed = row => Number(row.duration_seconds) > 0;
    const hasReps = row => Number(row.reps) > 0 && Number.isFinite(Number(row.reps));
    const validWeight = row => Number.isFinite(Number(row.weight_used)) && Number(row.weight_used) >= 0;
    const sessionKey = row => row.session_id || row.workout_session_id || `${row.entry_date}|${String(row.workout_title || "").trim().toLowerCase()}`;
    const completed = new Set(eligible.filter(row => Number.isFinite(Date.parse(row.completed_at))).map(sessionKey));
    const recent = new Date(now);
    recent.setDate(recent.getDate() - 29);
    const sessions = new Set();
    const sets = new Set();
    const completedDates = new Set();
    let workingSets = 0;
    const recentKey = localDateKey(recent);
    for (const row of eligible) {
      if (isWarmup(row) || !completed.has(sessionKey(row))) continue;
      const cardio = exerciseCode(row) === "CARDIO";
      const strength = !cardio && normalizedType(row) !== "timed" && !isTimed(row) && validWeight(row) && hasReps(row);
      if (strength || isTimed(row) || (cardio && Number(row.weight_used) > 0)) completedDates.add(row.entry_date);
      if (!strength || row.entry_date < recentKey) continue;
      sessions.add(sessionKey(row));
      const set = row.set_id || row.id;
      if (!set || !sets.has(set)) workingSets++;
      if (set) sets.add(set);
    }
    const weekKey = value => {
      const date = new Date(`${value}T12:00:00`);
      date.setDate(date.getDate() - (date.getDay() + 6) % 7);
      return localDateKey(date);
    };
    const weeks = new Set([...completedDates].map(weekKey));
    const monday = new Date(`${weekKey(today)}T12:00:00`);
    if (!weeks.has(localDateKey(monday))) monday.setDate(monday.getDate() - 7);
    let streak = 0;
    while (weeks.has(localDateKey(monday))) {
      streak++;
      monday.setDate(monday.getDate() - 7);
    }
    return { workouts: sessions.size, working_sets: workingSets, streak_weeks: streak };
  }

  async function preparePhoto(file, square) {
    if (!file?.size || file.size > 25 * 1024 * 1024) throw new Error("Choose a photo smaller than 25 MB.");
    const url = URL.createObjectURL(file);
    try {
      const photo = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Choose a photo your browser can open, such as JPEG or PNG."));
        img.src = url;
      });
      const srcWidth = square ? Math.min(photo.naturalWidth, photo.naturalHeight) : photo.naturalWidth;
      const srcHeight = square ? srcWidth : photo.naturalHeight;
      const scale = Math.min(1, 1600 / Math.max(srcWidth, srcHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(srcWidth * scale));
      canvas.height = Math.max(1, Math.round(srcHeight * scale));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Photo processing is unavailable in this browser.");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(photo, (photo.naturalWidth - srcWidth) / 2, (photo.naturalHeight - srcHeight) / 2,
        srcWidth, srcHeight, 0, 0, canvas.width, canvas.height);
      const jpeg = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.82));
      if (!jpeg || jpeg.size > 2 * 1024 * 1024) throw new Error("That photo could not be compressed. Try a smaller image.");
      return jpeg;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function create({ root, client, rpc, user, getProfile, updateProfile, showTab, getPreferredGender, setPreferredGender, loadWorkoutRows }) {
    const doc = root.ownerDocument;
    const abort = new AbortController();
    const photos = new Map();
    let mode = "view";
    let step = 0;
    let profileDraft;
    let detailsDraft;
    let details;
    let detailsLoading = false;
    let detailsError = false;
    let acceptedAge = false;
    let acceptedWaiver = false;
    let partnerGender = "";
    let isNew = false;
    let busy = false;
    let info = "";
    let error = "";
    let stats;
    let statsLoading = false;
    let statsError = false;
    const alive = () => !abort.signal.aborted;
    function currentAccount(operation) {
      const run = () => {
        if (!alive()) throw new DOMException("Spotter closed", "AbortError");
        return operation();
      };
      return window.FWB_AUTH_SESSION?.withAccount
        ? window.FWB_AUTH_SESSION.withAccount(client, { id: user.id, email: user.email }, run)
        : Promise.resolve().then(run);
    }

    function node(tag, text, className) {
      const item = doc.createElement(tag);
      if (text !== undefined) item.textContent = text;
      if (className) item.className = className;
      return item;
    }

    function button(text, run, primary = false) {
      const item = node("button", text, primary ? "spotter-primary" : "spotter-secondary");
      item.type = "button";
      item.disabled = busy;
      item.addEventListener("click", run);
      return item;
    }

    function check(label, value, onChange) {
      const item = node("label", undefined, "spotter-field spotter-choice");
      const field = node("input");
      field.type = "checkbox";
      field.checked = Boolean(value);
      field.disabled = busy;
      field.addEventListener("change", () => onChange(field.checked));
      item.append(field, node("span", label));
      return item;
    }

    function input(label, value, onChange, options = {}) {
      const item = node("label", undefined, "spotter-field");
      const field = node(options.multiline ? "textarea" : "input");
      const { multiline, ...attributes } = options;
      Object.assign(field, attributes);
      field.value = value ?? "";
      field.disabled = busy;
      field.addEventListener("input", () => onChange(field.value));
      item.append(node("span", label), field);
      return item;
    }

    function select(label, choices, value, onChange) {
      const item = node("label", undefined, "spotter-field");
      const field = node("select");
      field.disabled = busy;
      field.setAttribute("aria-label", label);
      for (const [value, label] of choices) {
        const option = node("option", label);
        option.value = value;
        field.append(option);
      }
      field.value = value ?? "";
      field.addEventListener("change", () => onChange(field.value));
      item.append(node("span", label), field);
      return item;
    }

    function choices(groupLabel, options, selected, update) {
      const group = node("fieldset", undefined, "spotter-stack spotter-choice-group");
      group.append(node("legend", groupLabel));
      const values = new Set(selected);
      for (const choice of options) {
        group.append(check(capitalize(choice), values.has(choice), checked => {
          if (checked) values.add(choice);
          else values.delete(choice);
          update([...values]);
        }));
      }
      return group;
    }

    function card(title) {
      const container = node("article", undefined, "spotter-card spotter-stack");
      container.append(node("h2", title));
      return container;
    }

    function actions(...buttons) {
      const wrapper = node("div", undefined, "spotter-actions");
      wrapper.append(...buttons);
      return wrapper;
    }

    function status(inlineOnly = false) {
      const existing = root.querySelector("[data-spotter-profile-status]");
      const message = existing || node("p");
      message.dataset.spotterProfileStatus = "";
      message.textContent = error || info;
      message.className = error ? "spotter-error" : "spotter-muted";
      message.setAttribute("role", error ? "alert" : "status");
      message.hidden = !message.textContent;
      if (!existing && !inlineOnly) root.append(message);
    }

    function show(next, focus = true) {
      mode = next;
      error = "";
      info = "";
      render();
      if (!focus) return;
      const heading = root.querySelector("h2");
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
    }

    function startSetup(profile) {
      isNew = !profile;
      profileDraft = { ...storeDefaults(), ...profile };
      detailsDraft = draftDetails(details || {});
      if (!detailsDraft.gym_names.length && profile?.gym_name) {
        detailsDraft.gym_names = [profile.gym_name];
      }
      acceptedAge = false;
      acceptedWaiver = false;
      partnerGender = getPreferredGender?.() || "";
      step = 0;
      show(isNew ? "consent" : "setup");
    }

    function welcome() {
      const content = card("Find your next workout partner");
      const preview = node("div", undefined, "spotter-setup-preview");
      for (const name of ["mateo", "janelle"]) {
        const portrait = node("img");
        portrait.src = `/images/spotter/demo-${name}.jpg`;
        portrait.alt = "";
        preview.append(portrait);
      }
      const benefits = node("ul");
      for (const benefit of ["Discover nearby workout partners", "Join local clubs and browse their message boards", "Chat when you both agree to connect"]) {
        benefits.append(node("li", benefit));
      }
      content.append(preview, node("p", "Meet people who share your training goals, schedule, and gym preferences."), benefits,
        node("p", "Confirm your age and accept the waiver before answering eight matching questions. Adding a Spotter photo is optional.", "spotter-muted"),
        button("Sign up for Spotter", () => startSetup(null), true));
      return content;
    }

    function consent() {
      const content = card("Before you set up");
      const waiver = node("details", undefined, "spotter-field");
      waiver.append(node("summary", "Review Spotter liability waiver"), node("p", "Meeting and exercising with other members is voluntary and involves risks, including injury. Spotter connects members. You decide where, how, and with whom you train."),
        node("p", "To the extent permitted by law, you assume those risks and release GRUNTR from claims arising from your voluntary participation in workouts or meetups you arrange through Spotter."));
      const continueButton = button("Agree and continue", () => {
        if (acceptedAge && acceptedWaiver) show("setup");
      }, true);
      const update = () => { continueButton.disabled = !acceptedAge || !acceptedWaiver; };
      update();
      content.append(node("p", "Spotter is for adults 18 and older."), waiver,
        check("I’m 18 or older", acceptedAge, value => { acceptedAge = value; update(); }),
        check("I have read and agree to the Spotter waiver.", acceptedWaiver, value => { acceptedWaiver = value; update(); }),
        actions(button("Back", () => show("view")), continueButton));
      return content;
    }

    function availabilityFields() {
      const group = node("fieldset", undefined, "spotter-stack spotter-availability");
      group.append(node("legend", "Days and times available"));
      if (!details?.availability_schedule?.length && profileDraft.availability.length) {
        group.append(node("p", `Current availability · ${profileDraft.availability.join(" · ")}`, "spotter-muted"));
      }
      for (const slot of detailsDraft.availability_schedule) {
        const section = node("details", undefined, "spotter-field");
        section.open = slot.periods.length > 0;
        section.append(node("summary", dayLabel(slot.day)),
          choices(`Preferred time on ${dayLabel(slot.day)}`, periods, slot.periods, list => { slot.periods = list; }),
          input("Earliest time (optional)", slot.start, value => { slot.start = value; }, { type: "time" }),
          input("Latest time (optional)", slot.end, value => { slot.end = value; }, { type: "time" }));
        group.append(section);
      }
      return group;
    }

    function gymFields() {
      const wrap = node("div", undefined, "spotter-stack");
      wrap.append(select("Gym access", [["", "Choose one"], ...gymOptions.map(value => [value, value])], profileDraft.gym, value => {
        profileDraft.gym = value;
        gymDetails.hidden = value !== gymOptions[0];
      }));
      const gymDetails = node("div", undefined, "spotter-stack");
      gymDetails.hidden = profileDraft.gym !== gymOptions[0];
      gymDetails.append(check("Open to a different gym", profileDraft.other_gym, value => { profileDraft.other_gym = value; }));
      const gyms = node("fieldset", undefined, "spotter-stack");
      gyms.append(node("legend", "Gym names (optional)"));
      for (let index = 0; index < 5; index++) {
        gyms.append(input(`Gym ${index + 1}`, detailsDraft.gym_names[index], value => { detailsDraft.gym_names[index] = value; }, { maxLength: 80 }));
      }
      if (detailsDraft.gym_names.length < 2) {
        const more = node("details");
        more.append(node("summary", "Add more gyms"), ...[...gyms.children].slice(2));
        gyms.append(more);
      }
      gymDetails.append(gyms, check("Show my listed gyms on Spotter", detailsDraft.share_gyms, value => { detailsDraft.share_gyms = value; }));
      wrap.append(gymDetails);
      return wrap;
    }

    function trainingFields() {
      const wrap = node("fieldset", undefined, "spotter-stack");
      const bodyGuide = node("details", undefined, "spotter-field");
      bodyGuide.append(node("summary", "What do the body types mean?"));
      for (const [, label, description] of bodyTypes) bodyGuide.append(node("p", `${label} · ${description}`));
      const update = key => value => { detailsDraft[key] = value; };
      wrap.append(node("legend", "Training details"), input("Height in inches (optional)", detailsDraft.height_inches, update("height_inches"), { type: "number", min: 36, max: 96, step: 1 }),
        input("Weight in pounds (optional)", detailsDraft.weight_lb, update("weight_lb"), { type: "number", min: 40, max: 900, step: 0.1 }),
        check("Share height and weight with accepted connections", detailsDraft.share_measurements, update("share_measurements")),
        select("Body type (optional)", bodyTypes, detailsDraft.body_type || "", update("body_type")), bodyGuide,
        input("Current workout program (optional)", detailsDraft.current_program, update("current_program"), { maxLength: 120 }),
        input("Current supplements (optional)", detailsDraft.supplements, update("supplements"), { multiline: true, rows: 2, maxLength: 240 }));
      return wrap;
    }

    function statsFields() {
      const group = node("fieldset", undefined, "spotter-stack");
      group.append(node("legend", "Share training stats"), node("p", "Choose which counts to share with accepted connections.", "spotter-muted"));
      if (loadWorkoutRows && !stats) {
        group.append(button(statsLoading ? "Loading training stats…" : "Load training stats", async () => {
          statsLoading = true;
          statsError = false;
          render();
          try {
            const rows = await loadWorkoutRows();
            if (!Array.isArray(rows)) throw new Error("Workout history unavailable.");
            stats = summarizeWorkoutRows(rows);
          } catch (_) {
            statsError = true;
          } finally {
            statsLoading = false;
            render();
          }
        }));
        if (statsLoading) group.querySelector("button").disabled = true;
      }
      if (statsError) group.append(node("p", "Training stats are unavailable right now.", "spotter-error"));
      for (const [key, label] of metrics) {
        const value = stats?.[key] ?? detailsDraft.shared_stats[key];
        const toggle = check(`${label} · ${finiteCount(value) ? value : "Unavailable"}`, finiteCount(detailsDraft.shared_stats[key]), checked => {
          if (checked && finiteCount(value)) detailsDraft.shared_stats[key] = value;
          else delete detailsDraft.shared_stats[key];
        });
        if (!finiteCount(value)) toggle.querySelector("input").disabled = true;
        group.append(toggle);
      }
      return group;
    }

    function setup() {
      const content = card(steps[step]);
      const progress = node("progress");
      progress.max = steps.length;
      progress.value = step + 1;
      progress.setAttribute("aria-label", `Step ${step + 1} of ${steps.length}`);
      content.insertBefore(node("p", `Step ${step + 1} of ${steps.length}`, "spotter-muted"), content.firstChild);
      content.prepend(progress);
      const set = key => value => { profileDraft[key] = value; };
      switch (step) {
        case 0: content.append(choices("What are your training goals?", goals, profileDraft.goals, set("goals"))); break;
        case 1: content.append(choices("What are you looking for?", preferences, profileDraft.preferences, set("preferences")),
          select("Preferred partner gender", partnerGenders, partnerGender, value => { partnerGender = value; })); break;
        case 2: content.append(availabilityFields()); break;
        case 3: content.append(select("Experience", [["", "Choose one"], ...levels.map(value => [value, value])], profileDraft.level, set("level"))); break;
        case 4: content.append(gymFields()); break;
        case 5: {
          const radius = select("Search radius", [5, 10, 25, 50].map(value => [String(value), `${value} miles`]),
            String(profileDraft.radius), value => set("radius")(Number(value)));
          radius.hidden = profileDraft.search_area !== "radius";
          content.append(input("Training ZIP code", profileDraft.zip, set("zip"), { maxLength: 5, inputMode: "numeric", autoComplete: "postal-code" }),
            node("p", "Your ZIP is used for matching and is hidden from other members.", "spotter-muted"),
            select("Search coverage", [["same_zip", "Same ZIP"], ["radius", "Radius"]], profileDraft.search_area, value => {
              profileDraft.search_area = value;
              radius.hidden = value !== "radius";
            }), radius);
          break;
        }
        case 6: content.append(select("Planned training sessions", [["", "Choose one"], ...frequencies.map(value => [value, value])],
          profileDraft.frequency, set("frequency"))); break;
        case 7: content.append(input("Display name", profileDraft.name, set("name"), { maxLength: 60 }),
          select("Gender", genders, profileDraft.gender, set("gender")),
          input("About you (optional)", profileDraft.about, set("about"), { multiline: true, rows: 3, maxLength: 500 }),
          trainingFields(), statsFields(),
          node("p", "Profile photos are reviewed before appearing in Discover. Only accepted connections can see additional approved photos.", "spotter-muted"));
      }
      const form = node("form", undefined, "spotter-stack");
      form.append(...content.children);
      const next = button(step === 7 ? (isNew ? "Create Spotter profile" : "Save profile") : "Continue", () => {}, true);
      next.type = "submit";
      form.append(actions(button(step || isNew ? "Back" : "Cancel", () => {
        if (step) { step--; show("setup"); }
        else show(isNew ? "consent" : "view");
      }), next));
      form.addEventListener("submit", event => { event.preventDefault(); advance(); });
      content.append(form);
      return content;
    }

    function advance() {
      const schedule = schedulePayload(detailsDraft);
      error = [
        !profileDraft.goals.length && "Choose at least one training goal.",
        !profileDraft.preferences.length && "Choose what you’re looking for in a partner.",
        !validSchedule(schedule) ? "Enter both times for a day and make the latest time later than the earliest."
          : !schedule.length && (!profileDraft.availability.length || details?.availability_schedule?.length) && "Choose at least one day and time.",
        !profileDraft.level && "Choose your experience level.",
        !profileDraft.gym && "Choose your gym access.",
        (!/^\d{5}$/.test(profileDraft.zip.trim()) || profileDraft.zip.trim() === "00000") && "Enter a five-digit training ZIP.",
        !profileDraft.frequency && "Choose how often you train.",
        !profileDraft.name.trim() && "Enter a display name."
      ][step] || "";
      if (error) { status(); return; }
      if (step + 1 < steps.length) { step++; show("setup"); }
      else void save(schedule);
    }

    async function act(work, fallback) {
      if (busy || !alive()) return;
      busy = true;
      error = "";
      info = "";
      render();
      try {
        await work();
      } catch (failure) {
        if (alive()) error = failure?.code === "22023" ? failure.message : fallback;
      } finally {
        busy = false;
        render();
      }
    }

    async function save(schedule) {
      if (isNew && !getProfile() && !(acceptedAge && acceptedWaiver)) {
        show("consent");
        return;
      }
      await act(async () => {
        const firstSave = isNew && !getProfile();
        const hasMembership = profileDraft.gym === gymOptions[0];
        const gymNames = hasMembership ? detailsDraft.gym_names.map(name => name.trim()).filter(Boolean) : [];
        const available = legacyAvailability(schedule);
        const profile = await rpc("spotter_save_profile", { p_profile: {
          ...profileDraft,
          name: profileDraft.name.trim(),
          zip: profileDraft.zip.trim(),
          gym_name: "",
          other_gym: hasMembership && Boolean(profileDraft.other_gym),
          availability: available.length ? available : profileDraft.availability,
          ...(firstSave ? { adult: true, waiver_version: waiverVersion } : {})
        } });
        if (!alive() || !profile) return;
        updateProfile(profile);
        setPreferredGender?.(partnerGender);
        const shared = { ...detailsDraft.shared_stats };
        if (stats) for (const [key] of metrics) if (finiteCount(shared[key])) shared[key] = stats[key];
        try {
          const result = await rpc("spotter_save_profile_details", {
            p_body_type: detailsDraft.body_type || "",
            p_supplements: detailsDraft.supplements || "",
            p_current_program: detailsDraft.current_program || "",
            p_shared_stats: shared,
            p_height_inches: detailsDraft.height_inches ? Number(detailsDraft.height_inches) : null,
            p_weight_lb: detailsDraft.weight_lb ? Number(detailsDraft.weight_lb) : null,
            p_share_measurements: Boolean(detailsDraft.share_measurements),
            p_availability_schedule: schedule,
            p_gym_names: gymNames,
            p_share_gyms: gymNames.length > 0 && Boolean(detailsDraft.share_gyms)
          });
          if (!alive()) return;
          if (!result) throw new Error("Spotter details were not saved.");
          details = result;
        } catch (failure) {
          if (!alive()) return;
          error = failure?.code === "22023"
            ? `Your basic profile was saved. Training details need attention. ${failure.message}`
            : "Your basic profile was saved. Training details could not be saved. Try again.";
          return;
        }
        mode = isNew ? "photos" : "view";
        info = isNew ? "Your Spotter profile is active." : "Spotter profile saved.";
        isNew = false;
      }, "Your Spotter profile could not be saved. Try again.");
    }

    async function loadDetails() {
      if (!alive() || !getProfile() || detailsLoading) return;
      detailsLoading = true;
      detailsError = false;
      try {
        const result = await rpc("spotter_profile_details");
        if (!result) throw new Error("Spotter details were unavailable.");
        if (alive()) details = result;
      } catch (_) {
        detailsError = true;
      } finally {
        detailsLoading = false;
        render();
      }
    }

    function photoPreview(photo, label) {
      const frame = node("div", label, "spotter-photo-preview");
      if (!photo?.path) return frame;
      const image = node("img");
      image.alt = label;
      if (!photos.has(photo.path)) {
        const request = currentAccount(async () => {
          if (!alive()) return null;
        const { data, error } = await client.storage.from(photoBucket).download(photo.path);
          if (error || !data) return null;
          if (!alive() || !photos.has(photo.path)) return null;
          return URL.createObjectURL(data);
        }).catch(() => null);
        photos.set(photo.path, request);
      }
      photos.get(photo.path).then(url => {
        if (url && alive() && frame.isConnected) { image.src = url; frame.replaceChildren(image); }
      });
      return frame;
    }

    function clearPhoto(path) {
      if (!path) return;
      photos.get(path)?.then(url => { if (url) URL.revokeObjectURL(url); });
      photos.delete(path);
    }

    async function refreshPhotos() {
      try {
        const result = await rpc("spotter_profile_details");
        if (result && alive()) details = result;
      } catch (_) {
        if (alive()) info += " Reload your profile to see the current photo status.";
      }
    }

    async function uploadPhoto(file, slot, oldPhoto) {
      await act(async () => {
        const jpeg = await preparePhoto(file, slot === 0);
        if (!alive()) return;
        const uploadId = window.crypto.randomUUID();
        const path = await rpc("spotter_reserve_photo", { p_slot: slot, p_upload_id: uploadId });
        if (!alive()) return;
        if (typeof path !== "string") throw new Error("Photo reservation failed.");
        const bucket = client.storage.from(photoBucket);
        const { error } = await currentAccount(() => bucket.upload(path, jpeg, {
          contentType: "image/jpeg", cacheControl: "0", upsert: false
        }));
        if (error) throw error;
        if (!alive()) return;
        if (!(await rpc("spotter_submit_photo", { p_upload_id: uploadId }))) throw new Error("Photo submission failed.");
        if (!alive()) return;
        clearPhoto(oldPhoto?.path);
        if (oldPhoto?.path && oldPhoto.path !== path) {
          try { await currentAccount(() => bucket.remove([oldPhoto.path])); } catch (_) { /* Retired photos stay private. */ }
        }
        if (!alive()) return;
        details = { ...details, photos: [...(details?.photos || []).filter(photo => photo.slot !== slot), { slot, path, status: "pending" }] };
        info = "Photo submitted for approval.";
        await refreshPhotos();
      }, "This photo could not be uploaded. Try another JPEG or PNG.");
    }

    async function removePhoto(photo) {
      if (!window.confirm("Remove this photo from your Spotter profile?")) return;
      await act(async () => {
        if (!(await rpc("spotter_remove_photo", { p_slot: photo.slot }))) throw new Error("Photo removal failed.");
        if (!alive()) return;
        clearPhoto(photo.path);
        details = { ...details, photos: (details?.photos || []).filter(item => item.slot !== photo.slot) };
        info = "Photo removed.";
        try { await currentAccount(() => client.storage.from(photoBucket).remove([photo.path])); } catch (_) { /* Removed slots stay private. */ }
        await refreshPhotos();
      }, "This photo could not be removed. Try again.");
    }

    function photoEditor(profile) {
      const content = card(mode === "photos" ? "Add your Spotter photos" : "Photos");
      content.append(node("p", "Your profile photo helps people recognize you. Approved profile photos appear in Discover. Extra photos are shared only with accepted connections after approval.", "spotter-muted"));
      const grid = node("div", undefined, "spotter-photo-grid");
      const statuses = { pending: "In review", approved: "Approved", rejected: "Needs a different photo" };
      for (let slot = 0; slot < 4; slot++) {
        const photo = (details?.photos || []).find(item => item.slot === slot);
        const label = slot === 0 ? "Profile photo" : `Extra photo ${slot}`;
        const tile = node("div", undefined, "spotter-stack spotter-photo-slot");
        tile.append(photoPreview(photo, label), node("strong", label), node("span", statuses[photo?.status] || "No photo", "spotter-muted"));
        if (profile.active) {
          const fileLabel = node("label", undefined, "spotter-field");
          const file = node("input");
          file.type = "file";
          file.accept = "image/*";
          file.disabled = busy;
          file.addEventListener("change", () => { if (file.files[0]) void uploadPhoto(file.files[0], slot, photo); });
          fileLabel.append(node("span", `${photo ? "Replace" : "Add"} ${label.toLowerCase()}`), file);
          tile.append(fileLabel);
          if (photo) tile.append(button(`Remove ${label.toLowerCase()}`, () => { void removePhoto(photo); }));
        }
        grid.append(tile);
      }
      content.append(grid);
      if (mode === "photos") content.append(button("Go to Discover", () => { show("view", false); showTab("discover"); }, true));
      if (!profile.active) content.append(node("p", "Resume your Spotter profile to update photos.", "spotter-muted"));
      return content;
    }

    function updateActive(profile) {
      return act(async () => {
        const updated = await rpc("spotter_set_active", { p_active: !profile.active });
        if (!alive() || !updated) return;
        updateProfile(updated);
        info = updated.active ? "Spotter profile resumed." : "Spotter profile paused.";
      }, "Your Spotter visibility could not be updated. Try again.");
    }

    function readOnlyProfile(profile) {
      const content = card(profile.name || "My Spotter profile");
      content.append(node("p", profile.active ? "Active on Spotter" : "Paused on Spotter", "spotter-muted"));
      if (profile.about) content.append(node("p", profile.about));
      const list = node("dl", undefined, "spotter-profile-details");
      const add = (label, detail) => {
        if (!detail) return;
        const entry = node("dd");
        entry.append(detail);
        list.append(node("dt", label), entry);
      };
      add("Training goals", profile.goals?.join(" · "));
      add("Looking for", profile.preferences?.join(" · "));
      add("Gender", genders.find(([value]) => value !== "undisclosed" && value === profile.gender)?.[1]);
      add("Experience", profile.level);
      add("Training schedule", profile.frequency);
      add("Availability", (details?.availability_schedule || []).map(slot => {
        const time = Number.isInteger(slot.start_minute) && Number.isInteger(slot.end_minute)
          ? ` ${formatClock(slot.start_minute)}–${formatClock(slot.end_minute)}` : "";
        return `${dayLabel(slot.day)} · ${slot.periods.map(capitalize).join(", ")}${time}`;
      }).join(" / ") || profile.availability?.join(" · "));
      add("Gyms", details?.gym_names?.join(" · ") || profile.gym_name);
      add("Current workout program", details?.current_program);
      add("Current supplements", details?.supplements);
      const bodyType = bodyTypes.find(([value]) => value && value === details?.body_type);
      if (bodyType) {
        const guide = node("details");
        guide.append(node("summary", bodyType[1]), node("p", bodyType[2]));
        add("Body type", guide);
      }
      add("Height", details?.height_inches && `${Math.floor(details.height_inches / 12)} ft ${details.height_inches % 12} in`);
      add("Weight", details?.weight_lb && `${details.weight_lb} lb`);
      for (const [key, label] of metrics) if (finiteCount(details?.shared_stats?.[key])) add(label, String(details.shared_stats[key]));
      content.append(list);
      const edit = button("Edit Spotter profile", () => startSetup(profile), true);
      edit.disabled = busy || !details;
      const controls = [edit, button(profile.active ? "Pause profile" : "Resume profile", () => { void updateActive(profile); })];
      if (profile.active) controls.push(button("Requests", () => showTab("requests")));
      content.append(actions(...controls));
      if (!details) {
        if (detailsError) content.append(node("p", "Training details and photos are unavailable.", "spotter-error"),
          button("Reload profile", () => { void loadDetails(); }));
        else content.append(node("p", "Loading training details and photos…", "spotter-muted"));
      }
      return content;
    }

    function render() {
      if (!alive()) return;
      root.replaceChildren();
      const profile = getProfile();
      if (mode === "consent") root.append(consent());
      else if (mode === "setup") root.append(setup());
      else if (mode === "photos" && profile) root.append(photoEditor(profile));
      else if (!profile) root.append(welcome());
      else {
        root.append(readOnlyProfile(profile));
        if (details) root.append(photoEditor(profile));
        else if (!detailsError && !detailsLoading) void loadDetails();
      }
      status();
    }

    return {
      render,
      dispose() {
        abort.abort();
        for (const path of photos.keys()) clearPhoto(path);
        root.replaceChildren();
      }
    };
  }

  window.FWBSpotterProfile = { create };
})();
