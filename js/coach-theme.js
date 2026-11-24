(() => {
  const modeKey = "gruntr-coach-theme";
  const root = document.documentElement;
  const themeColor = document.querySelector('meta[name="theme-color"]');
  const toggleSelector = "[data-coach-theme-toggle]";

  function applyTheme(value) {
    const dark = value === "dark";
    root.dataset.coachTheme = dark ? "dark" : "light";
    themeColor?.setAttribute("content", dark ? "#101113" : "#f2f4f6");
    for (const toggle of document.querySelectorAll(toggleSelector)) toggle.checked = dark;
  }

  let savedTheme;
  try { savedTheme = localStorage.getItem(modeKey); } catch { /* Storage may be disabled. */ }
  applyTheme(savedTheme);

  document.addEventListener("DOMContentLoaded", () => applyTheme(root.dataset.coachTheme));
  document.addEventListener("change", (event) => {
    if (!event.target.matches(toggleSelector)) return;
    const theme = event.target.checked ? "dark" : "light";
    applyTheme(theme);
    try { localStorage.setItem(modeKey, theme); } catch { /* Keep the current page usable. */ }
  });
  window.addEventListener("storage", (event) => {
    if (event.key === modeKey || event.key === null) applyTheme(event.newValue);
  });
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    try { applyTheme(localStorage.getItem(modeKey)); } catch { /* Keep the current theme. */ }
  });
})();
