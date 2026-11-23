/* Social consumes the same consent-filtered data as the iPhone app. */
(function attachSocial(root) {
  'use strict';

  const avatarSymbols = {
    strength: '💪', runner: '🏃', cycling: '🚴', boxing: '🥊', yoga: '🧘', swimming: '🏊',
    martial: '🥋', star: '⭐', lifting: '🏋️', walking: '🚶', hiking: '🥾', basketball: '🏀',
    soccer: '⚽', tennis: '🎾', rowing: '🚣', climbing: '🧗'
  };
  const metrics = ['workout_count', 'check_in_count', 'pr_count', 'badge_count'];
  const bucket = 'community-avatars';
  const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  const windows = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

  function customEmoji(value) {
    const emoji = String(value || '').trim();
    if (!emoji || Array.from(emoji).length > 16) return '';
    if (!/^(?:\p{Regional_Indicator}{2}|[0-9#*]\uFE0F?\u20E3|\p{Extended_Pictographic}[\uFE0F\p{Emoji_Modifier}\u{E0020}-\u{E007F}]*(?:\u200D\p{Extended_Pictographic}[\uFE0F\p{Emoji_Modifier}]*)*)$/u.test(emoji)) return '';
    if (typeof Intl.Segmenter === 'function'
      && Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(emoji)).length !== 1) return '';
    return emoji;
  }

  function avatarSymbol(value) {
    if (Object.hasOwn(avatarSymbols, value)) return avatarSymbols[value];
    return (typeof value === 'string' && value.startsWith('emoji:') && customEmoji(value.slice(6))) || avatarSymbols.strength;
  }

  function avatarPath(path, owner) {
    if (typeof path !== 'string' || !uuid.test(owner || '')) return false;
    const [folder, file, ...extra] = path.split('/');
    return !extra.length && folder === owner.toLowerCase()
      && file?.endsWith('.jpg') && uuid.test(file.slice(0, -4));
  }

  function eventOwner(id) {
    const [type, first, second, ...extra] = String(id || '').split(':');
    if (extra.length || !second) return null;
    const user = type === 'weekly' ? second : ['workout', 'gym', 'daily'].includes(type) ? first : null;
    return user && uuid.test(user) ? user.toLowerCase() : null;
  }

  function ranked(entries, metric) {
    if (!metrics.includes(metric) || !Array.isArray(entries)) return [];
    const active = entries.filter(row => Number.isInteger(row?.[metric]) && row[metric] > 0 && typeof row.nickname === 'string')
      .sort((a, b) => b[metric] - a[metric] || a.nickname.localeCompare(b.nickname, undefined, { sensitivity: 'base' }));
    let lastValue, rank;
    return active.map((row, index) => {
      if (row[metric] !== lastValue) rank = index + 1;
      lastValue = row[metric];
      return { nickname: row.nickname, avatarID: row.avatar_id, own: row.is_own === true, rank, value: lastValue };
    });
  }

  function workoutMetrics(summary) {
    if (!summary) return [];
    return [['Duration', summary.minutes, ' min'], ['Sets', summary.sets, ''], ['Volume', summary.volume_lb, ' lb']]
      .filter(([, value]) => (typeof value === 'number' || typeof value === 'string') && Number.isFinite(Number(value)) && Number(value) > 0)
      .map(([label, value, unit]) => [label, windows.format(Number(value)) + unit]);
  }

  function mount(document, panel, bridge) {
    const list = panel.querySelector('[data-community-wall-list]');
    const board = panel.querySelector('[data-community-leaderboard]');
    const rankList = panel.querySelector('[data-community-ranks]');
    const boardStatus = panel.querySelector('[data-community-board-status]');
    const boardSetting = panel.querySelector('[data-community-board-setting]');
    const boardSharing = panel.querySelector('[data-community-board-sharing]');
    const week = panel.querySelector('[data-community-week]');
    const metricButtons = [...panel.querySelectorAll('[data-community-metric]')];
    const wallStatus = panel.querySelector('[data-community-wall-status]');
    let client, user = '', disabled = true, epoch = 0, feedVersion = 0, boardVersion = 0, threadVersion = 0;
    let ownProfile, connections = [], feed = [], leaderboard, metric = metrics[0], reacting = false, setting = false;
    let activeEvent, activeMember, threadBusy = false;
    const lifetime = new Set();
    const requesting = new Set(), recentlyRequested = new Set();
    let squadReady = false;

    const el = (tag, className = '', value = '') => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (value !== '') node.textContent = value;
      return node;
    };
    const button = (value, action, className = 'client-social-control') => {
      const node = el('button', className, value);
      node.type = 'button';
      node.addEventListener('click', action);
      return node;
    };
    function refreshDate(value) {
      const date = new Date(value);
      if (!Number.isFinite(date.getTime())) return '';
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }

    const thread = el('dialog', 'client-social-dialog');
    thread.setAttribute('aria-labelledby', 'client-social-thread-title');
    const threadHead = el('div', 'client-social-top');
    const threadTitle = el('h3', '', 'Comments');
    threadTitle.id = 'client-social-thread-title';
    threadHead.append(threadTitle, button('Close', () => thread.close()));
    const threadRows = el('div', 'client-social-thread');
    const threadStatus = el('p', 'client-social-status');
    threadStatus.setAttribute('role', 'status');
    const commentLabel = el('label', '', 'Add a comment');
    const commentBox = el('textarea');
    commentBox.maxLength = 500;
    commentBox.rows = 2;
    commentBox.placeholder = 'Add a comment';
    commentBox.setAttribute('aria-label', 'Add a comment');
    commentLabel.append(commentBox);
    const send = button('Post comment', () => void sendComment());
    const form = el('div', 'client-social-comment-form');
    form.append(commentLabel, send);
    const join = button('Set up your Social profile', () => { thread.close(); bridge.openCircles(); });
    thread.append(threadHead, threadRows, threadStatus, join, form);
    thread.addEventListener('close', () => { activeEvent = null; threadVersion++; threadRows.replaceChildren(); revokeUnusedPhotos(); });

    const memberDialog = el('dialog', 'client-social-dialog');
    memberDialog.setAttribute('aria-labelledby', 'client-social-member-name');
    const memberHead = el('div', 'client-social-top');
    const memberName = el('h3');
    memberName.id = 'client-social-member-name';
    memberHead.append(memberName, button('Close', () => memberDialog.close()));
    const memberRows = el('div', 'client-social-thread');
    memberDialog.append(memberHead, memberRows);
    memberDialog.addEventListener('close', () => {
      if (memberDialog.open) return;
      activeMember = null;
      memberRows.replaceChildren();
      revokeUnusedPhotos();
    });
    panel.append(thread, memberDialog);

    function avatar(id) {
      const node = el('span', 'client-social-avatar', avatarSymbol(id));
      node.setAttribute('aria-hidden', 'true');
      return node;
    }

    async function enhancePhotos(elements, requestClient = client, generation = epoch) {
      if (!requestClient?.storage || !root.URL?.createObjectURL || !elements.length || disabled) return;
      const ids = [...new Set(elements.map(([id]) => id).filter(Boolean))].slice(0, 101);
      if (!ids.length) return;
      try {
        const { data, error } = await requestClient.rpc('community_avatar_paths', { p_user_ids: ids });
        if (error || generation !== epoch || !Array.isArray(data)) return;
        const paths = new Map(data.map(row => [row.user_id, row.avatar_photo_path]));
        // Only fetch photographs whose images are currently in the DOM.
        await Promise.all(ids.map(async id => {
          const path = paths.get(id);
          if (!avatarPath(path, id) || !elements.some(([owner, node]) => owner === id && node.isConnected)) return;
          const result = await requestClient.storage.from(bucket).download(path);
          if (result.error || !result.data || generation !== epoch) return;
          const nodes = elements.filter(([owner, node]) => owner === id && node.isConnected);
          if (!nodes.length) return;
          const url = root.URL.createObjectURL(result.data);
          lifetime.add(url);
          for (const [, node] of nodes) {
            const image = el('img');
            image.alt = '';
            image.src = url;
            node.replaceChildren(image);
          }
        }));
      } catch (_) { /* Emoji remains available if the photo cannot be downloaded. */ }
    }

    function revokeUnusedPhotos() {
      const shown = new Set([...panel.querySelectorAll('.client-social-avatar img')].map(image => image.src));
      for (const url of lifetime) {
        if (!shown.has(url)) {
          root.URL.revokeObjectURL(url);
          lifetime.delete(url);
        }
      }
    }

    function appendWorkoutSummary(card, summary) {
      const numbers = workoutMetrics(summary);
      if (numbers.length) {
        const stats = el('dl', 'client-social-summary');
        for (const [label, value] of numbers) {
          const item = el('div');
          item.append(el('dt', '', label), el('dd', '', value));
          stats.append(item);
        }
        card.append(stats);
      }
      if (!Array.isArray(summary?.exercises) || !summary.exercises.length) return;
      const exercises = el('ul', 'client-social-exercise-preview');
      for (const exercise of summary.exercises.slice(0, 3)) {
        if (typeof exercise?.name !== 'string' || !Number.isInteger(exercise.sets) || exercise.sets < 1) continue;
        const item = el('li');
        item.append(el('span', '', exercise.name), el('small', '', exercise.sets + (exercise.sets === 1 ? ' set' : ' sets')));
        exercises.append(item);
      }
      if (exercises.children.length) card.append(exercises);
    }

    const hasConnection = owner => connections.find(row => row.user_a === owner || row.user_b === owner);
    const canRequest = owner => !disabled && squadReady && Boolean(ownProfile) && Boolean(owner) &&
      owner !== user && !hasConnection(owner) && !recentlyRequested.has(owner);

    async function sendToSquad(owner, control, status) {
      if (!canRequest(owner) || requesting.has(owner)) return;
      const generation = epoch;
      requesting.add(owner);
      control.disabled = true;
      try {
        const saved = await bridge.requestCircle(owner);
        if (generation !== epoch) return;
        if (saved) recentlyRequested.add(owner);
        status.textContent = saved ? 'Squad request sent.' : 'Could not send the Squad request. Try again.';
      } catch (_) {
        if (generation === epoch) status.textContent = 'Could not send the Squad request. Try again.';
      } finally {
        if (generation === epoch) {
          requesting.delete(owner);
          if (!canRequest(owner)) {
            control.textContent = 'Squad request pending';
            control.disabled = true;
          } else control.disabled = false;
          if (activeMember?.owner === owner) renderMemberCircleAction(activeMember);
        }
      }
    }

    function renderMemberCircleAction(member) {
      const connection = hasConnection(member.owner);
      if (connection || recentlyRequested.has(member.owner)) {
        member.action.replaceChildren(el('small', 'client-social-circle-status',
          connection?.status === 'accepted' ? 'In your Squad' : 'Squad request pending'));
        return;
      }
      if (disabled || member.owner === user) { member.action.replaceChildren(); return; }
      if (!ownProfile) {
        member.action.replaceChildren(button('Set up your Social profile', () => {
          memberDialog.close();
          bridge.openCircles();
        }));
        return;
      }
      if (!canRequest(member.owner)) { member.action.replaceChildren(); return; }
      const add = button('Add to Squad', () => void sendToSquad(member.owner, add, member.status),
        'client-social-control client-social-add');
      add.disabled = requesting.has(member.owner);
      add.setAttribute('aria-label', 'Add ' + member.nickname + ' to Squad');
      member.action.replaceChildren(add);
    }

    function openMember(event, owner) {
      if (disabled) return;
      memberName.textContent = event.nickname;
      const identity = el('div', 'client-social-member-profile');
      const image = avatar(event.avatar_id);
      const action = el('div');
      const status = el('p', 'client-social-status');
      status.setAttribute('role', 'status');
      activeMember = { owner, nickname: event.nickname, action, status };
      renderMemberCircleAction(activeMember);
      identity.append(image, action, status);
      memberRows.replaceChildren(identity, el('h4', '', 'Recent shared workouts'));
      const workouts = feed.filter(post => post.event_type === 'workout' && eventOwner(post.event_id) === owner).slice(0, 3);
      for (const workout of workouts) {
        const card = el('article', 'client-social-post');
        card.append(el('h4', '', workout.summary?.title || workout.headline), el('small', '', refreshDate(workout.occurred_at)));
        appendWorkoutSummary(card, workout.summary);
        memberRows.append(card);
      }
      if (!workouts.length) memberRows.append(el('p', 'client-social-status', 'No recent shared workouts.'));
      if (!memberDialog.open) memberDialog.showModal();
      void enhancePhotos([[owner, image]]);
    }

    function renderFeed() {
      const photos = [];
      list.replaceChildren();
      for (const event of feed) {
        const card = el('article', 'client-social-post');
        const author = el('div', 'client-social-author');
        const icon = avatar(event.avatar_id);
        const owner = eventOwner(event.event_id);
        photos.push([owner, icon]);
        const identity = el('span', 'client-social-author-name');
        identity.append(el('strong', '', event.nickname), el('small', '', refreshDate(event.occurred_at)));
        if (owner && !event.is_own) {
          const member = button('', () => openMember(event, owner), 'client-social-member-button');
          member.setAttribute('aria-label', 'View ' + event.nickname + '’s Social profile');
          member.append(icon, identity);
          author.append(member);
          if (canRequest(owner)) {
            const direct = button('Add to Squad', () => void sendToSquad(owner, direct, wallStatus),
              'client-social-control client-social-inline-add');
            direct.disabled = requesting.has(owner);
            direct.setAttribute('aria-label', 'Add ' + event.nickname + ' to Squad');
            author.append(direct);
          }
        } else author.append(icon, identity);
        card.append(author, el('h3', 'client-social-post-title', event.summary?.title || event.headline));
        appendWorkoutSummary(card, event.summary);
        const actions = el('div', 'client-social-actions');
        const count = Number.isInteger(event.props_count) ? event.props_count : 0;
        const reaction = button((event.gave_props ? 'Props given' : 'Give props') + (count > 0 ? ' · ' + count : ''), () => void react(event, reaction));
        reaction.setAttribute('aria-pressed', String(Boolean(event.gave_props)));
        reaction.disabled = event.is_own || event.gave_props || !event.can_give_props;
        if (event.is_own) reaction.textContent = count + (count === 1 ? ' prop' : ' props');
        actions.append(reaction, button('Comments', () => openThread(event)));
        card.append(actions);
        list.append(card);
      }
      revokeUnusedPhotos();
      void enhancePhotos(photos);
    }

    async function refreshFeed() {
      if (disabled || !client) return;
      const version = ++feedVersion, generation = epoch, api = client;
      wallStatus.textContent = feed.length ? '' : 'Loading Feed…';
      try {
        const result = await api.rpc('community_wall_feed');
        if (result.error) throw result.error;
        const cutoff = Date.now() - 72 * 3600000, now = Date.now();
        const events = (Array.isArray(result.data) ? result.data : []).filter(event => {
          const date = Date.parse(event.occurred_at);
          return date >= cutoff && date <= now;
        }).slice(0, 100);
        const workoutIDs = events.filter(event => event.event_type === 'workout').map(event => event.event_id);
        let summaries = new Map();
        if (workoutIDs.length) {
          try {
            const requested = new Set(workoutIDs);
            const response = await api.rpc('community_wall_workout_summaries', { p_event_ids: workoutIDs });
            if (!response.error && Array.isArray(response.data)) {
              summaries = new Map(response.data.filter(row => requested.has(row.event_id)).map(row => [row.event_id, row]));
            }
          } catch (_) { /* Feed remains readable with the original headlines. */ }
        }
        if (generation !== epoch || version !== feedVersion) return;
        feed = events.map(event => ({ ...event, summary: summaries.get(event.event_id) }));
        renderFeed();
        wallStatus.textContent = feed.length ? '' : 'No activity has been shared in the last three days.';
      } catch (_) {
        if (generation === epoch && version === feedVersion) wallStatus.textContent = 'Could not load the Feed. Try opening Social again.';
      }
    }

    async function react(event, control) {
      if (disabled || reacting || !client || !event.can_give_props || event.gave_props || event.is_own) return;
      reacting = true;
      control.disabled = true;
      const generation = epoch;
      try {
        const result = await client.rpc('community_give_wall_props', { p_event_id: event.event_id });
        if (result.error) throw result.error;
        if (generation === epoch) {
          event.gave_props = true;
          event.props_count = Math.max(0, Number(event.props_count) || 0) + Number(result.data === true);
          control.setAttribute('aria-pressed', 'true');
          control.textContent = 'Props given' + (event.props_count > 0 ? ' · ' + event.props_count : '');
        }
      } catch (_) {
        if (generation === epoch) { wallStatus.textContent = 'Could not give props. Try again.'; control.disabled = false; }
      } finally { if (generation === epoch) reacting = false; }
    }

    function openThread(event) {
      if (disabled || !client) return;
      activeEvent = event;
      commentBox.value = '';
      form.hidden = !ownProfile;
      join.hidden = Boolean(ownProfile);
      threadRows.replaceChildren();
      if (!thread.open) thread.showModal();
      void loadThread();
    }

    async function loadThread() {
      if (!activeEvent) return;
      const version = ++threadVersion, generation = epoch;
      threadStatus.textContent = 'Loading comments…';
      try {
        const { data, error } = await client.rpc('community_wall_comments', { p_event_id: activeEvent.event_id });
        if (error) throw error;
        if (generation !== epoch || version !== threadVersion || !thread.open) return;
        threadRows.replaceChildren();
        const photos = [];
        for (const comment of Array.isArray(data) ? data : []) {
          const row = el('article', 'client-social-comment');
          const icon = avatar(comment.avatar_id);
          const owner = uuid.test(comment.user_id || '') ? comment.user_id.toLowerCase() : null;
          photos.push([owner, icon]);
          const content = el('div');
          content.append(el('strong', '', comment.nickname), el('p', '', comment.body));
          row.append(icon, content);
          if (comment.is_own && uuid.test(comment.id || '')) row.append(button('Delete', () => void deleteComment(comment.id)));
          threadRows.append(row);
        }
        threadStatus.textContent = threadRows.children.length ? '' : 'No comments yet.';
        revokeUnusedPhotos();
        void enhancePhotos(photos);
      } catch (_) {
        if (generation === epoch && version === threadVersion) threadStatus.textContent = 'Comments could not load. Try again.';
      }
    }

    async function sendComment() {
      const message = commentBox.value.trim();
      if (!message || Array.from(message).length > 500 || !ownProfile || !activeEvent || threadBusy || disabled) return;
      const generation = epoch, event = activeEvent;
      threadBusy = true;
      send.disabled = true;
      try {
        const { error } = await client.rpc('community_add_wall_comment', { p_event_id: event.event_id, p_body: message });
        if (error) throw error;
        if (epoch === generation && activeEvent === event) {
          commentBox.value = '';
          await loadThread();
        }
      } catch (_) {
        if (epoch === generation && activeEvent === event) threadStatus.textContent = 'Comment could not be sent. Try again.';
      } finally {
        if (epoch === generation) { threadBusy = false; send.disabled = false; }
      }
    }

    async function deleteComment(id) {
      if (!activeEvent || disabled || threadBusy) return;
      const generation = epoch, event = activeEvent;
      threadBusy = true;
      try {
        const { error } = await client.rpc('community_delete_wall_comment', { p_comment_id: id });
        if (error) throw error;
        if (generation === epoch && activeEvent === event) await loadThread();
      } catch (_) {
        if (generation === epoch && activeEvent === event) threadStatus.textContent = 'Could not delete the comment. Try again.';
      } finally { if (generation === epoch) threadBusy = false; }
    }

    function renderBoard() {
      rankList.replaceChildren();
      if (!leaderboard) return;
      const date = /^\d{4}-\d\d-\d\d$/.test(leaderboard.week_start) ? new Date(leaderboard.week_start + 'T12:00:00') : null;
      if (date && Number.isFinite(date.getTime())) {
        const end = new Date(date);
        end.setDate(date.getDate() + 6);
        week.textContent = refreshDate(date) + ' – ' + refreshDate(end);
      } else week.textContent = '';
      boardSetting.hidden = leaderboard.can_participate !== true;
      boardSharing.checked = leaderboard.sharing_enabled === true;
      boardSharing.disabled = setting;
      const rows = ranked(leaderboard.entries, metric);
      for (const result of rows) {
        const row = el('li', 'client-social-rank');
        row.append(el('span', 'client-social-position', String(result.rank)), avatar(result.avatarID),
          el('strong', '', result.nickname + (result.own ? ' (you)' : '')), el('span', 'client-social-rank-value', String(result.value)));
        rankList.append(row);
      }
      boardStatus.textContent = rows.length ? '' : 'No rankings for this metric yet.';
    }

    async function refreshBoard() {
      if (disabled || !client || board.hidden) return;
      const generation = epoch, version = ++boardVersion;
      boardStatus.textContent = 'Loading rankings…';
      try {
        const { data, error } = await client.rpc('community_weekly_leaderboard');
        if (error || !data || !Array.isArray(data.entries)) throw error || new Error('Leaderboard unavailable.');
        if (generation !== epoch || version !== boardVersion) return;
        leaderboard = data;
        renderBoard();
      } catch (_) {
        if (generation === epoch && version === boardVersion) boardStatus.textContent = 'Rankings are unavailable. Try again later.';
      }
    }

    metricButtons.forEach(control => control.addEventListener('click', () => {
      metric = control.dataset.communityMetric;
      for (const other of metricButtons) other.setAttribute('aria-pressed', String(other === control));
      renderBoard();
    }));
    boardSharing.addEventListener('change', async () => {
      if (disabled || setting || !leaderboard?.can_participate) return;
      const generation = epoch;
      const enabled = boardSharing.checked;
      setting = true;
      boardSharing.disabled = true;
      try {
        const { data, error } = await client.rpc('community_set_leaderboard_sharing', { p_enabled: enabled });
        if (error || data !== enabled) throw error || new Error('Sharing was not saved.');
        if (generation !== epoch) return;
        leaderboard.sharing_enabled = enabled;
        if (!enabled) leaderboard.entries = leaderboard.entries.filter(row => !row.is_own);
        renderBoard();
        await refreshBoard();
      } catch (_) {
        if (generation === epoch) {
          boardSharing.checked = leaderboard.sharing_enabled === true;
          boardStatus.textContent = 'Could not save leaderboard sharing. Try again.';
        }
      } finally {
        if (generation === epoch) { setting = false; boardSharing.disabled = false; }
      }
    });

    return {
      configure(api, account, preview) {
        if (client === api && user === account && disabled === (preview || !api || !account)) return;
        client = api; user = account; disabled = preview || !api || !account; epoch++;
        ownProfile = null; activeMember = null; connections = []; feed = []; leaderboard = null;
        squadReady = false; requesting.clear(); recentlyRequested.clear();
        setting = false; reacting = false; threadBusy = false;
        if (thread.open) thread.close();
        if (memberDialog.open) memberDialog.close();
        rankList.replaceChildren(); list.replaceChildren();
        boardSetting.hidden = true;
        week.textContent = '';
        boardStatus.textContent = disabled ? 'Sign in to view rankings.' : '';
        wallStatus.textContent = disabled ? 'Sign in to view the Feed.' : '';
        revokeUnusedPhotos();
      },
      refreshFeed,
      refreshBoard,
      setMembers(profile, peers, ready = true) {
        const signature = () => JSON.stringify([Boolean(ownProfile), squadReady,
          connections.map(x => [x.user_a, x.user_b, x.status])]);
        const before = signature();
        ownProfile = profile;
        connections = peers;
        squadReady = ready;
        for (const owner of recentlyRequested) if (hasConnection(owner)) recentlyRequested.delete(owner);
        if (activeMember && !requesting.has(activeMember.owner)) renderMemberCircleAction(activeMember);
        if (feed.length && before !== signature()) renderFeed();
      },
      enhancePhotos
    };
  }

  const api = { mount, avatarSymbol, avatarPath, customEmoji, ranked, eventOwner, workoutMetrics, bucket };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.FWB_COMMUNITY_SOCIAL = api;
})(typeof window !== 'undefined' ? window : globalThis);
