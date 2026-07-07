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
        status.textContent = "Something went wrong. Please email benjaminbenz.fit@gmail.com.";
      }
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  });
}

const contactForm = document.getElementById("contact-message-form");
const contactEmail = "benjaminbenz.fit@gmail.com";

function contactMailto(formData) {
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const message = String(formData.get("message") || "").trim();
  const body = [
    "New message from benjaminbenz.com.",
    "",
    `Name: ${name}`,
    `Email: ${email}`,
    `Phone: ${phone || "Not provided"}`,
    "",
    "Message:",
    message
  ].join("\n");

  return `mailto:${contactEmail}?subject=${encodeURIComponent(`Website message from ${name || "visitor"}`)}&body=${encodeURIComponent(body)}`;
}

if (contactForm) {
  contactForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const status = document.getElementById("contact-message-status");
    const submitButton = contactForm.querySelector('button[type="submit"]');
    const formData = new FormData(contactForm);
    const contactConfig = window.FWB_SUPABASE_CONFIG || {};
    const endpoint = contactConfig.url
      ? `${contactConfig.url}/functions/v1/send-contact-message`
      : "";

    if (submitButton) {
      submitButton.disabled = true;
    }
    if (status) {
      status.textContent = "Sending your message...";
    }

    try {
      if (!endpoint || !contactConfig.anonKey) {
        throw new Error("Contact form is not connected.");
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "apikey": contactConfig.anonKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: String(formData.get("name") || ""),
          email: String(formData.get("email") || ""),
          phone: String(formData.get("phone") || ""),
          message: String(formData.get("message") || ""),
          website: String(formData.get("website") || "")
        })
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || "Message could not be sent.");
      }

      if (status) {
        status.textContent = "Thanks. Your message was sent to Benjamin.";
      }

      contactForm.reset();
    } catch (error) {
      if (status) {
        status.textContent = "Opening your email app so the message still reaches Benjamin.";
      }
      window.location.href = contactMailto(formData);
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  });
}
