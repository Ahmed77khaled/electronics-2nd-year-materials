-- Student Analytics Foundation
-- Apply this migration in the Supabase SQL Editor or with the Supabase CLI.
-- IMPORTANT: Never expose the service_role key in the static website.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Shared updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin roles. Admin membership must be granted manually by a trusted owner
-- from the Supabase SQL Editor; there is intentionally no "first user is admin"
-- behavior and no client-side self-promotion policy.
-- ---------------------------------------------------------------------------
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin', 'owner')),
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users au
    where au.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Student profiles. The row is created automatically after Google sign-in.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  avatar_url text,
  created_at timestamptz not null default now(),
  last_active_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists profiles_email_idx on public.profiles (lower(email));
create index if not exists profiles_last_active_idx on public.profiles (last_active_at desc);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.email,
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    email = excluded.email,
    avatar_url = excluded.avatar_url,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert or update of email, raw_user_meta_data on auth.users
for each row execute procedure public.handle_new_user();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Courses and resources. Publicly readable because the portal is a public
-- directory; writes remain restricted to trusted administrators.
-- ---------------------------------------------------------------------------
create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  resource_key text not null unique,
  title text not null,
  resource_type text not null default 'drive'
    check (resource_type in ('drive', 'youtube', 'website', 'folder', 'other')),
  url text not null,
  parent_resource_id uuid references public.resources(id) on delete set null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists resources_course_id_idx on public.resources (course_id);
create index if not exists resources_parent_id_idx on public.resources (parent_resource_id);

drop trigger if exists courses_set_updated_at on public.courses;
create trigger courses_set_updated_at before update on public.courses
for each row execute procedure public.set_updated_at();

drop trigger if exists resources_set_updated_at on public.resources;
create trigger resources_set_updated_at before update on public.resources
for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Sessions. active_seconds is accumulated by the client heartbeat logic.
-- It should only count visible, focused, non-idle time on this portal.
-- ---------------------------------------------------------------------------
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  ended_at timestamptz,
  active_seconds integer not null default 0 check (active_seconds >= 0),
  entry_path text,
  created_at timestamptz not null default now()
);

create index if not exists sessions_user_started_idx
  on public.sessions (user_id, started_at desc);
create index if not exists sessions_started_idx on public.sessions (started_at desc);

-- ---------------------------------------------------------------------------
-- Activity events. Keep event properties small and never store passwords,
-- access tokens, message contents, or unrelated personal information here.
-- ---------------------------------------------------------------------------
create table if not exists public.activity_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  course_id uuid references public.courses(id) on delete set null,
  resource_id uuid references public.resources(id) on delete set null,
  event_name text not null,
  page_path text,
  properties jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists activity_user_time_idx
  on public.activity_events (user_id, occurred_at desc);
create index if not exists activity_event_time_idx
  on public.activity_events (event_name, occurred_at desc);
create index if not exists activity_course_time_idx
  on public.activity_events (course_id, occurred_at desc);
create index if not exists activity_resource_time_idx
  on public.activity_events (resource_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.admin_users enable row level security;
alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.resources enable row level security;
alter table public.sessions enable row level security;
alter table public.activity_events enable row level security;

-- Students can read their own profile. Admins can read all profiles.
drop policy if exists "profiles_read_own_or_admin" on public.profiles;
create policy "profiles_read_own_or_admin"
on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select public.is_admin()));

-- A student may update only their own profile. Identity fields are maintained
-- by the auth trigger; admin access is still available for support workflows.
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists "courses_read_active" on public.courses;
create policy "courses_read_active"
on public.courses for select to anon, authenticated
using (is_active or (select public.is_admin()));

drop policy if exists "courses_admin_manage" on public.courses;
create policy "courses_admin_manage"
on public.courses for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists "resources_read_active" on public.resources;
create policy "resources_read_active"
on public.resources for select to anon, authenticated
using (is_active or (select public.is_admin()));

drop policy if exists "resources_admin_manage" on public.resources;
create policy "resources_admin_manage"
on public.resources for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists "sessions_read_own_or_admin" on public.sessions;
create policy "sessions_read_own_or_admin"
on public.sessions for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "sessions_insert_own" on public.sessions;
create policy "sessions_insert_own"
on public.sessions for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "sessions_update_own" on public.sessions;
create policy "sessions_update_own"
on public.sessions for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "activity_read_own_or_admin" on public.activity_events;
create policy "activity_read_own_or_admin"
on public.activity_events for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "activity_insert_own" on public.activity_events;
create policy "activity_insert_own"
on public.activity_events for insert to authenticated
with check (user_id = (select auth.uid()));

-- No client-side insert/update/delete policies are provided for admin_users.
-- Grant an admin manually after the intended user has signed in at least once:
--
-- insert into public.admin_users (user_id, role)
-- select id, 'owner'
-- from auth.users
-- where email = 'YOUR_GOOGLE_EMAIL'
-- on conflict (user_id) do update set role = excluded.role;
--
-- Replace the email with the owner's exact Google account email, then run
-- this statement from the Supabase SQL Editor as the project owner.

-- ---------------------------------------------------------------------------
-- Basic reporting view for the admin dashboard. Access is still constrained
-- by the underlying tables' RLS policies.
-- ---------------------------------------------------------------------------
create or replace view public.admin_student_summary
with (security_invoker = true)
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
) s on s.user_id = p.id;

grant select on public.admin_student_summary to authenticated;

-- End of migration.
