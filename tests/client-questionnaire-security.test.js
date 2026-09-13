const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const migrationsDirectory = path.join(root, "supabase/migrations");
const migrationName = fs.readdirSync(migrationsDirectory)
  .find((name) => name.endsWith("_add_client_fitness_questionnaires.sql"));

assert.ok(migrationName, "Expected the questionnaire migration");

const migration = fs.readFileSync(path.join(migrationsDirectory, migrationName), "utf8");
const cleanupMigrationName = fs.readdirSync(migrationsDirectory)
  .find((name) => name.endsWith("_fix_questionnaire_auth_cleanup.sql"));

assert.ok(cleanupMigrationName, "Expected the questionnaire Auth cleanup migration");

const cleanupMigration = fs.readFileSync(path.join(migrationsDirectory, cleanupMigrationName), "utf8");
const matchedReadsMigrationName = fs.readdirSync(migrationsDirectory)
  .find((name) => name.endsWith("_require_matched_questionnaire_reads.sql"));

assert.ok(matchedReadsMigrationName, "Expected the matched questionnaire read migration");

const matchedReadsMigration = fs.readFileSync(
  path.join(migrationsDirectory, matchedReadsMigrationName),
  "utf8"
);
const removeDirectInsertsMigrationName = fs.readdirSync(migrationsDirectory)
  .find((name) => name.endsWith("_remove_direct_questionnaire_inserts.sql"));

assert.ok(removeDirectInsertsMigrationName, "Expected the direct questionnaire insert cleanup migration");

const removeDirectInsertsMigration = fs.readFileSync(
  path.join(migrationsDirectory, removeDirectInsertsMigrationName),
  "utf8"
);
const enforceEdgeOnlyMigrationName = fs.readdirSync(migrationsDirectory)
  .find((name) => name.endsWith("_enforce_edge_only_questionnaire_writes.sql"));

assert.ok(enforceEdgeOnlyMigrationName, "Expected the final Edge-only write migration");
assert.ok(
  enforceEdgeOnlyMigrationName > removeDirectInsertsMigrationName,
  "Expected the Edge-only cleanup to be the final questionnaire write migration"
);

const enforceEdgeOnlyMigration = fs.readFileSync(
  path.join(migrationsDirectory, enforceEdgeOnlyMigrationName),
  "utf8"
);
const policyStart = migration.indexOf('create policy "Clients and coach can read fitness questionnaires"');
const readPolicy = migration.slice(policyStart);

test("stores questionnaire copies with verified ownership and idempotent source identity", () => {
  assert.match(migration, /create table public\.client_fitness_questionnaires/);
  assert.match(migration, /linked_user_id uuid references auth\.users\(id\)/);
  assert.match(migration, /unique \(source, source_submission_id\)/);
  assert.match(migration, /match_status in \('matched', 'review', 'unmatched'\)/);
  assert.match(migration, /match_status <> 'matched'[\s\S]*?linked_user_id is not null[\s\S]*?linked_client_email is not null/);
  assert.match(migration, /jsonb_typeof\(answers\) = 'object'/);
  assert.match(cleanupMigration, /foreign key \(linked_user_id\)[\s\S]*?references auth\.users\(id\)[\s\S]*?on delete cascade/);
});

test("allows authenticated reads only through Auth UID ownership or coach access", () => {
  assert.ok(policyStart >= 0, "Expected the questionnaire read policy");
  assert.match(migration, /alter table public\.client_fitness_questionnaires enable row level security/);
  assert.match(migration, /revoke all on table public\.client_fitness_questionnaires from public, anon, authenticated/);
  assert.match(migration, /grant select on table public\.client_fitness_questionnaires to authenticated/);
  assert.match(readPolicy, /linked_user_id = \(select auth\.uid\(\)\)/);
  assert.match(readPolicy, /\(select public\.is_coach_admin\(\)\)/);
  assert.doesNotMatch(readPolicy, /respondent_email\s*=|linked_client_email\s*=/);
  assert.doesNotMatch(migration, /grant\s+(?:insert|update|delete|all)\s+on table public\.client_fitness_questionnaires to (?:anon|authenticated)/i);
});

test("keeps review and unmatched questionnaires coach-only", () => {
  assert.match(matchedReadsMigration, /drop policy if exists "Clients and coach can read fitness questionnaires"/);
  assert.match(
    matchedReadsMigration,
    /match_status = 'matched'[\s\S]*?linked_user_id = \(select auth\.uid\(\)\)/
  );
  assert.match(matchedReadsMigration, /or \(select public\.is_coach_admin\(\)\)/);
  assert.doesNotMatch(matchedReadsMigration, /respondent_email\s*=|linked_client_email\s*=/);
});

test("routes client writes through validated Edge Functions only", () => {
  assert.match(
    removeDirectInsertsMigration,
    /drop policy if exists "Clients can submit their onboarding questionnaire"/
  );
  assert.match(
    removeDirectInsertsMigration,
    /revoke insert on table public\.client_fitness_questionnaires from authenticated/
  );
  assert.match(
    enforceEdgeOnlyMigration,
    /drop policy if exists "Clients can submit their onboarding questionnaire"/
  );
  assert.match(
    enforceEdgeOnlyMigration,
    /revoke insert on table public\.client_fitness_questionnaires from authenticated/
  );
});

test("does not persist or expose the shared Google response-sheet location", () => {
  assert.doesNotMatch(migration, /docs\.google\.com|drive\.google\.com|script\.google\.com/i);
  assert.doesNotMatch(migration, /drive_(?:id|url)|sheet_(?:id|url)|spreadsheet_(?:id|url)/i);
});
