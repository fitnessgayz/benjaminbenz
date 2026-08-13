# Deployment

## 1. Use a safe Supabase environment

Create a development branch or separate development project with synthetic client data. Do not connect the Supabase developer MCP server to production client records.

The MCP server reuses `client_programs`, `client_progress`, and `client_workout_logs`. Its migration adds `client_progress_notes`, `client_check_ins`, and `coach_requests`. Confirm the three additions are exposed to the Data API, their explicit `authenticated` grants are present, and RLS remains enabled.

Apply the schema during development and review the Supabase security and performance advisors. The website repository already contains the CLI-generated migration; do not apply the standalone schema separately in production.

```bash
supabase db reset
```

Use only synthetic client accounts during the branch test.

## 2. Enable Supabase OAuth 2.1

In Supabase Dashboard, open **Authentication → OAuth Server** and enable OAuth 2.1. Enable dynamic client registration for MCP-compatible clients.

Configure the authorization path as:

```text
https://benjaminbenz.com/oauth-consent.html
```

Deploy `web/oauth-consent.html` as `/oauth-consent.html` and `web/oauth-consent.js` as `/js/oauth-consent.js`. The page creates its browser client from the existing `window.FWB_SUPABASE_CONFIG` object.

Use an asymmetric Supabase JWT signing key such as RS256 or ES256 before enabling OpenID Connect ID tokens.

## 3. Deploy the MCP server

The production service is configured for Deno Deploy through `deno.json`. Deno installs the npm dependencies, runs the TypeScript build, and starts `dist/index.js` as a dynamic application. The included Docker image remains available for another HTTPS host if needed.

Create the Deno application from the `mcp-server` directory and configure:

```text
PORT=3000
PUBLIC_BASE_URL=https://mcp.benjaminbenz.com
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_AUTH_SERVER_URL=https://PROJECT_REF.supabase.co/auth/v1
ADDITIONAL_ALLOWED_HOSTS=benjamin-ai-coach.benjaminbenz.deno.net
```

Never set a Supabase service-role or secret key in this service. The publishable key plus each user's OAuth bearer token is intentional: database operations must remain subject to RLS.

Attach `mcp.benjaminbenz.com` as the Deno application's custom domain, add the exact DNS record Deno provides at the registrar, and wait for managed TLS to become active. Then verify:

```bash
curl https://mcp.benjaminbenz.com/health
curl https://mcp.benjaminbenz.com/.well-known/oauth-protected-resource
curl https://qukdfjeupjhpthfbaonv.supabase.co/.well-known/oauth-authorization-server/auth/v1
curl https://qukdfjeupjhpthfbaonv.supabase.co/auth/v1/.well-known/openid-configuration
curl -i https://mcp.benjaminbenz.com/mcp
```

Both Supabase discovery requests should return valid OAuth/OIDC metadata. The final MCP request should return `405` for GET. An unauthenticated POST should return `401` with a `WWW-Authenticate` resource-metadata link.

## 4. Production checks

- Test with two separate client accounts and verify neither can retrieve the other's rows.
- Test a coach account whose `app_metadata.role` is `coach`.
- Confirm ordinary chats create no database records.
- Confirm all three write tools require explicit user intent in representative conversations.
- Confirm `contact_benjamin` creates a visible admin-queue item and does not claim immediate delivery.
- Add alerting for server errors and unresolved urgent coach requests.
- Publish support, privacy, and terms pages before submission.
