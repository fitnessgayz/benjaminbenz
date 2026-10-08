#!/usr/bin/env node

import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const exerciseNameMatcher = require("../../js/exercise-name-matcher.js");

const accessToken = String(process.env.SUPABASE_ACCESS_TOKEN || "").trim();
const projectId = String(process.env.SUPABASE_PROJECT_ID || "").trim();
const baseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");

if (accessToken.length < 20) throw new Error("Set SUPABASE_ACCESS_TOKEN.");
if (!/^[a-z0-9]{20}$/.test(projectId)) throw new Error("Set a valid SUPABASE_PROJECT_ID.");
if (!/^https:\/\/[a-z0-9-]+[.]supabase[.]co$/.test(baseUrl)) throw new Error("Set a valid SUPABASE_URL.");

async function projectSecretKey() {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${encodeURIComponent(projectId)}/api-keys?reveal=true`,
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
  );
  if (!response.ok) throw new Error(`Could not retrieve a project secret key: HTTP ${response.status}`);
  const keys = await response.json();
  const secret = keys.find((key) => key.type === "secret" && key.name === "github_actions_production")
    || keys.find((key) => key.type === "secret");
  const value = String(secret?.api_key || secret?.apiKey || secret?.key || "").trim();
  if (!value.startsWith("sb_secret_") || value.length < 20) throw new Error("No usable project secret key was found.");
  return value;
}

async function fetchAll(secretKey, table, select) {
  const pageSize = 1000;
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const url = new URL(`${baseUrl}/rest/v1/${table}`);
    url.searchParams.set("select", select);
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String(offset));
    const response = await fetch(url, {
      headers: {
        apikey: secretKey,
        Authorization: `Bearer ${secretKey}`,
        Accept: "application/json",
      },
    });
    if (!response.ok) throw new Error(`${table} query failed: HTTP ${response.status} ${await response.text()}`);
    const page = await response.json();
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

function normalize(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function addName(target, value, source) {
  const name = String(value || "").trim();
  if (!name || /^exercise\s*\d*$/i.test(name) || /^(warm[ -]?up|cardio)$/i.test(name)) return;
  const key = normalize(name);
  if (!key) return;
  if (!target.has(key)) target.set(key, { name, sources: new Set() });
  target.get(key).sources.add(source);
}

function programExerciseNames(programs, target) {
  const visit = (value) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    if (typeof value.name === "string") addName(target, value.name, "program");
    Object.values(value).forEach(visit);
  };
  programs.forEach((program) => visit(program.workouts));
}

function inferredMuscle(name) {
  const text = normalize(name);
  const has = (pattern) => pattern.test(text);

  if (has(/\b(rear delt|reverse pec|reverse fly|reverse dumbbell fly|rear delt fly)\b/)) return "shoulders";
  if (has(/\b(chest supported rear delt row)\b/)) return "shoulders";
  if (has(/\b(chest supported row|incline (dumbbell )?row|row machine|machine row|cable row|seated row|single arm row|bent over row|high row|trx .*row|overhand row)\b/)) return "back";
  if (has(/\b(lat|pull down|pulldown|pull up|assisted pull|chin up|straight arm pull)\b/)) return "lats";
  if (has(/\b(tricep|triceps|pressdown|pushdown|skull crusher|dip machine|assisted dip|weighted dip|body weight tricep dip)\b/)) return "triceps";
  if (has(/\b(bicep|biceps|curl|arm blaster)\b/) && !has(/\b(leg curl|hamstring curl)\b/)) return "biceps";
  if (has(/\b(adductor|adduction|inner thigh)\b/)) return "adductors";
  if (has(/\b(hamstring|leg curl|nordic|romanian deadlift|\brdl\b|good morning|stiff leg)\b/)) return "hamstrings";
  if (has(/\b(glute|hip thrust|hip extension|hip drive|kickback|abduction|outer thigh|lateral walk|clamshell|bridge)\b/)) return "glutes";
  if (has(/\b(quad|quadricep|squat|leg press|leg extension|lunge|step up)\b/)) return "quads";
  if (has(/\b(calf|calves|ankle rock|ankle knee to wall|ankle mobil)\b/)) return "calves";
  if (has(/\b(chest|pectoral|\bpec\b|bench press|push up|cable fly|dumbbell fly|machine fly|decline press)\b/)) return "chest";
  if (has(/\b(shoulder|delt|lateral raise|front raise|frontal raise|upright row|shrug|wall slide)\b/)) return "shoulders";
  if (has(/\b(core|\babs?\b|abdominal|crunch|plank|dead bug|pallof|wood chop|woodchop|sit up|knee raise|leg lower|jack knife|russian twist|torso twist|torso rotation|side bend|body saw|bicycle kick|hanging leg)\b/)) return "core";
  if (has(/\b(forearm|wrist|pronation|supination)\b/)) return "forearms";
  if (has(/\b(90 90|hip flexor|hip mobility|hip transition|hip airplane|couch stretch|leg swings)\b/)) return "hips";
  if (has(/\b(thoracic|open book|child s pose|back extension)\b/)) return "back";
  if (has(/\b(neck|cervical)\b/)) return "neck";
  if (has(/\b(world s greatest stretch|pogo hop|lateral shuffle|split step|bike|biking|treadmill|walk|run|elliptical|rower|stairs)\b/)) return "full_body";
  return "";
}

function inferredEquipment(name) {
  const text = normalize(name);
  if (/\b(cable|pulley)\b/.test(text)) return "cable";
  if (/\b(dumbbell|dumbell|\bdb\b)\b/.test(text)) return "dumbbell";
  if (/\b(barbell|ez bar)\b/.test(text)) return "barbell";
  if (/\b(smith)\b/.test(text)) return "smith_machine";
  if (/\b(machine|pec deck|hack squat|leg press|leg extension|leg curl|abcoaster|ghd)\b/.test(text)) return "machine";
  if (/\b(bench)\b/.test(text)) return "bench";
  if (/\b(trx)\b/.test(text)) return "suspension_trainer";
  if (/\b(body ?weight|push up|plank|sit up|stretch|mobility|rock|walk|run|lunge|step up|pogo|shuffle|split step)\b/.test(text)) return "bodyweight";
  return "other";
}

async function restWrite(secretKey, table, { method, query = "", body }) {
  const response = await fetch(`${baseUrl}/rest/v1/${table}${query}`, {
    method,
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${table} ${method} failed: HTTP ${response.status} ${await response.text()}`);
  const text = await response.text();
  return text ? JSON.parse(text) : [];
}

const secretKey = await projectSecretKey();
const [library, programs, logs] = await Promise.all([
  fetchAll(secretKey, "exercise_library", "id,name,aliases,primary_muscle,secondary_muscles,equipment,is_active,is_approved"),
  fetchAll(secretKey, "client_programs", "workouts"),
  fetchAll(secretKey, "client_workout_logs", "exercise_name"),
]);

const libraryLookup = new Map();
for (const exercise of library) {
  for (const label of [exercise.name, ...(exercise.aliases || [])]) {
    const key = normalize(label);
    if (key && !libraryLookup.has(key)) libraryLookup.set(key, exercise);
  }
}

const usedNames = new Map();
programExerciseNames(programs, usedNames);
logs.forEach((log) => addName(usedNames, log.exercise_name, "history"));

const matched = [];
const inferred = [];
const unresolved = [];
for (const [key, usage] of [...usedNames.entries()].sort((left, right) => left[1].name.localeCompare(right[1].name))) {
  const libraryExercise = libraryLookup.get(key);
  const record = { name: usage.name, sources: [...usage.sources].sort() };
  if (libraryExercise) {
    matched.push({ ...record, library_name: libraryExercise.name, primary_muscle: libraryExercise.primary_muscle });
    continue;
  }
  const muscle = inferredMuscle(usage.name);
  if (muscle) inferred.push({ ...record, primary_muscle: muscle, equipment: inferredEquipment(usage.name) });
  else unresolved.push(record);
}

const applied = [];
if (String(process.env.EXERCISE_AUDIT_APPLY || "").toLowerCase() === "true") {
  const existingAliasAdds = new Map();
  const planned = [];

  for (const record of inferred) {
    const existingMatch = exerciseNameMatcher.rankedLibraryMatches(record.name, library)[0];
    if (existingMatch?.score >= 0.88 && existingMatch.exercise.primary_muscle === record.primary_muscle) {
      if (!existingAliasAdds.has(existingMatch.exercise.id)) {
        existingAliasAdds.set(existingMatch.exercise.id, {
          exercise: existingMatch.exercise,
          aliases: new Set(existingMatch.exercise.aliases || []),
        });
      }
      existingAliasAdds.get(existingMatch.exercise.id).aliases.add(record.name);
      applied.push({ ...record, action: "alias", library_name: existingMatch.exercise.name });
      continue;
    }

    const plannedMatch = exerciseNameMatcher.rankedLibraryMatches(record.name, planned)[0];
    if (plannedMatch?.score >= 0.90 && plannedMatch.exercise.primary_muscle === record.primary_muscle) {
      plannedMatch.exercise.aliases.push(record.name);
      applied.push({ ...record, action: "alias", library_name: plannedMatch.exercise.name });
      continue;
    }

    const exercise = {
      name: record.name,
      aliases: [],
      primary_muscle: record.primary_muscle,
      secondary_muscles: [],
      equipment: record.equipment,
      difficulty: "beginner",
      movement_pattern: "",
      default_sets: 3,
      default_reps: "8-12",
      default_rest_seconds: 90,
      substitution_group: "",
      instructions: "",
      is_approved: true,
      is_active: true,
      sort_order: 2000,
    };
    planned.push(exercise);
    applied.push({ ...record, action: "new", library_name: exercise.name });
  }

  for (const { exercise, aliases } of existingAliasAdds.values()) {
    await restWrite(secretKey, "exercise_library", {
      method: "PATCH",
      query: `?id=eq.${encodeURIComponent(exercise.id)}`,
      body: { aliases: [...aliases].sort((left, right) => left.localeCompare(right)) },
    });
  }
  if (planned.length > 0) {
    await restWrite(secretKey, "exercise_library", { method: "POST", body: planned });
  }
}

const report = {
  counts: {
    library_records: library.length,
    distinct_used_names: usedNames.size,
    already_attached: matched.length,
    obvious_unattached: inferred.length,
    unresolved: unresolved.length,
  },
  obvious_unattached: inferred,
  unresolved,
  applied,
};

console.log("EXERCISE_MUSCLE_AUDIT_BEGIN");
console.log(JSON.stringify(report, null, 2));
console.log("EXERCISE_MUSCLE_AUDIT_END");
