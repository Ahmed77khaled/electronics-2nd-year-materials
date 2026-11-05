# Supabase Resource Seeding

The resource importer loads the 7 course records and 75 resource records from
`data/resource-registry.json` into the Supabase database.

## Required migrations

Apply migrations 001 through 005 in order before using the portal. Seed data is provided by
`003_seed_courses_and_resources.sql`; the CLI is an alternative importer, not an additional
required migration.

## Credentials

Use a server-side **Secret API key** (`sb_secret_...`) from Supabase. The CLI also supports the
legacy JWT-based `service_role` key for compatibility. It explicitly rejects publishable keys,
legacy `anon` keys, and other non-elevated credentials.

New API keys are preferred:

- `SUPABASE_URL`: project URL.
- `SUPABASE_SECRET_KEY`: server-side Secret API key.

Legacy compatibility:

- `SUPABASE_SERVICE_ROLE_KEY`: legacy elevated key (use only while migrating to the new API keys).

Never use `SUPABASE_ANON_KEY` or a publishable key for the importer. Never store a secret key in
Git, `js/config.js`, HTML, or browser JavaScript. Do not pass secrets in command-line arguments;
the importer reads them only from environment variables.

## PowerShell example

```powershell
$env:SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co"
$env:SUPABASE_SECRET_KEY = "sb_secret_..."

# Validate the URL and key format without contacting Supabase or changing data.
node scripts/seed-supabase.js --validate-only

# Run the import.
node scripts/seed-supabase.js

# Remove the secret from this PowerShell process when finished.
Remove-Item Env:SUPABASE_SECRET_KEY
Remove-Item Env:SUPABASE_URL
```

For the legacy key, set `SUPABASE_SERVICE_ROLE_KEY` instead of
`SUPABASE_SECRET_KEY`.

The importer sends opaque `sb_secret_...` values in the `apikey` header only. It sends a Bearer
header only for legacy JWT `service_role` keys. Remote endpoints must use HTTPS; HTTP is permitted
only for localhost loopback development.

The CLI performs privileged writes and bypasses RLS. Run it only from a trusted developer machine
or controlled backend environment after verifying the target project URL.
