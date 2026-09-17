const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.resolve(__dirname, "..");
const adminHtml = fs.readFileSync(path.join(projectRoot, "coach-admin.html"), "utf8");
const adminSource = fs.readFileSync(path.join(projectRoot, "js/coach-admin.js"), "utf8");
const styleSource = fs.readFileSync(path.join(projectRoot, "css/style.css"), "utf8");

function sourceForFunction(name, nextName) {
  const start = adminSource.indexOf(`function ${name}`);
  const end = nextName ? adminSource.indexOf(`function ${nextName}`, start + 1) : adminSource.length;

  assert.ok(start >= 0, `${name} should exist`);
  return adminSource.slice(start, end > start ? end : adminSource.length);
}

test("keeps the client selector separate from the new-client invite form", () => {
  const clientPanelStart = adminHtml.indexOf('data-admin-panel="clients"');
  const clientPanelEnd = adminHtml.indexOf('data-admin-panel="profile"', clientPanelStart);
  const clientPanel = adminHtml.slice(clientPanelStart, clientPanelEnd);

  assert.match(clientPanel, /Client selector/);
  assert.match(clientPanel, /client-search-input/);
  assert.match(clientPanel, /client-select/);
  assert.doesNotMatch(clientPanel, /name="client_email"/);
  assert.doesNotMatch(clientPanel, /id="send-invite-button"/);
});

test("opens a top-level accessible invite modal with save and send choices", () => {
  const homeStart = adminHtml.indexOf('data-admin-panel="home"');
  const homeEnd = adminHtml.indexOf('data-admin-client-context', homeStart);
  const homePanel = adminHtml.slice(homeStart, homeEnd);

  assert.match(homePanel, /id="new-client-button"[^>]*>Invite new client</);
  assert.match(adminHtml, /id="invite-client-modal"[\s\S]*?role="dialog"[\s\S]*?aria-modal="true"[\s\S]*?aria-labelledby="invite-client-title"/);
  const modalStart = adminHtml.indexOf('id="invite-client-modal"');
  const modalEnd = adminHtml.indexOf("</form>", modalStart);
  const modalMarkup = adminHtml.slice(modalStart, modalEnd);

  assert.match(modalMarkup, /name="invite_client_email"[\s\S]*?name="invite_client_name"[\s\S]*?name="invite_client_phone"/);
  assert.match(adminHtml, /id="save-client-button">Save without invite</);
  assert.match(adminHtml, /id="send-invite-button">Save &amp; send invite</);
  assert.ok((adminHtml.match(/data-close-invite-client/g) || []).length >= 2);
});

test("opening and canceling an invite leaves the selected client intact", () => {
  const openSource = sourceForFunction("openInviteClientModal", "handleNewClient");
  const closeSource = sourceForFunction("closeInviteClientModal", "openInviteClientModal");
  const handlerSource = sourceForFunction("handleNewClient", "handleStartNewProgram");

  assert.match(openSource, /form\.elements\.invite_client_email\.value = ""/);
  assert.match(openSource, /emailInput\?\.focus/);
  assert.doesNotMatch(openSource, /fillForm\(/);
  assert.doesNotMatch(openSource, /selectedProgramId\s*=/);
  assert.doesNotMatch(closeSource, /fillForm\(/);
  assert.match(closeSource, /returnFocus\?\.focus/);
  assert.match(handlerSource, /event\.target === modal/);
  assert.match(handlerSource, /event\.key === "Escape"/);
  assert.match(handlerSource, /event\.key !== "Tab"/);
});

test("successful save or invite closes the modal without reverting the new client", () => {
  assert.match(adminSource, /adminStatus\("Client saved\."\);\s*closeInviteClientModal\(\{ completed: true \}\)/);
  assert.match(adminSource, /adminStatus\(successMessage\);\s*closeInviteClientModal\(\{ completed: true \}\)/);
  assert.match(adminSource, /document\.querySelectorAll\("\[data-close-invite-client\]"\)[\s\S]*?button\.disabled = isBusy/);
});

test("creates a clean starter program from only the invite fields", () => {
  const payloadSource = sourceForFunction("newClientProgramFromInvite", "profileFromForm");
  const saveSource = sourceForFunction("saveNewClientFromInvite", "saveTrainingBlockFromForm");

  assert.match(payloadSource, /formValue\(form, "invite_client_email"\)/);
  assert.match(payloadSource, /formValue\(form, "invite_client_name"\)/);
  assert.match(payloadSource, /formValue\(form, "invite_client_phone"\)/);
  assert.match(payloadSource, /program_title:\s*"Client Program"/);
  assert.match(payloadSource, /workouts:\s*\[\{/);
  assert.match(saveSource, /saveClientProgramWithCoachAccess\(payload\)/);
  assert.match(saveSource, /selectedProgramId = data\.id/);
  assert.match(saveSource, /fillForm\(data\)/);
  assert.match(saveSource, /form\.elements\.invite_client_email\.value = data\.client_email \|\| payload\.client_email/);
});

test("invite modal is mobile-safe and stays above the coach navigation", () => {
  assert.match(styleSource, /\.invite-client-modal\s*\{[\s\S]*?z-index:\s*100[\s\S]*?place-items:\s*center/);
  assert.match(styleSource, /\.invite-client-dialog\s*\{[\s\S]*?max-height:\s*min\(760px, calc\(100dvh - 36px\)\)[\s\S]*?overflow-y:\s*auto/);
  assert.match(styleSource, /@media \(max-width: 520px\)[\s\S]*?\.invite-client-modal\s*\{[\s\S]*?align-items:\s*end/);
  assert.match(styleSource, /\.invite-client-dialog\s*\{[\s\S]*?width:\s*calc\(100vw - 16px\)[\s\S]*?max-width:\s*calc\(100vw - 16px\)/);
  assert.match(styleSource, /\.invite-client-fields\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
});
