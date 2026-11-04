# Secure Tracking RPCs

Migration: `002_secure_tracking_rpcs.sql`

Apply this migration **after** `001_student_analytics_foundation.sql`.

## Why this migration exists

The initial schema allowed authenticated browser clients to insert activity rows and update their own session rows directly. That is too permissive for production tracking: a modified browser could forge event names or inflate active-time counters.

This migration removes those direct write policies and exposes narrowly scoped Postgres RPCs instead. Each function binds writes to `auth.uid()` and checks session ownership.

## Browser call contract

After Google sign-in has completed and a valid Supabase session exists:

### Start a session

```js
const { data: sessionId, error } = await supabase.rpc(
  "start_portal_session",
  { p_entry_path: window.location.pathname }
);
```

The function creates the session, records `session_started`, and updates the profile's last-active timestamp.

### Track an event

```js
const { data: eventId, error } = await supabase.rpc(
  "track_portal_event",
  {
    p_session_id: sessionId,
    p_event_name: "resource_click",
    p_course_id: courseUuid,
    p_resource_id: resourceUuid,
    p_page_path: window.location.pathname,
    p_properties: { resource_type: "drive", source: "resource_link" }
  }
);
```

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

Do not send raw search text, email addresses, access tokens, or arbitrary page/query strings. Query strings and fragments are stripped from stored page paths.

For a resource event, the database verifies that the resource exists, is active, and belongs to the supplied course. The database derives the course from the resource if no course ID is supplied.

### Heartbeat

```js
const { data: creditedSeconds, error } = await supabase.rpc(
  "heartbeat_portal_session",
  { p_session_id: sessionId }
);
```

Call approximately every 30 seconds, and only while the tab is visible, focused, and the user has not been idle. The database measures the interval since the previous heartbeat and credits at most 45 seconds. If more than 45 seconds elapsed, the gap earns zero seconds. This reduces accidental time inflation after sleep, backgrounding, or network pauses; it does not prove a human was actively reading.

### End a session

```js
const { data: ended, error } = await supabase.rpc(
  "end_portal_session",
  { p_session_id: sessionId }
);
```

Call on logout and best-effort on `pagehide`/tab close. A browser close event is not guaranteed to run, so stale sessions should also be treated as ended after a suitable timeout in reporting.

## Security properties

- All RPCs require an authenticated Supabase user.
- A user can only write events to their own active session.
- A user cannot submit another user's ID; the database derives it from `auth.uid()`.
- Direct browser INSERT/UPDATE/DELETE privileges are revoked for profiles, sessions, events, and admin roles.
- Admin membership remains a trusted SQL-side operation.
- Event names and event property keys are allowlisted.
- Resource-to-course consistency is validated in the database.

## Important limitations

- Heartbeats are a best-effort estimate based on browser visibility/focus/idle logic. They are not proof of attention.
- Do not count time spent on Google Drive or YouTube as portal active time.
- The static site must still use only the Supabase publishable/anon key. Never expose the service-role key.
- Apply migrations to a development Supabase project first and test with two separate student accounts before production.
- This migration has been committed to a feature branch only. It has not been applied to a Supabase project or deployed to GitHub Pages.
