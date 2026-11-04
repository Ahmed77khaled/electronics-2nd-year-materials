-- Admin analytics views for the Student Analytics dashboard.
-- Apply after 001_student_analytics_foundation.sql and 002_secure_tracking_rpcs.sql.
-- Views use security_invoker so the underlying table RLS policies remain in force.
-- Students therefore see only their own underlying rows; admins see all rows.

begin;

-- Support time-window dashboards and active-session maintenance queries.
create index if not exists activity_occurred_at_idx
  on public.activity_events (occurred_at desc);
create index if not exists activity_user_event_time_idx
  on public.activity_events (user_id, event_name, occurred_at desc);
create index if not exists sessions_open_heartbeat_idx
  on public.sessions (last_heartbeat_at desc)
  where ended_at is null;

create or replace view public.admin_course_analytics
with (security_invoker = true)
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
  max(e.occurred_at) as last_interaction_at
from public.courses c
left join public.activity_events e on e.course_id = c.id
group by c.id, c.slug, c.title;

create or replace view public.admin_resource_analytics
with (security_invoker = true)
as
select
  r.id as resource_id,
  r.resource_key,
  r.title as resource_title,
  r.resource_type,
  r.course_id,
  c.slug as course_slug,
  c.title as course_title,
  count(e.id) filter (
    where e.event_name in ('resource_click', 'youtube_click', 'folder_link_clicked')
  ) as click_count,
  count(distinct e.user_id) filter (
    where e.event_name in ('resource_click', 'youtube_click', 'folder_link_clicked')
  ) as unique_students,
  max(e.occurred_at) filter (
    where e.event_name in ('resource_click', 'youtube_click', 'folder_link_clicked')
  ) as last_clicked_at
from public.resources r
join public.courses c on c.id = r.course_id
left join public.activity_events e on e.resource_id = r.id
group by r.id, r.resource_key, r.title, r.resource_type, r.course_id, c.slug, c.title;

create or replace view public.admin_daily_activity
with (security_invoker = true)
as
select
  timezone('UTC', e.occurred_at)::date as activity_date_utc,
  count(distinct e.user_id) as active_students,
  count(*) as event_count,
  count(distinct e.session_id) as sessions_with_activity
from public.activity_events e
group by timezone('UTC', e.occurred_at)::date;

create or replace view public.admin_overview_metrics
with (security_invoker = true)
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
    where event_name in ('resource_click', 'youtube_click', 'folder_link_clicked')) as total_resource_clicks;

grant select on public.admin_course_analytics to authenticated;
grant select on public.admin_resource_analytics to authenticated;
grant select on public.admin_daily_activity to authenticated;
grant select on public.admin_overview_metrics to authenticated;

commit;
