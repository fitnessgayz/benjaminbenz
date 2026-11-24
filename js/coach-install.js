(() => {
  const controls = document.querySelectorAll("[data-coach-install]");
  const standalone = window.matchMedia("(display-mode: standalone)");
  let installPrompt;
  let guide;
  let installed = false;

  function updateVisibility() {
    const show = !installed && !standalone.matches && navigator.standalone !== true;
    controls.forEach((control) => { control.hidden = !show; });
    if (!show && guide?.open) guide.close();
  }

  function openGuide() {
    if (!guide) {
      guide = document.createElement("dialog");
      guide.className = "coach-install-dialog";
      guide.setAttribute("aria-labelledby", "coach-install-title");
      guide.innerHTML = `
        <h2 id="coach-install-title">Install GRUNTR Coach</h2>
        <dl>
          <dt>iPhone or iPad</dt>
          <dd>Open this page in Safari. Tap Share, then Add to Home Screen. If shown, turn on Open as Web App and tap Add.</dd>
          <dt>Android</dt>
          <dd>Open the Chrome menu and choose Install app or Add to Home screen.</dd>
          <dt>Computer</dt>
          <dd>Look for the install icon in your browser’s address bar or the install option in its menu.</dd>
        </dl>
        <form method="dialog"><button class="button button-ghost" autofocus>Done</button></form>
      `;
      document.body.append(guide);
    }
    guide.showModal();
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    installPrompt = undefined;
    updateVisibility();
  });
  standalone.addEventListener("change", updateVisibility);

  controls.forEach((control) => {
    control.addEventListener("click", async () => {
      if (!installPrompt) {
        openGuide();
        return;
      }
      const prompt = installPrompt;
      installPrompt = undefined;
      try {
        await prompt.prompt();
      } catch {
        openGuide();
      }
    });
  });
  updateVisibility();
})();
