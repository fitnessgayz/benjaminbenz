// Original workout templates for LIFTHARDR's Explore Routines.
(function exposeExplorePrograms(root) {
  "use strict";

  const sessions = {
    gym: {
      full: [
        ["Full Body A", ["Barbell Back Squat", "Barbell Bench Press", "Seated Cable Row", "Seated Leg Curl", "Pallof Press"]],
        ["Full Body B", ["Romanian Deadlift", "Barbell Overhead Press", "Lat Pulldown", "Reverse Lunge", "Standing Calf Raise"]],
        ["Full Body C", ["Leg Press", "Incline Dumbbell Press", "One-Arm Dumbbell Row", "Hip Thrust", "Dead Bug"]],
        ["Full Body D", ["Barbell Front Squat", "Dumbbell Bench Press", "Pull-Up", "Lying Leg Curl", "Farmer's Carry"]],
        ["Full Body E", ["Barbell Deadlift", "Seated Dumbbell Shoulder Press", "Seated Cable Row", "Leg Extension", "Cable Woodchop"]],
      ],
      upperLower: [
        ["Upper Body A", ["Barbell Bench Press", "Lat Pulldown", "Seated Cable Row", "Dumbbell Lateral Raise", "Cable Triceps Pushdown"]],
        ["Lower Body A", ["Barbell Back Squat", "Romanian Deadlift", "Leg Extension", "Seated Leg Curl", "Standing Calf Raise"]],
        ["Upper Body B", ["Barbell Overhead Press", "One-Arm Dumbbell Row", "Incline Dumbbell Press", "Face Pull", "Dumbbell Curl"]],
        ["Lower Body B", ["Leg Press", "Hip Thrust", "Reverse Lunge", "Lying Leg Curl", "Pallof Press"]],
        ["Upper Body C", ["Dumbbell Bench Press", "Pull-Up", "Barbell Row", "Pec Deck Chest Fly", "Hammer Curl"]],
        ["Lower Body C", ["Barbell Front Squat", "Barbell Deadlift", "Walking Lunge", "Seated Calf Raise", "Hanging Knee Raise"]],
      ],
      pushPullLegs: [
        ["Push A", ["Barbell Bench Press", "Seated Dumbbell Shoulder Press", "Incline Dumbbell Press", "Dumbbell Lateral Raise", "Cable Triceps Pushdown"]],
        ["Pull A", ["Lat Pulldown", "Seated Cable Row", "Face Pull", "Dumbbell Curl", "Hammer Curl"]],
        ["Legs A", ["Barbell Back Squat", "Romanian Deadlift", "Leg Extension", "Seated Leg Curl", "Standing Calf Raise"]],
        ["Push B", ["Barbell Overhead Press", "Dumbbell Bench Press", "Pec Deck Chest Fly", "Dumbbell Lateral Raise", "Overhead Dumbbell Triceps Extension"]],
        ["Pull B", ["Pull-Up", "Barbell Row", "One-Arm Dumbbell Row", "Dumbbell Reverse Fly", "Barbell Curl"]],
        ["Legs B", ["Leg Press", "Hip Thrust", "Reverse Lunge", "Lying Leg Curl", "Seated Calf Raise"]],
      ],
    },
    dumbbells: {
      full: [
        ["Full Body A", ["Goblet Squat", "Dumbbell Bench Press", "One-Arm Dumbbell Row", "Dumbbell Romanian Deadlift", "Dead Bug"]],
        ["Full Body B", ["Dumbbell Reverse Lunge", "Standing Dumbbell Shoulder Press", "One-Arm Dumbbell Row", "Floor Bridge", "Farmer's Carry"]],
        ["Full Body C", ["Dumbbell Front Squat", "Incline Dumbbell Press", "Dumbbell Romanian Deadlift", "Dumbbell Reverse Fly", "Side Plank"]],
        ["Full Body D", ["Goblet Squat", "Push-Up", "One-Arm Dumbbell Row", "Dumbbell Reverse Lunge", "Suitcase Carry"]],
      ],
      upperLower: [
        ["Upper Body A", ["Dumbbell Bench Press", "One-Arm Dumbbell Row", "Standing Dumbbell Shoulder Press", "Dumbbell Lateral Raise", "Hammer Curl"]],
        ["Lower Body A", ["Goblet Squat", "Dumbbell Romanian Deadlift", "Dumbbell Reverse Lunge", "Floor Bridge", "Single-Leg Calf Raise"]],
        ["Upper Body B", ["Incline Dumbbell Press", "One-Arm Dumbbell Row", "Dumbbell Chest Fly", "Dumbbell Reverse Fly", "Dumbbell Curl"]],
        ["Lower Body B", ["Dumbbell Front Squat", "Dumbbell Romanian Deadlift", "Walking Lunge", "Single-Leg Glute Bridge", "Side Plank"]],
        ["Upper Body C", ["Seated Dumbbell Shoulder Press", "Dumbbell Bench Press", "One-Arm Dumbbell Row", "Dumbbell Reverse Fly", "Overhead Dumbbell Triceps Extension"]],
        ["Lower Body C", ["Dumbbell Reverse Lunge", "Dumbbell Front Squat", "Floor Bridge", "Single-Leg Calf Raise", "Suitcase Carry"]],
      ],
      pushPullLegs: [
        ["Push A", ["Dumbbell Bench Press", "Standing Dumbbell Shoulder Press", "Push-Up", "Dumbbell Lateral Raise", "Overhead Dumbbell Triceps Extension"]],
        ["Pull A", ["One-Arm Dumbbell Row", "Dumbbell Reverse Fly", "Dumbbell Curl", "Hammer Curl", "Farmer's Carry"]],
        ["Legs A", ["Goblet Squat", "Dumbbell Romanian Deadlift", "Dumbbell Reverse Lunge", "Floor Bridge", "Single-Leg Calf Raise"]],
        ["Push B", ["Incline Dumbbell Press", "Seated Dumbbell Shoulder Press", "Dumbbell Chest Fly", "Dumbbell Lateral Raise", "Overhead Dumbbell Triceps Extension"]],
        ["Pull B", ["One-Arm Dumbbell Row", "Dumbbell Reverse Fly", "Hammer Curl", "Dumbbell Curl", "Suitcase Carry"]],
        ["Legs B", ["Dumbbell Front Squat", "Dumbbell Romanian Deadlift", "Walking Lunge", "Single-Leg Glute Bridge", "Single-Leg Calf Raise"]],
      ],
    },
    bodyweight: {
      full: [
        ["Full Body A", ["Prisoner Squat", "Push-Up", "Floor Prone Cobra", "Floor Bridge", "Dead Bug"]],
        ["Full Body B", ["Reverse Lunge", "Push-Up", "Bird Dog", "Single-Leg Glute Bridge", "Side Plank"]],
        ["Full Body C", ["Walking Lunge", "Pike Push-Up", "Floor Prone Cobra", "Single-Leg Calf Raise", "Reverse Crunch"]],
      ],
      pushPullLegs: [
        ["Push", ["Push-Up", "Pike Push-Up", "Bear Crawl", "Plank"]],
        ["Pull & Core", ["Floor Prone Cobra", "Bird Dog", "Side Plank", "Dead Bug"]],
        ["Legs", ["Prisoner Squat", "Reverse Lunge", "Single-Leg Glute Bridge", "Single-Leg Calf Raise"]],
      ],
    },
  };

  const liftingSessions = [
    ["5×5 A", ["Barbell Back Squat", "Barbell Bench Press", "Barbell Row"]],
    ["5×5 B", ["Barbell Front Squat", "Barbell Overhead Press", "Barbell Deadlift"]],
    ["5×5 C", ["Barbell Back Squat", "Incline Barbell Bench Press", "Barbell Row"]],
  ];

  const powerSessions = [
    ["Upper Power", ["Barbell Bench Press", "Barbell Row", "Barbell Overhead Press", "Lat Pulldown", "Cable Triceps Pushdown"]],
    ["Lower Power", ["Barbell Back Squat", "Barbell Deadlift", "Leg Press", "Seated Leg Curl", "Standing Calf Raise"]],
    ["Upper Muscle", ["Incline Dumbbell Press", "Seated Cable Row", "Lat Pulldown", "Dumbbell Lateral Raise", "Dumbbell Curl", "Cable Triceps Pushdown"]],
    ["Lower Muscle", ["Leg Press", "Romanian Deadlift", "Reverse Lunge", "Leg Extension", "Lying Leg Curl", "Seated Calf Raise"]],
    ["Push & Pull Muscle", ["Dumbbell Bench Press", "Pull-Up", "One-Arm Dumbbell Row", "Pec Deck Chest Fly", "Face Pull"]],
    ["Legs & Glutes Muscle", ["Barbell Front Squat", "Hip Thrust", "Walking Lunge", "Seated Leg Curl", "Standing Calf Raise"]],
  ];

  const equipmentLabels = {"gym": "Gym Equipment", "dumbbells": "Dumbbells", "bodyweight": "Equipment-Free", "barbell": "Barbell"};
  const equipmentDetails = {"gym": "Gym equipment", "dumbbells": "Dumbbells and a bench", "bodyweight": "Bodyweight movements", "barbell": "Barbell, rack, and bench"};
  const familyLabels = {"full": "Full-Body", "upperLower": "Upper/Lower", "pushPullLegs": "Push/Pull/Legs"};
  const familyIds = {"full": "full-body", "upperLower": "upper-lower", "pushPullLegs": "push-pull-legs"};
  const timedExercises = new Set(["Bear Crawl", "Farmer's Carry", "Plank", "Side Plank", "Suitcase Carry"]);
  const unilateralExercises = new Set(["Bird Dog", "Cable Woodchop", "Dead Bug", "Dumbbell Reverse Lunge", "One-Arm Dumbbell Row", "Pallof Press", "Reverse Lunge", "Single-Leg Calf Raise", "Single-Leg Glute Bridge", "Walking Lunge"]);

  function prescription(name, level, equipment, family, isPowerSession, exerciseIndex) {
    const isPrimary = exerciseIndex < (family === "power" ? 2 : 3);
    if (family === "five") {
      const sets = name === "Barbell Deadlift" ? 2 : 5;
      return { sets, prescription: `5 reps x ${sets} sets`, rest: "150s" };
    }
    if (timedExercises.has(name)) {
      const sets = level === "Beginner" ? 2 : 3;
      const seconds = { Beginner: "20-30", Intermediate: "25-40", Advanced: "30-45" }[level];
      return { sets, prescription: `${seconds} seconds x ${sets} sets`, rest: "45s", timed: true };
    }

    let sets, reps, rest;
    if (isPowerSession && isPrimary) {
      [sets, reps, rest] = [4, "3-5", "150s"];
    } else if (family === "power") {
      [sets, reps, rest] = isPrimary ? [3, "8-12", "90s"] : [3, "10-15", "60s"];
    } else if (equipment === "bodyweight") {
      sets = level === "Beginner" ? 2 : level === "Advanced" && isPrimary ? 4 : 3;
      [reps, rest] = ["Push-Up", "Pike Push-Up"].includes(name) ? ["6-10", "75s"] : ["8-15", "60s"];
    } else if (level === "Beginner") {
      [sets, reps, rest] = isPrimary ? [3, "8-10", "90s"] : [2, "10-12", "60s"];
    } else if (level === "Advanced") {
      [sets, reps, rest] = isPrimary ? [4, "6-10", "120s"] : [3, "10-15", "60s"];
    } else {
      [sets, reps, rest] = isPrimary ? [3, "8-12", "90s"] : [3, "10-15", "60s"];
    }
    const sideNote = unilateralExercises.has(name) ? " · each side" : "";
    return { sets, prescription: `${reps} reps x ${sets} sets${sideNote}`, rest };
  }

  function program(level, equipment, family, count, featured = false) {
    const isFive = family === "five";
    const isPower = family === "power";
    const equipmentLabel = equipmentLabels[equipment];
    const levelId = level.toLowerCase();
    const id = isFive ? `${levelId}-5x5` : isPower ? `power-hypertrophy-${count}-day`
      : `${levelId}-${familyIds[family]}-${equipment}`;
    const title = isFive ? `${level} 5×5` : isPower ? `${count}-Day Power + Hypertrophy`
      : `${level} ${familyLabels[family]} (${equipmentLabel})`;
    const goal = isFive || isPower ? "Build Strength" : equipment === "bodyweight" ? "General Fitness" : "Build Muscle";
    const detail = isPower ? "Heavy early sessions with higher-rep work later in the week" : equipmentDetails[equipment];
    const minutes = isFive ? 45 : isPower ? 55
      : { Beginner: 30, Intermediate: 40, Advanced: 50 }[level] - (equipment === "bodyweight" ? 10 : 0);
    const schedule = isFive ? liftingSessions : isPower ? powerSessions : sessions[equipment][family];
    const routines = schedule.slice(0, count).map(([sessionTitle, names], dayIndex) => ({
      id: `${id}-${dayIndex + 1}`, title: sessionTitle, format: "single", minutes, warmUpCount: 0,
      exercises: names.map((name, index) => ({
        name, ...prescription(name, level, equipment, family, isPower && dayIndex < 2, index)
      }))
    }));
    return { id, title, level, equipment: equipmentLabel, goal, detail, featured, routines };
  }

  const programs = [
    program("Beginner", "gym", "pushPullLegs", 3, true),
    program("Intermediate", "gym", "full", 3, true),
    program("Intermediate", "gym", "pushPullLegs", 3, true),
    program("Beginner", "bodyweight", "full", 3),
    program("Beginner", "dumbbells", "full", 3),
    program("Beginner", "dumbbells", "upperLower", 2),
    program("Beginner", "dumbbells", "pushPullLegs", 3),
    program("Beginner", "gym", "full", 3),
    program("Beginner", "gym", "upperLower", 2),
    program("Beginner", "barbell", "five", 2),
    program("Intermediate", "bodyweight", "full", 3),
    program("Intermediate", "bodyweight", "pushPullLegs", 3),
    program("Intermediate", "dumbbells", "full", 3),
    program("Intermediate", "dumbbells", "upperLower", 4),
    program("Intermediate", "dumbbells", "pushPullLegs", 3),
    program("Intermediate", "gym", "upperLower", 4),
    program("Intermediate", "gym", "power", 4),
    program("Intermediate", "barbell", "five", 3),
    program("Advanced", "bodyweight", "full", 3),
    program("Advanced", "dumbbells", "full", 4),
    program("Advanced", "dumbbells", "upperLower", 6),
    program("Advanced", "dumbbells", "pushPullLegs", 6),
    program("Advanced", "gym", "full", 5),
    program("Advanced", "gym", "pushPullLegs", 6),
    program("Advanced", "gym", "upperLower", 6),
    program("Advanced", "gym", "power", 6),
  ];

  const catalog = { programs };
  if (typeof module === "object" && module.exports) module.exports = catalog;
  else root.FWB_CLIENT_EXPLORE_PROGRAMS = catalog;
}(typeof globalThis !== "undefined" ? globalThis : this));
