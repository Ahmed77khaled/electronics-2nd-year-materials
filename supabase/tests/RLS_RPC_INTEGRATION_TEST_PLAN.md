# 🧪 Live Supabase Integration & RLS/RPC Security Test Plan

This document provides step-by-step instructions and executable SQL test suites for verifying Row Level Security (RLS) and RPC functions on a live Supabase development project.

> [!IMPORTANT]
> **Production Safety Notice:**  
> These integration tests require a live PostgreSQL database and must be executed in a dedicated development or staging Supabase project. Never run destructive test assertions against production data.

---

## 📋 Overview of Test Roles

1. **Unauthenticated Guest (Role: `anon`)**:
   - Cannot call RPC `track_portal_event` (blocked by PostgreSQL `revoke all from anon`).
   - Cannot directly insert/update/delete any table.
   - Can read active courses and active resources (`courses_read_active`, `resources_read_active`).

2. **Authenticated Student (Role: `authenticated`, User ID: `user_student_1`)**:
   - Can start a session via `start_portal_session`.
   - Can track whitelisted events via `track_portal_event` for their own session only.
   - Cannot track events with another student's `session_id` (blocked by `Session not found or not owned by current user`).
   - Cannot read another student's profile or activity events.
   - Cannot directly write or delete rows from `activity_events`, `sessions`, or `profiles`.
   - Cannot promote themselves to `admin_users`.

3. **Authenticated Student 2 (Role: `authenticated`, User ID: `user_student_2`)**:
   - Serves as the isolation benchmark to verify cross-tenant data isolation.

4. **Trusted Administrator (Role: `authenticated` + listed in `admin_users`)**:
   - Can view system-wide analytics views (`admin_course_analytics`, `admin_resource_analytics`, `admin_daily_activity`, `admin_overview_metrics`).
   - Can view student profiles via `profiles_read_own_or_admin`.

---

## 🧪 Test Case 1: Unauthenticated Guest Restrictions

### Objective:
Verify that anon callers cannot log events or modify any tables.

### Execution in Supabase SQL Editor:
```sql
-- Simulate anon caller
set role anon;

-- 1. Verify read access to active resources (Allowed)
select count(*) from public.resources where is_active = true;
-- Expect: Returns 75

-- 2. Verify direct insert is blocked (Forbidden)
insert into public.activity_events (user_id, event_name)
values ('00000000-0000-0000-0000-000000000000', 'course_click');
-- Expect: ERROR: permission denied for table activity_events

-- 3. Verify RPC call is blocked (Forbidden)
select public.start_portal_session('/');
-- Expect: ERROR: permission denied for function start_portal_session

reset role;
```

---

## 🧪 Test Case 2: Student Session Ownership & RPC Event Tracking

### Objective:
Verify that an authenticated student can only write to their own session and cannot spoof another student's session.

### Execution:
```sql
-- Setup two test users (run as postgres/service_role)
insert into auth.users (id, email)
values
  ('11111111-1111-4111-a111-111111111111', 'student1@test.com'),
  ('22222222-2222-4222-a222-222222222222', 'student2@test.com')
on conflict (id) do nothing;

-- 1. Student 1 starts a session
set local role authenticated;
set local "request.jwt.claims" = '{"sub": "11111111-1111-4111-a111-111111111111", "role": "authenticated"}';

select public.start_portal_session('/portal') as session_1_id;
-- Note the returned UUID (e.g. 'sess_uuid_1')

-- 2. Student 1 tracks a valid event (Allowed)
select public.track_portal_event(
  p_session_id => '<session_1_id>',
  p_event_name => 'resource_click',
  p_course_id => null,
  p_resource_id => null,
  p_page_path => '/portal',
  p_properties => '{"resource_type": "drive", "source": "resource_chip"}'::jsonb
);
-- Expect: Returns event_id (bigint > 0)

-- 3. Switch to Student 2 and attempt to write to Student 1's session (Must Fail)
set local "request.jwt.claims" = '{"sub": "22222222-2222-4222-a222-222222222222", "role": "authenticated"}';

select public.track_portal_event(
  p_session_id => '<session_1_id>',
  p_event_name => 'resource_click',
  p_course_id => null,
  p_resource_id => null,
  p_page_path => '/portal',
  p_properties => '{"resource_type": "drive"}'::jsonb
);
-- Expect: ERROR: Session not found or not owned by current user (SQLSTATE: 42501)

-- 4. Student 2 tries to read Student 1's events (Must return zero rows)
select count(*) from public.activity_events
where user_id = '11111111-1111-4111-a111-111111111111';
-- Expect: Returns 0 rows (Cross-student reading blocked by RLS)

reset role;
```

---

## 🧪 Test Case 3: Admin Role Self-Promotion & Dashboard Isolation

### Objective:
Verify that a student cannot insert themselves into `admin_users` or access admin views.

### Execution:
```sql
set local role authenticated;
set local "request.jwt.claims" = '{"sub": "11111111-1111-4111-a111-111111111111", "role": "authenticated"}';

-- 1. Student attempts self-promotion (Must Fail)
insert into public.admin_users (user_id, role)
values ('11111111-1111-4111-a111-111111111111', 'owner');
-- Expect: ERROR: permission denied for table admin_users

-- 2. Student queries admin view (Must return only their own stats or empty)
select * from public.admin_overview_metrics;
-- RLS security_invoker prevents exposing other students' data

reset role;
```

---

## 🧪 Test Case 4: Property Allowlist Protection

### Objective:
Verify that arbitrary or sensitive properties (e.g. search queries or tokens) are blocked by RPC validation.

### Execution:
```sql
set local role authenticated;
set local "request.jwt.claims" = '{"sub": "11111111-1111-4111-a111-111111111111", "role": "authenticated"}';

select public.track_portal_event(
  p_session_id => '<session_1_id>',
  p_event_name => 'search_used',
  p_properties => '{"raw_query": "student sensitive search", "secret": "123"}'::jsonb
);
-- Expect: ERROR: Invalid or unsupported event properties (SQLSTATE: 22023)

reset role;
```

---
*Documented for integration audit and automated QA protocol.*
