-- Accurate activity metrics for the admin dashboard.
-- Apply after migrations 001 through 006.
-- This migration replaces estimates with counts derived from activity_events.
-- All administrative views remain server-side guarded and preserve table RLS.

begin;

-- Support exact per-session activity summaries.
create index if not exists activity_session_time_idx
  on public.activity_events (session_id, occurred_at desc)
  where session_id is not null;

-- ---------------------------------------------------------------------------
-- Per-student summary: retain the original column order and append event-based
-- counts/timestamps so CREATE OR REPLACE VIEW remains backwards compatible.
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
  coalesce(s.active_seconds, 0)::bigint as total_active_seconds,
  coalesce(e.course_visit_count, 0)::bigint as course_visit_count,
  coalesce(e.resource_click_count, 0)::bigint as resource_click_count,
  e.first_activity_at
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

-- ---------------------------------------------------------------------------
-- Overview metrics: preserve the existing totals and add a recorded
-- course-visit counter without reordering existing columns.
-- ---------------------------------------------------------------------------
create or replace view public.admin_overview_metrics
with (security_invoker = true, security_barrier = true)
as
select
  (select count(*) from public.profiles) as registered_students,
  (select count(distinct user_id)
     from public.activity_events
    where occurred_at >= now() - interval '1 day') as active_students_24h,
  (select count(distinct user_id)
     from public.activity_events
    where occurred_at >= now() - interval '7 days') as active_students_7d,
  (select count(distinct user_id)
     from public.activity_events
    where occurred_at >= now() - interval '30 days') as active_students_30d,
  (select count(*) from public.sessions) as total_sessions,
  (select coalesce(sum(active_seconds), 0) from public.sessions) as total_active_seconds,
  (select count(*) from public.activity_events
    where event_name in ('resource_click', 'youtube_click', 'folder_link_clicked')) as total_resource_clicks,
  (select count(*) from public.activity_events
    where event_name = 'course_click') as total_course_visits
where (select public.is_admin());

revoke all on public.admin_overview_metrics from public, anon;
grant select on public.admin_overview_metrics to authenticated;

-- ---------------------------------------------------------------------------
-- Course analytics: preserve total interaction count but expose actual course
-- visits separately. A resource click is not a course visit.
-- ---------------------------------------------------------------------------
create or replace view public.admin_course_analytics
with (security_invoker = true, security_barrier = true)
as
select
  c.id as course_id,
  c.slug as course_slug,
  c.title as course_title,
  count(distinct e.user_id) filter (
    where e.event_name in ('course_click', 'folder_link_clicked', 'resource_click', 'youtube_click')
  ) as engaged_students,
  count(*) filter (
    where e.event_name in ('course_click', 'folder_link_clicked', 'resource_click', 'youtube_click')
  ) as interaction_count,
  count(*) filter (
    where e.event_name in ('resource_click', 'youtube_click', 'folder_link_clicked')
  ) as resource_click_count,
  max(e.occurred_at) as last_interaction_at,
  count(*) filter (where e.event_name = 'course_click') as course_visit_count
from public.courses c
left join public.activity_events e on e.course_id = c.id
where (select public.is_admin())
group by c.id, c.slug, c.title;

revoke all on public.admin_course_analytics from public, anon;
grant select on public.admin_course_analytics to authenticated;

-- ---------------------------------------------------------------------------
-- Session analytics: real event count and last page observed per session.
-- Session start/end markers are excluded from last_path selection because
-- those records carry the entry path rather than a later navigation path.
-- ---------------------------------------------------------------------------
create or replace view public.admin_session_analytics
with (security_invoker = true, security_barrier = true)
as
select
  s.id,
  s.user_id,
  s.started_at,
  s.last_heartbeat_at,
  s.ended_at,
  s.active_seconds,
  s.entry_path,
  s.created_at,
  count(e.id)::bigint as event_count,
  (
    array_agg(e.page_path order by e.occurred_at desc)
      filter (
        where e.page_path is not null
          and e.event_name not in ('session_started', 'session_ended')
      )
  )[1] as last_path
from public.sessions s
left join public.activity_events e on e.session_id = s.id
where (select public.is_admin())
group by s.id;

revoke all on public.admin_session_analytics from public, anon;
grant select on public.admin_session_analytics to authenticated;

commit;
