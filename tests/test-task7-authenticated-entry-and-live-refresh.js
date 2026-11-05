const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const migration = read('supabase/migrations/009_portal_launch_reset_and_authenticated_entry.sql');
const tracker = read('js/tracker.js');
const bridge = read('js/supabase-client.js');
const app = read('js/admin/app.js');
const adapter = read('js/admin/supabase-adapter.js');
const index = read('index.html');
const admin = read('admin/index.html');
const privacy = read('privacy.html');

const checks = [
  ['archives old telemetry', () => {
    ['sessions_pre_launch','activity_events_pre_launch','anonymous_visitors_pre_launch','anonymous_sessions_pre_launch','anonymous_activity_events_pre_launch']
      .forEach(t => assert(migration.includes('analytics_archive.' + t)));
    assert(migration.includes('analytics_archive.rollover_log'));
    assert(migration.includes("rollover_key = 'electronics-2nd-year-resources-launch-2026-11-05'"));
    ['public.activity_events','public.sessions','public.anonymous_activity_events','public.anonymous_sessions','public.anonymous_visitors']
      .forEach(t => assert(migration.toLowerCase().includes('delete from ' + t)));
    ['public.profiles','public.courses','public.resources','auth.users']
      .forEach(t => assert(!migration.toLowerCase().includes('delete from ' + t)));
  }],
  ['authenticated entry RPC derives user from auth.uid', () => {
    assert(migration.includes('record_authenticated_portal_event'));
    assert(migration.includes("p_event_name not in ('page_view', 'login_success')"));
    assert(migration.includes('auth.uid()'));
    assert(migration.includes('last_login_at'));
    assert(migration.includes('page_view_count'));
  }],
  ['guest visit is specifically a login-gate view', () => {
    assert(tracker.includes("source: 'login_gate'"));
    assert(tracker.includes("pauseAnonymousSession('login-gate-view-recorded'"));
    assert(tracker.includes("reason: userId ? 'no_active_session' : 'login_gate_only'"));
  }],
  ['authenticated entry page/login events are recorded', () => {
    assert(tracker.includes('recordAuthenticatedEntry(true)'));
    assert(tracker.includes('recordAuthenticatedEntry(false)'));
    assert(bridge.includes('trackAuthenticatedPortalEvent'));
    assert(bridge.includes("rpc('record_authenticated_portal_event'"));
  }],
  ['admin overview and gate list silently refresh every 10 seconds', () => {
    assert(app.includes('AUTO_REFRESH_INTERVAL_MS = 10000'));
    assert(app.includes('setInterval(function()'));
    assert(app.includes('load(true)'));
    assert(app.includes('تتحدّث الإحصائيات تلقائيًا كل 10 ثوانٍ'));
    assert(app.includes('تتحدّث القائمة تلقائيًا كل 10 ثوانٍ'));
    assert(!app.includes('location.reload('));
  }],
  ['guest view is not described as student content engagement', () => {
    assert(app.includes('زيارات شاشة تسجيل الدخول'));
    assert(app.includes('مشاهدات شاشة تسجيل الدخول'));
    assert(adapter.includes('Login Gate Visits'));
    assert(adapter.includes('Login Gate Page Views'));
    const start = app.indexOf("var visitors = listView('visitors'");
    const end = app.indexOf("var sessions = listView('sessions'", start);
    assert(start >= 0 && end > start);
    assert(!app.slice(start, end).includes('U.dur(v.totalSeconds)'));
  }],
  ['new product brand is applied to public/admin/privacy pages', () => {
    assert(index.includes('<title>Electronics 2nd Year Resources</title>'));
    assert(index.includes('<h2 class="login-gate-title">Electronics 2nd Year Resources</h2>'));
    assert(admin.includes('Admin Dashboard — Electronics 2nd Year Resources'));
    assert(admin.includes('<small>Electronics 2nd Year Resources</small>'));
    assert(privacy.includes('Privacy Policy — Electronics 2nd Year Resources'));
  }],
  ['privacy notice explains the mandatory login gate accurately', () => {
    assert(privacy.includes('لا يظهر للزائر محتوى المواد'));
    assert(privacy.includes('شاشة تسجيل الدخول الإلزامية فقط'));
    assert(privacy.includes('بعد نجاح تسجيل الدخول'));
    assert(!privacy.includes('PostHog'));
    assert(!privacy.includes('Google Analytics 4'));
  }]
];

let failures = 0;
for (const [name, run] of checks) {
  try { run(); console.log('PASS — ' + name); }
  catch (error) { failures++; console.error('FAIL — ' + name + '\\n' + error.stack); }
}
console.log('TASK 7: ' + (checks.length - failures) + '/' + checks.length + ' passed');
if (failures) process.exit(1);
