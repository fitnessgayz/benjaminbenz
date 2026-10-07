(function () {
  "use strict";
  const dialog = document.getElementById("gym-directory-dialog");
  if (!dialog || typeof supabaseClient === "undefined" || !supabaseClient) return;
  const $ = (selector) => dialog.querySelector(selector);
  const status = $("#gym-directory-status");
  const results = $("#gym-directory-results");
  const clientResults = $("#gym-directory-client-results");
  const details = $("#gym-directory-detail");
  const reviews = $("#gym-directory-reviews");
  const gallery = $("#gym-directory-gallery");
  const host = document.getElementById("gym-directory-panel-host");
  const equipment = {
    free_weights: "Free weights", dumbbells: "Dumbbells", barbells: "Barbells",
    racks: "Racks", cables: "Cables", machines: "Machines", cardio: "Cardio",
    kettlebells: "Kettlebells", functional: "Functional area", boxing: "Boxing",
    platforms: "Lifting platforms", bands: "Bands"
  };
  const amenities = {
    showers: "Showers", lockers: "Lockers", sauna: "Sauna", steam_room: "Steam room",
    pool: "Pool", parking: "Parking", wifi: "Wi-Fi", day_passes: "Day passes",
    classes: "Classes", accessible: "Accessible", childcare: "Childcare",
    open_24h: "Open 24 hours", towels: "Towels", personal_training: "Personal training"
  };
  const avatars = { strength: "💪", runner: "🏃", cycling: "🚴", boxing: "🥊", yoga: "🧘", swimming: "🏊", martial: "🥋", star: "⭐", lifting: "🏋️" };
  let targetInput = null;
  let location = null;
  let places = [];
  let clientPlaces = [];
  let selected = null;
  let photos = [];

  function optionLabels(selector, choices) {
    $(selector).innerHTML = Object.entries(choices).map(([id, label]) =>
      `<label><input type="checkbox" value="${id}" />${label}</label>`).join("");
  }
  optionLabels("[data-gym-equipment]", equipment);
  optionLabels("[data-gym-amenities]", amenities);
  optionLabels("[data-gym-add-equipment]", equipment);
  optionLabels("[data-gym-add-amenities]", amenities);

  function checked(selector) {
    return [...$(selector).querySelectorAll("input:checked")].map((input) => input.value);
  }
  function checkOptions(selector, values) {
    $(selector).querySelectorAll("input").forEach((input) => { input.checked = (values || []).includes(input.value); });
  }
  function visible(list) {
    return list.filter((place) => !$("#gym-directory-hotels").checked || place.kind === "hotel_gym");
  }
  function placeHTML(place) {
    const osm = place.source === "osm" && place.osm_type && place.osm_id
      ? `<a href="https://www.openstreetmap.org/${encodeURIComponent(place.osm_type)}/${encodeURIComponent(place.osm_id)}" target="_blank" rel="noopener">Map ↗</a>` : "";
    const distance = Number.isFinite(Number(place.distance_km)) && place.distance_km !== null
      ? ` · ${Number(place.distance_km).toFixed(1)} km away` : "";
    return `<article class="gym-directory-place"><div><strong>${escapeHtml(place.name)}</strong>
      <small>${place.kind === "hotel_gym" ? "Hotel with gym" : "Gym"}${distance}</small>
      ${place.address ? `<small>${escapeHtml(place.address)}</small>` : ""}</div>
      <div><button class="button button-ghost" type="button" data-gym-place="${escapeHtml(place.id)}">Details</button>${osm}</div></article>`;
  }
  function renderPlaces() {
    const nearby = visible(places);
    results.innerHTML = nearby.length ? nearby.map(placeHTML).join("")
      : '<p class="empty-state">Search near you for mapped gyms.</p>';
    const added = visible(clientPlaces);
    clientResults.innerHTML = added.length ? added.map(placeHTML).join("")
      : '<p class="empty-state">No client-added gyms yet.</p>';
  }
  async function loadClientPlaces() {
    const { data, error } = await supabaseClient.from("gym_places")
      .select("id,source,osm_type,osm_id,kind,name,latitude,longitude,address,website")
      .eq("source", "client").order("created_at", { ascending: false }).limit(100);
    if (error) { status.textContent = "Could not load client-added gyms."; return; }
    clientPlaces = data || [];
    renderPlaces();
  }

  async function photoWithoutMetadata(file) {
    const bitmap = await createImageBitmap(file);
    try {
      const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
      canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const image = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
      if (!image || image.size > 5 * 1024 * 1024) throw new Error("Choose a smaller photo.");
      return image;
    } finally { bitmap.close(); }
  }
  async function uploadPhotos(place, files, userID) {
    if (files.length + photos.filter((photo) => photo.is_mine).length > 3 ||
      files.some((file) => file.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type))) {
      throw new Error("Add at most 3 JPEG, PNG, or WebP photos per gym, each under 5 MB.");
    }
    for (const file of files) {
      const image = await photoWithoutMetadata(file);
      const path = `${crypto.randomUUID()}.jpg`;
      const { error: uploadError } = await supabaseClient.storage.from("gym-review-photos")
        .upload(path, image, { contentType: "image/jpeg", upsert: false });
      if (uploadError) throw uploadError;
      const { error: rowError } = await supabaseClient.from("gym_review_photos")
        .insert({ gym_id: place.id, user_id: userID, storage_path: path });
      if (rowError) {
        await supabaseClient.storage.from("gym-review-photos").remove([path]);
        throw rowError;
      }
    }
  }
  async function loadPhotos(place) {
    gallery.textContent = "Loading photos…";
    const { data, error } = await supabaseClient.rpc("gym_photos_for_place", { p_gym_id: place.id });
    if (selected?.id !== place.id) return;
    if (error) { gallery.textContent = "Could not load photos."; return; }
    photos = data || [];
    gallery.textContent = "";
    if (!photos.length) { gallery.textContent = "No photos yet."; return; }
    const { data: signed } = await supabaseClient.storage.from("gym-review-photos")
      .createSignedUrls(photos.map((photo) => photo.storage_path), 3600);
    if (selected?.id !== place.id) return;
    photos.forEach((photo, index) => {
      if (!signed?.[index]?.signedUrl) return;
      const figure = document.createElement("figure");
      const img = document.createElement("img");
      img.src = signed[index].signedUrl;
      img.alt = `Gym photo shared by ${photo.nickname || "a client"}`;
      img.loading = "lazy";
      const caption = document.createElement("figcaption");
      caption.textContent = `${avatars[photo.avatar_id] || avatars.strength} ${photo.nickname || "Client"}`;
      figure.append(img, caption);
      if (photo.is_mine) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "button button-ghost";
        remove.textContent = "Delete photo";
        remove.dataset.deleteGymPhoto = photo.id;
        figure.append(remove);
      }
      gallery.append(figure);
    });
  }
  async function loadFeatures(place) {
    const [combined, user, own] = await Promise.all([
      supabaseClient.rpc("gym_features_for_place", { p_gym_id: place.id }),
      supabaseClient.auth.getUser(),
      supabaseClient.from("gym_place_details").select("equipment,amenities").eq("gym_id", place.id).maybeSingle()
    ]);
    if (selected?.id !== place.id) return;
    const item = combined.data?.[0] || {};
    const names = (values, labels) => (values || []).map((value) => labels[value] || value).join(", ");
    $("#gym-directory-features").textContent = combined.error
      ? "Could not load equipment and amenities."
      : `Equipment: ${names(item.equipment, equipment) || "none reported"} · Amenities: ${names(item.amenities, amenities) || "none reported"}`;
    checkOptions("[data-gym-equipment]", own.data?.equipment);
    checkOptions("[data-gym-amenities]", own.data?.amenities);
    if (!user.data?.user) status.textContent = "Sign in to share gym details.";
  }
  async function loadReviews(place) {
    reviews.textContent = "Loading ratings…";
    const { data, error } = await supabaseClient.rpc("gym_reviews_for_place", { p_gym_id: place.id });
    if (selected?.id !== place.id) return;
    if (error) { reviews.textContent = "Could not load ratings."; return; }
    const items = data || [];
    const mine = items.find((review) => review.is_mine);
    $("#gym-directory-delete-review").hidden = !mine;
    $("#gym-directory-rating").value = mine ? String(mine.rating) : "";
    $("#gym-directory-review").value = mine?.body || "";
    reviews.innerHTML = items.length ? items.map((review) =>
      `<article class="gym-directory-review"><strong>${avatars[review.avatar_id] || avatars.strength} ${escapeHtml(review.nickname || "Client")}</strong>
      <span aria-label="${Number(review.rating)} out of 5 stars">${"★".repeat(Number(review.rating))}</span>
      ${review.body ? `<p>${escapeHtml(review.body)}</p>` : ""}</article>`).join("")
      : '<p class="empty-state">No ratings yet.</p>';
  }
  async function choosePlace(place) {
    selected = place;
    details.hidden = false;
    $("#gym-directory-place-name").textContent = place.name;
    $("#gym-directory-use").hidden = !targetInput;
    await Promise.all([loadReviews(place), loadPhotos(place), loadFeatures(place)]);
    details.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function search() {
    if (!navigator.geolocation) { status.textContent = "Location services are unavailable on this device."; return; }
    status.textContent = "Requesting your location…";
    $("#gym-directory-search").disabled = true;
    try {
      location = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
        ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
        reject, { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 }
      ));
      status.textContent = "Searching nearby gyms…";
      const { data, error } = await supabaseClient.functions.invoke("gym-search", { body: location });
      if (error || !Array.isArray(data?.places)) throw new Error(data?.error || "Gym search is unavailable right now.");
      places = data.places;
      $("#gym-directory-geoapify-credit").hidden = !places.some((place) => place.source === "geoapify");
      selected = null;
      details.hidden = true;
      renderPlaces();
      status.textContent = data.partial
        ? "Map search is busy. Showing saved and client-added gyms."
        : `${places.length} nearby gyms found${data.stale ? " (cached results)" : ""}.`;
    } catch (error) {
      status.textContent = error?.code === 1 ? "Allow location access to search nearby gyms. Client-added gyms are shown below."
        : `${error?.message || "Could not search nearby gyms."} Client-added gyms are shown below.`;
    } finally { $("#gym-directory-search").disabled = false; }
  }

  window.FWBGymDirectory = {
    openTab() {
      if (!host) return;
      targetInput = null;
      if (dialog.open) dialog.close();
      host.append(dialog);
      dialog.classList.add("in-tab");
      dialog.show();
      if (!clientPlaces.length) void loadClientPlaces();
    },
    leaveTab() {
      if (!dialog.classList.contains("in-tab")) return;
      if (dialog.open) dialog.close();
      dialog.classList.remove("in-tab");
      document.body.append(dialog);
    }
  };
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-find-nearby-gym]");
    if (!button) return;
    window.FWBGymDirectory.leaveTab();
    targetInput = button.closest(".workout-gym-picker")?.querySelector("[data-workout-gym]") || null;
    dialog.showModal();
    if (!places.length) void search();
    if (!clientPlaces.length) void loadClientPlaces();
  });
  $("#gym-directory-close").addEventListener("click", () => dialog.close());
  $("#gym-directory-search").addEventListener("click", search);
  $("#gym-directory-hotels").addEventListener("change", renderPlaces);
  dialog.addEventListener("click", (event) => {
    const button = event.target.closest("[data-gym-place]");
    if (!button) return;
    const place = [...places, ...clientPlaces].find((entry) => entry.id === button.dataset.gymPlace);
    if (place) void choosePlace(place);
  });
  $("#gym-directory-use").addEventListener("click", () => {
    if (!selected || !targetInput) return;
    targetInput.value = selected.name.slice(0, 80);
    targetInput.dispatchEvent(new Event("input", { bubbles: true }));
    dialog.close();
  });
  $("#gym-directory-features-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!selected) return;
    const { data: auth } = await supabaseClient.auth.getUser();
    if (!auth.user) return;
    const { error } = await supabaseClient.from("gym_place_details").upsert({
      gym_id: selected.id, user_id: auth.user.id,
      equipment: checked("[data-gym-equipment]"), amenities: checked("[data-gym-amenities]"),
      updated_at: new Date().toISOString()
    }, { onConflict: "gym_id,user_id" });
    status.textContent = error ? `Could not save equipment and amenities: ${error.message}` : "Equipment and amenities saved.";
    if (!error) await loadFeatures(selected);
  });
  $("#gym-directory-photo-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!selected) return;
    const files = [...$("#gym-directory-photos").files];
    if (!files.length) return;
    const { data: auth } = await supabaseClient.auth.getUser();
    if (!auth.user) return;
    const button = event.target.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      await uploadPhotos(selected, files, auth.user.id);
      $("#gym-directory-photos").value = "";
      status.textContent = "Photos shared.";
      await loadPhotos(selected);
    } catch (error) { status.textContent = `Could not upload photos: ${error.message}`; }
    finally { button.disabled = false; }
  });
  gallery.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-gym-photo]");
    const photo = photos.find((entry) => entry.id === button?.dataset.deleteGymPhoto && entry.is_mine);
    if (!photo || !selected || !window.confirm("Delete this photo?")) return;
    const { error: removeError } = await supabaseClient.storage.from("gym-review-photos").remove([photo.storage_path]);
    if (removeError) { status.textContent = "Could not delete photo."; return; }
    const { error } = await supabaseClient.from("gym_review_photos").delete().eq("id", photo.id);
    status.textContent = error ? "Could not finish deleting photo." : "Photo deleted.";
    await loadPhotos(selected);
  });
  $("#gym-directory-review-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!selected) return;
    const { data: auth } = await supabaseClient.auth.getUser();
    if (!auth.user) return;
    const { error } = await supabaseClient.from("gym_reviews").upsert({
      gym_id: selected.id, user_id: auth.user.id, rating: Number($("#gym-directory-rating").value),
      body: $("#gym-directory-review").value.trim().slice(0, 1200),
      updated_at: new Date().toISOString()
    }, { onConflict: "gym_id,user_id" });
    status.textContent = error ? `Could not save rating: ${error.message}` : "Rating and tip saved.";
    if (!error) await loadReviews(selected);
  });
  $("#gym-directory-delete-review").addEventListener("click", async () => {
    if (!selected || !window.confirm("Delete your rating and tip? Your photos stay shared.")) return;
    const { data: auth } = await supabaseClient.auth.getUser();
    if (!auth.user) return;
    const { error } = await supabaseClient.from("gym_reviews").delete()
      .eq("gym_id", selected.id).eq("user_id", auth.user.id);
    status.textContent = error ? "Could not delete rating and tip." : "Rating and tip deleted.";
    if (!error) await loadReviews(selected);
  });
  $("#gym-directory-add-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!location) { status.textContent = "Search near your location before adding a gym."; return; }
    const { data: auth } = await supabaseClient.auth.getUser();
    if (!auth.user) return;
    const tip = $("#gym-directory-add-tip").value.trim();
    const rating = Number($("#gym-directory-add-rating").value);
    if (tip && !rating) { status.textContent = "Choose a 1–5 rating to share a tip."; return; }
    const files = [...$("#gym-directory-add-photos").files];
    if (files.length > 3) { status.textContent = "Choose up to 3 photos."; return; }
    const button = event.target.querySelector("button[type=submit]");
    button.disabled = true;
    const { data: place, error } = await supabaseClient.from("gym_places").insert({
      source: "client", kind: $("#gym-directory-add-kind").value,
      name: $("#gym-directory-add-name").value.trim(),
      latitude: Math.round(location.latitude * 100) / 100,
      longitude: Math.round(location.longitude * 100) / 100,
      created_by: auth.user.id
    }).select("id,source,kind,name,latitude,longitude,address,website").single();
    if (error) { status.textContent = `Could not add gym: ${error.message}`; button.disabled = false; return; }
    clientPlaces.unshift(place);
    renderPlaces();
    await choosePlace(place);
    const errors = [];
    const selections = {
      equipment: checked("[data-gym-add-equipment]"), amenities: checked("[data-gym-add-amenities]")
    };
    if (selections.equipment.length || selections.amenities.length) {
      const saved = await supabaseClient.from("gym_place_details").upsert({
        gym_id: place.id, user_id: auth.user.id, ...selections
      }, { onConflict: "gym_id,user_id" });
      if (saved.error) errors.push("equipment or amenities");
    }
    if (rating) {
      const saved = await supabaseClient.from("gym_reviews").upsert({
        gym_id: place.id, user_id: auth.user.id, rating, body: tip
      }, { onConflict: "gym_id,user_id" });
      if (saved.error) errors.push("rating or tip");
    }
    if (files.length) {
      try { await uploadPhotos(place, files, auth.user.id); }
      catch { errors.push("photos"); }
    }
    $("#gym-directory-add-form").reset();
    await Promise.all([loadFeatures(place), loadReviews(place), loadPhotos(place)]);
    status.textContent = errors.length
      ? `Gym added, but ${errors.join(", ")} could not be saved. You can retry below.`
      : "Gym, photos, and details shared with signed-in clients.";
    button.disabled = false;
  });
  void loadClientPlaces();
  if (!document.querySelector('[data-client-dashboard-panel="gyms"]')?.hidden) {
    window.FWBGymDirectory.openTab();
  }
})();
