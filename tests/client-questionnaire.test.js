const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.resolve(__dirname, "..");
const dashboardHtml = fs.readFileSync(path.join(projectRoot, "client-dashboard.html"), "utf8");
const portalSource = fs.readFileSync(path.join(projectRoot, "js/client-portal.js"), "utf8");
const styleSource = fs.readFileSync(path.join(projectRoot, "css/style.css"), "utf8");

function sourceForFunction(name) {
  const start = portalSource.indexOf(`function ${name}(`);
  const end = portalSource.indexOf("\nfunction ", start + 1);

  assert.ok(start >= 0, `Expected ${name} to exist`);
  return portalSource.slice(start, end >= 0 ? end : undefined);
}

function questionnairePanelMarkup() {
  const marker = 'data-client-dashboard-panel="questionnaire"';
  const markerIndex = dashboardHtml.indexOf(marker);
  const start = dashboardHtml.lastIndexOf("<section", markerIndex);
  const end = dashboardHtml.indexOf("</section>", markerIndex);

  assert.ok(markerIndex >= 0, "Expected the questionnaire dashboard panel");
  assert.ok(start >= 0 && end > start, "Expected a complete questionnaire panel");
  return dashboardHtml.slice(start, end + "</section>".length);
}

test("provides an accessible questionnaire panel without exposing the shared response sheet", () => {
  const panel = questionnairePanelMarkup();

  assert.match(panel, /class="[^"]*client-questionnaire-panel[^"]*"/);
  assert.match(panel, /aria-labelledby="client-questionnaire-title"/);
  assert.match(panel, /id="client-questionnaire-title"[^>]*>Fitness questionnaire</);
  assert.match(panel, /id="client-questionnaire-status"[^>]*role="status"/);
  assert.match(panel, /id="client-questionnaire-record"[^>]*aria-live="polite"[^>]*aria-busy="true"/);
  assert.doesNotMatch(panel, /docs\.google\.com|drive\.google\.com|script\.google\.com/i);
});

test("renders questionnaire values as text and supports safe empty, loading, and error states", () => {
  const renderer = sourceForFunction("renderClientQuestionnaire");
  const stateFactory = sourceForFunction("questionnaireStateElement");

  assert.match(renderer, /container\.replaceChildren\(\)/);
  assert.match(renderer, /name\.textContent\s*=/);
  assert.match(renderer, /email\.textContent\s*=/);
  assert.match(renderer, /questionText\.textContent\s*=/);
  assert.match(renderer, /response\.textContent\s*=/);
  assert.doesNotMatch(renderer, /\.innerHTML\s*=/);
  assert.match(renderer, /client-questionnaire-loading/);
  assert.match(renderer, /client-questionnaire-error/);
  assert.match(renderer, /client-questionnaire-empty/);
  assert.match(stateFactory, /link\.href\s*=\s*"questionnaire\.html\?return=client"/);
  assert.doesNotMatch(`${renderer}\n${stateFactory}`, /docs\.google\.com|drive\.google\.com|script\.google\.com/i);
});

test("keeps identity fields out of the answer list and safely formats arbitrary response values", () => {
  const grouping = sourceForFunction("questionnaireDisplayGroups");
  const answerText = sourceForFunction("questionnaireAnswerText");

  assert.match(grouping, /const ignoredKeys = new Set\(\[/);
  assert.match(grouping, /"email"/);
  assert.match(grouping, /"name"/);
  assert.match(grouping, /"respondentemail"/);
  assert.match(grouping, /"respondentname"/);
  assert.match(answerText, /Array\.isArray\(value\)/);
  assert.match(answerText, /JSON\.stringify\(value\)/);
  assert.match(answerText, /return String\(value\)\.trim\(\)/);
});

test("loads only the newest matched questionnaire through the RLS-protected table", () => {
  const marker = '.from("client_fitness_questionnaires")';
  const start = portalSource.indexOf(marker);
  const end = portalSource.indexOf("const [progressResult", start);
  const query = portalSource.slice(start, end);

  assert.ok(start >= 0, "Expected the questionnaire Supabase query");
  assert.ok(end > start, "Expected the questionnaire query to end before dashboard requests");
  assert.match(query, /\.select\("id,respondent_email,respondent_name,submitted_at,answers,linked_client_email,match_status,profile_imported_at"\)/);
  assert.match(query, /\.eq\("match_status",\s*"matched"\)/);
  assert.match(query, /\.order\("submitted_at",\s*\{\s*ascending:\s*false\s*\}\)/);
  assert.match(query, /\.limit\(1\)/);
  assert.match(query, /isCoachDashboardPreview[\s\S]*?\.ilike\("linked_client_email",\s*targetClientEmail\)/);
  assert.match(query, /\.eq\("linked_user_id",\s*user\.id\)/);
  assert.doesNotMatch(query, /\.select\("\*"\)|source_(?:sheet|drive)_url/i);
});

test("keeps long questionnaire responses contained and readable on mobile", () => {
  assert.match(styleSource, /\.client-questionnaire-question,[\s\S]*?\.client-questionnaire-response\s*\{[^}]*min-width:\s*0[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(styleSource, /\.client-questionnaire-response\s*\{[^}]*white-space:\s*pre-wrap/s);
  assert.match(styleSource, /\.client-questionnaire-groups\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s);
  assert.match(styleSource, /@media \(max-width:\s*700px\)[\s\S]*?\.client-questionnaire-groups\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
});
