const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const adminHtml = fs.readFileSync(path.join(root, "coach-admin.html"), "utf8");
const loggerHtml = fs.readFileSync(path.join(root, "coach-workout-log.html"), "utf8");
const loggerScript = fs.readFileSync(path.join(root, "js/coach-workout-log.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "css/style.css"), "utf8");

test("keeps Session logger as the first coach navigation link", () => {
  const navigationIndex = adminHtml.indexOf('id="coach-admin-sidebar-nav"');
  const clientsIndex = adminHtml.indexOf('data-admin-tab="clients"');
  const loggerIndex = adminHtml.indexOf('href="coach-workout-log.html"');
  const profileIndex = adminHtml.indexOf('data-admin-tab="profile"');

  assert.ok(navigationIndex >= 0);
  assert.ok(loggerIndex > navigationIndex);
  assert.ok(clientsIndex > loggerIndex);
  assert.ok(profileIndex > loggerIndex);
});

test("matches the custom workout card per-set controls and actions", () => {
  const exerciseMarkup = loggerScript.slice(
    loggerScript.indexOf("function coachWorkoutSetMarkup"),
    loggerScript.indexOf("function coachWorkoutExerciseElements")
  );
  const setIndex = exerciseMarkup.indexOf("data-coach-workout-set-row");
  const weightIndex = exerciseMarkup.indexOf("data-coach-workout-weight");
  const repsIndex = exerciseMarkup.indexOf("data-coach-workout-reps");
  const rirIndex = exerciseMarkup.indexOf("data-coach-workout-rir");

  assert.match(exerciseMarkup, /Input exercise name here/);
  assert.match(exerciseMarkup, /coach-workout-remove-exercise[\s\S]*?<svg/);
  assert.ok(setIndex >= 0 && weightIndex > setIndex && repsIndex > weightIndex && rirIndex > repsIndex);
  assert.match(exerciseMarkup, /data-coach-workout-add-set/);
  assert.match(exerciseMarkup, /data-coach-workout-delete-set/);
  assert.match(exerciseMarkup, /data-coach-workout-add-superset/);
  assert.match(exerciseMarkup, /data-coach-workout-notes-toggle/);
  assert.doesNotMatch(exerciseMarkup, /coach-workout-set-header/);
  assert.match(exerciseMarkup, /data-coach-workout-set-row[\s\S]*?<span>Set<\/span>[\s\S]*?<span>Weight<\/span>[\s\S]*?<span>Reps<\/span>[\s\S]*?<span>RIR<\/span>/);
  assert.match(styles, /\.coach-workout-set-row \{[\s\S]*?grid-template-columns:\s*54px repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.coach-workout-set-row label > span \{[\s\S]*?display:\s*block;[\s\S]*?text-align:\s*center/);
});

test("keeps straight sets full width and projects supersets and circuits into grouped cards", () => {
  assert.match(styles, /\.coach-workout-exercise-list \{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(styles, /\.coach-workout-exercise \{[\s\S]*?width:\s*100%;[\s\S]*?max-width:\s*100%;/);
  assert.match(loggerHtml, /id="coach-workout-grouped-view"[\s\S]*?hidden/);
  assert.match(loggerScript, /carousel\.dataset\.carouselEnabled = "false"/);
  assert.match(loggerScript, /exercise\.classList\.remove\("is-carousel-active"\)/);
  assert.match(loggerScript, /exercise\.setAttribute\("aria-roledescription", "exercise"\)/);
  assert.match(loggerScript, /scrollIntoView\?\.\(\{ behavior: "smooth", block: "nearest" \}\)/);
  assert.match(loggerScript, /function coachWorkoutUsesGroupedView[\s\S]*?format === "superset" \|\| format === "circuit"/);
  assert.match(loggerScript, /function coachWorkoutGroupedExerciseGroups[\s\S]*?Math\.floor\(index \/ 2\)[\s\S]*?format === "circuit"/);
  assert.match(loggerScript, /list\.hidden = grouped;[\s\S]*?view\.hidden = !grouped/);
  assert.match(styles, /\.coach-workout-grouped-card \{[\s\S]*?border-radius:\s*20px/);
  assert.doesNotMatch(loggerHtml, /coach-workout-carousel-status|coach-workout-carousel-controls|data-coach-workout-(?:previous|next)/);
  assert.doesNotMatch(loggerScript, /data-coach-workout-dot|coachWorkoutCarouselEnabled|scrollLeft/);
  assert.doesNotMatch(styles, /\.coach-workout-carousel\[data-carousel-enabled="true"\]/);
  assert.match(loggerScript, /\.forEach\(\(values\) => \{\s*addCoachWorkoutExercise\(values\);/s);
});

test("renders collapsible exercise keys, warm-up rows, and interleaved working rounds", () => {
  const groupedRowMarkup = loggerScript.slice(
    loggerScript.indexOf("function coachWorkoutGroupedSetRowMarkup"),
    loggerScript.indexOf("function coachWorkoutGroupedExerciseKeyMarkup")
  );

  assert.match(loggerScript, /data-coach-workout-marker>Exercise<\/span>/);
  assert.match(loggerScript, /marker\.textContent = coachWorkoutFormatMarker\(format, index\)/);
  assert.match(loggerScript, /data-coach-workout-grouped-key-toggle/);
  assert.match(loggerScript, /coachWorkoutCollapsedExerciseKeys/);
  assert.match(loggerScript, /<strong>Warm-up<\/strong><span>Excluded from working volume<\/span>/);
  assert.match(loggerScript, /<strong>Round \$\{roundIndex \+ 1\}<\/strong>/);
  assert.match(loggerScript, /workingByExercise\.map\(\(entry\) =>/);
  assert.match(loggerScript, /coachWorkoutGroupedMarker\(format, groupIndex, position\)/);
  assert.match(loggerScript, /data-coach-workout-grouped-add-round/);
  assert.match(loggerScript, /data-coach-workout-grouped-delete-round/);
  assert.doesNotMatch(groupedRowMarkup, /<small>\$\{escapeCoachWorkoutHtml\(name\)\}<\/small>/);
  assert.match(styles, /\.coach-workout-set-row \{[\s\S]*?border-left:\s*5px solid var\(--coach-grouped-blue\);[\s\S]*?background:\s*var\(--coach-grouped-paper\)/);
  assert.match(styles, /\.coach-workout-set-row\.is-warm-up \{[\s\S]*?border-left-color:\s*var\(--coach-grouped-gold\);[\s\S]*?background:\s*#fffcf1/);
  assert.match(styles, /\.coach-workout-grouped-set-row \{[\s\S]*?grid-template-columns:[^;]*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.coach-workout-grouped-set-row\.is-warm-up \{[\s\S]*?border-left-color:\s*var\(--coach-grouped-gold\)/);
  assert.match(styles, /\.coach-workout-grouped-set-row label > span \{[\s\S]*?text-align:\s*center/);
  assert.match(styles, /\.coach-workout-grouped-notes summary \{[\s\S]*?min-height:\s*44px/);
  assert.match(styles, /@media \(max-width: 520px\)[\s\S]*?\.coach-workout-set-row \{[\s\S]*?grid-template-columns:\s*44px repeat\(3, minmax\(0, 1fr\)\);[\s\S]*?gap:\s*4px/);
  assert.match(styles, /@media \(max-width: 520px\)[\s\S]*?\.coach-workout-grouped-exercise-key \{[\s\S]*?grid-template-columns:\s*44px minmax\(0, 1fr\) 44px/);
  assert.match(styles, /@media \(max-width: 520px\)[\s\S]*?\.coach-workout-grouped-set-row \{[\s\S]*?grid-template-columns:\s*48px repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(loggerHtml, /style\.css\?v=coach-session-grouped-layout-1/);
  assert.match(loggerHtml, /coach-workout-log\.js\?v=coach-session-grouped-layout-1/);
});

test("synchronizes grouped inputs with canonical exercise and set controls", () => {
  assert.match(loggerScript, /function coachWorkoutGroupedCanonicalControl/);
  assert.match(loggerScript, /data-coach-workout-grouped-field="name"/);
  assert.match(loggerScript, /coachWorkoutGroupedSetControlMarkup\(exerciseIndex, rowIndex, "weight", weight\)/);
  assert.match(loggerScript, /coachWorkoutGroupedSetControlMarkup\(exerciseIndex, rowIndex, "reps", reps\)/);
  assert.match(loggerScript, /coachWorkoutGroupedSetControlMarkup\(exerciseIndex, rowIndex, "rir", rir\)/);
  assert.match(loggerScript, /canonical\.value = control\.value;[\s\S]*?canonical\.dispatchEvent\(new Event\("input", \{ bubbles: true \}\)\)/);
  assert.match(loggerScript, /canonical\.dispatchEvent\(new Event\("change", \{ bubbles: true \}\)\)/);
  assert.match(loggerScript, /group\.forEach\(addCoachWorkoutSetToExercise\)/);
  assert.match(loggerScript, /group\.map\(deleteCoachWorkoutSetFromExercise\)\.some\(Boolean\)/);
  assert.match(loggerScript, /renderCoachWorkoutGroupedView\(\);\s*}\s*function moveCoachWorkoutCarousel/);
  assert.match(loggerScript, /renderCoachWorkoutGroupedView\(\);[\s\S]*?scheduleCoachWorkoutAutosave\(\)/);
  assert.match(loggerScript, /if \(!focusCoachWorkoutGroupedControl\(index, null, "name"\)\)/);
});

test("saves each set's weight reps and optional RIR", () => {
  assert.match(loggerScript, /data-coach-workout-set-label/);
  assert.match(loggerScript, /data-coach-workout-set-type=/);
  assert.match(loggerScript, /set_number:\s*set\.setNumber/);
  assert.match(loggerScript, /set_type:\s*set\.setType/);
  assert.match(loggerScript, /weight_used:\s*set\.weight/);
  assert.match(loggerScript, /reps:\s*set\.reps/);
  assert.match(loggerScript, /effort_scale:\s*set\.rir === null \? null : "rir"/);
  assert.match(loggerScript, /effort_value:\s*set\.rir/);
});

test("makes the warm-up set editable and accepts zero weight and reps", () => {
  assert.match(loggerScript, /placeholder="W" data-coach-workout-set-label/);
  assert.doesNotMatch(loggerScript, /data-coach-workout-set-label[^>]*readonly/);
  assert.match(loggerScript, /data-coach-workout-reps \/>/);
  assert.match(loggerScript, /reps < 0/);
  assert.doesNotMatch(loggerScript, /reps < 1/);
});

test("filters the exercise library into a scrollable name dropdown", () => {
  assert.match(loggerScript, /role="combobox"/);
  assert.match(loggerScript, /data-coach-workout-suggestions/);
  assert.match(loggerScript, /data-coach-workout-suggestion=/);
  assert.match(loggerScript, /\.filter\(\(item\) => item\.is_active !== false/);
  assert.match(loggerScript, /\.slice\(0, 16\)/);
  assert.match(styles, /\.coach-workout-suggestion-menu\s*\{[\s\S]*?max-height:\s*190px[\s\S]*?overflow-y:\s*auto/);
});
