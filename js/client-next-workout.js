/* Read-only Home-to-Workout navigation. The CTA opens a section, not a workout. */
(function (root) {
  'use strict';

  function sourceSection(source) {
    if (source === 'assigned') return 'personal';
    if (source === 'generated') return 'trainer';
    return 'routines';
  }

  function recommendation({ scheduled = [], workouts = [], lastTitle = '', today }) {
    const plans = scheduled.filter(row => row && typeof row.title === 'string' && row.title.trim()
      && /^\d{4}-\d{2}-\d{2}$/.test(row.planned_date) && row.planned_date >= today
      && ['assigned', 'generated', 'custom', 'history'].includes(row.source_type));
    plans.sort((a, b) => a.planned_date.localeCompare(b.planned_date) || String(a.id || '').localeCompare(String(b.id || '')));
    if (plans.length) {
      return { title: plans[0].title.trim(), date: plans[0].planned_date, section: sourceSection(plans[0].source_type) };
    }
    const candidates = workouts.filter(row => row?.title?.trim?.() && Array.isArray(row.exercises) && row.exercises.length);
    if (!candidates.length) return { title: '', date: '', section: 'routines' };
    const normalize = value => String(value || '').trim().toLowerCase();
    const last = candidates.findIndex(row => normalize(row.title) === normalize(lastTitle));
    return { title: candidates[(last + 1) % candidates.length].title, date: '', section: 'personal' };
  }

  const api = { recommendation, sourceSection };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FWB_CLIENT_NEXT_WORKOUT = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
