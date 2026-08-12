# Benjamin AI Coach

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

```bash
cp .env.example .env
npm run check
npm run dev
```

The server is wired for the existing FWB Supabase data model. Validate its additive migration on a development branch with synthetic accounts before production.

## Launch order

1. Follow [DEPLOYMENT.md](docs/DEPLOYMENT.md).
2. Review and publish the pages in `public/` on Benjaminbenz.com.
3. Add `web/oauth-consent.html` and `web/oauth-consent.js` to the website and enable the Supabase OAuth server.
4. Deploy this server at `https://mcp.benjaminbenz.com`.
5. Complete [SUBMISSION.md](docs/SUBMISSION.md) and submit through the OpenAI plugin portal.
