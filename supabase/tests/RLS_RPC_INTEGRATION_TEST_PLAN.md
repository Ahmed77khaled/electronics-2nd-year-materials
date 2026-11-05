# Supabase RLS / RPC Integration Test Plan & Security Verification

These tests are designed for a **dedicated Supabase staging project**, after sequentially applying
migrations `001` through `006` in order and seeding the 7 course rows / 75 resources.

---

## 🏗️ Three-Tier Testing Architecture

To avoid confusing static analysis with runtime database assertions, our verification protocol separates
all validation into three distinct, non-overlapping tiers:

| Tier | Environment | Scope | Verification Tool |
| :--- | :--- | :--- | :--- |
| **Tier 1: Static Code & Schema AST Audit** | Local / CI | Validates file existence, SQL DDL structure, policy syntax, topological ordering, foreign keys, and secret isolation. | `node tests/test-suite.js` & GitHub Actions |
| **Tier 2: Automated In-Memory Mock Tests** | Local Node.js | Validates client-side debounce, deduplication, event classification, guest `user_id = null`, and heartbeat lifecycle. | `node tests/test-suite.js` |
| **Tier 3: Live PostgreSQL Transactions** | Live Supabase Staging | Validates real engine RLS enforcement, role separation (`anon` vs `authenticated`), student cross-reading isolation, and admin authorization. | Supabase SQL Editor (`ROLLBACK`) |

> ⚠️ **CRITICAL NOTE:** Static text searches or AST checks (Tiers 1 & 2) do **NOT** prove that a live
> PostgreSQL database enforces RLS. Live engine verification (Tier 3) requires executing the SQL blocks below
> in Supabase SQL Editor with actual user tokens/claims.

---

## Preconditions for Live PostgreSQL Testing (Tier 3)

1. Create two disposable authenticated users through Supabase Auth (Student 1 and Student 2).
   Do not insert incomplete rows into `auth.users` manually.
2. Sign in each user at least once so the `auth.users` trigger creates their `public.profiles` row.
3. Create a third disposable authenticated user for the Admin test.
4. As the trusted database owner, manually promote only that third user:
   ```sql
   insert into public.admin_users (user_id, role)
   values ('<ADMIN_USER_UUID>', 'owner')
   on conflict (user_id) do update set role = excluded.role;
   ```
5. Replace the UUID placeholders in each test block with the real UUIDs from Supabase Auth.
6. Run each test block separately in SQL Editor. Every block uses its own transaction and ends
   with `ROLLBACK`, so test sessions/events are safely discarded.

---

## Sequential Migration Order

1. `001_student_analytics_foundation.sql` — Base tables, profile trigger, initial RLS.
2. `002_secure_tracking_rpcs.sql` — Revokes table writes; introduces SECURITY DEFINER RPCs.
3. `003_seed_courses_and_resources.sql` — 5-tier topological seed of 7 courses & 75 resources.
4. `004_admin_analytics_views.sql` — Defines initial aggregate reporting views.
5. `005_admin_analytics_authorization.sql` — Restricts views with `is_admin()` and security_invoker.
6. `006_backend_security_hardening.sql` — Separates anon/authenticated policies, explicit least privilege grants, and hardens admin_student_summary.

---

## Test 1 — Anonymous Visitor (Tier 3 Live Test)

**Expected:** Active courses and resources are publicly readable; inactive items are hidden; table mutations, admin tables, and tracking RPCs are completely denied.

```sql
begin;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

-- 1. Active resources must be readable (Expected: 75)
select count(*) as active_resources
from public.resources
where is_active = true;

-- 2. Inactive resources must NOT be readable by anon (Expected: 0)
select count(*) as inactive_resources
from public.resources
where is_active = false;

-- 3. Anonymous direct write on courses must be denied
do $$
declare
  v_blocked boolean := false;
begin
  begin
    insert into public.courses (slug, title) values ('hack-course', 'Hack');
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'FAIL: anon directly inserted a course';
  end if;
end $$;

-- 4. Anonymous direct write on resources must be denied
do $$
declare
  v_blocked boolean := false;
begin
  begin
    insert into public.resources (course_id, resource_key, title)
    values ('11111111-1111-4111-8111-111111111111'::uuid, 'HACK_RES', 'Hack');
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'FAIL: anon directly inserted a resource';
  end if;
end $$;

-- 5. Anonymous caller cannot read admin_users table
do $$
declare
  v_blocked boolean := false;
begin
  begin
    perform count(*) from public.admin_users;
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'FAIL: anon read admin_users table directly';
  end if;
end $$;

-- 6. Anonymous caller cannot execute tracking RPCs
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

---

## Test 2 — Student Isolation, Session Ownership & Admin Denial (Tier 3 Live Test)

Replace `<STUDENT_1_UUID>` and `<STUDENT_2_UUID>` with real UUIDs from Supabase Auth.

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

  -- All five admin analytics views must return no rows to a student.
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
  if exists (select 1 from public.admin_student_summary) then
    raise exception 'FAIL: Student can read admin_student_summary';
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

---

## Test 3 — Administrator Access (Tier 3 Live Test)

Replace `<ADMIN_USER_UUID>` with the account manually provisioned in `public.admin_users`.

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

  if not exists (select 1 from public.admin_student_summary) then
    raise exception 'FAIL: administrator cannot read student summary';
  end if;
end $$;

rollback;
```
