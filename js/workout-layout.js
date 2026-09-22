/* Shared prescription formatting and accessible touch/mouse reordering. */
(function (root) {
  function prescription(value) {
    const text = String(value || "").trim();
    const sets = text.match(/\b(\d+)\s*(?:sets?|rounds?)\b/i);
    const product = text.match(/^(\d+)\s*[x×]\s*(.+)$/i);
    let target = product?.[2] || "";
    if (sets) {
      const before = text.slice(0, sets.index).trim().replace(/\s*[x×]\s*$/i, "").trim();
      const after = text.slice(sets.index + sets[0].length).trim().replace(/^(?:[x×]\s*|of\s+)/i, "").trim();
      target = [before, after].filter(Boolean).join(" ");
    }
    const normalized = text.replace(/\s*(?:\/\s*side|per\s+side)\b/gi, "/side");
    const reps = normalized.match(/(\d[\d,\s–—−-]*(?:\/side)?)\s*reps?(\/side)?/i);
    const timed = normalized.match(/(\d+(?:\s*[-–—−]\s*\d+)?\s*(?:sec(?:onds?)?|min(?:utes?)?)(?:\/side)?)/i);
    return {
      sets: sets?.[1] || product?.[1] || "",
      reps: reps ? `${reps[1].trim()}${reps[2] && !reps[1].includes("/side") ? "/side" : ""}`
        : timed?.[1] || target.replace(/\s*(?:\/\s*side|per\s+side)\b/gi, "/side"),
      original: text
    };
  }
  function label(value) {
    const parsed = prescription(value);
    return parsed.sets && parsed.reps ? `${parsed.sets} × ${parsed.reps}` : parsed.original || "Not set";
  }
  function compose(sets, reps) {
    return `${reps}${/sec|min|rep/i.test(reps) ? "" : " reps"} x ${sets} sets`;
  }
  function order(workouts, layout) {
    if (!layout || layout.source !== JSON.stringify(workouts) || !Array.isArray(layout.order)) {
      return workouts.map((_, index) => index);
    }
    return layout.order.filter(index => Number.isInteger(index) && index >= 0 && index < workouts.length);
  }
  // Version 2 personalizes exercises only; legacy workout-level edits are ignored.
  function apply(workouts, layout) {
    const valid = layout?.version === 2 && layout.source === JSON.stringify(workouts);
    return workouts.map((workout, index) => ({
      ...workout,
      exercises: (valid && Array.isArray(layout.exercises?.[index])
        ? layout.exercises[index] : (workout.exercises || [])).map(exercise => ({ ...exercise }))
    }));
  }
  function bindReorder(container, rowSelector, handleSelector, onMove) {
    let drag = null;
    const track = () => {
      if (!drag) return;
      const edge = 70;
      if (drag.y < edge) window.scrollBy(0, -10);
      else if (drag.y > window.innerHeight - edge) window.scrollBy(0, 10);
      const hit = document.elementFromPoint(drag.x, drag.y)?.closest(rowSelector);
      if (hit && drag.rows.includes(hit)) drag.to = drag.rows.indexOf(hit);
      drag.rows.forEach((row, index) => row.classList.toggle("is-drop-target", index === drag.to));
      drag.frame = window.requestAnimationFrame(track);
    };
    container.addEventListener("pointerdown", event => {
      const handle = event.target.closest(handleSelector);
      if (!handle || event.button !== 0 || handle.disabled) return;
      const row = handle.closest(rowSelector);
      const rows = Array.from(row.parentElement.querySelectorAll(`:scope > ${rowSelector}`));
      drag = { handle, row, rows, from: rows.indexOf(row), to: rows.indexOf(row), id: event.pointerId, x: event.clientX, y: event.clientY };
      handle.setPointerCapture(event.pointerId);
      row.classList.add("is-reordering");
      drag.frame = window.requestAnimationFrame(track);
      event.preventDefault();
    });
    container.addEventListener("pointermove", event => {
      if (!drag || event.pointerId !== drag.id) return;
      drag.x = event.clientX;
      drag.y = event.clientY;
      const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest(rowSelector);
      if (hit && drag.rows.includes(hit)) drag.to = drag.rows.indexOf(hit);
      drag.rows.forEach((row, index) => row.classList.toggle("is-drop-target", index === drag.to));
      event.preventDefault();
    });
    const finish = event => {
      if (!drag || event.pointerId !== drag.id) return;
      const current = drag;
      window.cancelAnimationFrame(current.frame);
      drag = null;
      current.rows.forEach(row => row.classList.remove("is-drop-target", "is-reordering"));
      if (event.type === "pointerup" && current.from !== current.to) onMove(current.from, current.to, current.row);
    };
    container.addEventListener("pointerup", finish);
    container.addEventListener("pointercancel", finish);
    container.addEventListener("lostpointercapture", finish);
    container.addEventListener("keydown", event => {
      const handle = event.target.closest(handleSelector);
      if (!handle || handle.disabled || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
      const row = handle.closest(rowSelector);
      const rows = Array.from(row.parentElement.querySelectorAll(`:scope > ${rowSelector}`));
      const from = rows.indexOf(row);
      const to = from + (event.key === "ArrowUp" ? -1 : 1);
      event.preventDefault();
      if (to >= 0 && to < rows.length) onMove(from, to, row);
    });
  }
  const api = { prescription, label, compose, order, apply, bindReorder };
  if (typeof module !== "undefined") module.exports = api;
  root.WorkoutLayout = api;
})(typeof window !== "undefined" ? window : globalThis);
