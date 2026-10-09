(function () {
  "use strict";
  const dialog = document.getElementById("gym-directory-dialog");
  if (!dialog || !supabaseClient) return;
  const $ = (selector) => dialog.querySelector(selector);
  const status = $("#gym-directory-status");
  const results = $("#gym-directory-results");
  const details = $("#gym-directory-detail");
  const reviews = $("#gym-directory-reviews");
  let targetInput = null;
  let location = null;
  let places = [];
  let selected = null;
  let myPhotoCount = 0;
  const avatars = { strength: '💪', runner: '🏃', cycling: '🚴', boxing: '🥊', yoga: '🧘', swimming: '🏊', martial: '🥋', star: '⭐', lifting: '🏋️', walking: '🚶', hiking: '🥾', basketball: '🏀', soccer: '⚽', tennis: '🎾', rowing: '🚣', climbing: '🧗' };
  const avatarEmoji = id => window.FWB_COMMUNITY_AVATAR?.emojiFor(id) ||
    (Object.hasOwn(avatars, id) ? avatars[id] : avatars.strength);

  function visiblePlaces() {
    return places.filter((place) => !$("#gym-directory-hotels").checked || place.kind === "hotel_gym");
  }

  function renderPlaces() {
    const shown = visiblePlaces();
    results.innerHTML = shown.length ? shown.map((place) => {
      const osm = place.source === "osm" && place.osm_type && place.osm_id
        ? `<a href="https://www.openstreetmap.org/${encodeURIComponent(place.osm_type)}/${encodeURIComponent(place.osm_id)}" target="_blank" rel="noopener">Map ↗</a>` : "";
      return `<article class="gym-directory-place">
        <div><strong>${escapeHtml(place.name)}</strong><small>${place.kind === "hotel_gym" ? (place.source === "osm" ? "Hotel with mapped gym" : "Hotel with client-reported gym") : "Gym"} · ${Number(place.distance_km).toFixed(1)} km away</small>
        ${place.address ? `<small>${escapeHtml(place.address)}</small>` : ""}</div>
        <div><button class="button button-ghost" type="button" data-gym-place="${escapeHtml(place.id)}">Reviews &amp; photos</button>${osm}</div>
      </article>`;
    }).join("") : '<p class="empty-state">No matching gyms here yet. Try another area or add a gym you know.</p>';
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

  async function loadReviews(place) {
    reviews.textContent = "Loading reviews…";
    const { data, error } = await supabaseClient.rpc("gym_reviews_for_place", { p_gym_id: place.id });
    if (selected?.id !== place.id) return;
    if (error) { reviews.textContent = "Could not load reviews."; return; }
    const items = data || [];
    const mine = items.find((review) => review.is_mine);
    myPhotoCount = mine?.photo_paths?.length || 0;
    $("#gym-directory-delete-review").hidden = !mine;
    $("#gym-directory-rating").value = mine ? String(mine.rating) : "";
    $("#gym-directory-review").value = mine?.body || "";
    reviews.innerHTML = items.length ? items.map((review) => {
      const safeName = escapeHtml(review.nickname || "Client");
      const stars = "★".repeat(Number(review.rating));
      return `<article class="gym-directory-review"><strong>${escapeHtml(avatarEmoji(review.avatar_id))} ${safeName}</strong> <span aria-label="${review.rating} out of 5 stars">${stars}</span>
        <p>${escapeHtml(review.body)}</p><div class="gym-directory-review-photos" data-review-photos="${escapeHtml(review.id)}"></div></article>`;
    }).join("") : '<p class="empty-state">No reviews yet. Be the first to share your experience.</p>';
    for (const review of items) {
      const paths = (review.photo_paths || []).slice(0, 3);
      if (!paths.length) continue;
      const { data: signed } = await supabaseClient.storage.from("gym-review-photos").createSignedUrls(paths, 3600);
      if (selected?.id !== place.id) return;
      const holder = [...reviews.querySelectorAll("[data-review-photos]")].find((node) => node.dataset.reviewPhotos === review.id);
      if (!holder) continue;
      (signed || []).forEach((photo) => {
        if (!photo.signedUrl) return;
        const img = document.createElement("img");
        img.src = photo.signedUrl;
        img.alt = `Gym photo shared by ${review.nickname || "a client"}`;
        img.loading = "lazy";
        holder.appendChild(img);
      });
    }
  }

  async function choosePlace(place) {
    selected = place;
    details.hidden = false;
    $("#gym-directory-place-name").textContent = place.name;
    $("#gym-directory-use").hidden = !targetInput;
    await loadReviews(place);
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
      selected = null;
      details.hidden = true;
      renderPlaces();
      status.textContent = `${places.length} nearby gyms found${data.stale ? " (cached results)" : ""}.`;
    } catch (error) {
      status.textContent = error?.code === 1 ? "Allow location access to search nearby gyms." : error?.message || "Could not search nearby gyms.";
    } finally {
      $("#gym-directory-search").disabled = false;
    }
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-find-nearby-gym]");
    if (!button) return;
    targetInput = button.closest(".workout-gym-picker")?.querySelector("[data-workout-gym]") || null;
    dialog.showModal();
    if (!places.length) search();
  });
  $("#gym-directory-close").addEventListener("click", () => dialog.close());
  $("#gym-directory-search").addEventListener("click", search);
  $("#gym-directory-hotels").addEventListener("change", renderPlaces);
  results.addEventListener("click", (event) => {
    const button = event.target.closest("[data-gym-place]");
    const place = places.find((entry) => entry.id === button?.dataset.gymPlace);
    if (place) choosePlace(place);
  });
  $("#gym-directory-use").addEventListener("click", () => {
    if (!selected || !targetInput) return;
    targetInput.value = selected.name.slice(0, 80);
    targetInput.dispatchEvent(new Event("input", { bubbles: true }));
    dialog.close();
  });

  $("#gym-directory-review-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!selected) return;
    const files = [...$("#gym-directory-photos").files];
    if (files.length + myPhotoCount > 3 || files.some((file) => file.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type))) {
      status.textContent = "Add at most 3 JPEG, PNG, or WebP photos, each under 5 MB.";
      return;
    }
    const { data: auth } = await supabaseClient.auth.getUser();
    if (!auth.user) { status.textContent = "Sign in to leave a review."; return; }
    const button = event.target.querySelector("button[type=submit]");
    button.disabled = true;
    const place = selected;
    try {
      const { error } = await supabaseClient.from("gym_reviews").upsert({
        gym_id: place.id, user_id: auth.user.id,
        rating: Number($("#gym-directory-rating").value),
        body: $("#gym-directory-review").value.trim().slice(0, 1200),
        updated_at: new Date().toISOString()
      }, { onConflict: "gym_id,user_id" });
      if (error) throw error;
      for (const file of files) {
        const image = await photoWithoutMetadata(file);
        const path = `${crypto.randomUUID()}.jpg`;
        const { error: uploadError } = await supabaseClient.storage.from("gym-review-photos").upload(path, image, { contentType: "image/jpeg", upsert: false });
        if (uploadError) throw uploadError;
        const { error: rowError } = await supabaseClient.from("gym_review_photos").insert({ gym_id: place.id, user_id: auth.user.id, storage_path: path });
        if (rowError) {
          await supabaseClient.storage.from("gym-review-photos").remove([path]);
          throw rowError;
        }
      }
      $("#gym-directory-photos").value = "";
      status.textContent = "Review saved.";
      await loadReviews(place);
    } catch (error) {
      status.textContent = `Review could not be saved: ${error.message || "please try again"}`;
    } finally { button.disabled = false; }
  });

  $("#gym-directory-delete-review").addEventListener("click", async () => {
    const place = selected;
    if (!place || !window.confirm("Delete your review and its photos?")) return;
    const { data: auth } = await supabaseClient.auth.getUser();
    if (!auth.user) return;
    const { data: photoRows, error: photoError } = await supabaseClient.from("gym_review_photos")
      .select("storage_path").eq("gym_id", place.id).eq("user_id", auth.user.id);
    if (photoError) { status.textContent = "Could not check your photos. Nothing was deleted."; return; }
    const paths = (photoRows || []).map((row) => row.storage_path);
    if (paths.length) {
      const { error } = await supabaseClient.storage.from("gym-review-photos").remove(paths);
      if (error) { status.textContent = "Could not remove your photos. Nothing else was deleted."; return; }
      const { error: deletePhotoError } = await supabaseClient.from("gym_review_photos")
        .delete().eq("gym_id", place.id).eq("user_id", auth.user.id);
      if (deletePhotoError) { status.textContent = "Could not finish deleting photos. Please try again."; return; }
    }
    const { error } = await supabaseClient.from("gym_reviews").delete().eq("gym_id", place.id).eq("user_id", auth.user.id);
    if (error) { status.textContent = "Could not delete review. Please try again."; return; }
    status.textContent = "Review and photos deleted.";
    await loadReviews(place);
  });

  $("#gym-directory-add-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!location) { status.textContent = "Search near your location before adding a gym."; return; }
    const { data: auth } = await supabaseClient.auth.getUser();
    if (!auth.user) { status.textContent = "Sign in to add a gym."; return; }
    const name = $("#gym-directory-add-name").value.trim();
    const latitude = Math.round(location.latitude * 100) / 100;
    const longitude = Math.round(location.longitude * 100) / 100;
    const { data, error } = await supabaseClient.from("gym_places").insert({
      source: "client", kind: $("#gym-directory-add-kind").value, name,
      latitude, longitude, created_by: auth.user.id
    }).select("id,source,kind,name,latitude,longitude,address,website").single();
    if (error) { status.textContent = `Could not add gym: ${error.message}`; return; }
    places.unshift({ ...data, distance_km: 0 });
    $("#gym-directory-add-name").value = "";
    renderPlaces();
    await choosePlace(places[0]);
    status.textContent = "Gym added. You can review it or use it for this workout.";
  });
})();
