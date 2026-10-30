(function (root) {
  "use strict";

  function render({ container, count, records = [], cardMarkup, emptyMessage = "No exercises yet.", emptyCount = "No exercises yet" } = {}) {
    if (!container || typeof cardMarkup !== "function") return;
    const items = Array.isArray(records) ? records : [];
    container.classList.add("client-personal-bests-list");
    if (!items.length) {
      const message = container.ownerDocument.createElement("p");
      message.className = "empty-state";
      message.textContent = emptyMessage;
      container.replaceChildren(message);
      if (count) count.textContent = emptyCount;
      return;
    }

    container.innerHTML = items.map(cardMarkup).join("");
    container.querySelectorAll(".progress-exercise-card img").forEach((image) => {
      image.loading = "lazy";
      image.decoding = "async";
    });
    if (count) count.textContent = `${items.length} exercise${items.length === 1 ? "" : "s"}`;
  }

  const api = Object.freeze({ render });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FWB_CLIENT_PERSONAL_BESTS_LIST = api;
})(typeof window === "undefined" ? globalThis : window);
