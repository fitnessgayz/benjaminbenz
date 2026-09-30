#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const mode = process.argv[2] || "dry-run";
if (!new Set(["dry-run", "apply"]).has(mode)) {
  throw new Error('Use "dry-run" or "apply".');
}

const accessToken = String(process.env.SUPABASE_ACCESS_TOKEN || "").trim();
const projectId = String(process.env.SUPABASE_PROJECT_ID || "").trim();
if (accessToken.length < 20) throw new Error("Set SUPABASE_ACCESS_TOKEN.");
if (!/^[a-z0-9]{20}$/.test(projectId)) throw new Error("Set a valid SUPABASE_PROJECT_ID.");

const migrationDirectory = path.resolve(process.cwd(), "supabase/migrations");
const migrationPattern = /^(\d{14})_(.+)[.]sql$/;
const requestHeaders = {
  Authorization: `Bearer ${accessToken}`,
  Accept: "application/json",
  "Content-Type": "application/json",
};

async function managementRequest(endpoint, options = {}) {
  const response = await fetch(`https://api.supabase.com${endpoint}`, {
    ...options,
    headers: { ...requestHeaders, ...(options.headers || {}) },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase Management API ${options.method || "GET"} ${endpoint} failed: HTTP ${response.status} ${detail}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

const localFiles = (await readdir(migrationDirectory))
  .filter((file) => migrationPattern.test(file))
  .sort();
const remoteMigrations = await managementRequest(
  `/v1/projects/${encodeURIComponent(projectId)}/database/migrations`,
);
const appliedVersions = new Set(remoteMigrations.map((migration) => String(migration.version || "")));
const appliedNames = new Set(remoteMigrations.map((migration) => String(migration.name || "")));

const pending = localFiles.filter((file) => {
  const [, version, description] = file.match(migrationPattern);
  const baseName = file.replace(/[.]sql$/, "");
  return !appliedVersions.has(version)
    && !appliedNames.has(description)
    && !appliedNames.has(baseName);
});

console.log(`${pending.length} pending migration(s).`);
for (const file of pending) console.log(`pending ${file}`);
if (mode === "dry-run") process.exit(0);

for (const file of pending) {
  const query = await readFile(path.join(migrationDirectory, file), "utf8");
  const name = file.replace(/[.]sql$/, "");
  await managementRequest(
    `/v1/projects/${encodeURIComponent(projectId)}/database/migrations`,
    { method: "POST", body: JSON.stringify({ name, query }) },
  );
  console.log(`applied ${file}`);
}
