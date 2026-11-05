/**
 * Task 6 acceptance tests: anonymous visitor tracking and admin reporting.
 * These tests are source-level and browser-harness checks; the SQL still needs
 * to be applied to the target Supabase project for live integration testing.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const migration = read('supabase/migrations/008_anonymous_visitor_analytics.sql');
const tracker = read('js/tracker.js');
const bridge = read('js/supabase-client.js');
const adapter = read('js/admin/supabase-adapter.js');
const app = read('js/admin/app.js');
const contract = read('js/admin/contract.js');
const mock = read('js/admin/mock-adapter.js');
const privacy = read('privacy.html');
const workflow = read('.github/workflows/portal-tests.yml');

const tests = [];
function testCase(name, fn) { tests.push({ name, fn }); }

testCase('Migration creates isolated anonymous visitor, session, and event tables', function () {
  ['anonymous_visitors', 'anonymous_sessions', 'anonymous_activity_events'].forEach(function (name) {
    assert(migration.includes('create table if not exists public.' + name));
    assert(migration.includes('alter table public.' + name + ' enable row level security'));
  });
  assert(migration.includes('unique (visitor_id, client_session_id)'));
  assert(migration.includes('anonymous_events_visitor_time_idx'));
});

testCase('Anonymous browser roles have no direct table writes and no direct reads', function () {
  ['anonymous_visitors', 'anonymous_sessions', 'anonymous_activity_events'].forEach(function (name) {
    assert(migration.includes('revoke all on public.' + name + ' from public, anon, authenticated'));
  });
  assert(migration.includes('create policy "anonymous_visitors_admin_read"'));
  assert(migration.includes('create policy "anonymous_sessions_admin_read"'));
  assert(migration.includes('create policy "anonymous_events_admin_read"'));
});

testCase('Anonymous RPCs reject signed-in writes and restrict event payloads', function () {
  const start = migration.slice(migration.indexOf('create or replace function public.start_anonymous_visitor_session'), migration.indexOf('-- Anonymous events share'));
  const track = migration.slice(migration.indexOf('create or replace function public.track_anonymous_visitor_event'), migration.indexOf('-- Heartbeats credit'));
  assert(start.includes('if auth.uid() is not null'));
  assert(track.includes('if auth.uid() is not null'));
  const heartbeat = migration.slice(migration.indexOf('create or replace function public.heartbeat_anonymous_visitor_session'), migration.indexOf('-- End is best-effort'));
  const end = migration.slice(migration.indexOf('create or replace function public.end_anonymous_visitor_session'), migration.indexOf('-- Anonymous writes are RPC-only'));
  assert(heartbeat.includes('if auth.uid() is not null'), 'Authenticated users must not heartbeat anonymous sessions');
  assert(end.includes('if auth.uid() is not null'), 'Authenticated users must not close anonymous sessions');
  assert(track.includes("'page_view'"));
  assert(track.includes('jsonb_object_keys'));
  assert(track.includes('octet_length(v_properties::text) > 512'));
  assert(track.includes('Anonymous tracking rate limit exceeded'));
  assert(track.includes("regexp_replace(coalesce(p_page_path, '/'), '[?#].*$'"));
});

testCase('Anonymous RPC grants are narrow and admin summary view is guarded', function () {
  ['start_anonymous_visitor_session', 'track_anonymous_visitor_event', 'heartbeat_anonymous_visitor_session', 'end_anonymous_visitor_session'].forEach(function (fn) {
    assert(migration.includes('revoke all on function public.' + fn));
    assert(migration.includes('grant execute on function public.' + fn));
  });
  assert(migration.includes('create or replace view public.admin_anonymous_visitor_summary'));
  assert(migration.includes('security_invoker = true, security_barrier = true'));
  assert(migration.includes('where (select public.is_admin())'));
});

testCase('Browser bridge exposes anonymous session lifecycle and rejects signed-in tracking', function () {
  ['startAnonymousVisitorSession', 'heartbeatAnonymousVisitorSession', 'endAnonymousVisitorSession', 'trackAnonymousVisitorEvent'].forEach(function (fn) {
    assert(bridge.includes('function ' + fn));
    assert(bridge.includes(fn + ': ' + fn));
  });
  assert(bridge.includes("rpc('start_anonymous_visitor_session'"));
  assert(bridge.includes("rpc('track_anonymous_visitor_event'"));
  assert(bridge.includes('authenticated_user_skipped'));
});

testCase('Tracker attempts anonymous page_view on page load and persists only random UUIDs', function () {
  assert(tracker.includes('function initializeAnonymousTracking()'));
  assert(tracker.includes('initializeAnonymousTracking();'));
  assert(tracker.includes("event_name: 'page_view'"));
  assert(tracker.includes('portal_anonymous_visitor_key'));
  assert(tracker.includes('portal_anonymous_session_id'));
  assert(tracker.includes('sendAnonymousHeartbeat'));
  assert(tracker.includes('pauseAnonymousSession'));
  assert(tracker.includes('var requestClientSessionId = anonymousClientSessionId;'));
  const pauseStart = tracker.indexOf('function pauseAnonymousSession(');
  const pauseEnd = tracker.indexOf('async function recordAnonymousPageView', pauseStart);
  const pauseBlock = tracker.slice(pauseStart, pauseEnd);
  assert(pauseBlock.includes('renewAnonymousTabSessionId();'), 'Session key must rotate before unload/end');
});

testCase('Admin dashboard exposes anonymous visitor KPIs, list page, and CSV report', function () {
  assert(contract.includes("'getAnonymousVisitors'"));
  assert(adapter.includes('async function getAnonymousVisitors('));
  assert(adapter.includes("if (type === 'visitors')"));
  assert(app.includes("['anonymousVisitors', 'الزوار بدون تسجيل (الفترة)'"));
  assert(app.includes("['visitors', 'الزوار بدون تسجيل'"));
  assert(app.includes("['visitors', 'تقرير الزوار بدون تسجيل'"));
  assert(mock.includes('getAnonymousVisitors: function'));
});

testCase('Privacy notice explains pseudonymous visitor ID and non-collection of IP/fingerprints', function () {
  assert(privacy.includes('معرّفًا عشوائيًا للمتصفح'));
  assert(privacy.includes('لا نجمع عنوان IP أو بصمة الجهاز'));
});

testCase('CI syntax-checks and runs Task 6 acceptance tests', function () {
  assert(workflow.includes('node --check tests/test-task6-anonymous-visitors.js'));
  assert(workflow.includes('node tests/test-task6-anonymous-visitors.js'));
});

testCase('Browser harness records a guest page view immediately without a click', async function () {
  const sessionUuid = '123e4567-e89b-42d3-a456-426614174000';
  const visitorUuid = '123e4567-e89b-42d3-a456-426614174001';
  const clientSessionUuid = '123e4567-e89b-42d3-a456-426614174002';
  const calls = { start: 0, events: [], heartbeat: 0, end: 0 };
  const makeStorage = (initial) => {
    const data = Object.assign({}, initial || {});
    return {
      getItem: (key) => data[key] || null,
      setItem: (key, value) => { data[key] = value; },
      _data: data
    };
  };
  const localStorage = makeStorage({ portal_anonymous_visitor_key: visitorUuid });
  const sessionStorage = makeStorage({ portal_anonymous_session_id: clientSessionUuid });
  const docListeners = {};
  const winListeners = {};
  const fakeWindow = {
    APP_CONFIG: { analytics: { debug: false, clickDebounceMs: 1000 } },
    location: { pathname: '/electronics-2nd-year-materials/' },
    localStorage: localStorage,
    sessionStorage: sessionStorage,
    addEventListener: (name, fn) => { winListeners[name] = fn; },
    dispatchEvent: () => {},
    scrollTo: () => {},
    document: null,
    SupabaseBridge: {
      isReady: () => true,
      isUuid: (value) => /^[0-9a-f-]{36}$/i.test(value),
      getCurrentUser: async () => null,
      startAnonymousVisitorSession: async (visitorKey, clientId) => {
        calls.start++;
        assert.strictEqual(visitorKey, visitorUuid);
        assert.strictEqual(clientId, clientSessionUuid);
        return sessionUuid;
      },
      trackAnonymousVisitorEvent: async (event, visitorKey, clientId) => {
        calls.events.push({ event, visitorKey, clientId });
        return { success: true, event_id: calls.events.length };
      },
      heartbeatAnonymousVisitorSession: async () => { calls.heartbeat++; return 30; },
      endAnonymousVisitorSession: async () => { calls.end++; return true; },
      getCurrentUser: async () => null,
      onAuthStateChange: () => function () {}
    }
  };
  fakeWindow.document = {
    readyState: 'complete',
    visibilityState: 'visible',
    addEventListener: (name, fn) => { docListeners[name] = fn; },
    getElementById: () => null,
    querySelector: () => null
  };

  new Function('self', 'root', 'window', 'document', 'sessionStorage', tracker)(
    fakeWindow, fakeWindow, fakeWindow, fakeWindow.document, sessionStorage
  );
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.strictEqual(calls.start, 1, 'A guest page load should start one anonymous session');
  assert(calls.events.some((x) => x.event.event_name === 'page_view'), 'A page_view must be written at load');
  assert.strictEqual(calls.events[0].visitorKey, visitorUuid);
  fakeWindow.PortalTracker.stopHeartbeat();
});

(async function run() {
  let failures = 0;
  for (const item of tests) {
    try {
      await item.fn();
      console.log('  ✅ PASS — ' + item.name);
    } catch (error) {
      failures++;
      console.error('  ❌ FAIL — ' + item.name);
      console.error(error && error.stack ? error.stack : error);
    }
  }
  console.log('============================================================');
  console.log('TASK 6 ACCEPTANCE: ' + (tests.length - failures) + '/' + tests.length + ' passed');
  console.log('============================================================');
  if (failures) process.exit(1);
})();
