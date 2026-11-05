-- Anonymous visitor analytics for the public portal.
-- Apply after migrations 001 through 007.
-- This stores a random browser identifier only; no IP address, fingerprint,
-- user agent, name, or email is collected for anonymous visitors.

begin;

create table if not exists public.anonymous_visitors (
  id uuid primary key default gen_random_uuid(),
  visitor_key uuid not null unique,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  first_path text not null default '/',
  last_path text not null default '/',
  created_at timestamptz not null default now()
);

create table if not exists public.anonymous_sessions (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references public.anonymous_visitors(id) on delete cascade,
  client_session_id uuid not null,
  started_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  ended_at timestamptz,
  active_seconds integer not null default 0 check (active_seconds >= 0),
  entry_path text not null default '/',
  last_path text not null default '/',
  created_at timestamptz not null default now(),
  constraint anonymous_sessions_visitor_client_unique unique (visitor_id, client_session_id)
);

create table if not exists public.anonymous_activity_events (
  id bigint generated always as identity primary key,
  visitor_id uuid not null references public.anonymous_visitors(id) on delete cascade,
  session_id uuid not null references public.anonymous_sessions(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  resource_id uuid references public.resources(id) on delete set null,
  event_name text not null,
  page_path text not null default '/',
  properties jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint anonymous_activity_events_event_name_check
    check (event_name in (
      'page_view', 'course_click', 'folder_link_clicked', 'resource_click',
      'youtube_click', 'search_used', 'filter_changed', 'return_to_portal'
    ))
);

create index if not exists anonymous_visitors_last_seen_idx
  on public.anonymous_visitors (last_seen_at desc);
create index if not exists anonymous_sessions_visitor_started_idx
  on public.anonymous_sessions (visitor_id, started_at desc);
create index if not exists anonymous_sessions_heartbeat_idx
  on public.anonymous_sessions (last_heartbeat_at desc)
  where ended_at is null;
create index if not exists anonymous_events_visitor_time_idx
  on public.anonymous_activity_events (visitor_id, occurred_at desc);
create index if not exists anonymous_events_session_time_idx
  on public.anonymous_activity_events (session_id, occurred_at desc);
create index if not exists anonymous_events_time_name_idx
  on public.anonymous_activity_events (event_name, occurred_at desc);

alter table public.anonymous_visitors enable row level security;
alter table public.anonymous_sessions enable row level security;
alter table public.anonymous_activity_events enable row level security;

-- Browser clients receive no direct table writes. All writes use the narrow RPCs below.
revoke all on public.anonymous_visitors from public, anon, authenticated;
revoke all on public.anonymous_sessions from public, anon, authenticated;
revoke all on public.anonymous_activity_events from public, anon, authenticated;

grant select on public.anonymous_visitors to authenticated;
grant select on public.anonymous_sessions to authenticated;
grant select on public.anonymous_activity_events to authenticated;

drop policy if exists "anonymous_visitors_admin_read" on public.anonymous_visitors;
create policy "anonymous_visitors_admin_read"
on public.anonymous_visitors for select to authenticated
using ((select public.is_admin()));

drop policy if exists "anonymous_sessions_admin_read" on public.anonymous_sessions;
create policy "anonymous_sessions_admin_read"
on public.anonymous_sessions for select to authenticated
using ((select public.is_admin()));

drop policy if exists "anonymous_events_admin_read" on public.anonymous_activity_events;
create policy "anonymous_events_admin_read"
on public.anonymous_activity_events for select to authenticated
using ((select public.is_admin()));

-- Create or resume one anonymous browser-tab session.
-- The visitor key is a random UUID stored in localStorage; the session key is
-- a random UUID stored in sessionStorage. Neither value is a device fingerprint.
create or replace function public.start_anonymous_visitor_session(
  p_visitor_key uuid,
  p_client_session_id uuid,
  p_entry_path text default '/'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visitor_id uuid;
  v_session_id uuid;
  v_path text;
begin
  if auth.uid() is not null then
    raise exception 'Anonymous tracking is only available without sign-in'
      using errcode = '42501';
  end if;

  if p_visitor_key is null or p_client_session_id is null then
    raise exception 'Visitor and client session identifiers are required'
      using errcode = '22023';
  end if;

  v_path := left(regexp_replace(coalesce(nullif(p_entry_path, ''), '/'), '[?#].*$', ''), 300);
  if v_path = '' or left(v_path, 1) <> '/' then
    v_path := '/';
  end if;

  insert into public.anonymous_visitors (visitor_key, first_path, last_path)
  values (p_visitor_key, v_path, v_path)
  on conflict (visitor_key) do update set
    last_seen_at = clock_timestamp(),
    last_path = excluded.last_path
  returning id into v_visitor_id;

  insert into public.anonymous_sessions
    (visitor_id, client_session_id, entry_path, last_path)
  values
    (v_visitor_id, p_client_session_id, v_path, v_path)
  on conflict (visitor_id, client_session_id) do update set
    last_heartbeat_at = clock_timestamp(),
    ended_at = null,
    last_path = excluded.last_path
  returning id into v_session_id;

  return v_session_id;
end;
$$;

-- Anonymous events share the same resource/course UUID validation and
-- low-information property allowlist as identified student events.
create or replace function public.track_anonymous_visitor_event(
  p_visitor_key uuid,
  p_client_session_id uuid,
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
  v_visitor_id uuid;
  v_session_id uuid;
  v_event_id bigint;
  v_path text;
  v_properties jsonb := coalesce(p_properties, '{}'::jsonb);
  v_resource_course uuid;
  v_recent_events integer;
begin
  if auth.uid() is not null then
    raise exception 'Anonymous tracking is only available without sign-in'
      using errcode = '42501';
  end if;

  if p_visitor_key is null or p_client_session_id is null then
    raise exception 'Visitor and client session identifiers are required'
      using errcode = '22023';
  end if;

  if p_event_name is null or p_event_name not in (
    'page_view', 'course_click', 'folder_link_clicked', 'resource_click',
    'youtube_click', 'search_used', 'filter_changed', 'return_to_portal'
  ) then
    raise exception 'Unsupported anonymous event name' using errcode = '22023';
  end if;

  select v.id into v_visitor_id
  from public.anonymous_visitors v
  where v.visitor_key = p_visitor_key;

  if v_visitor_id is null then
    raise exception 'Anonymous visitor session not found' using errcode = 'P0002';
  end if;

  select s.id into v_session_id
  from public.anonymous_sessions s
  where s.visitor_id = v_visitor_id
    and s.client_session_id = p_client_session_id
    and s.ended_at is null
  for update;

  if v_session_id is null then
    raise exception 'Active anonymous session not found' using errcode = 'P0002';
  end if;

  -- Basic per-visitor write throttling to limit accidental loops and simple abuse.
  select count(*)::integer into v_recent_events
  from public.anonymous_activity_events e
  where e.visitor_id = v_visitor_id
    and e.occurred_at >= clock_timestamp() - interval '1 minute';

  if v_recent_events >= 120 then
    raise exception 'Anonymous tracking rate limit exceeded' using errcode = '54000';
  end if;

  if jsonb_typeof(v_properties) <> 'object'
     or octet_length(v_properties::text) > 512
     or exists (
       select 1
       from jsonb_object_keys(v_properties) as k(key)
       where k.key not in (
         'resource_type', 'filter_name', 'result_count', 'search_length', 'source'
       )
     ) then
    raise exception 'Invalid or unsupported anonymous event properties'
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
  if v_path = '' or left(v_path, 1) <> '/' then
    v_path := '/';
  end if;

  insert into public.anonymous_activity_events
    (visitor_id, session_id, course_id, resource_id, event_name, page_path, properties)
  values
    (v_visitor_id, v_session_id, p_course_id, p_resource_id, p_event_name, v_path, v_properties)
  returning id into v_event_id;

  update public.anonymous_sessions
  set last_path = v_path
  where id = v_session_id;

  update public.anonymous_visitors
  set last_seen_at = clock_timestamp(),
      last_path = v_path
  where id = v_visitor_id;

  return v_event_id;
end;
$$;

-- Heartbeats credit no more than 45 seconds and only when the previous
-- heartbeat was recent. Browsers that disappear become interrupted naturally.
create or replace function public.heartbeat_anonymous_visitor_session(
  p_visitor_key uuid,
  p_client_session_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visitor_id uuid;
  v_session_id uuid;
  v_last_heartbeat timestamptz;
  v_delta integer := 0;
begin
  if auth.uid() is not null then
    raise exception 'Anonymous tracking is only available without sign-in'
      using errcode = '42501';
  end if;

  if p_visitor_key is null or p_client_session_id is null then
    return 0;
  end if;

  select v.id into v_visitor_id
  from public.anonymous_visitors v
  where v.visitor_key = p_visitor_key;

  if v_visitor_id is null then
    return 0;
  end if;

  select s.id, s.last_heartbeat_at into v_session_id, v_last_heartbeat
  from public.anonymous_sessions s
  where s.visitor_id = v_visitor_id
    and s.client_session_id = p_client_session_id
    and s.ended_at is null
  for update;

  if v_session_id is null then
    return 0;
  end if;

  if clock_timestamp() - v_last_heartbeat <= interval '45 seconds' then
    v_delta := greatest(0, least(45,
      floor(extract(epoch from (clock_timestamp() - v_last_heartbeat)))::integer
    ));
  end if;

  update public.anonymous_sessions
  set active_seconds = active_seconds + v_delta,
      last_heartbeat_at = clock_timestamp()
  where id = v_session_id;

  update public.anonymous_visitors
  set last_seen_at = clock_timestamp()
  where id = v_visitor_id;

  return v_delta;
end;
$$;

-- End is best-effort during pagehide/unload. Stale sessions are still reported
-- as interrupted by comparing their last heartbeat with the current time.
create or replace function public.end_anonymous_visitor_session(
  p_visitor_key uuid,
  p_client_session_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visitor_id uuid;
begin
  if auth.uid() is not null then
    raise exception 'Anonymous tracking is only available without sign-in'
      using errcode = '42501';
  end if;

  if p_visitor_key is null or p_client_session_id is null then
    return false;
  end if;

  select v.id into v_visitor_id
  from public.anonymous_visitors v
  where v.visitor_key = p_visitor_key;

  if v_visitor_id is null then
    return false;
  end if;

  update public.anonymous_sessions
  set ended_at = coalesce(ended_at, clock_timestamp())
  where visitor_id = v_visitor_id
    and client_session_id = p_client_session_id
    and ended_at is null;

  return found;
end;
$$;

-- Anonymous writes are RPC-only. The admin reporting view is protected by
-- RLS on all underlying tables and an explicit is_admin() predicate.
revoke all on function public.start_anonymous_visitor_session(uuid, uuid, text) from public;
revoke all on function public.track_anonymous_visitor_event(uuid, uuid, text, uuid, uuid, text, jsonb) from public;
revoke all on function public.heartbeat_anonymous_visitor_session(uuid, uuid) from public;
revoke all on function public.end_anonymous_visitor_session(uuid, uuid) from public;

grant execute on function public.start_anonymous_visitor_session(uuid, uuid, text) to anon, authenticated;
grant execute on function public.track_anonymous_visitor_event(uuid, uuid, text, uuid, uuid, text, jsonb) to anon, authenticated;
grant execute on function public.heartbeat_anonymous_visitor_session(uuid, uuid) to anon, authenticated;
grant execute on function public.end_anonymous_visitor_session(uuid, uuid) to anon, authenticated;

create or replace view public.admin_anonymous_visitor_summary
with (security_invoker = true, security_barrier = true)
as
select
  v.id,
  v.visitor_key,
  v.first_seen_at,
  v.last_seen_at,
  v.first_path,
  v.last_path,
  coalesce(s.session_count, 0)::bigint as session_count,
  coalesce(s.total_active_seconds, 0)::bigint as total_active_seconds,
  coalesce(e.event_count, 0)::bigint as event_count,
  coalesce(e.page_view_count, 0)::bigint as page_view_count,
  coalesce(s.active_now, false) as active_now
from public.anonymous_visitors v
left join (
  select
    visitor_id,
    count(*) as session_count,
    coalesce(sum(active_seconds), 0) as total_active_seconds,
    bool_or(ended_at is null and last_heartbeat_at >= now() - interval '5 minutes') as active_now
  from public.anonymous_sessions
  group by visitor_id
) s on s.visitor_id = v.id
left join (
  select
    visitor_id,
    count(*) as event_count,
    count(*) filter (where event_name = 'page_view') as page_view_count
  from public.anonymous_activity_events
  group by visitor_id
) e on e.visitor_id = v.id
where (select public.is_admin());

revoke all on public.admin_anonymous_visitor_summary from public, anon;
grant select on public.admin_anonymous_visitor_summary to authenticated;

commit;
