-- Launch baseline reset and authenticated-entry telemetry.
-- Apply once after migration 008, immediately before enabling the refreshed portal analytics.
-- Existing auth users, profiles, admin roles, courses, and resources are preserved.
-- Previous tracking rows are copied to a private archive schema before the live tables are cleared.

begin;

create schema if not exists analytics_archive;
revoke all on schema analytics_archive from public, anon, authenticated;

create table if not exists analytics_archive.sessions_pre_launch
as select * from public.sessions where false;
create table if not exists analytics_archive.activity_events_pre_launch
as select * from public.activity_events where false;
create table if not exists analytics_archive.anonymous_visitors_pre_launch
as select * from public.anonymous_visitors where false;
create table if not exists analytics_archive.anonymous_sessions_pre_launch
as select * from public.anonymous_sessions where false;
create table if not exists analytics_archive.anonymous_activity_events_pre_launch
as select * from public.anonymous_activity_events where false;

create table if not exists analytics_archive.rollover_log (
  rollover_key text primary key,
  archived_at timestamptz not null default clock_timestamp(),
  archived_counts jsonb not null
);

alter table public.profiles
  add column if not exists last_login_at timestamptz;

do $$
declare
  v_sessions bigint := 0;
  v_events bigint := 0;
  v_visitors bigint := 0;
  v_anon_sessions bigint := 0;
  v_anon_events bigint := 0;
begin
  if not exists (
    select 1 from analytics_archive.rollover_log
    where rollover_key = 'electronics-2nd-year-resources-launch-2026-11-05'
  ) then
    insert into analytics_archive.sessions_pre_launch select * from public.sessions;
    get diagnostics v_sessions = row_count;

    insert into analytics_archive.activity_events_pre_launch select * from public.activity_events;
    get diagnostics v_events = row_count;

    insert into analytics_archive.anonymous_visitors_pre_launch select * from public.anonymous_visitors;
    get diagnostics v_visitors = row_count;

    insert into analytics_archive.anonymous_sessions_pre_launch select * from public.anonymous_sessions;
    get diagnostics v_anon_sessions = row_count;

    insert into analytics_archive.anonymous_activity_events_pre_launch select * from public.anonymous_activity_events;
    get diagnostics v_anon_events = row_count;

    -- Clear only telemetry. Profiles (and therefore student accounts), admin
    -- membership, course rows, resources, and resource links are untouched.
    delete from public.activity_events;
    delete from public.sessions;
    delete from public.anonymous_activity_events;
    delete from public.anonymous_sessions;
    delete from public.anonymous_visitors;

    update public.profiles
    set last_active_at = null,
        last_login_at = null;

    insert into analytics_archive.rollover_log (rollover_key, archived_counts)
    values (
      'electronics-2nd-year-resources-launch-2026-11-05',
      jsonb_build_object(
        'sessions', v_sessions,
        'activity_events', v_events,
        'anonymous_visitors', v_visitors,
        'anonymous_sessions', v_anon_sessions,
        'anonymous_activity_events', v_anon_events
      )
    );
  end if;
end;
$$;

-- Record a minimal authenticated entry event without opening an engagement
-- session or crediting any reading time. The database derives identity from auth.uid().
create or replace function public.record_authenticated_portal_event(
  p_event_name text,
  p_page_path text default '/'
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
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_event_name is null or p_event_name not in ('page_view', 'login_success') then
    raise exception 'Unsupported authenticated entry event' using errcode = '22023';
  end if;

  v_path := left(regexp_replace(coalesce(p_page_path, '/'), '[?#].*$', ''), 300);
  if v_path = '' or left(v_path, 1) <> '/' then
    v_path := '/';
  end if;

  insert into public.activity_events
    (user_id, session_id, event_name, page_path, properties)
  values
    (
      v_user_id,
      null,
      p_event_name,
      v_path,
      jsonb_build_object('source',
        case when p_event_name = 'login_success' then 'google_sign_in' else 'authenticated_page_load' end)
    )
  returning id into v_event_id;

  update public.profiles
  set last_active_at = clock_timestamp(),
      last_login_at = case
        when p_event_name = 'login_success' then clock_timestamp()
        else last_login_at
      end
  where id = v_user_id;

  return v_event_id;
end;
$$;

revoke all on function public.record_authenticated_portal_event(text, text) from public, anon;
grant execute on function public.record_authenticated_portal_event(text, text) to authenticated;

-- Preserve the existing view column order and append last_login_at for the admin UI.
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
  coalesce(s.active_seconds, 0)::bigint as total_active_seconds,
  coalesce(e.course_visit_count, 0)::bigint as course_visit_count,
  coalesce(e.resource_click_count, 0)::bigint as resource_click_count,
  e.first_activity_at,
  p.last_login_at
from public.profiles p
left join (
  select
    user_id,
    count(*) as session_count,
    coalesce(sum(active_seconds), 0) as active_seconds
  from public.sessions
  group by user_id
) s on s.user_id = p.id
left join (
  select
    user_id,
    count(*) filter (where event_name = 'course_click') as course_visit_count,
    count(*) filter (
      where event_name in ('resource_click', 'youtube_click', 'folder_link_clicked')
    ) as resource_click_count,
    min(occurred_at) as first_activity_at
  from public.activity_events
  group by user_id
) e on e.user_id = p.id
where (select public.is_admin());

revoke all on public.admin_student_summary from public, anon;
grant select on public.admin_student_summary to authenticated;

commit;
