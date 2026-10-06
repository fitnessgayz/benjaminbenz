(function (global) {
  "use strict";

  const steps = [
    { title: "Home", body: "Your daily check-in, gym visits, and dashboard shortcuts start here. Open Workouts when you are ready to train." },
    { title: "Choose a workout", body: "In Workouts, open a trainer-assigned workout, log a custom session, or tap Generate Workout. Choose a weekly plan to save several days, or Today’s workout for one session. Cardio & Mobility lets you log cardio or create a recovery session." },
    { title: "Warm up and log", body: "Start the workout timer, then log or skip the warm-up. Add exercises through the library. Enter weight, reps, and effort, then log each set or round. Gray values are suggestions; they do not count until you log them. Finish and save when you are done." },
    { title: "Logs", body: "See saved workouts first, followed by Apple Health and connected health workouts. Search your history, download a CSV, or import a workout history CSV from another app after reviewing its preview and units." },
    { title: "Progress", body: "Track measurements, exercise progress, personal records, and photos. Your workout history helps you choose weights for future sessions." },
    { title: "Community", body: "Try the daily challenge, earn XP and badges, and visit the FWB Wall. If you opt in to sharing, other clients can give props to your wins." },
    { title: "Settings", body: "Choose light or dark mode, adjust timers and check-ins, review health app sharing, and return to this tour any time." }
  ];

  function createTour(document) {
    const trigger = document.querySelector("[data-client-web-tour-open]");
    if (!trigger || typeof document.createElement !== "function") return null;
    const dialog = document.createElement("dialog");
    dialog.className = "client-web-tour";
    dialog.setAttribute("aria-labelledby", "client-web-tour-title");
    dialog.innerHTML = `<div class="client-web-tour-header"><span class="client-web-tour-kicker">FWB TRAINING · APP TOUR</span><button type="button" data-client-web-tour-close aria-label="Close app tour">✕</button></div>
      <p class="client-web-tour-count" data-client-web-tour-count></p>
      <h2 id="client-web-tour-title" data-client-web-tour-title></h2>
      <p data-client-web-tour-body></p>
      <div class="client-web-tour-actions"><button type="button" data-client-web-tour-back>Back</button><button type="button" data-client-web-tour-next>Next</button></div>`;
    document.body.append(dialog);
    let index = 0;
    const render = () => {
      dialog.querySelector("[data-client-web-tour-count]").textContent = `${index + 1} of ${steps.length}`;
      dialog.querySelector("[data-client-web-tour-title]").textContent = steps[index].title;
      dialog.querySelector("[data-client-web-tour-body]").textContent = steps[index].body;
      dialog.querySelector("[data-client-web-tour-back]").disabled = index === 0;
      dialog.querySelector("[data-client-web-tour-next]").textContent = index === steps.length - 1 ? "Done" : "Next";
    };
    trigger.addEventListener("click", () => { index = 0; render(); dialog.showModal(); });
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
