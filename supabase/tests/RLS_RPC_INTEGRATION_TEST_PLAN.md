# Supabase RLS / RPC Integration Test Plan

These tests are intended for a **dedicated Supabase staging project**, after applying migrations
001 through 005 in order and seeding the 7 course rows / 75 resources. They have not been run
against the live project.

## Preconditions

1. Create two disposable authenticated users through Supabase Auth (Student 1 and Student 2).
   Do not insert incomplete rows into `auth.users` manually.
2. Sign in each user at least once so the `auth.users` trigger creates their `public.profiles` row.
3. Create a third disposable authenticated user for the Admin test.
4. As the trusted database owner, manually promote only that third user:
   ```sql
   insert into public.admin_users (user_id, role)
   values ('<ADMIN_USER_UUID>', 'admin')
   on conflict (user_id) do update set role = excluded.role;
   ```
5. Replace the UUID placeholders in each test block with the real UUIDs from Supabase Auth.
6. Run each test block separately in SQL Editor. Every block uses its own transaction and ends
   with `ROLLBACK`, so test sessions/events are discarded.

> SQL Editor role/claim simulation verifies PostgreSQL grants, RLS, and the `auth.uid()`-based
> policies. It is not a substitute for testing the real Google OAuth redirect and browser JWT flow.

## Migration order

1. `001_student_analytics_foundation.sql`
2. `002_secure_tracking_rpcs.sql`
3. `003_seed_courses_and_resources.sql`
4. `004_admin_analytics_views.sql`
5. `005_admin_analytics_authorization.sql`

Do not release the analytics views before migration 005 is applied.

## Test 1 — Anonymous visitor

Expected: active courses/resources remain publicly readable; tracking RPCs and table writes are denied.

```sql
begin;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select count(*) as active_resources
from public.resources
where is_active = true;
-- Expected after seed: 75.

do $$
declare
  v_blocked boolean := false;
begin
  begin
    perform public.start_portal_session('/');
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'FAIL: anon unexpectedly executed start_portal_session';
  end if;
end $$;

rollback;
```

## Test 2 — Student isolation, session ownership, and administrative denial

Replace both student UUIDs. Both users must already exist in Auth and have profile rows.

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '<STUDENT_1_UUID>', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"<STUDENT_1_UUID>","role":"authenticated"}',
  true
);

do $$
declare
  v_session_1 uuid;
  v_session_2 uuid;
  v_count bigint;
  v_blocked boolean;
begin
  if auth.uid() <> '<STUDENT_1_UUID>'::uuid then
    raise exception 'FAIL: Student 1 JWT claim was not applied';
  end if;

  v_session_1 := public.start_portal_session('/rls-test');
  if v_session_1 is null then
    raise exception 'FAIL: Student 1 could not start a session';
  end if;

  perform public.track_portal_event(
    p_session_id => v_session_1,
    p_event_name => 'resource_click',
    p_course_id => null,
    p_resource_id => null,
    p_page_path => '/rls-test',
    p_properties => '{"resource_type":"drive","source":"integration_test"}'::jsonb
  );

  -- Direct table writes must be denied even for the row owner.
  v_blocked := false;
  begin
    insert into public.activity_events (user_id, event_name)
    values ('<STUDENT_1_UUID>'::uuid, 'resource_click');
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'FAIL: Student directly inserted an activity event';
  end if;

  -- Switch the simulated JWT to Student 2 within this same transaction.
  perform set_config('request.jwt.claim.sub', '<STUDENT_2_UUID>', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    '{"sub":"<STUDENT_2_UUID>","role":"authenticated"}',
    true
  );

  if auth.uid() <> '<STUDENT_2_UUID>'::uuid then
    raise exception 'FAIL: Student 2 JWT claim was not applied';
  end if;

  v_session_2 := public.start_portal_session('/rls-test-student-2');
  if v_session_2 is null then
    raise exception 'FAIL: Student 2 could not start their own session';
  end if;

  select count(*) into v_count
  from public.activity_events
  where user_id = '<STUDENT_1_UUID>'::uuid;
  if v_count <> 0 then
    raise exception 'FAIL: Student 2 can read Student 1 events';
  end if;

  select count(*) into v_count
  from public.profiles
  where id = '<STUDENT_1_UUID>'::uuid;
  if v_count <> 0 then
    raise exception 'FAIL: Student 2 can read Student 1 profile';
  end if;

  -- Student 2 cannot use Student 1's database session.
  v_blocked := false;
  begin
    perform public.track_portal_event(
      p_session_id => v_session_1,
      p_event_name => 'resource_click',
      p_page_path => '/rls-test',
      p_properties => '{}'::jsonb
    );
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'FAIL: Student 2 wrote to Student 1 session';
  end if;

  -- All four global analytics views must return no rows to a student.
  if exists (select 1 from public.admin_course_analytics) then
    raise exception 'FAIL: Student can read admin_course_analytics';
  end if;
  if exists (select 1 from public.admin_resource_analytics) then
    raise exception 'FAIL: Student can read admin_resource_analytics';
  end if;
  if exists (select 1 from public.admin_daily_activity) then
    raise exception 'FAIL: Student can read admin_daily_activity';
  end if;
  if exists (select 1 from public.admin_overview_metrics) then
    raise exception 'FAIL: Student can read admin_overview_metrics';
  end if;

  -- Student 2 cannot self-promote.
  v_blocked := false;
  begin
    insert into public.admin_users (user_id, role)
    values ('<STUDENT_2_UUID>'::uuid, 'owner');
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'FAIL: Student promoted themselves to admin';
  end if;

  -- Arbitrary event properties must be rejected by RPC validation.
  v_blocked := false;
  begin
    perform public.track_portal_event(
      p_session_id => v_session_2,
      p_event_name => 'search_used',
      p_page_path => '/rls-test',
      p_properties => '{"raw_query":"not allowed"}'::jsonb
    );
  exception when invalid_parameter_value then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'FAIL: RPC accepted a non-allowlisted property';
  end if;
end $$;

rollback;
```

Expected: the block completes without an exception. The expected-denial checks are caught inside
the PL/pgSQL block; an uncaught exception indicates a failed test or setup issue.

## Test 3 — Administrator access

Replace the admin UUID with the account manually inserted into `public.admin_users`.
Use seeded courses/resources from migration 003.

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '<ADMIN_USER_UUID>', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"<ADMIN_USER_UUID>","role":"authenticated"}',
  true
);

do $$
begin
  if not public.is_admin() then
    raise exception 'FAIL: configured administrator is not recognized';
  end if;

  if not exists (select 1 from public.profiles) then
    raise exception 'FAIL: administrator cannot read profiles';
  end if;

  if not exists (select 1 from public.admin_course_analytics) then
    raise exception 'FAIL: administrator cannot read course analytics';
  end if;

  if not exists (select 1 from public.admin_resource_analytics) then
    raise exception 'FAIL: administrator cannot read resource analytics';
  end if;

  if not exists (select 1 from public.admin_overview_metrics) then
    raise exception 'FAIL: administrator cannot read overview metrics';
  end if;
end $$;

rollback;
```

## Test 4 — Browser session lifecycle

Run these checks in a staging copy of the website with valid public Supabase URL/key:

1. Sign in as Student 1 and interact with the portal (click, scroll, key input). Confirm exactly one
   row is created in `sessions` for the active tab and one `session_started` event exists.
2. Wait for a heartbeat while the page is visible, focused, and recently active. Confirm
   `active_seconds` increases by no more than 45 seconds per heartbeat.
3. Open a Drive/YouTube link in a new tab or switch browser tabs. Confirm the portal session is
   ended shortly after the portal loses focus/visibility. No heartbeat should run while away.
4. Return to the portal and interact again. Confirm a new database session starts; the old session
   is not reused.
5. Leave the portal idle for more than 45 seconds, then interact again. Confirm a new session
   baseline is created and the idle gap is not credited.
6. Refresh or close the tab. Confirm `pagehide` attempts to end the active session. Treat this
   as best effort because browsers and network shutdown can interrupt unload-time requests.
7. Open two separate portal tabs under the same account. Each tab must have its own database
   session UUID; neither tab may heartbeat or end the other tab's session.
8. Sign out, then sign in as Student 2. Confirm the old user's session is never used for Student 2.

## What these tests do not prove

- They do not prove that a person is paying attention to the screen. Client-side activity and
  heartbeat logic can only provide a best-effort estimate.
- They do not measure time spent in Google Drive or YouTube.
- SQL Editor claim simulation does not verify the Google OAuth provider configuration or
  GitHub Pages redirect settings.
- The browser can fail to deliver an unload-time end RPC; stale open sessions should be treated
  as inactive after heartbeat expiry and optionally cleaned up by a trusted scheduled job.
