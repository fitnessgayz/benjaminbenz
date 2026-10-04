(() => {
  if (!document.body.classList.contains("client-dashboard-page")) return;

  const imageRoot = "/assets/mockups/fascia/client-web/";
  const homeStudies = ["torso-front-study", "torso-side-study", "torso-back-study"];
  const homePanel = document.querySelector('[data-client-dashboard-panel="home"]');
  if (!homePanel) return;

  const storageKey = "fwb-client-fascia-background-cycle";
  let cycle = Math.floor(Math.random() * 3);
  try {
    const previous = sessionStorage.getItem(storageKey);
    if (previous !== null) cycle = (Number(previous) + 1) % 3;
    sessionStorage.setItem(storageKey, String(cycle));
  } catch {
    // Browsers without session storage still get a background for each page.
  }

  const image = `${imageRoot}${homeStudies[cycle]}.webp`;
  homePanel.style.setProperty("--client-fascia-image", `url("${image}")`);
})();
