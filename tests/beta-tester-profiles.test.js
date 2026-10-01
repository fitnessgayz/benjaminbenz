const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260930183302_beta_tester_profiles.sql"),
  "utf8"
);

const testerEmails = [
  "kenny.t.walter@gmail.com",
  "trickedouttruck90@yahoo.com",
  "beauheide@gmail.com",
  "jmosquera89@gmail.com",
  "shaneturner36@gmail.com",
  "biggayjohn@gmail.com",
  "gladstone.ken@gmail.com",
  "realmchild@gmail.com",
  "joseph.hinchcliffe1@gmail.com"
];

test("classifies beta testers separately from personal-training clients", () => {
  assert.match(migration, /account_type text not null default 'client'/);
  assert.match(migration, /check \(account_type in \('client', 'beta_tester'\)\)/);
  assert.match(migration, /'beta_tester'/);
  assert.match(migration, /not enrolled as a personal-training client/);
});

test("provisions every invited beta tester exactly once", () => {
  for (const email of testerEmails) {
    assert.equal(migration.split(email).length - 1, 1, `${email} should appear once`);
  }
  assert.match(migration, /where not exists \([\s\S]*lower\(existing\.client_email\) = lower\(tester\.client_email\)/);
});

test("keeps client-only notifications away from beta tester rows", () => {
  assert.match(migration, /trigger_row\.tgfoid::regprocedure/);
  assert.match(migration, /create trigger fwb_program_notifications[\s\S]*new\.account_type = ''client''/);
  assert.match(migration, /create trigger fwb_client_session_balance_notifications[\s\S]*new\.account_type = ''client''/);
});
