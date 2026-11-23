const statusElement = document.querySelector("#status");
const approveButton = document.querySelector("#approve");
const denyButton = document.querySelector("#deny");
const clientNameElement = document.querySelector("#client-name");
const consentTitleElement = document.querySelector("#consent-title");
const consentDisclaimerElement = document.querySelector("#consent-disclaimer");
const scopesElement = document.querySelector("#requested-scopes");
const requestedActionsElement = document.querySelector("#requested-actions");
const authorizationId = new URLSearchParams(window.location.search).get("authorization_id");
const config = window.FWB_SUPABASE_CONFIG || {};
const supabaseClient = config.url && config.anonKey && window.supabase
  ? window.supabase.createClient(config.url, config.anonKey)
  : null;

function showStatus(message) {
  statusElement.textContent = message;
}

function disableActions(disabled = true) {
  approveButton.disabled = disabled;
  denyButton.disabled = disabled;
}

async function initialize() {
  if (!supabaseClient || !authorizationId) {
    showStatus("This authorization request is invalid or the site login is unavailable.");
    disableActions();
    return;
  }

  const { data: userData, error: userError } = await supabaseClient.auth.getUser();
  if (userError || !userData.user) {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    window.location.assign(`/client-login.html?return_to=${encodeURIComponent(returnTo)}`);
    return;
  }

  const { data, error } = await supabaseClient.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !data) {
    showStatus(error?.message || "This authorization request is no longer valid.");
    disableActions();
    return;
  }

  if (!("authorization_id" in data) && data.redirect_url) {
    window.location.assign(data.redirect_url);
    return;
  }

  const { data: isGruntr, error: resourceError } = await supabaseClient.rpc("is_gruntr_oauth_authorization", {
    p_authorization_id: data.authorization_id,
  });
  if (resourceError) {
    showStatus("Could not verify which connection is requesting access. Try reconnecting.");
    disableActions();
    return;
  }

  if (isGruntr) {
    document.title = "Connect GRUNTR to ChatGPT";
    consentTitleElement.textContent = "Connect GRUNTR to ChatGPT?";
    clientNameElement.textContent = `${data.client?.name || "The app"} is requesting access to your GRUNTR workout account.`;
    requestedActionsElement.replaceChildren();
    for (const action of [
      "Confirm your connected GRUNTR account and read your workout history, training program, and recent training check-ins.",
      "Save sets and completed workouts to your Logs when you ask.",
      "Prepare routine previews for your approval in GRUNTR.",
    ]) {
      const item = document.createElement("li");
      item.textContent = action;
      requestedActionsElement.append(item);
    }
    consentDisclaimerElement.textContent = "ChatGPT provides exercise guidance. Contact your coach for coaching or emergency services for urgent help.";
  } else if (data.client?.name) {
    clientNameElement.textContent = `${data.client.name} is requesting access to your coaching account.`;
  }
  if (data.scope?.trim()) {
    scopesElement.hidden = false;
    scopesElement.textContent = `Requested account permissions: ${data.scope.split(" ").join(", ")}.`;
  }
}

async function decide(approved) {
  if (!supabaseClient || !authorizationId) return;
  disableActions();
  showStatus(approved ? "Connecting…" : "Cancelling…");

  const action = approved
    ? supabaseClient.auth.oauth.approveAuthorization(authorizationId)
    : supabaseClient.auth.oauth.denyAuthorization(authorizationId);
  const { data, error } = await action;
  if (error || !data?.redirect_url) {
    showStatus(error?.message ?? "Authorization could not be completed.");
    disableActions(false);
    return;
  }
  window.location.assign(data.redirect_url);
}

approveButton.addEventListener("click", () => void decide(true));
denyButton.addEventListener("click", () => void decide(false));
void initialize();
