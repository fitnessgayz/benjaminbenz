const year = document.getElementById("year");

if (year) {
  year.textContent = new Date().getFullYear();
}

const reviewTrack = document.querySelector(".review-track");

if (reviewTrack) {
  const reviews = Array.from(reviewTrack.children);

  for (let index = reviews.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [reviews[index], reviews[randomIndex]] = [reviews[randomIndex], reviews[index]];
  }

  reviews.forEach((review) => reviewTrack.appendChild(review));
}

const questionnaire = document.getElementById("training-questionnaire");

if (questionnaire) {
  questionnaire.addEventListener("submit", async (event) => {
    event.preventDefault();

    const status = document.getElementById("questionnaire-status");
    const submitButton = questionnaire.querySelector('button[type="submit"]');

    if (submitButton) {
      submitButton.disabled = true;
    }
    if (status) {
      status.textContent = "Submitting your questionnaire...";
    }

    try {
      await fetch(questionnaire.action, {
        method: "POST",
        mode: "no-cors",
        body: new URLSearchParams(new FormData(questionnaire))
      });

      if (status) {
        status.textContent = "Thanks. Your questionnaire was sent to Benjamin.";
      }

      questionnaire.reset();
    } catch (error) {
      if (status) {
        status.textContent = "Something went wrong. Please email fwb@benjaminbenz.com.";
      }
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  });
}
