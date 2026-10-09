(() => {
  const tour = document.querySelector('[data-tour]');
  if (!tour) return;
  const steps = [...tour.querySelectorAll('[data-tour-step]')];
  const tabs = [...tour.querySelectorAll('[data-tour-select]')];
  const back = tour.querySelector('[data-tour-back]');
  const next = tour.querySelector('[data-tour-next]');
  const status = tour.querySelector('[data-tour-status]');
  let current = 0;

  function show(index) {
    current = Math.max(0, Math.min(index, steps.length - 1));
    steps.forEach((step, position) => { step.hidden = position !== current; });
    tabs.forEach((tab, position) => {
      if (position === current) tab.setAttribute('aria-current', 'step');
      else tab.removeAttribute('aria-current');
    });
    status.textContent = `Screen ${current + 1} of ${steps.length}`;
    back.disabled = current === 0;
    next.textContent = current === steps.length - 1 ? 'Start again ↺' : 'Next screen →';
  }

  tabs.forEach((tab, index) => tab.addEventListener('click', () => show(index)));
  back.addEventListener('click', () => show(current - 1));
  next.addEventListener('click', () => show(current === steps.length - 1 ? 0 : current + 1));
  tour.addEventListener('keydown', event => {
    if (event.key === 'ArrowRight') { event.preventDefault(); show((current + 1) % steps.length); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); show((current - 1 + steps.length) % steps.length); }
  });
  tour.classList.add('is-enhanced');
  show(0);
  const year = document.querySelector('#year');
  if (year) year.textContent = new Date().getFullYear();
})();
