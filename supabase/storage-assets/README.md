# Supabase media deployment

The production workflow uploads only files listed in `manifest.json`. Each
destination is immutable: deploying the same bytes again is a no-op, while
different bytes at an existing path fail the workflow. Use a new dated path or
filename when replacing approved media.

The GitHub `production` environment requires one encrypted repository secret:

- `SUPABASE_DEPLOY_TOKEN` — project-scoped personal access token with read
  access to Project Settings, API Keys, and API Key Secrets plus read-write
  access to Database and Migrations.

The workflow retrieves the dedicated `github_actions_production` server key
at runtime. It never stores the server key or production database password in
GitHub.

Never place these values in the repository, browser JavaScript, or either app.

To validate locally without credentials:

```sh
node scripts/supabase/deploy-media.mjs validate
```

Merges to `main` run the following sequence:

1. Validate the manifest and local asset checksums.
2. Upload missing media without overwriting an existing object.
3. Preview and apply only the migration files explicitly listed in the
   manifest's `migrations` array.
4. Download the public objects and compare their SHA-256 checksums.
5. Query `exercise_library` and confirm every declared media assignment.
