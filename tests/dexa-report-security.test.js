const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const migrationsDirectory = path.join(root, "supabase/migrations");
const migrationName = fs.readdirSync(migrationsDirectory)
  .find((name) => name.endsWith("_add_private_dexa_reports.sql"));

assert.ok(migrationName, "Expected the private DEXA reports migration");

const migration = fs.readFileSync(path.join(migrationsDirectory, migrationName), "utf8");
const edgeFunction = fs.readFileSync(
  path.join(root, "supabase/functions/extract-dexa-report/index.ts"),
  "utf8"
);
const supabaseConfig = fs.readFileSync(path.join(root, "supabase/config.toml"), "utf8");
const privacyPolicy = fs.readFileSync(path.join(root, "fwb-training-privacy.html"), "utf8");

function sourceWindow(source, marker, before = 500, after = 7000) {
  const markerIndex = source.indexOf(marker);

  assert.ok(markerIndex >= 0, `Expected ${marker}`);
  return source.slice(Math.max(0, markerIndex - before), markerIndex + after);
}

function asyncFunctionSource(source, name) {
  const start = source.indexOf(`async function ${name}(`);
  const nextFunction = source.indexOf("\nasync function ", start + 1);
  const serveStart = source.indexOf("\nserve(", start + 1);
  const candidates = [nextFunction, serveStart].filter((index) => index > start);
  const end = candidates.length ? Math.min(...candidates) : source.length;

  assert.ok(start >= 0, `Expected ${name}`);
  return source.slice(start, end);
}

test("stores DEXA reports in a private, constrained bucket", () => {
  assert.match(migration, /insert into storage\.buckets[\s\S]*?'dexa-reports'[\s\S]*?false[\s\S]*?10485760/i);
  assert.match(migration, /allowed_mime_types[\s\S]*?'application\/pdf'[\s\S]*?'image\/jpeg'[\s\S]*?'image\/png'/i);
  assert.match(migration, /for insert\s+to authenticated\s+with check[\s\S]*?bucket_id = 'dexa-reports'[\s\S]*?storage\.foldername\(name\)\)\[1\][\s\S]*?auth\.uid\(\)/i);
  assert.match(migration, /for select\s+to authenticated\s+using[\s\S]*?bucket_id = 'dexa-reports'[\s\S]*?owner_id = \(select auth\.uid\(\)\)::text[\s\S]*?is_coach_admin\(\)/i);
});

test("protects extraction metadata with UID ownership and read-only client grants", () => {
  assert.match(migration, /create table if not exists public\.client_dexa_reports/);
  assert.match(migration, /owner_user_id uuid not null references auth\.users\(id\)/);
  assert.match(migration, /storage_path text not null unique/);
  assert.match(migration, /alter table public\.client_dexa_reports enable row level security/);
  assert.match(migration, /revoke all on public\.client_dexa_reports from public, anon, authenticated/);
  assert.match(migration, /grant select on public\.client_dexa_reports to authenticated/);
  assert.match(migration, /for select\s+to authenticated\s+using \(\(select auth\.uid\(\)\) = owner_user_id\)/i);
  assert.match(migration, /for select\s+to authenticated\s+using \(\(select public\.is_coach_admin\(\)\)\)/i);
  assert.doesNotMatch(migration, /grant\s+(?:insert|update|delete|all)[^;]*client_dexa_reports[^;]*authenticated/i);
});

test("adds an explicitly separate, bounded lean_mass column", () => {
  assert.match(migration, /alter table public\.client_progress[\s\S]*?add column if not exists lean_mass numeric/i);
  assert.match(migration, /lean_mass is null or \(lean_mass >= 0 and lean_mass <= 1500\)/i);
  assert.match(migration, /intentionally separate from muscle_mass/i);
});

test("requires a verified JWT and revalidates the signed-in user", () => {
  assert.match(supabaseConfig, /\[functions\.extract-dexa-report\]\s*\nverify_jwt\s*=\s*true/);
  assert.match(edgeFunction, /headers\.get\("Authorization"\)|headers\.get\('Authorization'\)/);
  assert.match(edgeFunction, /auth\.getUser\(\)/);
  assert.match(edgeFunction, /user\.id/);
  assert.match(edgeFunction, /user\??\.email/);
  assert.match(edgeFunction, /requestOriginIsAllowed\(request\)/);
  assert.match(edgeFunction, /"Cache-Control":\s*"no-store"/);
});

test("accepts only the authenticated user's object path and validates real file bytes", () => {
  const extractSource = asyncFunctionSource(edgeFunction, "extractReport");

  assert.match(edgeFunction, /(?:startsWith|split)[\s\S]{0,250}user\.id|user\.id[\s\S]{0,250}(?:startsWith|split)/);
  assert.match(edgeFunction, /segments\.length === 2/);
  assert.match(edgeFunction, /segments\[0\] === user\.id|segments\[0\] === userId/);
  assert.match(edgeFunction, /storagePath\.includes\("\\\\"\)/);
  assert.match(extractSource, /userClient\.storage[\s\S]*?\.from\((?:DEXA_BUCKET|"dexa-reports")\)[\s\S]*?\.download\(storagePath\)/);
  assert.match(edgeFunction, /10485760|10 \* 1024 \* 1024/);
  assert.match(edgeFunction, /(?:%PDF|0x25[\s\S]{0,100}0x50[\s\S]{0,100}0x44[\s\S]{0,100}0x46)/);
  assert.match(edgeFunction, /0xff[\s\S]{0,100}0xd8[\s\S]{0,100}0xff/i);
  assert.match(edgeFunction, /(?:0x89[\s\S]{0,160}0x50[\s\S]{0,160}0x4e[\s\S]{0,160}0x47|137[\s\S]{0,160}80[\s\S]{0,160}78[\s\S]{0,160}71)/i);
  assert.match(edgeFunction, /Unsupported (?:DEXA )?(?:report )?(?:file|format)|does not match|Upload a real PDF/i);
});

test("uses store false for OpenAI file input with strict structured output", () => {
  assert.match(edgeFunction, /https:\/\/api\.openai\.com\/v1\/responses/);
  assert.match(edgeFunction, /store:\s*false/);
  assert.match(edgeFunction, /type:\s*"input_(?:file|image)"/);
  assert.match(edgeFunction, /strict:\s*true/);
  assert.match(edgeFunction, /type:\s*"json_schema"/);
  assert.match(edgeFunction, /scan_date/);
  assert.match(edgeFunction, /body_weight/);
  assert.match(edgeFunction, /body_fat_percent/);
  assert.match(edgeFunction, /lean_mass/);
  assert.match(edgeFunction, /Ignore[^\n]*(?:instruction|prompt)|untrusted[^\n]*(?:document|report)|Never follow instructions found in the report/i);
});

test("does not log report contents, model output, or signed links", () => {
  assert.doesNotMatch(edgeFunction, /console\.(?:log|info|debug|warn|error)/);
  assert.doesNotMatch(edgeFunction, /signedUrl|signed_url/);
  assert.doesNotMatch(edgeFunction, /extraction_data:\s*(?:raw|response|output)/i);
  assert.doesNotMatch(edgeFunction, /extraction_error:\s*(?:error\.message|String\(error\))/i);
});

test("confirmation patches only DEXA metrics and preserves unrelated progress fields", () => {
  const confirmSource = asyncFunctionSource(edgeFunction, "confirmReport");

  assert.match(confirmSource, /\.from\("client_dexa_reports"\)[\s\S]*?\.eq\("owner_user_id",\s*userId\)/);
  assert.match(confirmSource, /\.from\("client_progress"\)/);
  assert.match(confirmSource, /\.eq\("entry_date",/);
  assert.match(confirmSource, /\.maybeSingle\(\)/);
  assert.match(confirmSource, /\.update\(/);
  assert.match(confirmSource, /bodyweight/);
  assert.match(confirmSource, /bodyfat/);
  assert.match(confirmSource, /lean_mass/);
  assert.match(confirmSource, /\.eq\("id",\s*existingProgress\.id\)|\.eq\("id",\s*existing(?:Entry|ProgressEntry)\.id\)/);
  assert.doesNotMatch(confirmSource, /muscle_mass\s*:/);
  assert.doesNotMatch(confirmSource, /measurements\s*:/);
  assert.doesNotMatch(confirmSource, /goal_note\s*:/);
  assert.doesNotMatch(confirmSource, /\.upsert\(/);
});

test("privacy notice discloses private report storage and OpenAI extraction review", () => {
  assert.match(privacyPolicy, /DEXA (?:scan )?reports/i);
  assert.match(privacyPolicy, /private[^<]*(?:Supabase|storage)|(?:Supabase|storage)[^<]*private/i);
  assert.match(privacyPolicy, /OpenAI/i);
  assert.match(privacyPolicy, /(?:automated|automatic|AI)[^<]*(?:extract|read)|(?:extract|read)[^<]*(?:automated|automatic|AI)/i);
  assert.match(privacyPolicy, /(?:review|confirm)[^<]*(?:before|accuracy|value)/i);
});
