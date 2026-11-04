# Secure Tracking RPCs and Browser Session Lifecycle

This document describes the current browser-to-Supabase tracking contract.

## Migration order

Apply these files in order in a dedicated development/staging Supabase project:

1. `001_student_analytics_foundation.sql`
2. `002_secure_tracking_rpcs.sql`
3. `003_seed_courses_and_resources.sql`
4. `004_admin_analytics_views.sql`
5. `005_admin_analytics_authorization.sql`

Do not expose the admin analytics views until migration 005 has been applied.

## Browser integration

The static site uses the Supabase publishable/anon key only. Never put the service-role key in
`js/config.js`, HTML, JavaScript served to browsers, or Git.

The browser implementation is split across:

- `js/config.js`: public project URL and publishable/anon key placeholders.
- `js/supabase-client.js`: Auth client, UUID lookup, database-session ownership, and RPC wrapper.
- `js/tracker.js`: interaction events, idle/focus logic, session lifecycle, and heartbeat schedule.
- `data/resourceRegistry.js`: stable text resource keys used by the portal UI.

A signed-in Supabase Auth session is a prerequisite for identified student tracking. The tracker
does not invent identities for anonymous visitors. The Google OAuth sign-in UI/provider setup is
a separate prerequisite; these tracking modules do not create an OAuth login screen by themselves.

## Session lifecycle

1. A session is created on the first meaningful interaction while the page is visible and focused
   and the authenticated Supabase user is known.
2. `start_portal_session` creates the database session and its `session_started` event.
3. The database UUID returned by that RPC is the only session ID accepted by heartbeat/event RPCs.
   A browser-generated client correlation token is never used as `sessions.id`.
4. Concurrent start requests in one tab share one in-flight promise. The bridge also binds the
   active session to the authenticated user ID.
5. Heartbeats run approximately every 30 seconds only while the portal remains visible, focused,
   and recently active. The database caps credit at 45 seconds per heartbeat; a longer gap earns
   zero seconds.
6. On blur/hidden, the tracker stops credit immediately and best-effort ends the database session
   after allowing an in-flight click event to finish. A later interaction creates a new session.
7. Idle time longer than 45 seconds is not credited. The next interaction starts a fresh session
   baseline rather than carrying the idle gap forward.
8. `pagehide`/tab-close termination is best effort. Browsers can interrupt unload-time network
   requests, so a missing `ended_at` must not be interpreted as active time. Reporting should
   treat sessions with stale heartbeats as inactive.

Any future explicit logout UI must call `SupabaseBridge.endPortalSession()` before
`supabase.auth.signOut()`, while the user's access token is still available.

## RPC contract

### Start a session

The browser bridge calls:

```js
const sessionId = await SupabaseBridge.startPortalSession(window.location.pathname);
```

The database derives the owner from `auth.uid()`, creates the session, inserts
`session_started`, and updates the profile's last-active timestamp.

### Track an event

```js
await SupabaseBridge.trackPortalEvent({
  event_name: "resource_click",
  session_id: databaseSessionUuid,
  course_id: "oop-java",
  resource_id: "SUB_03_OOP_JAVA_MAT_LECTURE",
  page_path: window.location.pathname,
  properties: { resource_type: "drive", source: "resource_chip" }
});
```

The bridge resolves course slugs and resource keys to database UUIDs before calling
`track_portal_event`. The RPC independently verifies session ownership, active resource/course
relationships, event names, and the event-property allowlist.

Allowed event names:

- `page_view`
- `login_success`
- `course_click`
- `folder_link_clicked`
- `resource_click`
- `youtube_click`
- `search_used`
- `filter_changed`
- `return_to_portal`

Allowed property keys only:

- `resource_type`
- `filter_name`
- `result_count`
- `search_length`
- `source`

Do not send raw search text, email addresses, access tokens, or arbitrary page/query strings.
Query strings and fragments are stripped from stored page paths.

### Heartbeat and end

```js
await SupabaseBridge.heartbeatPortalSession(databaseSessionUuid);
await SupabaseBridge.endPortalSession(databaseSessionUuid);
```

The bridge refuses a heartbeat/end request unless the UUID is its current active database session
and belongs to the currently authenticated user.

## Administrative analytics

Migrations 004 and 005 create the aggregate analytics views. Migration 005 adds explicit
`public.is_admin()` predicates, `security_invoker`, and `security_barrier` to all four global
analytics views. Authenticated non-admin users receive no rows. Admin membership must be granted
manually by a trusted project owner; there is no first-user-is-admin behavior.

## Security properties and limitations

- Browser clients cannot directly INSERT/UPDATE/DELETE profiles, sessions, events, or admin roles.
- Tracking writes require authenticated RPCs; the database derives `user_id` from `auth.uid()`.
- A user can only write to their own active session.
- Event names and event-property keys are allowlisted.
- Resource-to-course consistency is validated in the database.
- Drive/YouTube time is not measured or credited as portal active time.
- Visibility, focus, and idle checks are best-effort client signals, not proof of human attention.
- Migrations and SQL role-simulation tests must be run in staging before production.
- The feature branch has not been applied to a Supabase project or deployed to GitHub Pages.
