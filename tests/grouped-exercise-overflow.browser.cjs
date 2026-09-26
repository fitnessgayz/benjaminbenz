// Run: NODE_PATH=<runtime node_modules> node tests/grouped-exercise-overflow.browser.cjs
// Optional: PLAYWRIGHT_BROWSER=webkit; PLAYWRIGHT_CHANNEL=chrome (Chromium default).
// GROUPED_OVERFLOW_CSS can point to pre-fix CSS to reproduce the regression.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const playwright = require("playwright");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");
const dashboard = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");
const styles = [...dashboard.matchAll(/<link[^>]+href="\/?(css\/[^"?]+)[^>]*>/g)].map((match) => {
  const file = match[1] === "css/custom-workout-mobile-fix.css" && process.env.GROUPED_OVERFLOW_CSS
    ? process.env.GROUPED_OVERFLOW_CSS : path.join(root, match[1]);
  return fs.readFileSync(file, "utf8");
}).join("\n");

function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing production function ${name}`);
  const rest = source.slice(start);
  const end = rest.slice(1).search(/\n(?:async )?function /);
  assert.ok(end >= 0, `Missing end of production function ${name}`);
  return rest.slice(0, end + 1);
}

const context = vm.createContext({
  URL,
  window: { FWB_SUPABASE_CONFIG: { url: "https://project.supabase.co" } },
  WorkoutLayout: require("../js/workout-layout.js"),
  exerciseNameMatcher: null,
  exerciseLibraryEntries: [],
  customWorkoutGroupedLogElements: (carousel) => carousel.logs,
  exerciseNameInputForLog: (log) => log.input,
  escapeHtml: (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"),
});
vm.runInContext([
  "youtubeExerciseSearchUrl", "approvedExerciseForName", "uploadedExerciseDemoUrl",
  "exerciseVideoUrl", "exerciseVideoMarkup", "repTargetsFromPrescription",
  "assignedWorkoutPrescriptionLabel", "customWorkoutGroupedExerciseKeyMarkup",
].map(functionSource).join("\n"), context);

const exercises = [
  {
    name: "Shoulder Circles",
    prescription: "2 sets x 8-10 reps",
    instructions: "Stand or sit comfortably. Make slow, relaxed shoulder circles using a small range that feels easy. Change direction partway through.",
  },
  {
    name: "Supine Figure-Four Stretch",
    prescription: "2 sets x 20-30 sec/side",
    instructions: "Lie on your back with knees bent. Rest one ankle above the other knee, then gently bring the opposite thigh toward you if comfortable. Keep the crossed knee relaxed and repeat on both sides.",
  },
  {
    name: "Single-Leg Romanian Deadlift With Contralateral Dumbbell and Supported Balance",
    prescription: "3 sets x 8-12 reps/side",
    instructions: "Keep a soft bend in the standing knee and hinge slowly at the hips. Reach the free leg back while keeping your shoulders square. Use support if needed and repeat on both sides.",
  },
  {
    name: "SupercalifragilisticexpialidociousUnbrokenExerciseNameForNarrowScreens",
    prescription: "2 sets x 30-45 sec/side",
    instructions: "Maintain a comfortable range of motion. Breathe slowly, relax your shoulders, and stop when the stretch feels strong enough.",
  },
];

function markup(panel, demo, details) {
  const logs = exercises.map((exercise) => ({
    dataset: {
      exerciseName: exercise.name,
      generatedExercise: "true",
      generatedInstructions: details.instructions ? exercise.instructions : "",
      exercisePrescription: details.target ? exercise.prescription : "",
    },
    input: panel === "custom" ? { value: exercise.name } : null,
    closest: (selector) => selector === `.client-workout-panel-${panel}` ? {} : null,
    // A rejected stored URL intentionally exercises the production no-demo branch.
    querySelector: (selector) => selector === ".exercise-video-link" ? {
      getAttribute: () => demo ? "https://youtu.be/example" : "https://invalid.example/demo",
    } : null,
  }));
  const key = context.customWorkoutGroupedExerciseKeyMarkup({
    dataset: { exerciseStartIndex: "0" }, logs,
    closest: (selector) => selector === `.client-workout-panel-${panel}` ? {} : null,
  });
  return `<section class="client-workout-panel client-workout-panel-${panel}">
    <section class="custom-workout-carousel custom-workout-grouped-rounds" data-custom-workout-grouped="true" data-custom-workout-format="single">
      <article class="custom-workout-grouped-card">
        <header class="custom-workout-grouped-card-heading"><h3>Straight sets 1</h3><p class="custom-workout-grouped-progress">0 / 2 complete</p></header>
        <div class="custom-workout-grouped-exercise-key" role="list">${key}</div>
        <div class="custom-workout-grouped-round-stepper"><button aria-label="Remove set">−</button><output><span>Sets</span><strong>2</strong></output><button aria-label="Add set">+</button></div>
      </article>
    </section>
  </section>`;
}

async function measurements(page) {
  return page.evaluate(() => {
    const rect = (element) => {
      const { top, bottom, left, right, width, height } = element.getBoundingClientRect();
      return { top, bottom, left, right, width, height };
    };
    const heading = document.querySelector(".custom-workout-grouped-card-heading");
    const title = heading.querySelector("h3");
    const firstWord = document.createRange();
    firstWord.setStart(title.firstChild, 0);
    firstWord.setEnd(title.firstChild, title.textContent.indexOf(" "));
    return {
      viewport: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      heading: {
        bounds: rect(heading),
        firstWordLines: firstWord.getClientRects().length,
        children: [...heading.children].map((element) => ({
          ...rect(element), scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
        })),
      },
      items: [...document.querySelectorAll(".custom-workout-grouped-exercise-key-item")].map((item) => ({
        bounds: rect(item),
        title: rect(item.querySelector("[data-open-custom-exercise], [data-custom-grouped-exercise-name]")),
        demo: item.querySelector(".exercise-video-link") ? rect(item.querySelector(".exercise-video-link")) : null,
        details: [...item.querySelectorAll("p:not([hidden])")].map((element) => ({
          ...rect(element), text: element.textContent,
          scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
        })),
      })),
    };
  });
}

function checkLayout(result, label, expectedDetails) {
  const epsilon = 1;
  assert.ok(result.documentWidth <= result.viewport + epsilon, `${label}: page overflows horizontally`);
  const heading = result.heading;
  for (const child of heading.children) {
    assert.ok(child.left >= heading.bounds.left - epsilon && child.right <= heading.bounds.right + epsilon,
      `${label}: group heading text extends horizontally past its card`);
    assert.ok(child.top >= heading.bounds.top - epsilon && child.bottom <= heading.bounds.bottom + epsilon,
      `${label}: group heading text extends vertically past its card`);
    assert.ok(child.scrollWidth <= child.clientWidth + epsilon, `${label}: group heading text overflows`);
  }
  const [groupTitle, progress] = heading.children;
  assert.ok(groupTitle.right <= progress.left + epsilon || progress.right <= groupTitle.left + epsilon
    || groupTitle.bottom <= progress.top + epsilon || progress.bottom <= groupTitle.top + epsilon,
  `${label}: group title and completion count overlap`);
  assert.equal(heading.firstWordLines, 1, `${label}: completion count squeezes group title into broken word fragments`);
  assert.equal(result.items.length, exercises.length);
  result.items.forEach((item, index) => {
    const message = `${label}: ${exercises[index].name}`;
    assert.equal(item.details.length, expectedDetails, `${message}: visible details missing`);
    let previous = item.demo && item.demo.bottom > item.title.bottom ? item.demo : item.title;
    for (const detail of item.details) {
      assert.ok(detail.top >= previous.bottom - epsilon,
        `${message}: overlapping rows (${detail.top.toFixed(1)} < ${previous.bottom.toFixed(1)}): ${detail.text}`);
      assert.ok(detail.bottom <= item.bounds.bottom + epsilon, `${message}: detail extends below its card`);
      assert.ok(detail.left >= item.bounds.left - epsilon && detail.right <= item.bounds.right + epsilon,
        `${message}: detail extends past its card`);
      assert.ok(detail.scrollWidth <= detail.clientWidth + epsilon, `${message}: detail text overflows horizontally`);
      assert.ok(detail.height > 0, `${message}: detail is clipped`);
      previous = detail;
    }
    for (const element of [item.title, item.demo].filter(Boolean)) {
      assert.ok(element.left >= item.bounds.left - epsilon && element.right <= item.bounds.right + epsilon,
        `${message}: title or demo extends past card`);
    }
    if (item.demo) assert.ok(item.title.right <= item.demo.left + epsilon, `${message}: title overlaps demo`);
  });
}

(async () => {
  const engine = process.env.PLAYWRIGHT_BROWSER || "chromium";
  const browser = await playwright[engine].launch({
    headless: true,
    ...(engine === "chromium" ? { channel: process.env.PLAYWRIGHT_CHANNEL || "chrome" } : {}),
  });
  const screenshotDir = process.env.GROUPED_OVERFLOW_SCREENSHOT_DIR;
  if (screenshotDir) fs.mkdirSync(screenshotDir, { recursive: true });
  let scenarios = 0;
  try {
    const page = await browser.newPage();
    // No app scripts or requests: the fixture cannot read or mutate account data.
    await page.route("**/*", (route) => route.abort());
    await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
      <body class="dashboard-page client-dashboard-page"><main class="dashboard-shell"><div id="dashboard-content">
        <section class="client-workouts-panel" id="client-workouts-panel" data-client-dashboard-panel="workouts">
          <div class="client-workout-panels" id="fixture"></div>
        </section>
      </div></main></body></html>`);
    await page.addStyleTag({ content: styles });
    for (const width of [320, 375, 390, 430, 768]) {
      await page.setViewportSize({ width, height: 900 });
      for (const scale of [1, 2]) {
        await page.evaluate((scale) => { document.documentElement.style.fontSize = `${16 * scale}px`; }, scale);
        for (const panel of ["custom", "assigned"]) {
          for (const demo of [true, false]) {
            for (const details of [
              { target: true, instructions: true, pr: true },
              { target: true, instructions: true, pr: false },
              { target: true, instructions: false, pr: true },
              { target: false, instructions: true, pr: true },
              { target: false, instructions: false, pr: true },
            ]) {
              await page.locator("#fixture").evaluate((element, html) => { element.innerHTML = html; }, markup(panel, demo, details));
              if (details.pr) await page.locator("[data-custom-grouped-pr-preview]").evaluateAll((elements) => {
                elements.forEach((element) => { element.hidden = false; element.textContent = "Personal best: 25 lb × 12 reps · September 24, 2026"; });
              });
              const label = `${engine} ${width}px ${scale * 100}% ${panel} demo=${demo} ${JSON.stringify(details)}`;
              const result = await measurements(page);
              if (screenshotDir && width === 390 && demo && details.target && details.instructions && details.pr) {
                await page.screenshot({ path: path.join(screenshotDir, `${engine}-${panel}-${scale * 100}.png`), fullPage: true });
              }
              checkLayout(result, label, Number(details.target) + Number(details.instructions) + Number(details.pr));
              scenarios++;
            }
          }
        }
      }
    }
    console.log(`Grouped exercise overflow passed: ${scenarios} ${engine} scenarios / ${scenarios * exercises.length} exercise headers; 320–768px, 100%/200% text, custom/assigned, demo on/off, optional target/instructions/PR.`);
    if (screenshotDir) console.log(`Screenshots: ${screenshotDir}`);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
