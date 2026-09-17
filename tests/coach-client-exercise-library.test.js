const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.resolve(__dirname, "..");
const adminHtml = fs.readFileSync(path.join(projectRoot, "coach-admin.html"), "utf8");
const adminSource = fs.readFileSync(path.join(projectRoot, "js/coach-admin.js"), "utf8");
const styleSource = fs.readFileSync(path.join(projectRoot, "css/style.css"), "utf8");
const migrationSource = fs.readFileSync(
  path.join(projectRoot, "supabase/migrations/20260914171000_manage_client_exercise_names.sql"),
  "utf8"
);

function sqlFunction(name, nextName = "") {
  const start = migrationSource.indexOf(`create or replace function public.${name}`);
  const end = nextName
    ? migrationSource.indexOf(`create or replace function public.${nextName}`, start + 1)
    : migrationSource.length;

  assert.ok(start >= 0, `${name} migration function should exist`);
  assert.ok(end > start, `${name} migration function should have a complete body`);
  return migrationSource.slice(start, end);
}

function javascriptFunction(name) {
  const declaration = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const match = declaration.exec(adminSource);

  assert.ok(match, `${name} should exist`);
  const start = match.index;
  const remainder = adminSource.slice(start + match[0].length);
  const nextDeclaration = remainder.search(/\n(?:async\s+)?function\s+[A-Za-z0-9_$]+\s*\(/);
  const end = nextDeclaration >= 0 ? start + match[0].length + nextDeclaration : adminSource.length;
  return adminSource.slice(start, end);
}

function cssMediaBlock(maxWidth) {
  const marker = `@media (max-width: ${maxWidth}px)`;
  const managerStyles = styleSource.indexOf(".client-exercise-name-manager {");
  const start = styleSource.indexOf(marker, managerStyles);

  assert.ok(start >= 0, `${marker} should exist`);
  const openingBrace = styleSource.indexOf("{", start);
  let depth = 0;

  for (let index = openingBrace; index < styleSource.length; index += 1) {
    if (styleSource[index] === "{") {
      depth += 1;
    } else if (styleSource[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return styleSource.slice(start, index + 1);
      }
    }
  }

  assert.fail(`${marker} should have a complete block`);
}

test("Exercise Library exposes an accessible selected-client custom-name manager", () => {
  const managerStart = adminHtml.indexOf('class="client-exercise-name-manager"');
  const managerEnd = adminHtml.indexOf('<div class="exercise-library-layout">', managerStart);
  const managerMarkup = adminHtml.slice(managerStart, managerEnd);

  assert.ok(managerStart >= 0);
  assert.match(managerMarkup, /aria-labelledby="client-exercise-name-manager-title"/);
  assert.match(managerMarkup, /id="client-exercise-name-manager-title">Client custom exercise names/);
  assert.match(managerMarkup, /<label>[\s\S]*?id="client-exercise-name-search"/);
  assert.match(managerMarkup, /id="client-exercise-name-count"[^>]*role="status"/);
  assert.match(managerMarkup, /id="client-exercise-name-list"[^>]*aria-live="polite"/);
  assert.match(managerMarkup, /id="client-exercise-name-status"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(managerMarkup, /<button[^>]*type="button"[^>]*id="correct-client-exercise-name"[^>]*disabled[^>]*>Fix spelling/);
  assert.match(managerMarkup, /<button[^>]*type="button"[^>]*id="delete-client-exercise-name"[^>]*disabled[^>]*>Delete saved sets permanently/);
});

test("selected client custom-workout history populates actionable exercise-name rows", () => {
  const loader = javascriptFunction("loadClientCustomExerciseNames");
  const renderer = javascriptFunction("renderClientCustomExerciseNames");
  const grouper = javascriptFunction("clientCustomExerciseNameGroups");
  const setAdminTab = javascriptFunction("setAdminTab");

  assert.match(loader, /\.from\("client_workout_logs"\)/);
  assert.match(loader, /\.select\([^)]*exercise_name[^)]*workout_title[^)]*\)|\.select\([^)]*workout_title[^)]*exercise_name[^)]*\)/);
  assert.match(loader, /normalizeEmail\(selectedProgram\(\)\?\.client_email\)/);
  assert.match(loader, /\.eq\("client_email",\s*normalizedEmail\)/);
  assert.doesNotMatch(loader, /\.ilike\("client_email"/);
  assert.match(loader, /\.ilike\("workout_title",\s*"Custom workout%"\)/);
  assert.match(loader, /\.range\(from,\s*from \+ pageSize - 1\)/);
  assert.match(loader, /clientExerciseNameLoadToken/);
  assert.match(loader, /normalizeEmail\(selectedProgram\(\)\?\.client_email\)\s*!==\s*normalizedEmail/);
  assert.match(grouper, /workoutTitle\.startsWith\("custom workout"\)/);
  assert.match(grouper, /exerciseCode === warmupExerciseCode/);
  assert.match(grouper, /exerciseCode === cardioExerciseCode/);
  assert.match(renderer, /<button[^>]*type="button"[^>]*data-client-exercise-name-key=/);
  assert.match(renderer, /aria-pressed=/);
  assert.match(setAdminTab, /nextTab === "library"[\s\S]*?loadClientCustomExerciseNames\(selectedProgram\(\)\?\.client_email\)/);
});

test("custom exercise grouping runs on exact normalized names and excludes non-custom activity", () => {
  const makeHelpers = new Function("exerciseLibraryRecords", "warmupExerciseCode", "cardioExerciseCode", `
    ${javascriptFunction("normalizeClientExerciseName")}
    ${javascriptFunction("clientExerciseLibraryMatch")}
    ${javascriptFunction("clientCustomExerciseNameGroups")}
    return { clientCustomExerciseNameGroups };
  `);
  const { clientCustomExerciseNameGroups } = makeHelpers(
    [{ name: "Cable Curl", aliases: ["Biceps curl"] }],
    "WARMUP",
    "CARDIO"
  );
  const groups = clientCustomExerciseNameGroups([
    {
      exercise_name: "  Cable   Curl ",
      exercise_code: "A1",
      workout_title: "Custom workout · Arms",
      workout_session_id: "session-1",
      entry_date: "2026-09-10"
    },
    {
      exercise_name: "CABLE CURL",
      exercise_code: "A1",
      workout_title: "Custom Workout",
      workout_session_id: "session-1",
      entry_date: "2026-09-10"
    },
    {
      exercise_name: " cable curl ",
      exercise_code: "A1",
      workout_title: "custom workout — arms",
      workout_session_id: "session-2",
      entry_date: "2026-09-12"
    },
    {
      exercise_name: "Cable Curl Plus",
      exercise_code: "A2",
      workout_title: "Custom workout",
      workout_session_id: "session-3",
      entry_date: "2026-09-11"
    },
    {
      exercise_name: "Cable Curl",
      exercise_code: "A1",
      workout_title: "Preset upper body",
      workout_session_id: "session-4",
      entry_date: "2026-09-13"
    },
    {
      exercise_name: "Warm-up typo",
      exercise_code: "WARMUP",
      workout_title: "Custom workout",
      workout_session_id: "session-5",
      entry_date: "2026-09-13"
    },
    {
      exercise_name: "Cardio typo",
      exercise_code: "CARDIO",
      workout_title: "Custom workout",
      workout_session_id: "session-6",
      entry_date: "2026-09-13"
    }
  ]);

  assert.equal(groups.length, 2);
  assert.equal(groups[0].key, "cable curl");
  assert.equal(groups[0].logs.length, 3);
  assert.equal(groups[0].workoutKeys.size, 2);
  assert.equal(groups[0].latestDate, "2026-09-12");
  assert.equal(groups[0].libraryMatch.matchType, "name");
  assert.equal(groups[1].key, "cable curl plus");
  assert.equal(groups[1].libraryMatch, null);
});

test("client exercise rows distinguish shared names, shared aliases, and client-only names", () => {
  const matcher = javascriptFunction("clientExerciseLibraryMatch");
  const libraryLoader = javascriptFunction("loadExerciseLibrary");

  assert.match(adminSource, /Shared library/);
  assert.match(adminSource, /Library alias for/);
  assert.match(adminSource, /Client-created/);
  assert.match(adminSource, /Archived library/);
  assert.match(adminSource, /Hidden library/);
  assert.match(matcher, /exerciseLibraryRecords/);
  assert.match(matcher, /normalizeClientExerciseName\(record\.name\)\s*===\s*key/);
  assert.match(matcher, /record\.aliases[\s\S]*?normalizeClientExerciseName\(alias\)\s*===\s*key/);
  assert.match(matcher, /availableToClients:[^\n]*is_active[^\n]*is_approved/);
  assert.match(libraryLoader, /renderClientCustomExerciseNames/);
  assert.match(libraryLoader, /renderClientExerciseNameCorrectionOptions/);
});

test("library matching differentiates exact names, aliases, and client-created names", () => {
  const makeMatcher = new Function("exerciseLibraryRecords", `
    ${javascriptFunction("normalizeClientExerciseName")}
    ${javascriptFunction("clientExerciseLibraryMatch")}
    return { normalizeClientExerciseName, clientExerciseLibraryMatch };
  `);
  const helpers = makeMatcher([
    { id: "alias-collision", name: "Standing Curl", aliases: ["Cable Curl"] },
    { id: "curl", name: "Cable Curl", aliases: ["Biceps curl", "Cable arm curl"] },
    { id: "press", name: "Dumbbell Bench Press", aliases: ["DB bench"] },
    { id: "hidden", name: "Hidden Raise", aliases: [], is_approved: false },
    { id: "archived", name: "Archived Row", aliases: ["Old row"], is_active: false }
  ]);

  assert.equal(helpers.normalizeClientExerciseName("  CABLE   Curl  "), "cable curl");
  const exactMatch = helpers.clientExerciseLibraryMatch("cable curl");

  assert.equal(exactMatch.record.id, "curl");
  assert.equal(exactMatch.matchType, "name");
  assert.equal(exactMatch.availableToClients, true);
  assert.equal(helpers.clientExerciseLibraryMatch(" biceps   CURL ").record.id, "curl");
  assert.equal(helpers.clientExerciseLibraryMatch(" biceps   CURL ").matchType, "alias");
  assert.equal(helpers.clientExerciseLibraryMatch("Hidden Raise").availableToClients, false);
  assert.equal(helpers.clientExerciseLibraryMatch("Old row").availableToClients, false);
  assert.equal(helpers.clientExerciseLibraryMatch("Cabel Curl"), null);
});

test("coach admin cache-busts both assets", () => {
  assert.match(adminHtml, /href="css\/style\.css\?v=fwb-calendar-sync-1"/);
  assert.match(adminHtml, /src="js\/coach-admin\.js\?v=fwb-calendar-sync-1"/);
});

test("spelling correction uses the protected RPC and keeps deletion separate", () => {
  const correctionHandler = javascriptFunction("correctSelectedClientExerciseName");
  const deleteHandler = javascriptFunction("deleteSelectedClientExerciseName");

  assert.match(
    correctionHandler,
    /\.rpc\("correct_client_exercise_name",\s*\{[\s\S]*?target_client_email:[\s\S]*?previous_exercise_name:[\s\S]*?corrected_exercise_name:/
  );
  assert.match(
    deleteHandler,
    /\.rpc\("delete_client_custom_exercise_history",\s*\{[\s\S]*?target_client_email:[\s\S]*?exercise_name_to_delete:/
  );

  assert.match(deleteHandler, /window\.confirm\(/);
  assert.match(deleteHandler, /permanent|cannot be undone|delete[^`"']*saved set/i);
  assert.ok(
    deleteHandler.indexOf("window.confirm(") < deleteHandler.indexOf('.rpc("delete_client_custom_exercise_history"'),
    "permanent deletion must be confirmed before the destructive RPC"
  );
  assert.doesNotMatch(correctionHandler, /delete_client_custom_exercise_history/);
});

test("canceling either confirmation prevents correction and deletion RPC calls", async () => {
  const makeActions = new Function(`
    const rpcCalls = [];
    const statusMessages = [];
    let confirmationCount = 0;
    const coachSupabase = {
      rpc(name, parameters) {
        rpcCalls.push({ name, parameters });
        return Promise.resolve({ data: 1, error: null });
      }
    };
    const document = {
      getElementById(id) {
        return id === "client-exercise-name-correction" ? { value: "Cable Curl" } : null;
      }
    };
    const window = {
      confirm() {
        confirmationCount += 1;
        return false;
      }
    };
    function selectedProgram() {
      return { client_name: "Test Client", client_email: "client@example.com" };
    }
    function normalizeEmail(value) {
      return String(value || "").trim().toLowerCase();
    }
    function normalizeClientExerciseName(value) {
      return String(value || "").trim().replace(/\\s+/g, " ").toLowerCase();
    }
    function selectedClientExerciseNameGroup() {
      return { key: "cabel curl", name: "Cabel Curl", logs: [{}, {}] };
    }
    function clientExerciseNameStatus(message) {
      statusMessages.push(message);
    }
    function setClientExerciseNameManagerBusy() {}
    async function loadTrainingLogsForEmail() {}
    async function loadClientCustomExerciseNames() {}
    let selectedClientExerciseNameKey = "cabel curl";
    let isClientExerciseNameMutating = false;
    let isClientExerciseNameLoading = false;

    ${javascriptFunction("correctSelectedClientExerciseName")}
    ${javascriptFunction("deleteSelectedClientExerciseName")}

    return {
      correctSelectedClientExerciseName,
      deleteSelectedClientExerciseName,
      rpcCalls,
      statusMessages,
      getConfirmationCount: () => confirmationCount
    };
  `);
  const actions = makeActions();

  await actions.correctSelectedClientExerciseName();
  await actions.deleteSelectedClientExerciseName();

  assert.equal(actions.getConfirmationCount(), 2);
  assert.deepEqual(actions.rpcCalls, []);
  assert.match(actions.statusMessages[0], /correction canceled/i);
  assert.match(actions.statusMessages[1], /deletion canceled/i);
});

test("client-name mutations keep every manager control locked until refresh finishes", () => {
  const renderer = javascriptFunction("renderClientCustomExerciseNames");
  const busyState = javascriptFunction("setClientExerciseNameManagerBusy");
  const correctionHandler = javascriptFunction("correctSelectedClientExerciseName");
  const deletionHandler = javascriptFunction("deleteSelectedClientExerciseName");
  const managerHandler = javascriptFunction("handleClientExerciseNameManager");
  const loader = javascriptFunction("loadClientCustomExerciseNames");

  assert.match(adminSource, /let isClientExerciseNameMutating = false;/);
  assert.match(renderer, /searchInput\.disabled = isClientExerciseNameMutating/);
  assert.match(renderer, /isClientExerciseNameMutating \? "disabled" : ""/);
  assert.match(busyState, /isClientExerciseNameMutating = isBusy/);
  assert.match(busyState, /querySelectorAll\("\[data-client-exercise-name-key\]"\)[\s\S]*?button\.disabled = isBusy/);
  assert.match(correctionHandler, /isClientExerciseNameMutating \|\| isClientExerciseNameLoading/);
  assert.match(deletionHandler, /isClientExerciseNameMutating \|\| isClientExerciseNameLoading/);
  assert.match(managerHandler, /if \(isClientExerciseNameMutating\)/);
  assert.match(managerHandler, /\.find\([\s\S]*?\?\.focus\(\)/);
  assert.match(loader, /clientExerciseNameClientEmail !== normalizedEmail[\s\S]*?clientExerciseNameStatus\("No changes made\."\)/);
});

test("client exercise-name manager stacks cleanly on narrow screens", () => {
  const tabletStyles = cssMediaBlock(900);
  const phoneStyles = cssMediaBlock(620);

  assert.match(styleSource, /\.client-exercise-name-manager-layout\s*\{[^}]*display:\s*grid/s);
  assert.match(styleSource, /\.client-exercise-name-list\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(tabletStyles, /\.client-exercise-name-manager-layout\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(phoneStyles, /\.client-exercise-name-actions\s*\{[^}]*flex-direction:\s*column/s);
});

test("correction RPC is an invoker-only authenticated function and preserves the entered name", () => {
  const correction = sqlFunction("correct_client_exercise_name", "delete_client_custom_exercise_history");

  assert.match(correction, /security invoker/i);
  assert.doesNotMatch(correction, /security definer/i);
  assert.match(correction, /set search_path = ''/i);
  assert.match(correction, /original_exercise_name\s*=\s*coalesce\(original_exercise_name,\s*exercise_name\)/i);
  assert.match(correction, /exercise_name\s*=\s*cleaned_corrected_name/i);
  assert.doesNotMatch(correction, /\bdelete\s+from\b/i);
  assert.match(correction, /where lower\(btrim\(client_email\)\)\s*=\s*normalized_email/i);
  assert.match(correction, /revoke all on function public\.correct_client_exercise_name\(text, text, text\) from public;/i);
  assert.match(correction, /revoke all on function public\.correct_client_exercise_name\(text, text, text\) from anon;/i);
  assert.match(correction, /grant execute on function public\.correct_client_exercise_name\(text, text, text\) to authenticated;/i);
  assert.match(correction, /normalized_email\s*=\s*lower\(coalesce\(\(select auth\.jwt\(\)\) ->> 'email', ''\)\)/i);
  assert.match(correction, /or \(select public\.is_coach_admin\(\)\)/i);
});

test("coach can read the selected client's workout names under RLS", () => {
  assert.match(
    migrationSource,
    /drop policy if exists "Coach admins can read all workout logs" on public\.client_workout_logs;[\s\S]*?create policy "Coach admins can read all workout logs"[\s\S]*?for select[\s\S]*?to authenticated[\s\S]*?using \(\(select public\.is_coach_admin\(\)\)\);/i
  );
});

test("both RPCs use exact normalized matching and deletion is custom-workout-only", () => {
  const correction = sqlFunction("correct_client_exercise_name", "delete_client_custom_exercise_history");
  const deletion = sqlFunction("delete_client_custom_exercise_history");
  const exactNormalization = /lower\(regexp_replace\(btrim\(exercise_name\),\s*'\[\[:space:\]\]\+',\s*' ',\s*'g'\)\)\s*=\s*normalized_(?:previous|exercise)_name/i;

  assert.match(correction, exactNormalization);
  assert.match(deletion, exactNormalization);
  assert.doesNotMatch(correction, /exercise_name\s+(?:i?like)\s+/i);
  assert.doesNotMatch(deletion, /exercise_name\s+(?:i?like)\s+/i);
  assert.match(deletion, /lower\(btrim\(workout_title\)\) like 'custom workout%'/i);
  assert.match(deletion, /delete from public\.client_workout_logs/i);
  assert.match(deletion, /where lower\(btrim\(client_email\)\)\s*=\s*normalized_email/i);
  assert.match(deletion, /not in \('WARMUP', 'CARDIO'\)/i);
  assert.match(deletion, /security invoker/i);
  assert.doesNotMatch(deletion, /security definer/i);
  assert.match(deletion, /set search_path = ''/i);
  assert.match(deletion, /normalized_email\s*=\s*lower\(coalesce\(\(select auth\.jwt\(\)\) ->> 'email', ''\)\)/i);
  assert.match(deletion, /or \(select public\.is_coach_admin\(\)\)/i);
  assert.match(deletion, /revoke all on function public\.delete_client_custom_exercise_history\(text, text\) from public;/i);
  assert.match(deletion, /revoke all on function public\.delete_client_custom_exercise_history\(text, text\) from anon;/i);
  assert.match(deletion, /grant execute on function public\.delete_client_custom_exercise_history\(text, text\) to authenticated;/i);
});
