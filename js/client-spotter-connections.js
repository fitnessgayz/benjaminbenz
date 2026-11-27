(function (global) {
  "use strict";

  const clubNames = {
    running: "Run Club", pickleball: "Pickleball", volleyball: "Volleyball", tennis: "Tennis",
    hiking: "Hiking", cycling: "Cycling", basketball: "Basketball", soccer: "Soccer",
    frisbee: "Frisbee", swimming: "Swim Club"
  };
  const waiverVersion = "spotter-club-waiver-v1";
  const waiverTerms = [
    ["Activity and meetup risks", "Participation is voluntary. Member-organized activities and in-person meetups can involve injury, illness, or property loss from falls, collisions, traffic, weather, water conditions, or other people's conduct. I accept the inherent risks of activities and meetups I choose to attend."],
    ["Online and in-person conduct", "I’ll treat members with respect and use my own judgment when making plans. I won’t harass, threaten, impersonate, or share another person's private information, location, photos, or messages without their permission."],
    ["Limited release", "To the extent permitted by law, I release the operator of GRUNTR from claims arising solely from the inherent risks of member-organized activities and meetups I choose to attend. This preserves claims for gross negligence, intentional misconduct, fraud, and any rights or liability the law protects from waiver."]
  ];
  const bodyTypes = {
    ectomorph: "Typically describes a leaner build with a narrower frame.",
    mesomorph: "Typically describes a naturally muscular build.",
    endomorph: "Typically describes a broader or rounder build."
  };
  const weekdays = {
    mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
    fri: "Friday", sat: "Saturday", sun: "Sunday"
  };
  const clock = new Intl.DateTimeFormat(undefined, {hour: "numeric", minute: "2-digit"});
  const date = new Intl.DateTimeFormat(undefined, {dateStyle: "medium", timeStyle: "short"});

  function cityName(city) {
    return city ? [city.name, city.region, city.country === "US" ? "" : city.country].filter(Boolean).join(", ") : "";
  }

  function clubName(club) {
    const sport = clubNames[club.id] || club.id;
    return club.city ? `${club.city.name} ${sport}` : sport;
  }

  function clubKey(club) {
    return `${club.city?.id || ""}:${club.id}`;
  }

  function clubParameters(club) {
    return {p_club: club.id, ...(club.city ? {p_city_id: club.city.id} : {})};
  }

  function showTime(minutes) {
    return clock.format(new Date(2000, 0, 1, 0, minutes));
  }

  function formattedDate(value) {
    const time = new Date(value);
    return value && Number.isFinite(time.getTime()) ? date.format(time) : "";
  }

  function formattedAvailability(schedule, fallback) {
    if (!schedule?.length) return fallback?.join(" · ");
    return schedule.map(({day, periods, start_minute: start, end_minute: end}) => {
      const period = (periods || []).map((value) => value[0].toUpperCase() + value.slice(1)).join(", ");
      const hours = Number.isInteger(start) && Number.isInteger(end) ? ` (${showTime(start)}–${showTime(end)})` : "";
      return `${weekdays[day] || day} ${period}${hours}`.trim();
    }).join(" · ");
  }

  function create({root, client, rpc, getProfile, showTab}) {
    const doc = root.ownerDocument;
    const urls = new Set();
    const pendingWrites = new Map();
    let screen;
    let selectedCity;
    let chatRefresh;

    function element(tag, value, className) {
      const node = doc.createElement(tag);
      if (value != null) node.textContent = value;
      if (className) node.className = className;
      return node;
    }

    function button(label, action, primary = false) {
      const node = element("button", label, primary ? "spotter-primary" : "spotter-secondary");
      node.type = "button";
      node.addEventListener("click", action);
      return node;
    }

    function cleanup() {
      clearInterval(chatRefresh);
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    }

    function page(title, back) {
      cleanup();
      const panel = element("section", null, "spotter-stack");
      const heading = element("h2", title);
      if (back) panel.append(button("Back", back));
      panel.append(heading);
      root.replaceChildren(panel);
      screen = panel;
      return panel;
    }

    function current(panel) {
      return screen === panel && root.contains(panel);
    }

    function announce(panel, message, failure = false) {
      if (!current(panel)) return;
      let notice = panel.querySelector("[data-spotter-notice]");
      if (!notice) {
        notice = element("p");
        notice.dataset.spotterNotice = "";
        panel.querySelector("h2").after(notice);
      }
      notice.className = failure ? "spotter-error" : "spotter-muted";
      notice.setAttribute("role", failure ? "alert" : "status");
      notice.textContent = message;
    }

    async function call(name, params = {}) {
      const result = await rpc(name, params);
      if (result?.error) throw result.error;
      return result && Object.hasOwn(result, "data") ? result.data : result;
    }

    async function confirmWrite(name, params) {
      if (await call(name, params) !== true) throw new Error("Spotter could not confirm the change.");
    }

    async function mutate(panel, control, fallback, action) {
      if (control.disabled || !current(panel)) return;
      control.disabled = true;
      try {
        await action();
      } catch {
        announce(panel, fallback, true);
      } finally {
        control.disabled = false;
      }
    }

    async function portrait(panel, path, host, name) {
      if (!path) return;
      try {
        const {data, error} = await client.storage.from("spotter-profile-photos").download(path);
        if (error || !data || !current(panel) || !panel.contains(host)) return;
        const image = element("img");
        const url = URL.createObjectURL(data);
        urls.add(url);
        image.src = url;
        image.alt = name;
        image.loading = "lazy";
        host.replaceChildren(image);
      } catch {
        // The initial remains available when the private image cannot be read.
      }
    }

    function addField(container, name, value) {
      if (value === "" || value == null) return;
      container.append(element("dt", name), element("dd", value));
    }

    function textForm(panel, label, limit, submitLabel, fallback, onSubmit) {
      const form = element("form", null, "spotter-stack");
      const field = element("label", label, "spotter-field");
      const input = element("textarea");
      input.rows = 2;
      input.required = true;
      const submit = element("button", submitLabel, "spotter-primary");
      submit.type = "submit";
      field.append(input);
      form.append(field, submit);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const body = input.value.trim();
        if (!body || Array.from(body).length > limit) {
          announce(panel, `Enter up to ${limit.toLocaleString()} characters.`, true);
          input.focus();
          return;
        }
        void mutate(panel, submit, fallback, async () => {
          await onSubmit(body);
          if (input.value.trim() === body) input.value = "";
        });
      });
      return form;
    }

    async function withStableWrite(key, body, action) {
      const previous = pendingWrites.get(key);
      const id = previous?.body === body ? previous.id : global.crypto.randomUUID();
      pendingWrites.set(key, {id, body});
      const result = await action(id);
      if (pendingWrites.get(key)?.id === id) pendingWrites.delete(key);
      return result;
    }

    function report(title, back, submit) {
      const panel = page(title, back);
      panel.append(textForm(panel, "Reason for reporting", 500, "Send report", "Spotter couldn’t send your report. Try again.", async (reason) => {
        await submit(reason);
        announce(panel, "Report sent.");
        panel.querySelector("form")?.remove();
      }));
    }

    async function renderProfile(connection, back, chatBack = back) {
      const {member} = connection;
      const panel = page(member.name, back);
      const avatar = element("div", member.name?.slice(0, 1), "spotter-portrait");
      const info = element("div", null, "spotter-card spotter-stack");
      const details = element("dl", null, "spotter-profile-details");
      const actions = element("div", null, "spotter-actions");
      info.append(avatar);
      if (member.about) info.append(element("p", member.about));
      info.append(details);
      panel.append(info, actions);
      void portrait(panel, member.portrait_path, avatar, member.name);
      addField(details, "Training goals", member.goals?.join(" · "));
      addField(details, "Looking for", member.preferences?.join(" · "));
      const openProfile = () => renderProfile(connection, back, chatBack);
      if (connection.status === "accepted" && chatBack === back) {
        actions.append(button("Message", () => openChat(connection, openProfile), true));
      }
      actions.append(button("Report profile", () => report("Report profile", openProfile, (reason) =>
        confirmWrite("spotter_report", {p_member_id: member.id, p_reason: reason}))));
      if (member.portrait_path) {
        actions.append(button("Report profile photo", () => report("Report photo", openProfile, (reason) =>
          confirmWrite("spotter_report_photo", {p_path: member.portrait_path, p_reason: reason}))));
      }
      actions.append(button("Block", () => {
        const confirm = page(`Block ${member.name}?`, openProfile);
        confirm.append(element("p", "Blocking removes this member from your Spotter conversations and discovery."));
        confirm.append(button("Block member", (event) => mutate(confirm, event.currentTarget, "Spotter couldn’t block this member. Try again.", async () => {
          await confirmWrite("spotter_block", {p_member_id: member.id});
          if (current(confirm)) chatBack();
        })));
      }));
      try {
        const result = await call("spotter_profile_details", {p_member_id: member.id});
        if (!result || !current(panel)) return;
        const height = result.height_inches;
        addField(details, "Height", height == null ? null : `${Math.floor(height / 12)} ft ${height % 12} in`);
        addField(details, "Weight", result.weight_lb == null ? null : `${result.weight_lb} lb`);
        addField(details, "Body type", result.body_type);
        const explanation = bodyTypes[result.body_type?.toLowerCase()];
        if (explanation) {
          const glossary = element("details");
          glossary.append(element("summary", "About this body type"), element("p", explanation));
          details.lastElementChild.append(glossary);
        }
        addField(details, "Current program", result.current_program);
        addField(details, "Current supplements", result.supplements);
        addField(details, "Weekly availability", formattedAvailability(result.availability_schedule, member.availability));
        addField(details, "Gyms", result.gym_names?.join(" · "));
        addField(details, "Workouts", result.shared_stats?.workouts);
        addField(details, "Working sets", result.shared_stats?.working_sets);
        addField(details, "Streak (weeks)", result.shared_stats?.streak_weeks);
        const photos = result.photos?.filter((photo) => photo.status === "approved" && photo.slot > 0) || [];
        if (connection.status === "accepted" && photos.length) {
          const gallery = element("div", null, "spotter-gallery");
          info.append(gallery);
          photos.forEach((photo) => {
            const tile = element("div", null, "spotter-stack");
            const image = element("div", null, "spotter-portrait");
            tile.append(image, button("Report photo", () => report("Report photo", openProfile, (reason) =>
              confirmWrite("spotter_report_photo", {p_path: photo.path, p_reason: reason}))));
            gallery.append(tile);
            void portrait(panel, photo.path, image, `${member.name}, photo ${photo.slot + 1}`);
          });
        }
      } catch {
        announce(panel, "Spotter couldn’t load additional profile details.", true);
      }
    }

    async function openConnections(tab) {
      const title = {matches: "Matches", requests: "Requests", inbox: "Inbox"}[tab];
      const back = tab === "requests" ? () => showTab("profile") : null;
      const panel = page(title, back);
      const list = element("div", null, tab === "matches" ? "spotter-matches-grid" : "spotter-stack");
      const reload = () => render(tab);
      panel.append(button("Refresh", reload), list);
      list.textContent = "Loading…";
      try {
        const connections = await call("spotter_connections");
        if (!current(panel)) return;
        const rows = (connections || []).filter(({status}) => status === (tab === "requests" ? "pending" : "accepted"));
        list.replaceChildren();
        if (!rows.length) {
          list.append(element("p", {matches: "Your matches will appear here.", requests: "You have no pending requests.", inbox: "Your conversations will appear here."}[tab], "spotter-muted"));
        }
        rows.forEach((connection) => {
          const {member} = connection;
          const unread = Number(connection.unread_count) || 0;
          const isInbox = tab === "inbox";
          const item = element("article", null, tab === "matches" ? "spotter-match-tile" : "spotter-card spotter-stack");
          const label = unread > 0 ? `${member.name} · ${unread} new` : member.name;
          const open = button(tab === "matches" ? member.name : label,
            isInbox ? () => openChat(connection, reload) : () => renderProfile(connection, reload));
          if (!isInbox) {
            const avatar = element("span", member.name?.slice(0, 1), "spotter-portrait");
            open.prepend(avatar);
            if (tab === "matches" && unread > 0) {
              open.setAttribute("aria-label", label);
              const badge = element("span", String(unread), "spotter-match-unread");
              badge.setAttribute("aria-hidden", "true");
              open.append(badge);
            }
            item.append(open);
            list.append(item);
            void portrait(panel, member.portrait_path, avatar, "");
          } else {
            item.append(open);
            list.append(item);
          }
          if (tab === "requests" && connection.direction === "incoming") {
            const actions = element("div", null, "spotter-actions");
            [true, false].forEach((accept) => {
              actions.append(button(accept ? "Accept" : "Decline", (event) => {
                const control = event.currentTarget;
                void mutate(panel, control, "Spotter couldn’t update this request. Try again.", async () => {
                  for (const other of actions.children) other.disabled = true;
                  try {
                    await confirmWrite("spotter_respond", {p_connection_id: connection.id, p_accept: accept});
                    if (current(panel)) reload();
                  } finally {
                    for (const other of actions.children) other.disabled = false;
                  }
                });
              }, accept));
            });
            item.append(actions);
          }
          if (tab === "requests" && connection.direction === "outgoing") {
            item.append(element("p", "Request sent", "spotter-muted"));
          }
        });
      } catch {
        list.replaceChildren();
        announce(panel, "Spotter couldn’t load your connections. Try again.", true);
      }
    }

    function openChat(connection, back) {
      const {id, member} = connection;
      const panel = page(member.name, back);
      const profile = button("View profile", () => renderProfile(connection, () => openChat(connection, back), back));
      const avatar = element("span", member.name?.slice(0, 1), "spotter-portrait spotter-chat-avatar");
      profile.prepend(avatar);
      const historyButton = button("Load older messages", () => refresh(messages[0]?.created_at));
      historyButton.hidden = true;
      const log = element("div", null, "spotter-chat-log spotter-stack");
      log.setAttribute("role", "log");
      let messages = [];
      let lastRead;
      let isRefreshing = false;

      function updateLog() {
        log.replaceChildren();
        if (!messages.length) log.append(element("p", "No messages yet.", "spotter-muted"));
        messages.forEach((message) => {
          const bubble = element("article", null, "spotter-card spotter-chat-message");
          bubble.dataset.mine = String(message.mine);
          const stamp = [message.mine ? "You" : member.name, formattedDate(message.created_at)].filter(Boolean).join(" · ");
          bubble.append(element("p", stamp, "spotter-muted"), element("p", message.body));
          if (!message.mine) {
            bubble.append(button("Report message", () => report("Report message", () => openChat(connection, back), (reason) =>
              confirmWrite("spotter_report", {p_member_id: member.id, p_reason: reason, p_message_id: message.id}))));
          }
          log.append(bubble);
        });
      }

      async function refresh(before, quietly = false) {
        if (isRefreshing || !current(panel)) return;
        isRefreshing = true;
        historyButton.disabled = true;
        try {
          const latest = await call("spotter_messages", {p_connection_id: id, ...(before ? {p_before: before} : {})}) || [];
          if (!current(panel)) return;
          const merged = new Map(messages.map((message) => [message.id, message]));
          latest.forEach((message) => merged.set(message.id, message));
          if (merged.size !== messages.length || !quietly) {
            messages = [...merged.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
            updateLog();
          }
          if (!quietly) historyButton.hidden = latest.length < 50;
          const mark = latest.findLast((message) => !message.mine);
          if (mark && lastRead !== mark.id && doc.visibilityState !== "hidden") {
            try {
              await confirmWrite("spotter_mark_chat_read", {p_connection_id: id, p_message_id: mark.id});
              lastRead = mark.id;
            } catch {
              // Keep the conversation usable when only the unread marker fails.
            }
          }
        } catch (error) {
          if (error?.code === "42501" || error?.code === "P0002") {
            if (current(panel)) back();
          } else if (!quietly) {
            announce(panel, "Spotter couldn’t load this conversation. Try again.", true);
          }
        } finally {
          isRefreshing = false;
          historyButton.disabled = false;
        }
      }

      panel.append(profile, historyButton, log,
        textForm(panel, "Message", 1000, "Send", "Spotter couldn’t confirm your message. Retry to check or send it.", async (body) => {
          const message = await withStableWrite(`chat:${id}`, body, async (messageID) => {
            const sent = await call("spotter_send_message", {p_connection_id: id, p_message_id: messageID, p_body: body});
            if (!sent?.mine || sent.id !== messageID) throw new Error("Message not confirmed.");
            return sent;
          });
          if (current(panel) && !messages.some((row) => row.id === message.id)) {
            messages.push(message);
            messages.sort((a, b) => a.created_at.localeCompare(b.created_at));
            updateLog();
          }
        })
      );
      void portrait(panel, member.portrait_path, avatar, "");
      void refresh();
      chatRefresh = global.setInterval(() => {
        if (!current(panel)) clearInterval(chatRefresh);
        else if (doc.visibilityState !== "hidden") void refresh(undefined, true);
      }, 8000);
    }

    function showClubWaiver(club, afterJoin, back) {
      const panel = page("Club waiver", back);
      const card = element("article", null, "spotter-card spotter-stack");
      const consent = element("label", null, "spotter-field");
      const checkbox = element("input");
      checkbox.type = "checkbox";
      consent.append(checkbox, doc.createTextNode(" I’ve read and agree to this club waiver."));
      const join = button("Agree and join", () => {
        if (!checkbox.checked) return;
        void mutate(panel, join, "Spotter couldn’t join this group. Try again.", async () => {
          checkbox.disabled = true;
          try {
            await confirmWrite("spotter_accept_club_waiver_and_join", {...clubParameters(club), p_version: waiverVersion});
            if (current(panel)) afterJoin({...club, joined: true, waiver_accepted: true});
          } finally {
            checkbox.disabled = false;
          }
        });
      }, true);
      join.disabled = true;
      checkbox.addEventListener("change", () => { join.disabled = !checkbox.checked; });
      card.append(element("h3", `Join ${clubName(club)}`), element("p", "Draft for legal review · v1", "spotter-muted"));
      waiverTerms.forEach(([title, body]) => card.append(element("h4", title), element("p", body)));
      panel.append(card, consent, join);
    }

    function openBoard(club) {
      const back = () => render("groups");
      if (!club.joined || !club.waiver_accepted) return showClubWaiver(club, openBoard, back);
      const panel = page(clubName(club), back);
      const params = clubParameters(club);
      const log = element("div", null, "spotter-stack");
      const refresh = async () => {
        log.textContent = "Loading posts…";
        try {
          const posts = await call("spotter_club_posts", params) || [];
          if (!current(panel)) return;
          log.replaceChildren();
          if (!posts.length) log.append(element("p", "No posts yet. Start the conversation with your club.", "spotter-muted"));
          posts.forEach((post) => {
            const card = element("article", null, "spotter-card spotter-stack");
            const stamp = [post.mine ? "You" : post.author_name, formattedDate(post.created_at)].filter(Boolean).join(" · ");
            card.append(element("h3", stamp), element("p", post.body));
            if (post.mine) {
              card.append(button("Delete post", () => {
                const confirm = page("Delete this post?", () => openBoard(club));
                confirm.append(element("p", post.body));
                confirm.append(button("Delete post", (event) => mutate(confirm, event.currentTarget, "Spotter couldn’t delete this post. Try again.", async () => {
                  await confirmWrite("spotter_delete_club_post", {...params, p_post_id: post.id});
                  if (current(confirm)) openBoard(club);
                })));
              }));
            } else {
              card.append(button("Report post", () => report("Report post", () => openBoard(club), (reason) =>
                confirmWrite("spotter_report_club_post", {...params, p_post_id: post.id, p_reason: reason}))));
            }
            log.append(card);
          });
        } catch {
          log.replaceChildren();
          announce(panel, "Spotter couldn’t load club posts. Try again.", true);
        }
      };

      panel.append(textForm(panel, "Write a post", 1000, "Post", "Spotter couldn’t confirm your post. Try again.", async (body) => {
        await withStableWrite(`post:${clubKey(club)}`, body, (postID) =>
          confirmWrite("spotter_post_to_club", {...params, p_post_id: postID, p_body: body}));
        if (current(panel)) await refresh();
      }), button("Refresh posts", refresh), log);
      void refresh();
    }

    function groupCard(panel, club) {
      const card = element("article", null, "spotter-card spotter-stack");
      const actions = element("div", null, "spotter-actions");
      const count = club.member_count || 0;
      const reload = () => render("groups");
      card.append(element("h3", clubName(club)), element("p", `${count} ${count === 1 ? "member" : "members"}`, "spotter-muted"), actions);

      if (club.joined) {
        actions.append(button("Open club board", () => openBoard(club), true));
        actions.append(button("Leave", () => {
          const confirm = page(`Leave ${clubName(club)}?`, reload);
          confirm.append(element("p", "You’ll need to rejoin to open the club board."));
          confirm.append(button("Leave group", (event) => mutate(confirm, event.currentTarget, "Spotter couldn’t leave this group. Try again.", async () => {
            await confirmWrite("spotter_set_club_membership", {...clubParameters(club), p_joined: false});
            if (current(confirm)) reload();
          })));
        }));
      } else if (club.waiver_accepted) {
        actions.append(button("Join", (event) => mutate(panel, event.currentTarget, "Spotter couldn’t join this group. Try again.", async () => {
          await confirmWrite("spotter_set_club_membership", {...clubParameters(club), p_joined: true});
          if (current(panel)) reload();
        }), true));
      } else {
        actions.append(button("Review waiver to join", () => showClubWaiver(club, reload, reload), true));
      }
      return card;
    }

    async function openGroups() {
      const panel = page("Groups");
      const loading = element("p", "Loading groups…", "spotter-muted");
      panel.append(loading);
      try {
        let context = null;
        try {
          context = await call("spotter_group_cities", {p_query: ""});
        } catch (error) {
          if (error?.code !== "PGRST202") throw error;
        }
        if (!current(panel)) return;
        const city = context ? selectedCity || context.default_city || null : null;
        const [clubs, joined, legacy] = await Promise.all([
          context && !city ? [] : call("spotter_local_clubs", city ? {p_city_id: city.id} : {}),
          context ? call("spotter_joined_city_clubs") : [],
          context && !context.default_city ? call("spotter_local_clubs") : []
        ]);
        if (!current(panel)) return;
        loading.remove();

        if (context) {
          const cityForm = element("form", null, "spotter-stack");
          const field = element("label", "Find a city", "spotter-field");
          const search = element("input");
          search.type = "search";
          search.maxLength = 80;
          search.placeholder = "City name";
          const submit = element("button", "Search", "spotter-secondary");
          submit.type = "submit";
          const results = element("div", null, "spotter-actions");
          field.append(search);
          cityForm.append(field, submit, results);
          const listCities = (cities) => {
            results.replaceChildren();
            if (!cities?.length) results.append(element("p", "No cities found.", "spotter-muted"));
            (cities || []).forEach((place) => {
              results.append(button(cityName(place), () => { selectedCity = place; void render("groups"); }));
            });
          };
          cityForm.addEventListener("submit", (event) => {
            event.preventDefault();
            void mutate(panel, submit, "Spotter couldn’t search cities. Try again.", async () => {
              const result = await call("spotter_group_cities", {p_query: search.value.trim()});
              if (current(panel)) listCities(result?.cities);
            });
          });
          if (!city && context.cities?.length) listCities(context.cities);
          panel.append(cityForm);
        }

        const shownClubs = (clubs || []).map((club) => ({...club, city}));
        const mine = new Map([
          ...(joined || []).map((entry) => ({...entry.club, city: entry.city})),
          ...(legacy || []).filter((club) => club.joined),
          ...shownClubs.filter((club) => club.joined)
        ].map((club) => [clubKey(club), club]));
        if (mine.size) {
          panel.append(element("h3", "Joined groups"));
          for (const club of mine.values()) panel.append(groupCard(panel, club));
        }
        const nearby = shownClubs.filter((club) => !club.joined);
        if (!context || city) panel.append(element("h3", city ? cityName(city) : "Local groups"));
        nearby.forEach((club) => panel.append(groupCard(panel, club)));
        if (!nearby.length && !mine.size) {
          panel.append(element("p", city || !context ? "No groups are available here yet." : "Choose a city to browse groups.", "spotter-muted"));
        }
      } catch {
        loading.remove();
        announce(panel, "Spotter couldn’t load groups. Try again.", true);
        if (current(panel)) panel.append(button("Retry", () => render("groups")));
      }
    }

    async function render(tab) {
      if (!["groups", "matches", "inbox", "requests"].includes(tab)) return;
      if (!getProfile()?.active) {
        const panel = page({groups: "Groups", matches: "Matches", inbox: "Inbox", requests: "Requests"}[tab]);
        panel.append(element("p", "Set up your Spotter profile to use this section.", "spotter-muted"));
        panel.append(button("Go to Spotter profile", () => showTab("profile"), true));
        return;
      }
      if (tab === "groups") await openGroups();
      else await openConnections(tab);
    }

    return {
      render,
      dispose() {
        cleanup();
        pendingWrites.clear();
        selectedCity = undefined;
        screen = undefined;
      }
    };
  }

  global.FWBSpotterConnections = {create};
})(window);
