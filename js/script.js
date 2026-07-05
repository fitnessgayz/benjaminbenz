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
  questionnaire.addEventListener("submit", (event) => {
    const dateInput = document.getElementById("date-of-birth");
    const status = document.getElementById("questionnaire-status");

    if (dateInput?.value) {
      const [yearValue, monthValue, dayValue] = dateInput.value.split("-");
      document.getElementById("dob-year").value = yearValue || "";
      document.getElementById("dob-month").value = monthValue || "";
      document.getElementById("dob-day").value = dayValue || "";
    }

    if (status) {
      status.textContent = "Submitting your questionnaire...";
    }

    window.setTimeout(() => {
      if (status) {
        status.textContent = "Thanks. Your questionnaire was sent to Benjamin.";
      }

      questionnaire.reset();
    }, 1400);
  });
}
