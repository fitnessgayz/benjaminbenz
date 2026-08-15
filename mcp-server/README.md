# FWB Coach

Production-oriented MVP for an authenticated ChatGPT plugin that lets Fitness with Benjamin clients discuss their program and progress, save explicit check-ins, and queue human follow-up.

## What is included

- Streamable HTTP MCP server with seven narrowly scoped tools.
- Supabase OAuth token verification without a service-role key.
- Compatibility with the live Benjaminbenz.com portal tables plus additive RLS-protected check-in, progress-note, and coach-request tables.
- `coach-with-benjamin` skill for voice, workflow, privacy, and safety boundaries.
- OAuth consent page to add to Benjaminbenz.com.
- Public policy-page drafts and plugin submission materials.
- Unit and MCP integration tests.

The server deliberately does not store full ChatGPT conversations. It writes only an explicit structured check-in, progress note, or coach request.

## Local verification

Docker Desktop must be installed and running. From this `mcp-server` directory:

```bash
cp .env.example .env
npm run supabase:start
npm run test:db
npm run check
npm run dev
```

`npm run supabase:start` excludes the unused Edge Functions runtime and starts a free local Supabase environment. The local bootstrap and seed files contain only synthetic `example.test` clients; they never copy production rows. `npm run test:db` runs 15 database and RLS assertions covering client isolation, allowed writes, blocked impersonation, and coach access.

When finished, stop the local services without deleting the local database:

```bash
npm run supabase:stop
```

The server is wired for the existing FWB Supabase data model. Validate the additive migration locally before any production deployment.

## Launch order

1. Follow [DEPLOYMENT.md](docs/DEPLOYMENT.md).
2. Review and publish the pages in `public/` on Benjaminbenz.com.
3. Add `web/oauth-consent.html` and `web/oauth-consent.js` to the website and enable the Supabase OAuth server.
4. Deploy this server at `https://mcp.benjaminbenz.com`.
5. Complete [SUBMISSION.md](docs/SUBMISSION.md) and submit through the OpenAI plugin portal.
