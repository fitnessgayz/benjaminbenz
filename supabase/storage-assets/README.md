# Supabase media deployment

The production workflow uploads only files listed in `manifest.json`. Each
destination is immutable: deploying the same bytes again is a no-op, while
different bytes at an existing path fail the workflow. Use a new dated path or
filename when replacing approved media.

The GitHub `production` environment requires these encrypted secrets:

- `SUPABASE_ACCESS_TOKEN` — scoped personal access token used by the CLI.
- `SUPABASE_DB_PASSWORD` — production Postgres password used by `db push`.
- `SUPABASE_SECRET_KEY` — dedicated server-side key used for Storage uploads
  and post-deploy database verification. The legacy
  `SUPABASE_SERVICE_ROLE_KEY` name is accepted as a fallback.

Never place these values in the repository, browser JavaScript, or either app.

To validate locally without credentials:

```sh
node scripts/supabase/deploy-media.mjs validate
```

Merges to `main` run the following sequence:

1. Validate the manifest and local asset checksums.
2. Upload missing media without overwriting an existing object.
3. Preview and apply pending Supabase migrations.
4. Download the public objects and compare their SHA-256 checksums.
5. Query `exercise_library` and confirm every declared media assignment.
