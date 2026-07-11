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

function shuffleItems(items) {
  const shuffledItems = [...items];

  for (let index = shuffledItems.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffledItems[index], shuffledItems[randomIndex]] = [shuffledItems[randomIndex], shuffledItems[index]];
  }

  return shuffledItems;
}

const photoFocusPositions = {
  "images/home/benjamin-cable-rotation.jpg": {
    hero: "26% 24%",
    card: "26% 18%",
    figure: "28% 24%"
  },
  "images/home/benjamin-curl.jpg": {
    hero: "68% 8%",
    card: "68% 0%",
    figure: "62% 16%"
  },
  "images/home/benjamin-dip-station.jpg": {
    hero: "52% 14%",
    card: "52% 12%",
    figure: "54% 18%"
  },
  "images/home/benjamin-dumbbell-row.jpg": {
    hero: "36% 16%",
    card: "36% 8%",
    figure: "40% 18%"
  },
  "images/home/benjamin-floor-core.jpg": {
    hero: "34% 56%",
    card: "34% 54%",
    figure: "34% 58%"
  },
  "images/home/benjamin-incline-core.jpg": {
    hero: "60% 18%",
    card: "56% 18%",
    figure: "58% 20%"
  },
  "images/home/benjamin-mobility-floor.jpg": {
    hero: "30% 58%",
    card: "24% 58%",
    figure: "28% 62%"
  },
  "images/home/benjamin-kettlebell-reach.jpg": {
    hero: "50% 20%",
    card: "50% 18%",
    figure: "50% 22%"
  },
  "images/home/benjamin-bosu-core.jpg": {
    hero: "52% 44%",
    card: "52% 42%",
    figure: "54% 44%"
  },
  "images/home/benjamin-bike-conditioning.jpg": {
    hero: "48% 18%",
    card: "48% 16%",
    figure: "50% 20%"
  },
  "images/home/benjamin-stability-press.jpg": {
    hero: "40% 34%",
    card: "42% 32%",
    figure: "44% 36%"
  },
  "images/home/benjamin-gym-reset.jpg": {
    hero: "42% 20%",
    card: "40% 20%",
    figure: "42% 22%"
  },
  "images/home/benjamin-pullup-back.jpg": {
    hero: "46% 24%",
    card: "46% 22%",
    figure: "50% 24%"
  },
  "images/home/benjamin-band-activation.jpg": {
    hero: "48% 26%",
    card: "50% 24%",
    figure: "52% 26%"
  },
  "images/home/benjamin-climb-conditioning.jpg": {
    hero: "50% 22%",
    card: "50% 20%",
    figure: "52% 22%"
  },
  "images/home/benjamin-stairs-reset.jpg": {
    hero: "48% 18%",
    card: "48% 18%",
    figure: "50% 20%"
  },
  "images/home/benjamin-strength-rack.jpg": {
    hero: "62% 14%",
    card: "62% 16%",
    figure: "62% 18%"
  }
};

function applyPhotoFocus(image, source, context) {
  const nextPosition = photoFocusPositions[source]?.[context];

  if (nextPosition) {
    image.style.objectPosition = nextPosition;
    return;
  }

  image.style.removeProperty("object-position");
}

const heroImage = document.querySelector(".hero img");
const trainingCardImages = Array.from(document.querySelectorAll(".training-grid .tile-photo img"));
const trainingPhotoGrid = document.querySelector("[data-photo-grid]");

if (heroImage && trainingCardImages.length && trainingPhotoGrid) {
  const photoFigures = Array.from(trainingPhotoGrid.querySelectorAll("figure"));
  const storageKey = "training-photo-order";
  const previousOrder = window.localStorage.getItem(storageKey);
  const photoFigureImages = photoFigures
    .map((figure) => figure.querySelector("img"))
    .filter(Boolean);
  const trainingPhotoSlots = [...trainingCardImages, ...photoFigureImages];
  const combinedPhotoPool = [
    {
      src: "images/home/benjamin-curl.jpg",
      alt: "Benjamin training with a barbell in the gym"
    },
    {
      src: "images/home/benjamin-mobility-floor.jpg",
      alt: "Benjamin stretching and coaching in the gym"
    },
    {
      src: "images/home/benjamin-incline-core.jpg",
      alt: "Benjamin training on an incline bench in the gym"
    },
    {
      src: "images/home/benjamin-dumbbell-row.jpg",
      alt: "Benjamin performing a one-arm dumbbell row in the gym"
    },
    {
      src: "images/home/benjamin-strength-rack.jpg",
      alt: "Benjamin setting up a strength exercise at the rack"
    },
    {
      src: "images/home/benjamin-floor-core.jpg",
      alt: "Benjamin performing a controlled floor core exercise"
    },
    {
      src: "images/home/benjamin-cable-rotation.jpg",
      alt: "Benjamin training cable rotation in the gym"
    },
    {
      src: "images/home/benjamin-dip-station.jpg",
      alt: "Benjamin training on the dip station in the gym"
    },
    {
      src: "images/home/benjamin-kettlebell-reach.jpg",
      alt: "Benjamin pressing a dumbbell overhead with control in the gym"
    },
    {
      src: "images/home/benjamin-bosu-core.jpg",
      alt: "Benjamin using a BOSU ball for core stability work"
    },
    {
      src: "images/home/benjamin-bike-conditioning.jpg",
      alt: "Benjamin riding a stationary bike for conditioning"
    },
    {
      src: "images/home/benjamin-stability-press.jpg",
      alt: "Benjamin pressing dumbbells while balancing on a stability ball"
    },
    {
      src: "images/home/benjamin-gym-reset.jpg",
      alt: "Benjamin taking a reset moment on the gym floor"
    },
    {
      src: "images/home/benjamin-pullup-back.jpg",
      alt: "Benjamin performing a pull-up in the gym"
    },
    {
      src: "images/home/benjamin-band-activation.jpg",
      alt: "Benjamin using a resistance band for activation work"
    },
    {
      src: "images/home/benjamin-climb-conditioning.jpg",
      alt: "Benjamin climbing indoors for athletic conditioning"
    },
    {
      src: "images/home/benjamin-stairs-reset.jpg",
      alt: "Benjamin pausing on a staircase after training"
    }
  ];

  if (combinedPhotoPool.length >= trainingPhotoSlots.length) {
    let shuffledPhotos = shuffleItems(combinedPhotoPool);
    const nextOrder = shuffledPhotos.map((photo) => photo.src).join("|");

    if (nextOrder === previousOrder) {
      shuffledPhotos.push(shuffledPhotos.shift());
    }

    const finalOrder = shuffledPhotos.map((photo) => photo.src).join("|");
    window.localStorage.setItem(storageKey, finalOrder);

    trainingPhotoSlots.forEach((image, index) => {
      const nextPhoto = shuffledPhotos[index];

      if (!nextPhoto) {
        return;
      }

      image.setAttribute("src", nextPhoto.src);
      image.setAttribute("alt", nextPhoto.alt);
      applyPhotoFocus(image, nextPhoto.src, trainingCardImages.includes(image) ? "card" : "figure");
    });

    const heroPhoto = shuffledPhotos[trainingPhotoSlots.length];

    if (heroPhoto) {
      heroImage.setAttribute("src", heroPhoto.src);
      heroImage.setAttribute("alt", heroPhoto.alt);
      applyPhotoFocus(heroImage, heroPhoto.src, "hero");
    }
  }
}

const clientCarousels = Array.from(document.querySelectorAll("[data-client-carousel]"));

clientCarousels.forEach((carousel) => {
  const track = carousel.querySelector("[data-carousel-track]");
  const slides = Array.from(carousel.querySelectorAll(".client-slide"));
  const prevButton = carousel.querySelector("[data-carousel-prev]");
  const nextButton = carousel.querySelector("[data-carousel-next]");
  const dotsContainer = carousel.querySelector("[data-carousel-dots]");
  const viewport = carousel.querySelector(".client-carousel-viewport");

  if (!track || !viewport || slides.length === 0) {
    return;
  }

  if (dotsContainer) {
    dotsContainer.innerHTML = slides
      .map(
        (_, index) =>
          `<button class="client-carousel-dot${index === 0 ? " is-active" : ""}" type="button" aria-label="Show client photo ${
            index + 1
          }" aria-pressed="${index === 0 ? "true" : "false"}" data-carousel-dot="${index}"></button>`
      )
      .join("");
  }

  const dots = Array.from(carousel.querySelectorAll("[data-carousel-dot]"));
  let activeIndex = 0;

  const maxOffset = () => Math.max(0, track.scrollWidth - viewport.clientWidth);

  const updateCarousel = () => {
    const targetSlide = slides[activeIndex];
    const targetOffset = targetSlide ? Math.min(targetSlide.offsetLeft, maxOffset()) : 0;
    track.style.transform = `translateX(-${targetOffset}px)`;

    dots.forEach((dot, index) => {
      const isActive = index === activeIndex;
      dot.classList.toggle("is-active", isActive);
      dot.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  };

  prevButton?.addEventListener("click", () => {
    activeIndex = (activeIndex - 1 + slides.length) % slides.length;
    updateCarousel();
  });

  nextButton?.addEventListener("click", () => {
    activeIndex = (activeIndex + 1) % slides.length;
    updateCarousel();
  });

  dots.forEach((dot) => {
    dot.addEventListener("click", () => {
      const nextIndex = Number(dot.dataset.carouselDot);

      if (Number.isNaN(nextIndex)) {
        return;
      }

      activeIndex = nextIndex;
      updateCarousel();
    });
  });

  window.addEventListener("resize", updateCarousel);
  updateCarousel();
});

const photoStoryCarousels = Array.from(document.querySelectorAll("[data-story-carousel]"));

photoStoryCarousels.forEach((carousel) => {
  const track = carousel.querySelector("[data-story-track]");
  const slides = Array.from(carousel.querySelectorAll(".photo-story-slide"));
  const prevButton = carousel.querySelector("[data-story-prev]");
  const nextButton = carousel.querySelector("[data-story-next]");
  const dotsContainer = carousel.querySelector("[data-story-dots]");
  const viewport = carousel.querySelector(".photo-story-viewport");

  if (!track || !viewport || slides.length === 0) {
    return;
  }

  if (dotsContainer) {
    dotsContainer.innerHTML = slides
      .map(
        (_, index) =>
          `<button class="photo-story-dot${index === 0 ? " is-active" : ""}" type="button" aria-label="Show training photo ${
            index + 1
          }" aria-pressed="${index === 0 ? "true" : "false"}" data-story-dot="${index}"></button>`
      )
      .join("");
  }

  const dots = Array.from(carousel.querySelectorAll("[data-story-dot]"));
  let activeIndex = 0;

  const maxOffset = () => Math.max(0, track.scrollWidth - viewport.clientWidth);

  const updateCarousel = () => {
    const targetSlide = slides[activeIndex];
    const targetOffset = targetSlide ? Math.min(targetSlide.offsetLeft, maxOffset()) : 0;
    track.style.transform = `translateX(-${targetOffset}px)`;

    dots.forEach((dot, index) => {
      const isActive = index === activeIndex;
      dot.classList.toggle("is-active", isActive);
      dot.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  };

  prevButton?.addEventListener("click", () => {
    activeIndex = (activeIndex - 1 + slides.length) % slides.length;
    updateCarousel();
  });

  nextButton?.addEventListener("click", () => {
    activeIndex = (activeIndex + 1) % slides.length;
    updateCarousel();
  });

  dots.forEach((dot) => {
    dot.addEventListener("click", () => {
      const nextIndex = Number(dot.dataset.storyDot);

      if (Number.isNaN(nextIndex)) {
        return;
      }

      activeIndex = nextIndex;
      updateCarousel();
    });
  });

  window.addEventListener("resize", updateCarousel);
  updateCarousel();
});

const homeTabLinks = Array.from(document.querySelectorAll("[data-home-tab-link]"));
const homeTabPanels = Array.from(document.querySelectorAll("[data-home-tab-panel]"));
const homeTabStage = document.querySelector(".homepage-tab-stage");
const trainingSubtabLinks = Array.from(document.querySelectorAll("[data-training-subtab-link]"));
const trainingSubtabPanels = Array.from(document.querySelectorAll("[data-training-subtab-panel]"));

function activateTrainingSubtab(tabId) {
  if (!trainingSubtabPanels.length) {
    return;
  }

  const targetPanel = trainingSubtabPanels.find((panel) => panel.dataset.trainingSubtabPanel === tabId);

  if (!targetPanel) {
    return;
  }

  trainingSubtabPanels.forEach((panel) => {
    const isActive = panel === targetPanel;
    panel.hidden = !isActive;
    panel.classList.toggle("is-active", isActive);
  });

  trainingSubtabLinks.forEach((link) => {
    const isActive = link.dataset.trainingSubtabLink === tabId;
    link.classList.toggle("is-active", isActive);
    link.setAttribute("aria-selected", isActive ? "true" : "false");
  });
}

if (trainingSubtabLinks.length && trainingSubtabPanels.length) {
  activateTrainingSubtab("overview");

  trainingSubtabLinks.forEach((link) => {
    link.addEventListener("click", () => {
      const targetTab = link.dataset.trainingSubtabLink;

      if (!targetTab) {
        return;
      }

      activateTrainingSubtab(targetTab);
    });
  });
}

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
    : "training";

  activateHomeTab(validInitialTab, { updateHash: validInitialTab === initialTab });

  if (validInitialTab === initialTab && initialTab) {
    const initialPanel = homeTabPanels.find((panel) => panel.dataset.homeTabPanel === validInitialTab);

    if (initialPanel) {
      requestAnimationFrame(() => {
        initialPanel.scrollIntoView({ behavior: "auto", block: "start" });
      });
    }
  }

  homeTabLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      const targetTab = link.dataset.homeTabLink;
      const targetPanel = homeTabPanels.find((panel) => panel.dataset.homeTabPanel === targetTab);

      if (!targetTab || !targetPanel) {
        return;
      }

      event.preventDefault();
      activateHomeTab(targetTab, { scrollIntoView: true });
    });
  });

  window.addEventListener("hashchange", () => {
    const targetTab = window.location.hash.replace("#", "");

    if (!targetTab) {
      return;
    }
    activateHomeTab(targetTab, { updateHash: false, scrollIntoView: true });
  });
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
