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

const homeTabLinks = Array.from(document.querySelectorAll("[data-home-tab-link]"));
const homeTabPanels = Array.from(document.querySelectorAll("[data-home-tab-panel]"));
const homeTabStage = document.querySelector(".homepage-tab-stage");
const homeTabMedia = window.matchMedia("(max-width: 980px)");

function activateHomeTab(tabId, options = {}) {
  if (!homeTabPanels.length) {
    return;
  }

  const { updateHash = true, scrollIntoView = false } = options;
  const targetPanel = homeTabPanels.find((panel) => panel.dataset.homeTabPanel === tabId);

  if (!targetPanel) {
    return;
  }

  homeTabPanels.forEach((panel) => {
    const isActive = panel === targetPanel;
    panel.hidden = !isActive;
    panel.classList.toggle("is-active", isActive);
  });

  homeTabLinks.forEach((link) => {
    const isActive = link.dataset.homeTabLink === tabId;
    link.classList.toggle("is-active", isActive);
    link.setAttribute("aria-selected", isActive ? "true" : "false");
    link.setAttribute("aria-current", isActive ? "page" : "false");
  });

  if (updateHash && window.location.hash !== `#${tabId}`) {
    history.replaceState(null, "", `#${tabId}`);
  }

  if (scrollIntoView && homeTabStage) {
    homeTabStage.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function showAllHomePanels() {
  homeTabPanels.forEach((panel) => {
    panel.hidden = false;
    panel.classList.remove("is-active");
  });

  homeTabLinks.forEach((link) => {
    link.classList.remove("is-active");
    link.setAttribute("aria-selected", "false");
    link.removeAttribute("aria-current");
  });
}

if (homeTabLinks.length && homeTabPanels.length) {
  const initialTab = window.location.hash.replace("#", "");
  const validInitialTab = homeTabPanels.some((panel) => panel.dataset.homeTabPanel === initialTab)
    ? initialTab
    : "start";

  if (homeTabMedia.matches) {
    activateHomeTab(validInitialTab, { updateHash: validInitialTab === initialTab });
  } else {
    showAllHomePanels();
  }

  homeTabLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      const targetTab = link.dataset.homeTabLink;
      const targetPanel = homeTabPanels.find((panel) => panel.dataset.homeTabPanel === targetTab);

      if (!targetTab || !targetPanel) {
        return;
      }

      event.preventDefault();

      if (homeTabMedia.matches) {
        activateHomeTab(targetTab, { scrollIntoView: true });
        return;
      }

      targetPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  window.addEventListener("hashchange", () => {
    const targetTab = window.location.hash.replace("#", "");

    if (!targetTab) {
      return;
    }

    if (homeTabMedia.matches) {
      activateHomeTab(targetTab, { updateHash: false });
      return;
    }

    const targetPanel = homeTabPanels.find((panel) => panel.dataset.homeTabPanel === targetTab);

    if (targetPanel) {
      targetPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  const syncHomeTabMode = (event) => {
    if (event.matches) {
      activateHomeTab(window.location.hash.replace("#", "") || "start", { updateHash: false });
      return;
    }

    showAllHomePanels();
  };

  if (typeof homeTabMedia.addEventListener === "function") {
    homeTabMedia.addEventListener("change", syncHomeTabMode);
  } else if (typeof homeTabMedia.addListener === "function") {
    homeTabMedia.addListener(syncHomeTabMode);
  }
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

const contactForm = document.getElementById("contact-message-form");
const contactEmail = "fwb@benjaminbenz.com";

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
