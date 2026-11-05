# Admin user deletion Edge Function

The admin user-details screen calls `admin-delete-user` through `supabase.functions.invoke`.

## Deploy

From the repository root, authenticate and link the Supabase CLI to the existing project:

```bash
npx supabase login
npx supabase link --project-ref qgcabhbwlzalvfqpdzfl
npx supabase functions deploy admin-delete-user --project-ref qgcabhbwlzalvfqpdzfl
```

The function requires the project's server-side Supabase secret key. Supabase injects the legacy
`SUPABASE_SERVICE_ROLE_KEY` or the named `SUPABASE_SECRET_KEYS.default` secret into Edge Functions.
Do not put either key in `js/config.js`, the website, GitHub Pages, or any browser code.

JWT verification is kept enabled by `supabase/config.toml`. The function also validates the caller
with Supabase Auth and checks the caller's row in `public.admin_users` before deletion.

## Behaviour and safeguards

- Only an authenticated administrator can call the function.
- The current administrator account cannot delete itself.
- No administrator account can be deleted from this UI.
- Student Auth users are permanently deleted with `auth.admin.deleteUser(..., false)`.
- Existing foreign keys cascade to the student's profile, sessions, and activity events. Courses,
  resources, resource links, and other student accounts are not touched.
- If the Auth user owns Supabase Storage objects, Supabase may reject deletion until those objects
  are reassigned or removed.
