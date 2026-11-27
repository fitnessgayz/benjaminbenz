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

  function sport(slug, title, goal, equipment, sessions) {
    const labels = ["Warm-up", "Mobility", "Strength"];
    const routines = sessions.map(([id, minutes, detail, movements], index) => ({
      id, title: `${title} ${labels[index]}`, minutes, detail,
      format: "single", warmUpCount: 0,
      exercises: movements.map(([name, target, sets, rest, perSide, cue]) => {
        const timed = typeof target === "number";
        const prescription = timed
          ? `${target} ${perSide ? "sec/side" : "seconds"} x ${sets} ${sets === 1 ? "set" : "sets"}`
          : perSide ? `${sets} x ${target} reps per side` : `${target} reps x ${sets} sets`;
        return { name, sets, prescription, rest: `${rest}s`, timed, instructions: [cue] };
      })
    }));
    return {
      id: `sport-${slug}`, title, level: "All levels", equipment, goal,
      detail: `Warm-up and mobility use bodyweight. Strength uses ${equipment.toLowerCase()}.`,
      routines
    };
  }

  const sportPrograms = [
    sport("pickleball", "Pickleball", "Quick court movement", "Dumbbells and a bench", [
      ["2b499084-0280-5363-b2f0-26c7f9fe6922", 8, "Short steps, lateral movement, and paddle prep", [
        ["Brisk March", 45, 2, 15, false, "Build the pace gradually with easy arm swings."],
        ["Arm Circles", 30, 2, 15, false, "Start with small circles. Reverse direction halfway through."],
        ["Lateral Shuffle", 30, 2, 15, false, "Use quick, short side steps and change direction without crossing your feet."],
        ["Reverse Lunge", "6", 2, 20, true, "Step back lightly and return to a balanced ready stance."],
        ["Pickleball Split Step", 25, 2, 15, false, "Make a small hop and land quietly, then take a short step left or right."],
      ]],
      ["0e7c7b0f-7eff-571c-ab95-2a5f0a1395ab", 9, "Ankles, hips, trunk rotation, and wrists", [
        ["Half-Kneeling Ankle Rock", "8", 2, 20, true, "Rock the front knee over your toes while keeping your heel down."],
        ["90/90 Hip Switch", "6", 2, 20, true, "Switch sides slowly and use your hands for support if needed."],
        ["Side-Lying Open Book", "6", 2, 20, true, "Keep your knees stacked while turning through your upper back."],
        ["Wrist Flexor Stretch", 20, 2, 15, true, "With your palm up, gently lower your fingers with your other hand."],
        ["Standing Calf Stretch", 25, 2, 15, true, "Keep the rear heel down and both feet pointing forward."],
      ]],
      ["03d26448-6743-5a67-8d4f-016a4572e057", 24, "Lateral leg strength, pulling, and grip", [
        ["Goblet Squat", "8–12", 3, 75, false, "Hold a dumbbell close to your chest and keep pressure through both feet."],
        ["Lateral Lunge", "6–8", 2, 60, true, "Sit your hips back over the stepping leg, then push through that foot to return."],
        ["One-Arm Dumbbell Row", "8–12", 3, 60, true, "Use a bench for support and pull your elbow toward your back pocket."],
        ["Single-Leg Calf Raise", "12–15", 2, 45, true, "Use a wall for balance. Rise smoothly and lower slowly."],
        ["Suitcase Carry", 30, 2, 45, true, "Carry one dumbbell at your side and walk without leaning toward it."],
      ]],
    ]),
    sport("tennis", "Tennis", "Footwork and rotation", "Dumbbells, a bench, and a cable station", [
      ["d9f4745b-c5af-5f86-8eb5-4ee3b31ba829", 9, "Court movement and racket-swing prep", [
        ["Easy Jog", 60, 2, 15, false, "Jog easily at first and gradually build pace."],
        ["Arm Circles", 30, 1, 15, false, "Keep the elbows soft and gradually increase the circle size."],
        ["Lateral Shuffle", 35, 2, 15, false, "Alternate directions and return to a balanced stance after each short burst."],
        ["Walking Lunge With Rotation", "6", 2, 20, true, "Move forward with a controlled stride and gently turn toward your front leg."],
        ["Tennis Shadow Swings", 35, 2, 15, false, "Rehearse relaxed forehands and backhands before adding light service motions."],
      ]],
      ["40f5c2d9-7550-51a1-b9e1-82f4240feb68", 10, "Hip, upper-back, and overhead range", [
        ["World's Greatest Stretch", "4", 2, 15, true, "Rotate slowly from a long lunge while keeping your front foot planted."],
        ["Side-Lying Open Book", "6", 2, 15, true, "Follow your top hand with your eyes as your chest opens."],
        ["Wall Slide", "8", 2, 20, false, "Slide your arms up the wall without arching your lower back."],
        ["Doorway Pec Stretch", 25, 2, 15, true, "Step gently forward with your forearm supported on the doorway."],
        ["Supine Hamstring Stretch", 25, 2, 15, true, "Support the back of your thigh and straighten your knee into a comfortable stretch."],
      ]],
      ["70733f61-38d2-50b3-b6ee-bbb115c5e7af", 26, "Split-stance strength and controlled rotation", [
        ["Two Dumbbell Bulgarian Split Squat", "8–10", 3, 75, true, "Rest the rear foot on a stable low bench and hold a dumbbell in each hand."],
        ["One-Arm Dumbbell Row", "8–12", 3, 60, true, "Brace your free hand on your thigh or a stable surface and keep your torso steady."],
        ["Cable Woodchop", "8–10", 2, 60, true, "Move the handle diagonally across your body and control the return."],
        ["Dumbbell Reverse Fly", "10–12", 2, 45, false, "Hinge at your hips and lift light dumbbells out to the sides without shrugging."],
        ["Side Plank", 25, 2, 30, true, "Stack your shoulder over your elbow and keep your hips lifted. Bend the lower knee if needed."],
      ]],
    ]),
    sport("basketball", "Basketball", "Agility and landing", "Dumbbells and a low step", [
      ["f5adee43-e391-5e85-b21d-d286b74bc5c9", 8, "Defensive slides and landing prep", [
        ["Easy Jog", 45, 2, 15, false, "Start at an easy pace and finish each interval in a balanced stance."],
        ["High Knees", 25, 2, 15, false, "Start with a march, then raise the cadence while keeping your torso tall."],
        ["Lateral Shuffle", 30, 2, 15, false, "Take low defensive slides and keep your feet from crossing."],
        ["Bodyweight Squat", "8", 2, 20, false, "Sit between your hips and stand tall without bouncing."],
        ["Snap-Down Landing Drill", "5", 2, 30, false, "Rise onto your toes, then drop into a shallow squat and settle quietly without jumping."],
      ]],
      ["14625b12-5288-55df-b261-0c0246e1b05e", 9, "Ankle and hip movement for a lower stance", [
        ["Half-Kneeling Ankle Rock", "10", 2, 20, true, "Drive your knee forward without lifting the front heel."],
        ["90/90 Hip Switch", "6", 2, 20, true, "Rotate at the hips with a tall torso and keep the motion smooth."],
        ["Adductor Rock-Back", "8", 2, 15, true, "Kneel with one leg extended sideways and sit your hips back until you feel your inner thigh."],
        ["Half-Kneeling Hip Flexor Stretch", 25, 2, 15, true, "Tuck your pelvis gently and shift forward without arching your back."],
        ["Standing Calf Stretch", 25, 2, 15, true, "Keep the rear heel grounded and relax into the stretch."],
      ]],
      ["3f558434-f85c-592f-b67c-7f467abd296d", 25, "Single-leg control and lower-body strength", [
        ["Goblet Squat", "8–10", 3, 75, false, "Keep your knees tracking over your toes as you descend and stand."],
        ["Dumbbell Step Up", "6–8", 3, 75, true, "Use a low stable step and hold dumbbells at your sides. Drive through the foot on the step."],
        ["Dumbbell Romanian Deadlift", "8–10", 3, 75, false, "Push your hips back with soft knees and keep the dumbbells close to your legs."],
        ["Single-Leg Calf Raise", "12–15", 2, 45, true, "Pause briefly at the top and lower your heel slowly."],
        ["Dead Bug", "6–8", 2, 30, true, "Lower opposite limbs without lifting your lower back from the floor."],
      ]],
    ]),
    sport("volleyball", "Volleyball", "Jump and overhead prep", "Dumbbells and a cable station", [
      ["7a3b99eb-9506-5722-860c-f1f479379acd", 8, "Block footwork, approach steps, and shoulder prep", [
        ["Jumping Jack", 35, 2, 15, false, "Start with step jacks and progress to light jumps if comfortable."],
        ["Arm Circles", 30, 2, 15, false, "Start small, then build to larger circles. Switch directions halfway."],
        ["Lateral Shuffle", 35, 2, 15, false, "Shuffle along an imaginary net and square your shoulders before changing directions."],
        ["Wall Slide", "8", 2, 15, false, "Reach smoothly overhead with your ribs down and shoulders relaxed."],
        ["Volleyball Approach Footwork", 30, 2, 25, false, "Rehearse your usual approach with an easy arm swing before adding speed."],
      ]],
      ["2857a1b2-f7b9-5522-aef7-d07d83eaf8f5", 10, "Overhead reach, upper back, hips, and ankles", [
        ["Wall Slide", "8", 2, 20, false, "Raise your arms only as far as you can keep your ribs down."],
        ["Side-Lying Open Book", "6", 2, 20, true, "Keep both knees together while rotating your chest."],
        ["Child's Pose Lat Stretch", 30, 2, 15, false, "Reach both hands forward and breathe slowly into your back."],
        ["Half-Kneeling Ankle Rock", "8", 2, 20, true, "Rock over the front toes without losing heel contact."],
        ["Half-Kneeling Hip Flexor Stretch", 25, 2, 15, true, "Gently tuck your pelvis and move into a comfortable stretch."],
      ]],
      ["7146dc5a-a741-51a7-83cb-8dfcae74ca59", 26, "Jump support, calves, and controlled overhead work", [
        ["Goblet Squat", "8–10", 3, 75, false, "Squat smoothly, keeping your knees and feet tracking in the same direction."],
        ["Dumbbell Reverse Lunge", "8–10", 3, 75, true, "Hold dumbbells at your sides, step back and return under control."],
        ["Standing Dumbbell Shoulder Press", "8–10", 2, 60, false, "Use a comfortable grip and press without leaning back."],
        ["Face Pull", "10–15", 2, 45, false, "Pull the cable rope toward your face with control, keeping your shoulders relaxed."],
        ["Single-Leg Calf Raise", "12–15", 2, 45, true, "Push through your forefoot and lower slowly."],
      ]],
    ]),
    sport("swimming", "Swimming", "Dryland stroke prep", "Dumbbells, a bench, and a cable station", [
      ["0dd7417e-f50b-58fc-b1e0-2f00277d1ea1", 8, "Dryland shoulder and core prep before swimming", [
        ["Brisk March", 45, 2, 15, false, "March on the spot with relaxed arm swings. Build the pace over each interval."],
        ["Arm Circles", 30, 2, 15, false, "Start small and let the circles grow gradually. Change direction halfway through."],
        ["Wall Slide", "8", 2, 15, false, "Slide your forearms up the wall while keeping your ribs over your hips."],
        ["Scapular Push-Up", "8", 2, 15, false, "Start from a plank or on your knees. Keep your elbows straight as your chest lowers slightly, then press the floor away."],
        ["Plank Shoulder Tap", "6", 2, 20, true, "Set your feet wide and keep your hips facing the floor as you tap the opposite shoulder."],
      ]],
      ["54f01011-8004-5330-9974-82faa18b7332", 10, "Dryland mobility for overhead reach, rotation, and kicking", [
        ["Side-Lying Open Book", "6", 2, 15, true, "Keep your knees together and let the top arm open as your upper back rotates."],
        ["Child's Pose Lat Stretch", 30, 2, 15, false, "Sit your hips back, walk both hands forward, and breathe into your upper back."],
        ["Doorway Pec Stretch", 25, 2, 15, true, "Rest one forearm against a doorway and step forward until you feel a gentle stretch across your chest."],
        ["Adductor Rock-Back", "6", 2, 15, true, "Extend one leg to the side and rock your hips back with your hands on the floor."],
        ["Ankle CARs", "6", 2, 15, true, "Support your thigh and draw slow circles with your ankle. Switch direction after three circles."],
      ]],
      ["54be07ce-91d9-5932-a184-62c4e8b6065b", 25, "Dryland pulling strength, push-off, and trunk control", [
        ["One-Arm Dumbbell Row", "8–12", 3, 60, true, "Brace your free hand on a bench and pull your elbow toward your hip without rotating your torso."],
        ["Straight-Arm Lat Pulldown", "10–12", 3, 60, false, "Start with the cable handle above shoulder height and sweep it toward your thighs with soft elbows."],
        ["Goblet Squat", "8–12", 3, 75, false, "Hold one dumbbell at your chest and stand by pushing evenly through both feet."],
        ["Dumbbell Reverse Fly", "10–12", 2, 45, false, "Hinge at your hips and use light dumbbells. Stop lifting when your upper arms line up with your torso."],
        ["Dead Bug", "6–8", 2, 30, true, "Exhale as opposite limbs reach away. Shorten the reach if your back starts to arch."],
      ]],
    ]),
    sport("running", "Running", "Stride prep and single-leg strength", "Dumbbells and a low step", [
      ["3d462f99-a6a3-529c-8296-d1e9895c15cd", 8, "Easy jogging and dynamic drills before a run", [
        ["Easy Jog", 60, 2, 15, false, "Start at a pace that lets you talk comfortably. Use short, relaxed strides."],
        ["Front-to-Back Leg Swings", "8", 2, 15, true, "Use a wall for balance and gently swing one leg forward and back while keeping your trunk tall."],
        ["Lateral Leg Swings", "8", 2, 15, true, "Face a support and swing one leg side to side through a comfortable range while keeping your hips square."],
        ["Walking Lunge", "6", 2, 20, true, "Take short forward steps and rise smoothly into the next stride."],
        ["High Knees", 25, 2, 15, false, "Start with a quick march, then pick up your cadence while keeping your foot strikes light."],
      ]],
      ["1c4750ab-e5f9-53a4-8810-9cbf981531f0", 10, "Ankle, calf, and hip mobility", [
        ["Half-Kneeling Ankle Rock", "8", 2, 20, true, "Guide your front knee toward your middle toes while keeping your front heel down."],
        ["Half-Kneeling Hip Flexor Stretch", 25, 2, 15, true, "Gently tuck your pelvis, squeeze the rear glute, and shift forward a little."],
        ["90/90 Hip Switch", "6", 2, 15, true, "Slowly guide both knees to the opposite side. Put your hands behind you for support if needed."],
        ["Standing Calf Stretch", 25, 2, 15, true, "Lean toward a wall with your back heel down and both feet facing forward."],
        ["Supine Hamstring Stretch", 25, 2, 15, true, "Support one thigh with your hands and straighten that knee until the back of your leg stretches gently."],
      ]],
      ["f487c5d5-0bc8-533d-992f-46ffdafd6615", 25, "Single-leg strength, calves, and trunk stability", [
        ["Dumbbell Step Up", "8–10", 3, 60, true, "Place your whole foot on a low, stable step. Drive up through that foot and lower slowly."],
        ["Dumbbell Single-Leg Romanian Deadlift", "8–10", 3, 60, true, "Keep your stance knee soft as you hinge. Reach the free leg back while keeping your hips level."],
        ["Dumbbell Reverse Lunge", "8–10", 2, 60, true, "Step back with control and drive through your front foot to return to standing."],
        ["Single-Leg Calf Raise", "12–15", 2, 45, true, "Use a wall for balance. Raise your heel smoothly and take a little longer to lower."],
        ["Side Plank", 25, 2, 30, true, "Set your elbow beneath your shoulder and lift your hips. Bend your lower knee for support if needed."],
      ]],
    ]),
  ];

  const catalog = { programs, sportPrograms };
  if (typeof module === "object" && module.exports) module.exports = catalog;
  else root.FWB_CLIENT_EXPLORE_PROGRAMS = catalog;
}(typeof globalThis !== "undefined" ? globalThis : this));
