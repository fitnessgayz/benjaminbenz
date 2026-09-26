const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { stripTypeScriptTypes } = require("node:module");

const source = fs.readFileSync(path.join(__dirname, "../supabase/functions/invite-client/index.ts"), "utf8");
const executable = stripTypeScriptTypes(source.replace(/^import .+;\n/gm, ""));
const inviteUrl = "https://test.supabase.co/auth/v1/verify?token=test-invite-token&type=invite";

function fixture(options = {}) {
  const calls = { auth: 0, invite: [], link: [] };
  const env = {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_ANON_KEY: "test-anon",
    SUPABASE_SERVICE_ROLE_KEY: "test-service",
    COACH_ADMIN_EMAILS: "coach@example.com"
  };
  let handler;
  const context = vm.createContext({
    Request, Response, URL,
    Deno: { env: { get: (name) => env[name] } },
    serve: (requestHandler) => { handler = requestHandler; },
    createClient: (_url, key) => key === env.SUPABASE_ANON_KEY ? {
      auth: { getUser: async () => {
        calls.auth++;
        return options.authResult ?? { data: { user: { email: "coach@example.com" } }, error: null };
      } }
    } : {
      auth: { admin: {
        inviteUserByEmail: async (email, inviteOptions) => {
          calls.invite.push({ email, options: inviteOptions });
          return options.inviteResult ?? { data: { user: { email } }, error: null };
        },
        generateLink: async (args) => {
          calls.link.push(args);
          return options.linkResult ?? {
            data: { user: { email: args.email }, properties: { action_link: inviteUrl } }, error: null
          };
        }
      } }
    }
  });
  vm.runInContext(executable, context);

  async function invoke(body = {}, headers = {}) {
    const response = await handler(new Request("https://test.supabase.co/functions/v1/invite-client", {
      method: "POST",
      headers: { Authorization: "Bearer test-coach-token", "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ email: "client@example.com", ...body })
    }));
    return { status: response.status, body: await response.json(), headers: response.headers };
  }

  return { calls, invoke };
}

test("only a verified coach can generate or send invitations", async () => {
  const missingToken = fixture();
  assert.equal((await missingToken.invoke({ delivery: "link" }, { Authorization: "" })).status, 401);
  assert.equal(missingToken.calls.auth, 0);
  assert.equal(missingToken.calls.link.length, 0);
  assert.equal(missingToken.calls.invite.length, 0);

  for (const [authResult, status] of [
    [{ data: { user: null }, error: { message: "Invalid token" } }, 401],
    [{ data: { user: { email: "client@example.com" } }, error: null }, 403]
  ]) {
    for (const delivery of ["email", "link"]) {
      const h = fixture({ authResult });
      assert.equal((await h.invoke({ delivery })).status, status);
      assert.equal(h.calls.link.length, 0);
      assert.equal(h.calls.invite.length, 0);
    }
  }
});

test("invalid delivery modes and email addresses never create or send invitations", async () => {
  const h = fixture();
  for (const delivery of ["sms", "", null, false, {}, []]) {
    assert.equal((await h.invoke({ delivery })).status, 400);
  }
  for (const email of ["", "not-an-email", "client@", "client@example com"]) {
    assert.equal((await h.invoke({ delivery: "link", email })).status, 400);
  }
  assert.equal(h.calls.link.length, 0);
  assert.equal(h.calls.invite.length, 0);
});

test("link delivery returns a verified invitation without sending email", async () => {
  const h = fixture();
  const result = await h.invoke({
    delivery: "link", email: " CLIENT@Example.com ", clientName: " Client Name ",
    redirectTo: "https://benjaminbenz.com/client-invite.html?flow=account-setup"
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    email: "client@example.com", manualInviteUrl: inviteUrl, message: "Invite link ready for client@example.com."
  });
  assert.equal(result.headers.get("Cache-Control"), "no-store");
  assert.equal(h.calls.invite.length, 0);
  assert.equal(h.calls.link.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.link[0])), {
    type: "invite", email: "client@example.com",
    options: {
      redirectTo: "https://benjaminbenz.com/client-invite.html?flow=account-setup",
      data: { email: "client@example.com", client_email: "client@example.com", client_name: "Client Name" }
    }
  });
});

test("link delivery keeps invitation redirects on the allowed setup page", async () => {
  for (const redirectTo of ["https://attacker.example/client-invite.html", "https://benjaminbenz.com/other-page", "invalid"]) {
    const h = fixture();
    assert.equal((await h.invoke({ delivery: "link", redirectTo })).status, 200);
    assert.equal(h.calls.link[0].options.redirectTo, "https://benjaminbenz.com/client-invite.html");
  }
});

test("link delivery never returns a link for an unconfirmed or mismatched email", async () => {
  for (const user of [{ email: "different@example.com" }, { email: "" }, {}, null]) {
    const h = fixture({ linkResult: { data: { user, properties: { action_link: inviteUrl } }, error: null } });
    const result = await h.invoke({ delivery: "link" });
    assert.equal(result.status, 502);
    assert.equal(result.body.manualInviteUrl, undefined);
    assert.equal(result.body.email, undefined);
    assert.equal(h.calls.invite.length, 0);
  }
});

test("link delivery fails closed when the provider omits a usable link", async () => {
  for (const data of [null, { user: { email: "client@example.com" } },
    ...["", "   ", null, 42].map((action_link) => ({ user: { email: "client@example.com" }, properties: { action_link } }))]) {
    const h = fixture({ linkResult: { data, error: null } });
    const result = await h.invoke({ delivery: "link" });
    assert.equal(result.status, 502);
    assert.equal(result.body.manualInviteUrl, undefined);
    assert.equal(h.calls.invite.length, 0);
  }
  const h = fixture({ linkResult: { data: null, error: { message: "Link generation failed" } } });
  const result = await h.invoke({ delivery: "link" });
  assert.equal(result.status, 400);
  assert.equal(result.body.error, "Link generation failed");
  assert.equal(result.body.manualInviteUrl, undefined);
  assert.equal(h.calls.invite.length, 0);
});

test("omitted or explicit email delivery preserves the existing email invitation", async () => {
  for (const body of [{}, { delivery: "email" }]) {
    const h = fixture();
    const result = await h.invoke(body);
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { message: "Invite sent to client@example.com.", email: "client@example.com" });
    assert.equal(h.calls.invite.length, 1);
    assert.equal(h.calls.link.length, 0);
    assert.equal(h.calls.invite[0].options.redirectTo, "https://benjaminbenz.com/client-invite.html");
  }
});

test("failed email delivery still returns its existing manual link fallback", async () => {
  const h = fixture({ inviteResult: { data: null, error: { message: "Email delivery unavailable" } } });
  const result = await h.invoke();
  assert.equal(result.status, 400);
  assert.deepEqual(result.body, { error: "Email delivery unavailable", manualInviteUrl: inviteUrl });
  assert.equal(h.calls.invite.length, 1);
  assert.equal(h.calls.link.length, 1);
});
