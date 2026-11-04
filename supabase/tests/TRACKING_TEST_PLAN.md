# Supabase Tracking Test Plan

Run this plan against a disposable development Supabase project after applying migrations 001, 002, and 003 in order. Do not use real student accounts or production data.

## Test accounts

Create two ordinary authenticated test users:
- Student A
- Student B

Create one admin test user by running the documented manual admin bootstrap SQL after that user has signed in once.

## Authentication and ownership

| Test | Action | Expected result |
|---|---|---|
| Unauthenticated session start | Call `start_portal_session` without a valid access token | Rejected |
| Student A starts session | Call `start_portal_session` | Returns a session UUID owned by A |
| Student A tracks own event | Call `track_portal_event` with A's session | Event is inserted for A |
| Student A uses B's session | Call `track_portal_event` with B's session UUID | Rejected |
| Student A ends own session | Call `end_portal_session` | Returns true and closes session |
| Student A ends same session again | Repeat the call | Returns false; no duplicate end event |
| Student B reads A's profile | Query `profiles` as B | A's row is not returned |
| Student B reads A's events | Query `activity_events` as B | A's rows are not returned |
| Student B reads A's sessions | Query `sessions` as B | A's rows are not returned |
| Student cannot grant admin | Attempt client INSERT/UPDATE on `admin_users` | Permission denied |

## Event validation

| Test | Input | Expected result |
|---|---|---|
| Valid event | `resource_click` | Accepted |
| Unknown event | `student_exported_all_data` | Rejected |
| Null event name | null | Rejected |
| Unknown property key | `{ "email": "..." }` | Rejected |
| Oversized properties | JSON larger than 512 bytes | Rejected |
| Query string in page path | `/index.html?email=...` | Stored path excludes query string |
| Mismatched resource/course | Resource from course X with course Y | Rejected |
| Inactive resource | Resource with `is_active=false` | Rejected |

## Session timing

1. Start a session.
2. Wait about 30 seconds and call heartbeat: expect approximately 30 credited seconds.
3. Wait more than 45 seconds without heartbeat and call again: expect 0 credited seconds for that long gap.
4. Call another heartbeat about 30 seconds later: expect approximately 30 credited seconds.
5. End the session and verify `ended_at` is populated.

The browser client must call heartbeat only while the tab is visible, focused, and the idle detector says the user is active. Server-side caps reduce accidental inflation but cannot prove human attention.

## Dashboard views

As an admin user, query:
- `admin_student_summary`
- `admin_course_analytics`
- `admin_resource_analytics`
- `admin_daily_activity`
- `admin_overview_metrics`

Confirm the views return expected totals for seeded test data.

As an ordinary student, query the same views and confirm underlying RLS limits results to that student's own records. Do not treat aggregate view names as a substitute for verifying actual RLS behavior.

## Before production

- Run all tests with two separate student accounts and one admin.
- Verify only the Supabase publishable/anon key is present in browser code.
- Verify no service-role key, OAuth client secret, or private token is shipped to GitHub Pages.
- Verify raw search terms and URL query strings are not stored.
- Verify the resource registry importer is repeatable and does not duplicate rows.
- Verify existing Drive and YouTube links still open unchanged.
- Confirm the applicable privacy and provider requirements before enabling production tracking.

## Current limitation

These are test instructions, not evidence that the migrations have been executed against a live Supabase project. Actual database tests require project credentials and a development project.
