#!/usr/bin/env node

import process from "node:process";

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

const muscleRules = [
  ["chest", /\b(chest|pectoral|pecs?|bench press|push[ -]?up|flye?)\b/i],
  ["lats", /\b(lats?|pulldown|pull[ -]?up|chin[ -]?up)\b/i],
  ["back", /\b(back|rows?|rear delts?|face pull)\b/i],
  ["shoulders", /\b(shoulders?|delts?|lateral raise|front raise|upright row)\b/i],
  ["biceps", /\b(biceps?|curls?|hammer curl|preacher)\b/i],
  ["triceps", /\b(triceps?|pressdowns?|pushdowns?|skull ?crushers?|dips?)\b/i],
  ["quads", /\b(quads?|quadriceps|squats?|leg press|leg extension|lunges?|step[ -]?ups?|split squat)\b/i],
  ["hamstrings", /\b(hamstrings?|leg curls?|romanian deadlift|rdl|good mornings?|stiff[ -]?leg)\b/i],
  ["glutes", /\b(glutes?|hip thrust|kickbacks?|abduction|clamshell|hip drive)\b/i],
  ["calves", /\b(calves|calf|plantar flexion)\b/i],
  ["core", /\b(core|abs?|abdominal|crunch|planks?|dead bug|pallof|woodchop|sit[ -]?ups?|knee raise)\b/i],
  ["adductors", /\b(adductors?|adduction|inner thigh)\b/i],
  ["forearms", /\b(forearms?|wrist curls?|wrist extension|grip)\b/i],
  ["hips", /\b(hips?|90[ /-]?90|hip cars?|hip mobility)\b/i],
  ["neck", /\b(neck|cervical)\b/i],
];

function inferredMuscle(name) {
  const matches = muscleRules.filter(([, pattern]) => pattern.test(name)).map(([muscle]) => muscle);
  return matches.length === 1 ? matches[0] : "";
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
  if (muscle) inferred.push({ ...record, primary_muscle: muscle });
  else unresolved.push(record);
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
};

console.log("EXERCISE_MUSCLE_AUDIT_BEGIN");
console.log(JSON.stringify(report, null, 2));
console.log("EXERCISE_MUSCLE_AUDIT_END");
