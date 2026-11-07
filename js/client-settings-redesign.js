(() => {
  const menu = document.querySelector('[data-client-settings-view="menu"]');
  const nav = menu?.querySelector('.client-settings-shortcuts');
  if (!menu || !nav) return;
  const children = [...nav.children];
  const take = (selector) => {
    const item = children.find((node) => node.matches(selector));
    if (item) item.remove();
    return item;
  };
  const group = (title, items) => {
    const section = document.createElement('section');
    section.className = 'client-settings-redesign-group';
    section.innerHTML = `<h3>${title}</h3><div class="client-settings-redesign-list"></div>`;
    items.filter(Boolean).forEach((item) => section.querySelector('div').append(item));
    nav.append(section);
    return section;
  };
  const membership = menu.querySelector('.client-membership-label');
  membership?.remove();
  const heading = menu.querySelector('.panel-heading');
  heading.innerHTML = '<div class="client-settings-redesign-heading"><h2 id="client-notification-settings-title">Settings</h2><button type="button" data-settings-search-toggle aria-label="Search settings">⌕</button></div><label class="client-settings-redesign-search" hidden><span class="sr-only">Search settings</span><input type="search" placeholder="Search settings" autocomplete="off"></label>';
  const profile = menu.querySelector('.profile-photo-card');
  if (profile) {
    profile.hidden = false;
    heading.after(profile);
    const accountCopy = profile.querySelector('.profile-photo-account');
    if (accountCopy && membership) {
      membership.firstChild.textContent = '';
      accountCopy.append(membership);
    }
    if (accountCopy) {
      const displayName = document.createElement('span');
      displayName.className = 'client-settings-profile-name';
      accountCopy.prepend(displayName);
      const updateName = () => {
        const email = accountCopy.querySelector('[data-profile-email]')?.textContent || '';
        const programName = typeof currentProgram !== 'undefined' ? (currentProgram?.clientName || currentProgram?.client_name) : '';
        displayName.textContent = programName || email.split('@')[0] || 'Your profile';
      };
      updateName();
      const emailNode = accountCopy.querySelector('[data-profile-email]');
      if (emailNode) new MutationObserver(updateName).observe(emailNode, { childList: true, characterData: true, subtree: true });
    }
  }
  nav.innerHTML = '';
  nav.className = 'client-settings-redesign-groups';
  const theme = menu.querySelector('.client-theme-setting');
  const tabs = take('[data-client-settings-open="bottom-tabs"]');
  const appearance = document.createElement('button');
  appearance.type = 'button'; appearance.className = 'client-settings-shortcut client-settings-appearance-toggle';
  appearance.innerHTML = '<span class="settings-redesign-icon">◐</span><span class="client-settings-shortcut-copy"><strong>Appearance &amp; tabs</strong></span><small>Dark</small><span class="client-settings-shortcut-arrow" aria-hidden="true">›</span>';
  const appearanceStatus = appearance.querySelector('small');
  const syncAppearance = () => { appearanceStatus.textContent = menu.querySelector('input[name="client-theme"]:checked')?.value || 'System'; };
  menu.addEventListener('change', (event) => { if (event.target.name === 'client-theme') syncAppearance(); });
  const appearanceDetails = document.createElement('div');
  appearanceDetails.className = 'client-settings-appearance-details'; appearanceDetails.hidden = true;
  if (theme) appearanceDetails.append(theme);
  syncAppearance();
  if (tabs) appearanceDetails.append(tabs);
  appearance.addEventListener('click', () => {
    appearanceDetails.hidden = !appearanceDetails.hidden;
    appearance.setAttribute('aria-expanded', String(!appearanceDetails.hidden));
  });
  group('ACCOUNT', [take('[data-client-settings-open="notifications"]'), take('[data-client-settings-open="security"]')]);
  group('TRAINING', [take('[data-client-settings-open="training-preferences"]'), take('[data-client-settings-destination="sessions"]'), take('[data-client-settings-destination="nutrition"]'), take('[data-client-settings-destination="questionnaire"]')]);
  group('HEALTH & DEVICES', [take('[data-client-settings-open="health-apps"]')]);
  group('APP', [appearance, appearanceDetails, take('[data-client-settings-destination="stats"]'), take('[data-client-settings-open="recent-updates"]'), take('[data-message-coach]')]);
  group('SUPPORT & PRIVACY', [...children.filter((node) => node.parentNode !== nav && !node.parentNode), take('.client-settings-signout')]);
  const rename = (selector, label) => { const node = nav.querySelector(selector); if (node) node.querySelector('strong').textContent = label; };
  rename('[data-client-settings-open="security"]', 'Password & Security');
  rename('[data-client-settings-open="training-preferences"]', 'Workout settings');
  rename('[data-client-settings-destination="nutrition"]', 'Food · calories & macros');
  rename('[data-client-settings-destination="questionnaire"]', 'PAR-Q questionnaire');
  rename('[data-client-settings-open="health-apps"]', 'Apple Health & Watch');
  const search = heading.querySelector('.client-settings-redesign-search');
  heading.querySelector('[data-settings-search-toggle]').addEventListener('click', () => {
    search.hidden = !search.hidden;
    if (!search.hidden) search.querySelector('input').focus();
    else { search.querySelector('input').value = ''; search.querySelector('input').dispatchEvent(new Event('input')); }
  });
  search.querySelector('input').addEventListener('input', (event) => {
    const query = event.target.value.trim().toLowerCase();
    nav.querySelectorAll('.client-settings-shortcut, .client-settings-appearance-toggle').forEach((row) => {
      row.hidden = !!query && !row.textContent.toLowerCase().includes(query);
    });
    nav.querySelectorAll('.client-settings-redesign-group').forEach((section) => {
      section.hidden = ![...section.querySelectorAll('.client-settings-shortcut, .client-settings-appearance-toggle')].some((row) => !row.hidden);
    });
  });
})();
