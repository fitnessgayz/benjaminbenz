(() => {
  if (!document.body.classList.contains("client-dashboard-page")) return;

  const imageRoot = "/assets/mockups/fascia/client-web/";
  const studies = {
    home: ["torso-front-study", "torso-side-study", "torso-back-study"],
    workouts: ["shoulder-press-fibers", "curl-fibers-v2", "squat-fibers-forward-head"],
    logs: ["torso-back-study", "glutes-hamstrings-study", "calves-study"],
    progress: ["quads-study", "legs-study", "glutes-hamstrings-study"],
    community: ["female-lunge-fibers", "running-fibers", "martial-arts-fibers"],
    notifications: ["calves-study", "torso-side-study", "torso-front-study"],
    nutrition: ["torso-side-study", "quads-study", "torso-front-study"],
    stats: ["legs-study", "glutes-hamstrings-study", "calves-study"],
    questionnaire: ["torso-front-study", "torso-back-study", "torso-side-study"],
    sessions: ["female-lunge-fibers", "running-fibers", "martial-arts-fibers"]
  };

  const storageKey = "fwb-client-fascia-background-cycle";
  let cycle = Math.floor(Math.random() * 3);
  try {
    const previous = sessionStorage.getItem(storageKey);
    if (previous !== null) cycle = (Number(previous) + 1) % 3;
    sessionStorage.setItem(storageKey, String(cycle));
  } catch {
    // Browsers without session storage still get a background for each page.
  }

  for (const [section, choices] of Object.entries(studies)) {
    const panel = document.querySelector(`[data-client-dashboard-panel="${section}"]`);
    if (!panel) continue;
    const image = `${imageRoot}${choices[cycle]}.webp`;
    panel.style.setProperty("--client-fascia-image", `url("${image}")`);
  }
})();
