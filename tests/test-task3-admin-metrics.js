/**
 * Task 3 acceptance tests: admin metrics must come from recorded database events.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const adapter = fs.readFileSync(path.join(root, 'js', 'admin', 'supabase-adapter.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '007_admin_analytics_metric_accuracy.sql'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'portal-tests.yml'), 'utf8');

const tests = [];
function testCase(name, fn) {
  tests.push({ name, fn });
}

testCase('Overview page views use the dedicated page_view metric', function () {
  assert(adapter.includes('pageViews: pageViewsSum'));
  assert(adapter.includes('metrics.total_page_views'));
  assert(!/pageViews:\s*Number\(metrics\.total_resource_clicks/.test(adapter));
});

testCase('User activity counts are read from per-user event aggregates', function () {
  assert(adapter.includes('s.page_view_count'));
  assert(adapter.includes('s.course_visit_count'));
  assert(adapter.includes('s.resource_click_count'));
  assert(adapter.includes('s.first_activity_at'));
  assert(!adapter.includes('Math.round(user.sessions * 2.5)'));
  assert(!adapter.includes('Math.round(user.sessions * 1.8)'));
  assert(!/resourceClicks:\s*Number\(s\.session_count/.test(adapter));
});

testCase('Last login is sourced from login_success events, not last_active_at', function () {
  assert(adapter.includes('lastLoginAt: s.last_login_at || null'));
  assert(migration.includes("max(occurred_at) filter (where event_name = 'login_success') as last_login_at"));
});

testCase('Course visits count course_click events only', function () {
  assert(adapter.includes('visits: toNullableNumber(c.course_visit_count)'));
  assert(adapter.includes('value: toNullableNumber(c.course_visit_count)'));
  assert(migration.includes("count(*) filter (where e.event_name = 'course_click') as course_visit_count"));
});

testCase('Session event counts and last path come from activity_events', function () {
  assert(adapter.includes("from('admin_session_analytics')"));
  assert(adapter.includes('eventCount: toNullableNumber(s.event_count)'));
  assert(adapter.includes('lastPath: s.last_path || null'));
  assert(migration.includes('count(e.id)::bigint as event_count'));
  assert(migration.includes('as last_path'));
  assert(!/eventCount:\s*1/.test(adapter));
  assert(!/lastPath:\s*s\.entry_path/.test(adapter));
});

testCase('Interrupted sessions are distinguished using last heartbeat age', function () {
  assert(adapter.includes("return 'interrupted'"));
  assert(adapter.includes('session.last_heartbeat_at'));
  assert(adapter.includes("5 * 60 * 1000"));
});

testCase('Active-now KPI counts distinct users rather than open sessions', function () {
  assert(adapter.includes('activeUserIds[session.user_id] = true'));
  assert(adapter.includes('activeNow: Object.keys(activeUserIds).length'));
});

testCase('New or unavailable metrics remain null instead of being fabricated as zero', function () {
  assert(adapter.includes('function toNullableNumber(value)'));
  assert(adapter.includes('if (value === null || value === undefined || value === \'\') return null;'));
  assert(adapter.includes('pageViews: pageViewsSum'));
});

testCase('All new analytics views retain admin-only access and RLS semantics', function () {
  ['admin_student_summary', 'admin_overview_metrics', 'admin_course_analytics', 'admin_session_analytics'].forEach(function (viewName) {
    const start = migration.indexOf('create or replace view public.' + viewName);
    assert(start >= 0, viewName + ' definition missing');
    const next = migration.indexOf('create or replace view public.', start + 30);
    const block = migration.slice(start, next < 0 ? migration.length : next);
    assert(block.includes('security_invoker = true'), viewName + ' must use security_invoker');
    assert(block.includes('security_barrier = true'), viewName + ' must use security_barrier');
    assert(block.includes('(select public.is_admin())'), viewName + ' must be admin guarded');
  });
  assert(migration.includes('revoke all on public.admin_session_analytics from public, anon'));
  assert(migration.includes('grant select on public.admin_session_analytics to authenticated'));
});

testCase('GitHub Actions syntax-checks and runs the Task 3 acceptance test', function () {
  assert(workflow.includes('node --check tests/test-task3-admin-metrics.js'));
  assert(workflow.includes('node tests/test-task3-admin-metrics.js'));
});

let failures = 0;
for (const item of tests) {
  try {
    item.fn();
    console.log('  ✅ PASS — ' + item.name);
  } catch (error) {
    failures++;
    console.error('  ❌ FAIL — ' + item.name);
    console.error(error && error.stack ? error.stack : error);
  }
}
console.log('============================================================');
console.log('TASK 3 ACCEPTANCE: ' + (tests.length - failures) + '/' + tests.length + ' passed');
console.log('============================================================');
if (failures) process.exit(1);
