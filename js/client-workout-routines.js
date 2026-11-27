/* Prewritten exercise prescriptions that can be opened in the client logger. */
(function exposeClientWorkoutRoutines(root) {
  "use strict";

  const strength = (name, sets, reps, extra = {}) =>
    ({ name, sets, prescription: `${reps} reps x ${sets} sets`, ...extra });
  const intermediate = [
    ["full-body", "Full Body Day", 50, [
      ["Hip Thrust Machine", 3, "8–12"], ["Linear Hack Squat", 3, "8–12"],
      ["One Dumbbell Bulgarian Split Squat", 3, "8–12"], ["Machine Chest Press", 3, "8–12"],
      ["Lat Pulldown", 3, "8–12"]
    ]],
    ["chest-triceps", "Chest & Triceps", 40, [
      ["Incline Dumbbell Press", 3, "8–12"], ["Machine Chest Press", 3, "8–12"],
      ["Decline Cable Fly", 2, "12–15"], ["Overhead Dumbbell Triceps Extension", 2, "10–15"],
      ["Cable Triceps Pushdown", 2, "10–15"]
    ]],
    ["back-biceps", "Back & Biceps", 45, [
      ["Lat Pulldown", 3, "8–12"], ["Chest-Supported Dumbbell Row", 3, "8–12"],
      ["T-Bar Row", 3, "8–12"], ["Preacher Curl", 2, "10–15"], ["Incline Dumbbell Curl", 2, "10–15"]
    ]],
    ["push-day", "Push Day", 45, [
      ["Dumbbell Bench Press", 3, "8–12"], ["Seated Dumbbell Shoulder Press", 3, "8–12"],
      ["Cable Lateral Raise", 3, "12–15"], ["Cable Chest Fly", 3, "12–15"],
      ["Rope Triceps Pressdown", 3, "10–15"]
    ]],
    ["pull-day", "Pull Day", 45, [
      ["Neutral-Grip Lat Pulldown", 3, "8–12"], ["Seated Cable Row", 3, "8–12"],
      ["Straight-Arm Cable Pulldown", 3, "10–15"], ["Cable Reverse Fly", 3, "12–15"],
      ["Face Pull", 2, "12–15"]
    ]],
    ["glutes", "Glute Focus", 40, [
      ["Hip Thrust Machine", 4, "8–12"], ["Hip Abduction Machine", 3, "12–15"],
      ["Cable Glute Kickback", 3, "12–15"], ["Back Extension (Glute Focus) Machine", 3, "10–15"]
    ]],
    ["lower-body", "Lower Body", 45, [
      ["Leg Extension", 3, "10–15"], ["Belt Squat", 3, "8–12"], ["Dumbbell Reverse Lunge", 3, "8–12"],
      ["Single Leg Dumbbell RDL", 3, "8–12"], ["Seated Leg Curl", 3, "10–15"]
    ]]
  ];
  const targeted = {
    title: "Targeted Routines",
    routines: [
      ["arms-day", "Arms Day", 35, [
        ["Barbell Curl", 3, "8–12"], ["Incline Dumbbell Curl", 3, "10–15"],
        ["Cable Triceps Pushdown", 3, "10–15"], ["Overhead Dumbbell Triceps Extension", 3, "10–15"]
      ]],
      ["shoulders-arms", "Shoulders & Arms", 45, [
        ["Seated Dumbbell Shoulder Press", 3, "8–12"], ["Cable Lateral Raise", 3, "12–15"],
        ["Cable Reverse Fly", 2, "12–15"], ["Preacher Curl", 3, "10–15"], ["Rope Triceps Pressdown", 3, "10–15"]
      ]],
      ["abs-core", "Abs & Core", 30, [
        ["Cable Crunch", 3, "10–15"], ["Cable Woodchop", 3, "10–15"],
        ["Lying Leg Raise", 3, "10–15"], ["Reverse Crunch", 2, "12–15"]
      ]],
      ["abs-butt", "Abs & Butt", 40, [
        ["Hip Thrust Machine", 3, "8–12"], ["Cable Glute Kickback", 3, "12–15"],
        ["Hip Abduction Machine", 3, "12–15"], ["Cable Crunch", 3, "10–15"], ["Hanging Leg Raise", 2, "10–15"]
      ]]
    ].map(([id, title, minutes, exercises]) => ({
      id, title, minutes, cover: id, format: "single", warmUpCount: 0,
      exercises: exercises.map(([name, sets, reps]) => strength(name, sets, reps))
    }))
  };
  const benjaminLevels = ["Intermediate", "Advanced"].map(level => {
    const advanced = level === "Advanced";
    return {
      title: level,
      routines: intermediate.map(([id, title, minutes, exercises]) => ({
        id: `benjamin-${id}${advanced ? "-advanced" : ""}`,
        title,
        level,
        cover: `benjamin-${id}`,
        format: "single",
        minutes: advanced ? minutes + 5 : minutes,
        warmUpCount: 0,
        exercises: exercises.map(([name, sets, reps], index) => strength(
          name,
          advanced && index < 2 ? Math.min(4, sets + 1) : sets,
          advanced && index === 0 && id !== "lower-body" ? "6–8" : reps
        ))
      }))
    };
  });
  const atHome = Object.freeze([
    ["foundations", "ce53c45b-8852-596c-8942-a9b8b7f73111", "Full Body Foundations", "Beginner", "Bodyweight", "full-body", 60, [
      ["Bodyweight Squat", 2, "8-12 reps"],
      ["Push-Up", 2, "5-8 reps"],
      ["Glute Bridge", 2, "10-12 reps"],
      ["Dead Bug", 2, "6-8 reps each side"],
    ]],
    ["lower-core", "cd4e1998-5d31-5f19-a1c7-59ce470010bd", "Lower Body & Core", "Intermediate", "Bodyweight", "abs-butt", 60, [
      ["Reverse Lunge", 3, "8-10 reps each side"],
      ["Single-Leg Glute Bridge", 3, "8-12 reps each side"],
      ["Bodyweight Squat", 3, "12-15 reps"],
      ["Dead Bug", 3, "8-10 reps each side"],
      ["Side Plank", 2, "20-30 sec/side"],
    ]],
    ["upper-strength", "b6f78ddd-d1d3-5a98-ae63-7050f61ce5ff", "Upper Body Strength", "Intermediate", "Dumbbells", "benjamin-push-day", 75, [
      ["Dumbbell Floor Press", 3, "8-12 reps"],
      ["One-Arm Dumbbell Row", 3, "8-12 reps each side"],
      ["Standing Dumbbell Shoulder Press", 3, "8-12 reps"],
      ["Dumbbell Reverse Fly", 2, "10-15 reps"],
      ["Hammer Curl", 2, "10-15 reps"],
    ]],
    ["full-strength", "88aef37c-78fd-5f5c-9800-2b862b514837", "Full Body Strength", "Advanced", "Dumbbells", "upper-lower", 90, [
      ["Goblet Squat", 4, "8-12 reps"],
      ["Dumbbell Romanian Deadlift", 4, "8-12 reps"],
      ["Dumbbell Floor Press", 4, "6-10 reps"],
      ["One-Arm Dumbbell Row", 4, "8-12 reps each side"],
      ["Dumbbell Reverse Lunge", 3, "8-10 reps each side"],
      ["Front Plank", 3, "30-45 sec"],
    ]],
  ].map(([slug, id, title, level, focus, cover, rest, movements]) => Object.freeze({
    slug, id, title, level, focus, collection: "at-home", cover,
    format: "single", warmUpCount: 0,
    exercises: Object.freeze(movements.map(([name, sets, target]) => Object.freeze({
      name, sets, prescription: `${target} x ${sets} sets`, rest: `${rest}s rest`, timed: / sec/.test(target)
    })))
  })));

  const legacyGroups = [
    {
      title: "Benjamin’s Routine",
      detail: "Three sessions from Benjamin’s starter program",
      routines: [
        {
          id: "benjamin-push", title: "Benjamin’s Push Workout", format: "single", minutes: 35,
          exercises: [
            strength("Dumbbell Bench Press", 4, "15", { rest: "60–90s" }),
            strength("Incline Dumbbell Press", 3, "10–12", { rest: "60–90s" }),
            strength("Overhead Shoulder Press", 3, "8–10", { rest: "60–90s" })
          ]
        },
        {
          id: "benjamin-superset", title: "Benjamin’s Superset Workout", format: "superset", minutes: 35,
          exercises: [
            strength("Dumbbell Row", 3, "12"),
            strength("Push-Up", 3, "12", { rest: "60–90s after pair" }),
            strength("Lateral Raise", 3, "12–20", { groupType: "single", rest: "45–60s" }),
            strength("Tricep Pushdown", 3, "12–15", { groupType: "single", rest: "45–60s" })
          ]
        },
        {
          id: "benjamin-circuit", title: "Benjamin’s Circuit", format: "circuit", minutes: 25,
          exercises: [
            strength("Goblet Squat", 3, "12"),
            strength("Dumbbell Romanian Deadlift", 3, "12"),
            { name: "Plank", sets: 3, prescription: "30–45 seconds x 3 rounds", timed: true, rest: "60–90s after round" }
          ]
        }
      ]
    },
    {
      title: "Full Body",
      detail: "Straight-set sessions for home or the gym",
      routines: [
        {
          id: "home-bodyweight", title: "At-Home Bodyweight", format: "single", minutes: 20,
          exercises: [strength("Bodyweight Squat", 3, "10–12"), strength("Push-Up", 3, "6–10"),
            strength("Glute Bridge", 3, "12–15")]
        },
        {
          id: "dumbbell-full-body", title: "Dumbbell Full Body", format: "single", minutes: 30,
          exercises: [strength("Goblet Squat", 3, "8–12"), strength("Dumbbell Bench Press", 3, "8–12"),
            strength("Dumbbell Row", 3, "8–12"), strength("Dumbbell Romanian Deadlift", 3, "8–12")]
        }
      ]
    }
  ];

  const filters = [["level", "Level"], ["goal", "Goal"], ["equipment", "Equipment"]];
  const categories = [
    ["benjamin", "Benjamin’s Routine", "Intermediate and advanced sessions", "benjamin-full-body"],
    ["training", "Training Programs", "Browse by level, goal, and equipment", "upper-lower"],
    ["sports", "Sports Training", "Warm-up, mobility, and strength by sport", "power-hypertrophy"],
    ["targeted", "Targeted Routines", "Focus on arms, shoulders, abs, or glutes", "abs-core"],
    ["at-home", "At-Home Routines", "Bodyweight and dumbbell workouts", "full-body"]
  ];
  const programCoverFamilies = ["full-body", "upper-lower", "push-pull-legs"];
  const initialPrograms = 3;
  const mountedCatalogs = new WeakSet();
  const mountedNavigation = new WeakSet();

  function catalog() {
    if (typeof module === "object" && module.exports) return require("./client-explore-programs.js");
    return root.FWB_CLIENT_EXPLORE_PROGRAMS || { programs: [], sportPrograms: [] };
  }

  function find(id) {
    const { programs, sportPrograms } = catalog();
    return [...benjaminLevels, ...programs, ...sportPrograms, targeted, { routines: atHome }, ...legacyGroups]
      .flatMap(group => group.routines).find(routine => routine.id === id);
  }

  function programCover(id = "") {
    if (id.endsWith("-5x5")) return "five-by-five";
    if (id.startsWith("power-hypertrophy-")) return "power-hypertrophy";
    return programCoverFamilies.find(family => id.includes(`-${family}-`));
  }

  function coverMarkup(slug, escape) {
    return slug ? `<img class="client-explore-cover" src="images/routines/${escape(slug)}.webp?v=2" width="96" height="64" alt="" loading="lazy" decoding="async">` : "";
  }

  function routineMarkup(routine, escape) {
    const metadata = [`${routine.exercises.length} exercises`, routine.detail ? `About ${routine.minutes} min` : ""].filter(Boolean);
    return `<details class="client-routine">
      <summary class="client-explore-routine-summary">
        ${coverMarkup(routine.cover, escape)}
        <span class="client-explore-program-title"><strong>${escape(routine.title)}</strong><small>${escape(metadata.join(" · "))}</small></span>
      </summary>
      ${routine.detail ? `<p>${escape(routine.detail)}</p>` : ""}
      <ol>${routine.exercises.map(exercise => `<li><span>${escape(exercise.name)}</span><small>${escape(exercise.prescription)}${routine.detail ? ` · Rest ${escape(exercise.rest)}` : ""}</small>
        ${routine.detail && exercise.instructions ? `<small>${escape(exercise.instructions.join(" "))}</small>` : ""}</li>`).join("")}</ol>
      <button type="button" class="button" data-client-explore-routine="${escape(routine.id)}">Open workout</button>
    </details>`;
  }

  function atHomeMarkup(routine, escape) {
    return `<details class="client-routine client-at-home-card" data-client-at-home-template="${escape(routine.id)}">
      <summary class="client-explore-routine-summary">
        ${coverMarkup(routine.cover, escape)}
        <span class="client-at-home-card-copy">
          <span class="client-at-home-card-title"><strong>${escape(routine.title)}</strong><span aria-hidden="true">→</span></span>
          <small>${escape(routine.level + " · " + routine.focus)}</small>
        </span>
      </summary>
      <ol>${routine.exercises.map((exercise,index) => `<li><button type="button" class="client-at-home-exercise-guide" data-client-at-home-guide="${index}" aria-label="View ${escape(exercise.name)} guide">${escape(exercise.name)}</button><small>${escape(exercise.prescription + " · " + exercise.rest)}</small></li>`).join("")}</ol>
      <button type="button" class="button" data-client-explore-routine="${escape(routine.id)}">Open workout</button>
    </details>`;
  }

  function programMarkup(program, escape, index = 0, sport = false) {
    const metadata = filters.map(([key]) => program[key]).filter(Boolean);
    const workoutCount = `${program.routines.length} ${program.routines.length === 1 ? "workout" : "workouts"}`;
    const kind = sport ? ` data-client-sport-program="${escape(program.id)}"` : program.id
      ? ` data-client-explore-program="${escape(program.id)}"${filters.map(([key]) => ` data-${key}="${escape(program[key] || "")}"`).join("")}`
      : "";
    return `<details class="client-explore-program"${kind}${!sport && index >= initialPrograms ? " hidden" : ""}>
      <summary>
        ${coverMarkup(programCover(program.id), escape)}
        <span class="client-explore-program-title"><strong>${escape(program.title)}</strong><small>${escape([...metadata, workoutCount].join(" · "))}</small></span>
      </summary>
      <div class="client-explore-program-workouts">
        ${program.detail ? `<p>${escape(program.detail)}</p>` : ""}
        ${program.routines.map(routine => routineMarkup(routine, escape)).join("")}
      </div>
    </details>`;
  }

  function trainingMarkup(available, escape) {
    if (!available.length) return "<p>Training programs are unavailable. Refresh to try again.</p>";
    return `<div class="client-routine-group" data-client-explore-catalog>
      <div class="client-explore-filters" role="group" aria-label="Filter training programs">
        ${filters.map(([key, label]) => `<label>${label}
          <select data-client-explore-filter="${key}">
            <option value="">All</option>
            ${[...new Set(available.map(program => program[key]).filter(Boolean))].map(option =>
              `<option value="${escape(option)}">${escape(option)}</option>`).join("")}
          </select>
        </label>`).join("")}
      </div>
      <p class="sr-only" data-client-explore-results role="status"></p>
      ${available.map((program, index) => programMarkup(program, escape, index)).join("")}
      <p data-client-explore-empty hidden>No programs match these filters.</p>
      <button type="button" class="button button-ghost" data-client-explore-reset hidden>Clear filters</button>
      ${available.length > initialPrograms ? `<button type="button" class="button button-ghost" data-client-explore-more aria-expanded="false">Show all ${available.length} programs</button>` : ""}
    </div>`;
  }

  function markup(escape) {
    const { programs, sportPrograms } = catalog();
    const content = [
      benjaminLevels.map(level => programMarkup(level, escape)).join(""),
      trainingMarkup(programs, escape),
      `<div class="client-sport-grid">${sportPrograms.map(program => programMarkup(program, escape, 0, true)).join("")}</div>`,
      targeted.routines.map(routine => routineMarkup(routine, escape)).join(""),
      `<div class="client-at-home-grid">${atHome.map(routine => atHomeMarkup(routine, escape)).join("")}</div>`
    ];
    return `<div data-client-explore-navigation>
      <nav class="client-explore-category-list" data-client-explore-landing aria-label="Explore Routines categories">
        ${categories.map(([id, title, description]) => `<button type="button" class="client-explore-category" data-client-explore-category="${id}" aria-controls="client-explore-${id}">
          <span><strong>${escape(title)}</strong><small>${escape(description)}</small></span>
        </button>`).join("")}
      </nav>
      ${categories.map(([id, title, , cover], index) => `<section id="client-explore-${id}" class="client-routine-group client-explore-category-panel" aria-label="${escape(title)}" data-client-explore-category-panel="${id}" hidden>
        <button type="button" class="button button-ghost client-explore-back" data-client-explore-back>Back to Explore Routines</button>
        <h4 tabindex="-1">${escape(title)}</h4>
        <div class="client-explore-category-art">${coverMarkup(cover, escape)}</div>
        ${content[index]}
      </section>`).join("")}
    </div>`;
  }

  function bindNavigation(container) {
    const navigation = container?.querySelector("[data-client-explore-navigation]");
    if (!navigation || mountedNavigation.has(navigation)) return;
    mountedNavigation.add(navigation);
    const landing = navigation.querySelector("[data-client-explore-landing]");
    const panels = Array.from(navigation.querySelectorAll("[data-client-explore-category-panel]"));
    let origin;

    function back(restoreFocus) {
      for (const panel of panels) panel.hidden = true;
      landing.hidden = false;
      container.scrollTop = 0;
      if (restoreFocus) origin?.focus();
      origin = null;
    }

    navigation.addEventListener("click", event => {
      if (event.target.closest("[data-client-explore-back]")) {
        back(true);
        return;
      }
      const choice = event.target.closest("[data-client-explore-category]");
      if (!choice) return;
      const panel = panels.find(item => item.dataset.clientExploreCategoryPanel === choice.dataset.clientExploreCategory);
      if (!panel) return;
      origin = choice;
      landing.hidden = true;
      for (const item of panels) item.hidden = item !== panel;
      container.scrollTop = 0;
      panel.querySelector("h4")?.focus();
    });
    container.addEventListener("close", () => back(false));
  }

  function bind(container) {
    bindNavigation(container);
    const catalog = container?.querySelector("[data-client-explore-catalog]");
    if (!catalog || mountedCatalogs.has(catalog)) return;
    mountedCatalogs.add(catalog);
    const fields = Array.from(catalog.querySelectorAll("[data-client-explore-filter]"));
    const cards = Array.from(catalog.querySelectorAll("[data-client-explore-program]"));
    const more = catalog.querySelector("[data-client-explore-more]");
    const reset = catalog.querySelector("[data-client-explore-reset]");
    const empty = catalog.querySelector("[data-client-explore-empty]");
    const status = catalog.querySelector("[data-client-explore-results]");
    let expanded = false;

    function update() {
      const active = fields.filter(field => field.value);
      const matching = cards.filter(card => active.every(field => card.dataset[field.dataset.clientExploreFilter] === field.value));
      const shown = expanded || active.length ? matching : matching.slice(0, initialPrograms);
      for (const card of cards) card.hidden = !shown.includes(card);
      empty.hidden = matching.length > 0;
      reset.hidden = !active.length;
      if (more) {
        more.hidden = Boolean(active.length);
        more.setAttribute("aria-expanded", String(expanded));
        more.textContent = expanded ? "Show fewer programs" : `Show all ${cards.length} programs`;
      }
      status.textContent = `Showing ${shown.length} of ${matching.length} ${matching.length === 1 ? "program" : "programs"}.`;
    }

    for (const field of fields) field.addEventListener("change", update);
    more?.addEventListener("click", () => {
      expanded = !expanded;
      update();
    });
    reset.addEventListener("click", () => {
      for (const field of fields) field.value = "";
      update();
      fields[0]?.focus();
    });
  }

  const api = { find, markup, bind };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FWB_CLIENT_WORKOUT_ROUTINES = api;
}(typeof globalThis !== "undefined" ? globalThis : this));
