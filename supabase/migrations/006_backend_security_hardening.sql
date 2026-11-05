-- Backend Security Hardening & Principle of Least Privilege
-- Migration: 006_backend_security_hardening.sql
-- Applies after 001 through 005. Idempotent and non-destructive.
--
-- 1. Separates anon and authenticated SELECT policies on courses and resources
--    so anon never invokes the authenticated-only is_admin() function.
-- 2. Explicitly revokes direct table mutation privileges on courses, resources,
--    and admin_users from browser roles.
-- 3. Grants explicit, minimal privileges (least privilege) for anon and authenticated.
-- 4. Hardens admin_student_summary view with is_admin() filter and security_barrier.
-- 5. Revokes client EXECUTE privileges on trigger functions.

begin;

-- ---------------------------------------------------------------------------
-- 1. Schema Usage Privileges
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Explicit Revocations & Least Privilege Grants on Tables
-- ---------------------------------------------------------------------------
-- Remove any default write privileges on courses and resources from browser roles.
revoke insert, update, delete on public.courses from anon, authenticated;
revoke insert, update, delete on public.resources from anon, authenticated;

-- Revoke all table-level access on admin_users from browser roles.
-- The is_admin() function is SECURITY DEFINER and checks this table internally.
revoke all on public.admin_users from public, anon, authenticated;

-- Explicit SELECT grants:
-- anon: courses and resources only
grant select on public.courses to anon;
grant select on public.resources to anon;

-- authenticated: courses, resources, and student-scoped tables (governed by RLS)
grant select on public.courses to authenticated;
grant select on public.resources to authenticated;
grant select on public.profiles to authenticated;
grant select on public.sessions to authenticated;
grant select on public.activity_events to authenticated;

-- ---------------------------------------------------------------------------
-- 3. RLS Policy Separation on courses and resources
-- ---------------------------------------------------------------------------
-- Drop the unified policies that called is_admin() for anon
drop policy if exists "courses_read_active" on public.courses;
drop policy if exists "courses_read_active_anon" on public.courses;
drop policy if exists "courses_read_active_authenticated" on public.courses;

drop policy if exists "resources_read_active" on public.resources;
drop policy if exists "resources_read_active_anon" on public.resources;
drop policy if exists "resources_read_active_authenticated" on public.resources;

-- anon: strictly active courses and resources only (no is_admin call)
create policy "courses_read_active_anon"
on public.courses for select to anon
using (is_active = true);

create policy "resources_read_active_anon"
on public.resources for select to anon
using (is_active = true);

-- authenticated: active items for all students, inactive items for administrators
create policy "courses_read_active_authenticated"
on public.courses for select to authenticated
using (is_active = true or (select public.is_admin()));

create policy "resources_read_active_authenticated"
on public.resources for select to authenticated
using (is_active = true or (select public.is_admin()));

-- ---------------------------------------------------------------------------
-- 4. Harden admin_student_summary View
-- ---------------------------------------------------------------------------
create or replace view public.admin_student_summary
with (security_invoker = true, security_barrier = true)
as
select
  p.id as user_id,
  p.full_name,
  p.email,
  p.avatar_url,
  p.created_at as registered_at,
  p.last_active_at,
  coalesce(s.session_count, 0)::bigint as session_count,
  coalesce(s.active_seconds, 0)::bigint as total_active_seconds
from public.profiles p
left join (
  select
    user_id,
    count(*) as session_count,
    sum(active_seconds) as active_seconds
  from public.sessions
  group by user_id
) s on s.user_id = p.id
where (select public.is_admin());

revoke all on public.admin_student_summary from public, anon;
grant select on public.admin_student_summary to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Trigger Functions Hardening
-- ---------------------------------------------------------------------------
-- Revoke direct client execute privileges from trigger functions.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;

-- Ensure set_updated_at has safe search_path
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

commit;
