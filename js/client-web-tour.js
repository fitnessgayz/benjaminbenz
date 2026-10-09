(function (global) {
  "use strict";

  const steps = [
    { title: "Home", pose: "greeting", body: "Hi, I’m Atari! I’ll show you around. Your daily check-in, gym visits, and dashboard shortcuts start here. Open Workouts when you are ready to train." },
    { title: "Choose a workout", pose: "encouraging", body: "Let’s find a workout for you. In Workouts, open a trainer-assigned workout, log a custom session, or tap Generate Workout. Choose a weekly plan to save several days, or Today’s workout for one session. Cardio & Mobility lets you log cardio or create a recovery session." },
    { title: "Warm up and log", pose: "encouraging", body: "I’ll help you keep track as you train. Start the timer, then log or skip the warm-up. Add exercises through the library. Enter weight, reps, and effort, then log each set or round. Gray values are suggestions; they do not count until you log them. Finish and save when you are done." },
    { title: "Logs", pose: "greeting", body: "Your Logs keep saved workouts first, followed by Apple Health and connected health workouts. Search your history, download a CSV, or import a workout history CSV from another app after reviewing its preview and units." },
    { title: "Progress", pose: "celebrating", body: "Come see how far you’ve come! Track measurements, exercise progress, personal records, and photos. Your workout history helps you choose weights for future sessions." },
    { title: "Community", pose: "celebrating", body: "Let’s celebrate your wins. Try the daily challenge, earn XP and badges, and visit the FWB Wall. If you opt in to sharing, other clients can give props to your wins." },
    { title: "Settings", pose: "resting", body: "Need a breather or a refresher? In Settings, choose light or dark mode, adjust timers and check-ins, review health app sharing, and return to this tour any time. I’ll be here when you need me." }
  ];

  function createTour(document) {
    const trigger = document.querySelector("[data-client-web-tour-open]");
    if (!trigger || typeof document.createElement !== "function") return null;
    const dialog = document.createElement("dialog");
    dialog.className = "client-web-tour";
    dialog.setAttribute("aria-labelledby", "client-web-tour-title");
    dialog.innerHTML = `<div class="client-web-tour-header"><span class="client-web-tour-kicker">FWB TRAINING · TOUR WITH ATARI</span><button type="button" data-client-web-tour-close aria-label="Close app tour">✕</button></div>
      <p class="client-web-tour-count" data-client-web-tour-count></p>
      <h2 id="client-web-tour-title" data-client-web-tour-title tabindex="-1"></h2>
      <div class="client-web-tour-guide"><span class="client-web-tour-atari is-greeting" data-client-web-tour-atari aria-hidden="true"><img src="assets/mascots/atari-expressions.png" alt="" /></span><div class="client-web-tour-speech"><strong>Atari says</strong><p data-client-web-tour-body aria-live="polite"></p></div></div>
      <div class="client-web-tour-actions"><button type="button" data-client-web-tour-back>Back</button><button type="button" data-client-web-tour-next>Next</button></div>`;
    document.body.append(dialog);
    let index = 0;
    const render = () => {
      dialog.querySelector("[data-client-web-tour-count]").textContent = `${index + 1} of ${steps.length}`;
      const title = dialog.querySelector("[data-client-web-tour-title]");
      title.textContent = steps[index].title;
      dialog.querySelector("[data-client-web-tour-body]").textContent = steps[index].body;
      dialog.querySelector("[data-client-web-tour-atari]").className = `client-web-tour-atari is-${steps[index].pose}`;
      dialog.querySelector("[data-client-web-tour-back]").disabled = index === 0;
      dialog.querySelector("[data-client-web-tour-next]").textContent = index === steps.length - 1 ? "Done" : "Next";
      if (dialog.open) title.focus({ preventScroll: true });
    };
    trigger.addEventListener("click", () => { index = 0; render(); dialog.showModal(); dialog.querySelector("[data-client-web-tour-title]").focus({ preventScroll: true }); });
    dialog.addEventListener("click", (event) => {
      if (event.target.closest("[data-client-web-tour-close]") || event.target === dialog) { dialog.close(); return; }
      if (event.target.closest("[data-client-web-tour-back]")) { index = Math.max(0, index - 1); render(); }
      if (event.target.closest("[data-client-web-tour-next]")) {
        if (index === steps.length - 1) dialog.close();
        else { index++; render(); }
      }
    });
    dialog.addEventListener("close", () => trigger.focus());
    return dialog;
  }

  global.FWB_CLIENT_WEB_TOUR = Object.freeze({ createTour, steps });
  if (global.document) createTour(global.document);
})(typeof window === "undefined" ? globalThis : window);
