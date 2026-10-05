(() => {
  const key = "fwb-client-theme";
  const choices = new Set(["light", "dark", "system"]);
  const systemTheme = window.matchMedia?.("(prefers-color-scheme: light)");

  function savedChoice() {
    try {
      const value = window.localStorage.getItem(key);
      return choices.has(value) ? value : "dark";
    } catch (_) {
      return "dark";
    }
  }

  function applyTheme(choice) {
    const resolved = choice === "system" ? (systemTheme?.matches ? "light" : "dark") : choice;
    document.documentElement.dataset.clientTheme = resolved;
    document.documentElement.style.colorScheme = resolved;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = resolved === "light" ? "#f4f5ef" : "#050806";
    document.querySelectorAll('input[name="client-theme"]').forEach((input) => {
      input.checked = input.value === choice;
    });
  }

  applyTheme(savedChoice());
  systemTheme?.addEventListener?.("change", () => {
    if (savedChoice() === "system") applyTheme("system");
  });

  document.addEventListener("DOMContentLoaded", () => {
    applyTheme(savedChoice());
    document.querySelectorAll('input[name="client-theme"]').forEach((input) => {
      input.addEventListener("change", () => {
        if (!input.checked || !choices.has(input.value)) return;
        try { window.localStorage.setItem(key, input.value); } catch (_) { /* Keep this visit's choice. */ }
        applyTheme(input.value);
      });
    });
  });
})();
