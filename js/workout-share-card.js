/* Public share artwork uses reviewed summary values, never private screenshots. */
(() => {
  "use strict";
  const ink = "#171a17";
  const paper = "#f7f7f2";
  const lime = "#d6ff35";
  const line = "#4b5148";
  const fontFamily = 'Inter, "Arial", sans-serif';

  function number(value) {
    if (!["number", "string"].includes(typeof value) || String(value).trim() === "") return null;
    const result = Number(value);
    return Number.isFinite(result) && result >= 0 ? result : null;
  }

  function cleanText(value, fallback = "") {
    return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() || fallback;
  }

  function dateValue(value) {
    const text = String(value || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    const date = new Date(`${text}T12:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text ? date : null;
  }

  function dateLabel(value) {
    const date = dateValue(value);
    return date ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date) : "Date not recorded";
  }

  function weekLabel(value, now = new Date()) {
    const date = dateValue(value);
    if (!date || Number.isNaN(now.getTime())) return "That week";
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12));
    const monday = (item) => item.getTime() - ((item.getUTCDay() + 6) % 7) * 86400000;
    return monday(date) === monday(today) ? "This week" : "That week";
  }

  function durationLabel(seconds) {
    const value = number(seconds);
    if (value === null) return "—";
    const total = Math.round(value);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor(total % 3600 / 60);
    const remainder = String(total % 60).padStart(2, "0");
    return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${remainder}` : `${minutes}:${remainder}`;
  }

  function metrics(summary = {}, now = new Date()) {
    const apple = summary.appleWorkout || {};
    const appleTime = number(apple.duration_seconds);
    const appTime = number(summary.durationSeconds);
    const fallbackLabel = /^\d+(?::\d{2}){1,2}$/.test(String(summary.durationLabel || "")) ? summary.durationLabel : "—";
    const format = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
    const appleMetrics = [
      ["Active calories", apple.active_calories, "kcal"],
      ["Total calories", apple.total_calories, "kcal"],
      ["Avg heart rate", apple.average_heart_rate, "bpm"]
    ].filter(([, value]) => number(value) !== null)
      .map(([label, value, unit]) => ({ label, value: `${format.format(number(value))} ${unit}` }));
    return {
      durationLabel: appleTime !== null ? durationLabel(appleTime) : appTime ? durationLabel(appTime) : fallbackLabel,
      timeLabel: appleTime !== null ? "Apple workout time" : "Workout time",
      weekLabel: weekLabel(summary.entryDate, now),
      appleMetrics
    };
  }

  function content(summary = {}, now = new Date()) {
    const names = (Array.isArray(summary.exerciseNames) ? summary.exerciseNames : []).map((name) => cleanText(name)).filter(Boolean);
    const exerciseCount = Math.max(names.length, Math.floor(number(summary.exerciseCount) || 0));
    const weeklyCount = Math.floor(number(summary.weeklyWorkoutCount) || 0);
    const completed = summary.isComplete !== false;
    return {
      ...metrics(summary, now),
      title: cleanText(summary.title, "Workout"),
      date: dateLabel(summary.entryDate),
      status: completed ? "Workout complete" : "Workout saved",
      exerciseCount,
      exerciseLabel: `${exerciseCount} exercise${exerciseCount === 1 ? "" : "s"}`,
      weeklyLabel: `${weeklyCount} workout${weeklyCount === 1 ? "" : "s"}`,
      exerciseHeading: completed ? "Exercises completed" : "Exercises logged",
      exerciseNames: names.slice(0, 6),
      moreExercises: Math.max(0, exerciseCount - Math.min(names.length, 6)),
      praise: completed ? "Strong work. You showed up." : "Your session is saved."
    };
  }

  function text(summary = {}, now = new Date()) {
    const data = content(summary, now);
    const lines = [data.status, data.title, data.date, "", `${data.timeLabel}: ${data.durationLabel}`, data.exerciseLabel, `${data.weeklyLabel} ${data.weekLabel.toLowerCase()}`];
    if (data.appleMetrics.length) lines.push("", "Apple Workout", ...data.appleMetrics.map((metric) => `${metric.label}: ${metric.value}`));
    if (data.exerciseNames.length) lines.push("", `${data.exerciseHeading}:`, ...data.exerciseNames.map((name) => `• ${name}`));
    if (data.moreExercises) lines.push(`+ ${data.moreExercises} more exercise${data.moreExercises === 1 ? "" : "s"}`);
    lines.push("", data.praise, "#FitnessWithBenjamin");
    return lines.join("\n");
  }

  function setFont(context, size, weight = 800) { context.font = `${weight} ${size}px ${fontFamily}`; }

  function wrappedLines(context, text, width) {
    const words = cleanText(text).split(" ").filter(Boolean);
    const lines = [];
    let current = "";
    words.forEach((word) => {
      const joined = current ? `${current} ${word}` : word;
      if (context.measureText(joined).width <= width) { current = joined; return; }
      if (current) { lines.push(current); current = ""; }
      let chunk = "";
      for (const character of Array.from(word)) {
        if (chunk && context.measureText(chunk + character).width > width) { lines.push(chunk); chunk = ""; }
        chunk += character;
      }
      current = chunk;
    });
    if (current) lines.push(current);
    return lines;
  }

  function fitText(context, value, width, options = {}) {
    const { maxSize = 40, minSize = 24, maxLines = 1, maxHeight = Infinity, weight = 800 } = options;
    let size = maxSize;
    let lines;
    for (; size >= minSize; size -= 2) {
      setFont(context, size, weight);
      lines = wrappedLines(context, value, width);
      if (lines.length <= maxLines && lines.length * size * 1.12 <= maxHeight) break;
    }
    size = Math.max(minSize, size);
    setFont(context, size, weight);
    lines = wrappedLines(context, value, width);
    const allowedLines = Math.max(1, Math.min(maxLines, Math.floor(maxHeight / (size * 1.12)) || maxLines));
    const truncated = lines.length > allowedLines;
    lines = lines.slice(0, allowedLines);
    if (truncated && lines.length) {
      let last = lines[lines.length - 1];
      while (last && context.measureText(`${last}…`).width > width) last = Array.from(last).slice(0, -1).join("");
      lines[lines.length - 1] = `${last}…`;
    }
    return { lines, size, lineHeight: size * 1.12, height: lines.length * size * 1.12, weight, truncated };
  }

  function drawBlock(context, value, x, y, width, options = {}) {
    const block = fitText(context, value, width, options);
    setFont(context, block.size, block.weight);
    context.textAlign = "left";
    context.textBaseline = "top";
    block.lines.forEach((line, index) => context.fillText(line, x, y + index * block.lineHeight));
    return block;
  }

  function drawCard(context, summary = {}, now = new Date()) {
    const data = content(summary, now);
    const width = 1080;
    const height = 1350;
    const left = 64;
    const innerWidth = width - left * 2;
    context.fillStyle = ink;
    context.fillRect(0, 0, width, height);
    context.fillStyle = lime;
    context.fillRect(left, 58, 108, 108);
    context.fillStyle = "#080a08";
    setFont(context, 38, 900);
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("FWB", left + 54, 112);
    context.fillStyle = paper;
    setFont(context, 27, 700);
    context.textAlign = "right";
    context.textBaseline = "top";
    context.fillText(data.date, width - left, 75);
    context.fillStyle = lime;
    drawBlock(context, data.status.toUpperCase(), left, 196, innerWidth, { maxSize: 28, minSize: 28, weight: 900 });
    context.fillStyle = paper;
    const title = drawBlock(context, data.title, left, 242, innerWidth, { maxSize: 78, minSize: 44, maxLines: 3, maxHeight: 160, weight: 900 });
    let cursor = 242 + title.height + 30;

    const main = [[data.durationLabel, data.timeLabel], [String(data.exerciseCount), data.exerciseCount === 1 ? "Exercise" : "Exercises"], [data.weeklyLabel, data.weekLabel]];
    const gap = 14;
    const cellWidth = (innerWidth - gap * 2) / 3;
    main.forEach(([value, label], index) => {
      const x = left + index * (cellWidth + gap);
      context.strokeStyle = line;
      context.lineWidth = 2;
      context.strokeRect(x, cursor, cellWidth, 144);
      context.fillStyle = paper;
      drawBlock(context, value, x + 18, cursor + 22, cellWidth - 36, { maxSize: 39, minSize: 24, maxLines: 1, weight: 900 });
      context.fillStyle = lime;
      drawBlock(context, label.toUpperCase(), x + 18, cursor + 81, cellWidth - 36, { maxSize: 23, minSize: 21, maxLines: 2, maxHeight: 50, weight: 800 });
    });
    cursor += 144;

    if (data.appleMetrics.length) {
      context.fillStyle = lime;
      drawBlock(context, "APPLE WORKOUT", left, cursor + 28, innerWidth, { maxSize: 24, minSize: 24 });
      cursor += 70;
      const appleWidth = (innerWidth - gap * (data.appleMetrics.length - 1)) / data.appleMetrics.length;
      data.appleMetrics.forEach((metric, index) => {
        const x = left + index * (appleWidth + gap);
        context.fillStyle = "#242923";
        context.fillRect(x, cursor, appleWidth, 111);
        context.fillStyle = paper;
        drawBlock(context, metric.value, x + 18, cursor + 17, appleWidth - 36, { maxSize: 34, minSize: 22, weight: 900 });
        context.fillStyle = "#b8bfb2";
        drawBlock(context, metric.label.toUpperCase(), x + 18, cursor + 64, appleWidth - 36, { maxSize: 20, minSize: 18, maxLines: 2, maxHeight: 42 });
      });
      cursor += 111;
    }

    cursor += 36;
    context.fillStyle = lime;
    drawBlock(context, data.exerciseHeading.toUpperCase(), left, cursor, innerWidth, { maxSize: 25, minSize: 25 });
    cursor += 44;
    const exerciseWidth = (innerWidth - 36) / 2;
    const rows = Math.ceil(data.exerciseNames.length / 2);
    data.exerciseNames.forEach((name, index) => {
      const x = left + (index % 2) * (exerciseWidth + 36);
      const y = cursor + Math.floor(index / 2) * 83;
      context.fillStyle = line;
      context.fillRect(x, y, exerciseWidth, 1);
      context.fillStyle = paper;
      drawBlock(context, name, x, y + 12, exerciseWidth, { maxSize: 29, minSize: 24, maxLines: 2, maxHeight: 64, weight: 750 });
    });
    if (!data.exerciseNames.length) {
      context.fillStyle = paper;
      drawBlock(context, data.exerciseLabel, left, cursor, innerWidth, { maxSize: 29, minSize: 29 });
    }
    cursor += Math.max(1, rows) * 83;
    if (data.moreExercises) {
      context.fillStyle = "#b8bfb2";
      drawBlock(context, `+ ${data.moreExercises} more exercise${data.moreExercises === 1 ? "" : "s"}`, left, cursor + 2, innerWidth, { maxSize: 24, minSize: 22 });
      cursor += 31;
    }

    // The footer has its own reserved band, even for a three-line title and six long names.
    context.fillStyle = paper;
    drawBlock(context, data.praise, left, Math.max(1194, Math.min(cursor + 28, 1204)), innerWidth, { maxSize: 34, minSize: 28, maxLines: 1, weight: 800 });
    context.fillStyle = "#b8bfb2";
    drawBlock(context, "Fitness with Benjamin · benjaminbenz.com", left, 1294, innerWidth, { maxSize: 24, minSize: 24, maxLines: 1, weight: 700 });
    return { contentBottom: cursor, footerTop: 1194, title, width, height };
  }

  async function image(summary = {}) {
    if (typeof document === "undefined" || typeof File === "undefined") return null;
    try {
      let timer;
      if (document.fonts?.load) {
        await Promise.race([
          Promise.allSettled([document.fonts.load("900 48px Inter"), document.fonts.load("700 28px Inter")]),
          new Promise((resolve) => { timer = setTimeout(resolve, 1200); })
        ]).finally(() => clearTimeout(timer));
      }
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1350;
      const context = canvas.getContext("2d");
      if (!context) return null;
      drawCard(context, summary);
      return await new Promise((resolve) => {
        canvas.toBlob((blob) => {
          try { resolve(blob ? new File([blob], summary.isComplete === false ? "fwb-workout-saved.png" : "fwb-workout-complete.png", { type: "image/png" }) : null); }
          catch (_error) { resolve(null); }
        }, "image/png");
      });
    } catch (_error) { return null; }
  }

  const api = { image, text, metrics };
  if (typeof window !== "undefined") window.FWBWorkoutShareCard = api;
  if (typeof module !== "undefined" && module.exports) module.exports = { ...api, number, dateLabel, weekLabel, durationLabel, content, wrappedLines, fitText, drawCard };
})();
