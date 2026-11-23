const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../js/client-portal.js"), "utf8");

const owner = "client@example.test";
const program = (type, fields = {}) => ({
  id: type, client_email: owner, membership_type: type, active: true,
  workouts: [], program_title: "Fixture " + type, ...fields
});
const panels = new Map();
const tabs = ["routines", "personal", "trainer"].map(name => ({
  name, dataset: { clientWorkoutHubTab: name }, state: {},
  setAttribute(key, value) { this.state[key] = value; },
  getAttribute() { return name; }
}));
const scope = vm.createContext({
  normalizeClientEmail: value => String(value || "").trim().toLowerCase(),
  activeDashboardUser: { email: owner }, activeClientEmail: owner, currentProgram: null,
  isCoachDashboardPreview: false, clientAvailablePrograms: [],
  clientWorkoutHubSection: "routines", clientPreviewProgramSelected: false,
  document: { querySelectorAll: () => tabs, getElementById: id => panels.get(id) },
  escapeHtml: value => String(value), clientWorkoutChoiceContent: ({title}) => title,
  clientWorkoutChoiceDialogMarkup: () => ""
});
for (const tab of tabs) panels.set(tab.name, {hidden: false});
const start = source.indexOf("function clientCoachingMembership(");
const htmlEnd = source.indexOf("  const assigned = workouts.filter", start);
assert.ok(start >= 0 && htmlEnd > start);
vm.runInContext(source.slice(start, htmlEnd) + "return '';\n}", scope);

test("canonical current ownership, membership, beta, archive and loading checks", () => {
  const pt = program("personal_training");
  const online = program("online_training");
  const beta = program("personal_training", {account_type: " BETA_TESTER "});
  const app = program("app_access_only", {workouts: [{title: "not entitlement evidence"}]});
  const unknown = program("other", {membership_requested_type: "personal_training"});
  const foreign = program("personal_training", {client_email: "other@example.test"});
  assert.equal(scope.clientPersonalTrainingAccess([pt], owner.toUpperCase()).state, "available");
  assert.equal(scope.clientPersonalTrainingAccess([online], owner).state, "available");
  assert.equal(scope.clientPersonalTrainingAccess([beta, app], owner).state, "app-only");
  assert.equal(scope.clientPersonalTrainingAccess([unknown, foreign, program("personal_training",{client_archived:true}), program("personal_training",{active:false})], owner).state, "unverified");
  assert.equal(scope.clientPersonalTrainingAccess([pt], "").state, "unverified");
  assert.equal(scope.clientPersonalTrainingAccess([pt, app], owner).programs.length, 1);
});

test("personal route falls back, does not render assigned content, and keeps Trainer", () => {
  scope.clientAvailablePrograms = [program("app_access_only")];
  scope.currentProgram = scope.clientAvailablePrograms[0];
  scope.clientPreviewProgramSelected = true;
  scope.selectClientWorkoutHubSection("personal");
  assert.equal(panels.get("personal").hidden, true);
  assert.equal(panels.get("routines").hidden, false);
  const html = scope.clientWorkoutListMarkup([]);
  assert.match(html, /disabled aria-describedby="client-personal-training-access-hint"/);
  assert.doesNotMatch(html, /data-preview-program=/);
  scope.selectClientWorkoutHubSection("trainer");
  assert.equal(panels.get("trainer").hidden, false);
  scope.clientAvailablePrograms = [program("app_access_only"), program("online_training")];
  scope.selectClientWorkoutHubSection("personal");
  assert.equal(panels.get("personal").hidden, false);
  assert.match(scope.clientWorkoutListMarkup([]), /data-preview-program="1"/);
});
