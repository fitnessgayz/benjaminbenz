const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.resolve(__dirname, "..");
const loggerHtml = fs.readFileSync(path.join(projectRoot, "coach-workout-log.html"), "utf8");
const loggerSource = fs.readFileSync(path.join(projectRoot, "js/coach-workout-log.js"), "utf8");

test("Session Logger exposes autosave with a manual Save now fallback", () => {
  assert.match(loggerHtml, />Autosave on</);
  assert.match(loggerHtml, /id="coach-workout-save">Save now</);
  assert.match(loggerSource, /const coachWorkoutAutosaveDelayMs = 10000/);
  assert.match(loggerSource, /form\.addEventListener\("input", \(event\) =>/);
  assert.match(loggerSource, /scheduleCoachWorkoutAutosave\(\)/);
  assert.match(loggerSource, /form\.addEventListener\("change",/);
});

test("incomplete Session Logger changes stay in a restorable local draft", () => {
  assert.match(loggerSource, /fwb_coach_session_logger_draft_v1/);
  assert.match(loggerSource, /localStorage\.setItem\([\s\S]*coachWorkoutDraftKey\(context\)/);
  assert.match(loggerSource, /restoreCoachWorkoutDraft\(/);
  assert.match(loggerSource, /Draft saved on this device\. Complete the required fields to sync it\./);
  assert.match(loggerSource, /This draft could not be saved on this device/);
});

test("automatic saves validate silently and serialize overlapping changes", () => {
  assert.match(loggerSource, /automatic \? form\?\.checkValidity\(\) : form\?\.reportValidity\(\)/);
  assert.match(loggerSource, /coachWorkoutAutosaveInFlight/);
  assert.match(loggerSource, /coachWorkoutAutosaveQueued = true/);
  assert.match(loggerSource, /scheduleCoachWorkoutAutosave\(\{ recordChange: false, delayMs: 0 \}\)/);
});

test("autosave keeps stable exercise codes and reconciles removed saved exercises", () => {
  assert.match(loggerSource, /data-coach-workout-code=/);
  assert.match(loggerSource, /queueCoachWorkoutExerciseRemoval/);
  assert.match(loggerSource, /\.eq\("exercise_code", pendingDelete\.code\)/);
  assert.match(loggerSource, /exercise\.dataset\.coachWorkoutCode = planned\[index\]\.code/);
});

test("drafts are isolated and restored by authenticated coach, client, and date", () => {
  assert.match(loggerSource, /const coachWorkoutDraftVersion = 2/);
  assert.match(loggerSource, /ownerEmail: coachWorkoutDraftOwner/);
  assert.match(loggerSource, /encodeURIComponent\(normalized\.clientEmail \|\| "unassigned"\)/);
  assert.match(loggerSource, /encodeURIComponent\(normalized\.entryDate \|\| "undated"\)/);
  assert.match(loggerSource, /function switchCoachWorkoutContext\(\)/);
  assert.match(loggerSource, /storeCoachWorkoutDraft\(\{\}, \{[\s\S]*context: previousContext,[\s\S]*markActive: false/);
  assert.match(loggerSource, /restoreCoachWorkoutDraft\(\{ context: nextContext, updateFields: false \}\)/);
  assert.match(loggerSource, /resetCoachWorkoutEditor\(\)/);
  assert.match(loggerSource, /coachWorkoutDraftMemory\.set\(draftKey, payload\)/);
  assert.match(loggerSource, /coachWorkoutDraftMemory\.get\(draftKey\)/);
  assert.match(loggerSource, /const isAssigningFirstClient = Boolean\(/);
  assert.match(loggerSource, /if \(isAssigningFirstClient\) \{[\s\S]*scheduleCoachWorkoutAutosave\(\{ recordChange: false \}\)/);
});

test("context switches and Clear form invalidate stale in-flight save completions", () => {
  assert.match(loggerSource, /let coachWorkoutSaveEpoch = 0/);
  assert.match(loggerSource, /coachWorkoutSaveEpoch \+= 1/g);
  assert.match(loggerSource, /const saveEpoch = coachWorkoutSaveEpoch/);
  assert.match(loggerSource, /saveEpoch === coachWorkoutSaveEpoch/);
  assert.match(loggerSource, /return \{ saved: true, rows: rows\.length, stale: true \}/);
  assert.match(loggerSource, /const queuedSave = \([\s\S]*coachWorkoutAutosaveQueuedEpoch === coachWorkoutSaveEpoch/);
});

test("remote saves are cross-tab serialized, exact-email scoped, and upsert before pruning", () => {
  assert.match(loggerSource, /window\.navigator\?\.locks/);
  assert.match(loggerSource, /if \(!lockManager \|\| typeof lockManager\.request !== "function"\)/);
  assert.doesNotMatch(loggerSource, /\.ilike\("client_email"/);
  assert.match(loggerSource, /\.eq\("client_email", clientEmail\)/);

  const upsertIndex = loggerSource.indexOf(".upsert(plannedRows");
  const pendingDeleteIndex = loggerSource.indexOf("for (const pendingDelete of pendingDeletes)");
  const staleSetDeleteIndex = loggerSource.indexOf("for (const exercise of plannedExercises)");

  assert.ok(upsertIndex > -1);
  assert.ok(pendingDeleteIndex > upsertIndex);
  assert.ok(staleSetDeleteIndex > upsertIndex);
});

test("pending delete reconciliation preserves removals made during a save", () => {
  assert.match(loggerSource, /mutationId: coachWorkoutPendingDeleteRevision/);
  assert.match(loggerSource, /requestedPendingDeletes[\s\S]*\.map\(\(item\) => \(\{ \.\.\.item \}\)\)/);
  assert.match(loggerSource, /settledDeleteIds\.has\(item\.mutationId\)/);
  assert.match(loggerSource, /queueCoachWorkoutPendingDelete\(planned\[index\]\.code, clientEmail, entryDate\)/);
});

test("draft access is owner-scoped and sign out invalidates pending saves", () => {
  assert.match(loggerSource, /normalizeCoachWorkoutEmail\(record\.ownerEmail\) === coachWorkoutDraftOwner/);
  assert.match(loggerSource, /async function signOutCoachWorkout\(\) \{[\s\S]*coachWorkoutSaveEpoch \+= 1;[\s\S]*auth\.signOut\(\)/);
  assert.match(loggerSource, /coachWorkoutDraftOwner = normalizeCoachWorkoutEmail\(user\.email\)/);
});
