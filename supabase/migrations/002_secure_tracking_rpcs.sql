-- Secure tracking RPCs for the static student portal.
-- Apply after 001_student_analytics_foundation.sql.
-- These SECURITY DEFINER functions bind every write to auth.uid() and avoid
-- exposing direct session/event writes to browser clients.

begin;

-- The browser must not be able to edit identity fields or write arbitrary
-- session counters/events directly. All tracking writes go through RPCs below.
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "sessions_insert_own" on public.sessions;
drop policy if exists "sessions_update_own" on public.sessions;
drop policy if exists "activity_insert_own" on public.activity_events;

-- Remove table-level write privileges from the browser roles. Admins can still
-- read data through the SELECT policies; trusted migrations/admin SQL can write.
revoke insert, update, delete on public.profiles from anon, authenticated;
revoke insert, update, delete on public.sessions from anon, authenticated;
revoke insert, update, delete on public.activity_events from anon, authenticated;
revoke insert, update, delete on public.admin_users from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Start a session for the authenticated user.
-- ---------------------------------------------------------------------------
create or replace function public.start_portal_session(p_entry_path text default '/')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_path text;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  v_path := left(regexp_replace(coalesce(p_entry_path, '/'), '[?#].*$', ''), 300);

  insert into public.sessions (user_id, entry_path)
  values (v_user_id, v_path)
  returning id into v_session_id;

  update public.profiles
  set last_active_at = clock_timestamp()
  where id = v_user_id;

  insert into public.activity_events
    (user_id, session_id, event_name, page_path, properties)
  values
    (v_user_id, v_session_id, 'session_started', v_path, '{}'::jsonb);

  return v_session_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Record a whitelisted event. Arbitrary properties are deliberately blocked:
-- only a small set of non-sensitive keys and compact JSON values are accepted.
-- ---------------------------------------------------------------------------
create or replace function public.track_portal_event(
  p_session_id uuid,
  p_event_name text,
  p_course_id uuid default null,
  p_resource_id uuid default null,
  p_page_path text default null,
  p_properties jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_event_id bigint;
  v_path text;
  v_properties jsonb := coalesce(p_properties, '{}'::jsonb);
  v_session_user uuid;
  v_resource_course uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_event_name not in (
    'page_view',
    'login_success',
    'course_click',
    'folder_link_clicked',
    'resource_click',
    'youtube_click',
    'search_used',
    'filter_changed',
    'return_to_portal'
  ) then
    raise exception 'Unsupported event name' using errcode = '22023';
  end if;

  select s.user_id into v_session_user
  from public.sessions s
  where s.id = p_session_id
    and s.ended_at is null
  for update;

  if v_session_user is distinct from v_user_id then
    raise exception 'Session not found or not owned by current user'
      using errcode = '42501';
  end if;

  if jsonb_typeof(v_properties) <> 'object'
     or octet_length(v_properties::text) > 512
     or exists (
       select 1
       from jsonb_object_keys(v_properties) as k(key)
       where k.key not in (
         'resource_type',
         'filter_name',
         'result_count',
         'search_length',
         'source'
       )
     ) then
    raise exception 'Invalid or unsupported event properties'
      using errcode = '22023';
  end if;

  if p_resource_id is not null then
    select r.course_id into v_resource_course
    from public.resources r
    where r.id = p_resource_id and r.is_active = true;

    if v_resource_course is null then
      raise exception 'Resource not found or inactive' using errcode = '22023';
    end if;

    if p_course_id is not null and p_course_id <> v_resource_course then
      raise exception 'Resource does not belong to supplied course'
        using errcode = '22023';
    end if;

    p_course_id := v_resource_course;
  end if;

  if p_course_id is not null and not exists (
    select 1 from public.courses c
    where c.id = p_course_id and c.is_active = true
  ) then
    raise exception 'Course not found or inactive' using errcode = '22023';
  end if;

  v_path := left(regexp_replace(coalesce(p_page_path, '/'), '[?#].*$', ''), 300);

  insert into public.activity_events
    (user_id, session_id, course_id, resource_id, event_name, page_path, properties)
  values
    (v_user_id, p_session_id, p_course_id, p_resource_id,
     p_event_name, v_path, v_properties)
  returning id into v_event_id;

  update public.profiles
  set last_active_at = clock_timestamp()
  where id = v_user_id;

  return v_event_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Heartbeat: server measures the gap between calls and caps credited time at
-- 45 seconds. If the browser disappears/pauses for longer, that gap earns zero.
-- The client should call only while visible, focused, and not idle.
-- ---------------------------------------------------------------------------
create or replace function public.heartbeat_portal_session(p_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_last_heartbeat timestamptz;
  v_delta integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select s.last_heartbeat_at into v_last_heartbeat
  from public.sessions s
  where s.id = p_session_id
    and s.user_id = v_user_id
    and s.ended_at is null
  for update;

  if not found then
    raise exception 'Active session not found' using errcode = 'P0002';
  end if;

  if clock_timestamp() - v_last_heartbeat <= interval '45 seconds' then
    v_delta := greatest(
      0,
      least(45, floor(extract(epoch from (clock_timestamp() - v_last_heartbeat)))::integer)
    );
  end if;

  update public.sessions
  set active_seconds = active_seconds + v_delta,
      last_heartbeat_at = clock_timestamp()
  where id = p_session_id and user_id = v_user_id;

  update public.profiles
  set last_active_at = clock_timestamp()
  where id = v_user_id;

  return v_delta;
end;
$$;

-- ---------------------------------------------------------------------------
-- End a session. Idempotent for an already-ended session owned by the caller.
-- ---------------------------------------------------------------------------
create or replace function public.end_portal_session(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_path text;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  update public.sessions
  set ended_at = coalesce(ended_at, clock_timestamp())
  where id = p_session_id
    and user_id = v_user_id
  returning entry_path into v_path;

  if not found then
    return false;
  end if;

  insert into public.activity_events
    (user_id, session_id, event_name, page_path, properties)
  values
    (v_user_id, p_session_id, 'session_ended', coalesce(v_path, '/'), '{}'::jsonb);

  update public.profiles
  set last_active_at = clock_timestamp()
  where id = v_user_id;

  return true;
end;
$$;

-- RPCs are callable only by authenticated users.
revoke all on function public.start_portal_session(text) from public, anon;
revoke all on function public.track_portal_event(uuid, text, uuid, uuid, text, jsonb) from public, anon;
revoke all on function public.heartbeat_portal_session(uuid) from public, anon;
revoke all on function public.end_portal_session(uuid) from public, anon;

grant execute on function public.start_portal_session(text) to authenticated;
grant execute on function public.track_portal_event(uuid, text, uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.heartbeat_portal_session(uuid) to authenticated;
grant execute on function public.end_portal_session(uuid) to authenticated;

commit;
