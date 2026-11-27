(() => {
  "use strict";

  const root = document.querySelector(".gruntr-owner");
  if (!root) return;

  const config = window.FWB_SUPABASE_CONFIG;
  const client = config?.url && config.anonKey && window.supabase && window.FWB_AUTH_SESSION
    ? window.supabase.createClient(config.url, config.anonKey, {
        auth: { storage: window.FWB_AUTH_SESSION.storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      })
    : null;
  const tabs = new Set(["groups", "reports", "approvals"]);
  const tabLinks = [...root.querySelectorAll("[data-owner-tab]")];
  const panels = [...root.querySelectorAll("[data-owner-panel]")];
  const element = (name) => root.querySelector(`[data-owner-${name}]`);
  const date = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
  const clubNames = {
    running: "Run Club", pickleball: "Pickleball", volleyball: "Volleyball", tennis: "Tennis",
    hiking: "Hiking", cycling: "Cycling", basketball: "Basketball", soccer: "Soccer", frisbee: "Frisbee",
    swimming: "Swim Club"
  };
  const reportLabels = { open: "Open", resolved: "Resolved", dismissed: "Dismissed" };
  let ownerId = null;
  let authVersion = 0;
  let activeTab = null;
  let approvals = null;
  let selectedCity = null;
  let selectedClub = null;
  let cityQuery = "";
  let cityRequest = 0;
  let groupRows = [];
  let pendingAction = false;

  function create(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function button(text, className = "button button-ghost") {
    const node = create("button", className, text);
    node.type = "button";
    return node;
  }

  function cityName(city) {
    return [city.name, city.region, city.country === "US" ? "" : city.country].filter(Boolean).join(", ");
  }

  function counts(row) {
    const members = row.member_count || 0;
    const posts = row.post_count || 0;
    const reports = row.open_report_count || 0;
    return `${members} ${members === 1 ? "member" : "members"} · ${posts} ${posts === 1 ? "post" : "posts"} · ${reports} open ${reports === 1 ? "report" : "reports"}`;
  }

  function timestamp(value) {
    const time = new Date(value);
    return value && !Number.isNaN(time.valueOf()) ? date.format(time) : "";
  }

  function requestedTab() {
    const value = new URLSearchParams(window.location.search).get("tab");
    return tabs.has(value) ? value : "groups";
  }

  function loginDestination(tab) {
    const returnTo = `/gruntr-admin.html?tab=${tab}`;
    return `/coach-login.html?return_to=${encodeURIComponent(returnTo)}`;
  }

  function resetBoard() {
    selectedClub = null;
    posts.clear();
    element("board").hidden = true;
  }

  function clearWorkspace() {
    authVersion++;
    cityRequest++;
    ownerId = null;
    activeTab = null;
    const previous = approvals;
    approvals = null;
    previous?.destroy();
    selectedCity = null;
    groupRows = [];
    cityQuery = "";
    pendingAction = false;
    element("city-search").reset();
    cities.clear();
    reports.clear();
    resetBoard();
    element("group-list").replaceChildren();
    element("workspace").hidden = true;
    element("sign-out").hidden = true;
    element("access").hidden = false;
  }

  function showAccess(message, { login = false, retry = false, signOut = false } = {}) {
    clearWorkspace();
    element("access-status").textContent = message;
    element("login").href = loginDestination(requestedTab());
    element("login").hidden = !login;
    element("retry-access").hidden = !retry;
    element("sign-out").hidden = !signOut;
  }

  async function rpc(name, parameters) {
    const sessionOwner = ownerId;
    if (!sessionOwner) throw new DOMException("Owner session closed", "AbortError");
    const { data, error } = await client.rpc(name, parameters);
    if (sessionOwner !== ownerId) throw new DOMException("Owner session changed", "AbortError");
    if (error) throw error;
    return data;
  }

  function displayError(error, status, fallback) {
    if (error?.name === "AbortError") return;
    if (error?.code === "42501" || error?.code === "PGRST301") {
      showAccess("This workspace requires your GRUNTR owner account.", { login: true, signOut: true });
    } else if (error?.code === "PGRST202") {
      status.textContent = "This moderation tool is unavailable right now.";
    } else {
      status.textContent = fallback;
    }
  }

  function paginatedList(key, pageSize, request, rowElement, empty, errorMessage) {
    const list = element(`${key}-list`);
    const status = element(`${key}-status`);
    const more = element(`more-${key === "city" ? "cities" : key === "post" ? "posts" : "reports"}`);
    let version = 0;
    let length = 0;

    function clear() {
      version++;
      length = 0;
      list.replaceChildren();
      status.textContent = "";
      more.hidden = true;
      more.disabled = false;
    }

    async function load(append = false) {
      if (!append) clear();
      const current = ++version;
      more.disabled = true;
      status.textContent = append ? "Loading more…" : "Loading…";
      try {
        const rows = await request(pageSize, length);
        if (current !== version) return;
        if (!Array.isArray(rows)) throw new Error("Expected a list.");
        list.append(...rows.map(rowElement));
        length += rows.length;
        status.textContent = length ? "" : empty();
        more.hidden = rows.length < pageSize;
      } catch (error) {
        if (current === version) displayError(error, status, errorMessage);
      } finally {
        if (current === version) more.disabled = false;
      }
    }

    more.addEventListener("click", () => load(true));
    return { clear, load };
  }

  function cityRow(city) {
    const row = create("li");
    const control = button("", "owner-list-item");
    control.dataset.cityId = city.id;
    control.setAttribute("aria-pressed", String(city.id === selectedCity?.id));
    control.append(create("strong", "", cityName(city)), create("span", "owner-meta", counts(city)));
    control.addEventListener("click", () => selectCity(city));
    row.append(control);
    return row;
  }

  async function selectCity(city) {
    selectedCity = city;
    const current = ++cityRequest;
    resetBoard();
    for (const control of element("city-list").querySelectorAll("button[data-city-id]")) {
      control.setAttribute("aria-pressed", String(control.dataset.cityId === city.id));
    }
    element("board-title").textContent = cityName(city);
    element("group-list").replaceChildren();
    groupRows = [];
    const status = element("group-status");
    status.textContent = "Loading clubs…";
    try {
      const rows = await rpc("gruntr_admin_spotter_groups", { p_city_id: city.id });
      if (cityRequest !== current || activeTab !== "groups") return;
      if (!Array.isArray(rows)) throw new Error("Expected a list.");
      groupRows = rows;
      renderGroups();
      status.textContent = rows.length ? "" : "No clubs in this city.";
    } catch (error) {
      if (cityRequest === current) displayError(error, status, "Couldn’t load clubs. Choose the city to try again.");
    }
  }

  function renderGroups() {
    element("group-list").replaceChildren(...groupRows.map((club) => {
      const control = button("", "owner-club");
      control.setAttribute("aria-pressed", String(club.id === selectedClub?.id));
      control.append(create("strong", "", clubNames[club.id] || club.id), create("span", "owner-meta", counts(club)));
      control.addEventListener("click", () => {
        selectedClub = club;
        const title = element("post-title");
        title.textContent = `${clubNames[club.id] || club.id} posts`;
        element("board").hidden = false;
        for (const node of element("group-list").querySelectorAll("button")) node.setAttribute("aria-pressed", String(node === control));
        posts.load();
      });
      return control;
    }));
  }

  async function save(button, call, parameters, reload, failure) {
    const current = ownerId;
    const tab = activeTab;
    if (!current || pendingAction) return;
    pendingAction = true;
    button.disabled = true;
    try {
      const changed = await rpc(call, parameters);
      if (changed !== true) throw new Error("Action was not confirmed.");
      if (activeTab === tab) await reload();
    } catch (error) {
      if (ownerId === current && activeTab === tab) {
        displayError(error, element(tab === "reports" ? "report-status" : "post-status"), failure);
      }
    } finally {
      if (ownerId === current) pendingAction = false;
      if (button.isConnected) button.disabled = false;
    }
  }

  function postVisibilityButton(id, hidden, reload) {
    const control = button(hidden ? "Restore post" : "Hide post");
    control.addEventListener("click", () => save(
      control, "gruntr_admin_set_spotter_post_hidden", { p_post_id: id, p_hidden: !hidden },
      reload, "Couldn’t update the post. Refresh and try again."
    ));
    return control;
  }

  function postRow(post) {
    const row = create("li", "owner-post-card");
    const state = post.deleted_at ? "Deleted by author" : post.hidden_at ? "Hidden" : "Visible";
    const reportCount = post.open_report_count || 0;
    row.append(
      create("strong", "", post.author_name || "Spotter member"),
      create("p", "owner-meta", [
        timestamp(post.created_at), state, post.legacy ? "Earlier ZIP board" : null,
        reportCount ? `${reportCount} open ${reportCount === 1 ? "report" : "reports"}` : null
      ].filter(Boolean).join(" · ")),
      create("p", "owner-post-text", post.body || "Post text unavailable.")
    );
    if (!post.deleted_at) {
      const actions = create("div", "owner-actions");
      actions.append(postVisibilityButton(post.id, Boolean(post.hidden_at), () => posts.load()));
      row.append(actions);
    }
    return row;
  }

  function reportRow(report) {
    const row = create("li", "owner-post-card");
    const location = cityName({ name: report.city_name, region: report.city_region, country: report.city_country });
    const group = clubNames[report.club_id] || report.club_id;
    row.append(create("strong", "", report.reason || "Reported post"), create("p", "owner-meta",
      [reportLabels[report.status], location, group, timestamp(report.created_at)].filter(Boolean).join(" · ")));
    if (report.details) row.append(create("p", "owner-post-text", report.details));
    if (report.post_body) {
      const content = create("blockquote");
      content.append(create("strong", "", report.author_name || "Spotter member"),
        create("p", "owner-post-text", report.post_body));
      row.append(content);
    }
    if (report.post_hidden_at || report.post_deleted_at) {
      row.append(create("p", "owner-meta", report.post_deleted_at ? "Post deleted by author" : "Post hidden"));
    }
    const actions = create("div", "owner-actions");
    if (report.post_id && !report.post_deleted_at) {
      actions.append(postVisibilityButton(report.post_id, Boolean(report.post_hidden_at), () => reports.load()));
    }
    if (report.status === "open") {
      for (const [label, status] of [["Resolve", "resolved"], ["Dismiss", "dismissed"]]) {
        const control = button(label);
        control.addEventListener("click", () => save(
          control, "gruntr_admin_resolve_spotter_report", { p_report_id: report.id, p_status: status },
          () => reports.load(), "Couldn’t update the report. Refresh and try again."
        ));
        actions.append(control);
      }
    }
    if (actions.childElementCount) row.append(actions);
    return row;
  }

  const cities = paginatedList(
    "city", 50, (limit, offset) => rpc("gruntr_admin_spotter_cities", {
      p_query: cityQuery, p_limit: limit, p_offset: offset
    }), cityRow, () => cityQuery ? "No cities match your search." : "No city activity yet. Search to see a city’s clubs.",
    "Couldn’t load cities. Search to try again."
  );
  const posts = paginatedList(
    "post", 40, (limit, offset) => rpc("gruntr_admin_spotter_group_posts", {
      p_city_id: selectedCity.id, p_club_id: selectedClub.id, p_limit: limit, p_offset: offset
    }), postRow, () => "No posts in this club yet.", "Couldn’t load posts. Refresh to try again."
  );
  const reports = paginatedList(
    "report", 40, (limit, offset) => rpc("gruntr_admin_spotter_reports", {
      p_status: element("report-filter").value, p_limit: limit, p_offset: offset
    }), reportRow, () => "No reports match this status.", "Couldn’t load reports. Refresh to try again."
  );

  function changeTab(tab, updateHistory = false) {
    if (!ownerId || activeTab === tab) return;
    if (activeTab === "groups") {
      cityRequest++;
      cities.clear();
      resetBoard();
      selectedCity = null;
      groupRows = [];
    }
    if (activeTab === "reports") reports.clear();
    activeTab = tab;
    if (updateHistory) window.history.pushState(null, "", `?tab=${tab}`);
    for (const link of tabLinks) {
      if (link.dataset.ownerTab === tab) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
    for (const panel of panels) panel.hidden = panel.dataset.ownerPanel !== tab;
    approvals?.setActive(tab === "approvals");
    if (tab === "groups") {
      element("board-title").textContent = "Club boards";
      element("group-status").textContent = "Choose a city to see its clubs.";
      element("group-list").replaceChildren();
      cities.load();
    }
    if (tab === "reports") reports.load();
    if (updateHistory) panels.find((panel) => panel.dataset.ownerPanel === tab)?.querySelector("h1, h2")?.focus();
  }

  async function verifyOwner() {
    if (!client) {
      showAccess("GRUNTR Admin couldn’t connect. Reload to try again.");
      return;
    }
    const current = ++authVersion;
    element("access-status").textContent = "Checking owner access…";
    element("retry-access").hidden = true;
    try {
      const { data, error } = await client.auth.getUser();
      if (current !== authVersion) return;
      if (error || !data?.user?.id) {
        showAccess("Sign in with your GRUNTR owner account.", { login: true });
        return;
      }
      const permission = await client.rpc("spotter_can_review_photos");
      if (current !== authVersion) return;
      if (permission.error) {
        showAccess("Owner access couldn’t be checked. Try again.", { retry: true, signOut: true });
        return;
      }
      if (permission.data !== true) {
        showAccess("This workspace requires your GRUNTR owner account.", { login: true, signOut: true });
        return;
      }
      ownerId = data.user.id;
      if (window.FWBSpotterApprovals) {
        const verifiedOwner = ownerId;
        approvals = window.FWBSpotterApprovals.create({
          root: root.querySelector(".coach-approvals-panel"), client, userId: verifiedOwner,
          onAccessLost() {
            if (ownerId === verifiedOwner) showAccess("Your owner access has ended.", { login: true });
          }
        });
        await approvals.checkAccess();
      }
      if (current !== authVersion) return;
      element("access").hidden = true;
      element("workspace").hidden = false;
      element("sign-out").hidden = false;
      changeTab(requestedTab());
    } catch {
      if (current === authVersion) showAccess("Owner access couldn’t be checked. Try again.", { retry: true });
    }
  }

  tabLinks.forEach((link) => link.addEventListener("click", (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    changeTab(link.dataset.ownerTab, true);
  }));
  window.addEventListener("popstate", () => changeTab(requestedTab()));
  window.addEventListener("pagehide", clearWorkspace);
  window.addEventListener("pageshow", (event) => { if (event.persisted) verifyOwner(); });
  element("city-search").addEventListener("submit", (event) => {
    event.preventDefault();
    cityQuery = new FormData(event.currentTarget).get("query").trim();
    cities.load();
  });
  element("refresh-posts").addEventListener("click", () => posts.load());
  element("refresh-reports").addEventListener("click", () => reports.load());
  element("report-filter").addEventListener("change", () => reports.load());
  element("retry-access").addEventListener("click", verifyOwner);
  element("sign-out").addEventListener("click", async () => {
    showAccess("Signing out…");
    try {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) throw error;
      showAccess("Sign in with your GRUNTR owner account.", { login: true });
    } catch {
      showAccess("Couldn’t sign out. Try again.", { signOut: true });
    }
  });
  client?.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT" || (ownerId && session?.user?.id && session.user.id !== ownerId)) {
      showAccess("Sign in with your GRUNTR owner account.", { login: true });
    }
  });
  verifyOwner();
})();
