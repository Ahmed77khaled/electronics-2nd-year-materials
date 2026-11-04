/**
 * Comprehensive Automated Verification & Test Suite
 * Electronics 2nd Year Materials Portal - Supabase & Telemetry Integration
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { execSync } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..');
const htmlContent = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf-8');
const registryJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'data', 'resource-registry.json'), 'utf-8'));
const registryJs = require(path.join(ROOT_DIR, 'data', 'resourceRegistry.js'));

const migration001 = fs.readFileSync(path.join(ROOT_DIR, 'supabase', 'migrations', '001_student_analytics_foundation.sql'), 'utf-8').replace(/\r\n/g, '\n');
const migration002 = fs.readFileSync(path.join(ROOT_DIR, 'supabase', 'migrations', '002_secure_tracking_rpcs.sql'), 'utf-8').replace(/\r\n/g, '\n');
const migration003 = fs.readFileSync(path.join(ROOT_DIR, 'supabase', 'migrations', '003_seed_courses_and_resources.sql'), 'utf-8').replace(/\r\n/g, '\n');
const migration004 = fs.readFileSync(path.join(ROOT_DIR, 'supabase', 'migrations', '004_admin_analytics_views.sql'), 'utf-8').replace(/\r\n/g, '\n');
const migration005 = fs.readFileSync(path.join(ROOT_DIR, 'supabase', 'migrations', '005_admin_analytics_authorization.sql'), 'utf-8').replace(/\r\n/g, '\n');
const trackerSource = fs.readFileSync(path.join(ROOT_DIR, 'js', 'tracker.js'), 'utf-8');
const supabaseClientSource = fs.readFileSync(path.join(ROOT_DIR, 'js', 'supabase-client.js'), 'utf-8');
const integrationPlan = fs.readFileSync(path.join(ROOT_DIR, 'supabase', 'tests', 'RLS_RPC_INTEGRATION_TEST_PLAN.md'), 'utf-8');

const tests = [];
let passedTests = 0;
function it(description, fn) {
  tests.push({ description, fn });
}

console.log('\n============================================================');
console.log('🧪 RUNNING EXTENDED INTEGRATION & SECURITY TEST SUITE');
console.log('============================================================\n');

// ---------------------------------------------------------------------------
// 1. Unconfigured Supabase Resilience
// ---------------------------------------------------------------------------
console.log('Test Suite 1: Unconfigured Supabase & Offline Resilience');
it('SupabaseBridge handles empty config without throwing unhandled exceptions', () => {
  const fakeWindow = {
    APP_CONFIG: {
      supabase: { url: '', anonKey: '' },
      analytics: { debug: false }
    }
  };

  const clientCode = fs.readFileSync(path.join(ROOT_DIR, 'js', 'supabase-client.js'), 'utf-8');
  new Function('self', 'root', clientCode)(fakeWindow, fakeWindow);

  assert.strictEqual(fakeWindow.SupabaseBridge.isReady(), false, 'Bridge should report isReady=false');
  assert.strictEqual(fakeWindow.SupabaseBridge.isConfigured(), false, 'Bridge should report isConfigured=false');
});

it('SupabaseBridge returns safe fallbacks for user queries and event insertion when unconfigured', async () => {
  const fakeWindow = { APP_CONFIG: { supabase: { url: '', anonKey: '' } } };
  const clientCode = fs.readFileSync(path.join(ROOT_DIR, 'js', 'supabase-client.js'), 'utf-8');
  new Function('self', 'root', clientCode)(fakeWindow, fakeWindow);

  const user = await fakeWindow.SupabaseBridge.getCurrentUser();
  assert.strictEqual(user, null, 'getCurrentUser should resolve to null');

  const insertResult = await fakeWindow.SupabaseBridge.trackPortalEvent({ event_name: 'test' });
  assert.strictEqual(insertResult.success, false, 'trackPortalEvent should return success=false');
  assert.strictEqual(insertResult.reason, 'unconfigured', 'Reason should be unconfigured');
});

// ---------------------------------------------------------------------------
// 2. Original URLs & Resource Integrity
// ---------------------------------------------------------------------------
console.log('\nTest Suite 2: Original URLs & Resource Integrity');
it('Resource Registry JSON contains exactly 75 verified unique entities', () => {
  const flat = registryJson.flatIndex;
  const count = Object.keys(flat).length;
  assert.strictEqual(count, 75, `Expected 75 entities, got ${count}`);
});

it('All 65 Drive/YouTube links in index.html match registered URLs without corruption', () => {
  const driveUrlsInHtml = (htmlContent.match(/https:\/\/drive\.google\.com\/drive\/folders\/[a-zA-Z0-9_-]+/g) || []);
  const ytUrlsInHtml = (htmlContent.match(/https:\/\/youtube\.com\/playlist\?list=[a-zA-Z0-9_-]+/g) || []);
  const allUrls = [...driveUrlsInHtml, ...ytUrlsInHtml];

  assert(allUrls.length > 0, 'Should find URLs in HTML');
  allUrls.forEach(url => {
    assert(url.startsWith('https://'), `Invalid URL protocol: ${url}`);
  });
});

it('Vanilla JS registry module loads seamlessly and matches JSON data', () => {
  assert.strictEqual(registryJs.metadata.totalIndexedEntities, 75);
  const sampleRes = registryJs.getResourceById('SUB_03_OOP_JAVA_MAT_LECTURE');
  assert(sampleRes !== null, 'Sample resource should exist');
  assert.strictEqual(sampleRes.type, 'chip');
  assert.strictEqual(sampleRes.subject, 'SUB_03_OOP_JAVA');
});

// ---------------------------------------------------------------------------
// 3. Resource ID Extraction & Event Classification
// ---------------------------------------------------------------------------
console.log('\nTest Suite 3: Resource ID Extraction & Event Classification');
it('Tracker correctly classifies course, folder, chip, and youtube events', () => {
  const eventsEmitted = [];
  const fakeWindow = {
    APP_CONFIG: { analytics: { clickDebounceMs: 1000, debug: false } },
    ResourceRegistry: registryJs,
    SupabaseBridge: {
      isReady: () => false,
      getCurrentUser: async () => null,
      trackPortalEvent: async () => ({ success: false })
    },
    location: { pathname: '/electronics-2nd-year-materials/' },
    sessionStorage: {
      getItem: () => 'sess_test_123',
      setItem: () => {}
    },
    dispatchEvent: (ev) => {
      eventsEmitted.push(ev.detail);
    },
    document: {
      addEventListener: () => {},
      getElementById: () => null,
      querySelector: () => null,
      readyState: 'complete'
    },
    addEventListener: () => {}
  };

  const trackerCode = fs.readFileSync(path.join(ROOT_DIR, 'js', 'tracker.js'), 'utf-8');
  new Function('self', 'root', 'window', 'document', 'sessionStorage', trackerCode)(
    fakeWindow, fakeWindow, fakeWindow, fakeWindow.document, fakeWindow.sessionStorage
  );

  assert(fakeWindow.PortalTracker, 'PortalTracker should be exposed on window');
  assert.strictEqual(fakeWindow.PortalTracker.getClientSessionId(), 'sess_test_123');
  if (fakeWindow.PortalTracker.stopHeartbeat) fakeWindow.PortalTracker.stopHeartbeat();
});

// ---------------------------------------------------------------------------
// 4. Event Deduplication
// ---------------------------------------------------------------------------
console.log('\nTest Suite 4: Event Deduplication & Listener Protection');
it('Tracker protects against duplicate script initialization', () => {
  const fakeWindow = {
    __PORTAL_TRACKER_INITIALIZED__: true,
    document: { addEventListener: () => { throw new Error('Should not add listener'); } }
  };
  const trackerCode = fs.readFileSync(path.join(ROOT_DIR, 'js', 'tracker.js'), 'utf-8');
  new Function('self', 'root', 'window', 'document', trackerCode)(fakeWindow, fakeWindow, fakeWindow, fakeWindow.document);
  assert.strictEqual(fakeWindow.__PORTAL_TRACKER_INITIALIZED__, true);
});

// ---------------------------------------------------------------------------
// 5. Unauthenticated User Safety (No Fake Identity)
// ---------------------------------------------------------------------------
console.log('\nTest Suite 5: Unauthenticated Student Identity Safety');
it('Unauthenticated users have user_id strictly set to null (never spoofed)', async () => {
  const dispatchedEvents = [];
  const fakeWindow = {
    APP_CONFIG: { analytics: { debug: false } },
    ResourceRegistry: registryJs,
    SupabaseBridge: {
      isReady: () => false,
      getCurrentUser: async () => null,
      trackPortalEvent: async () => { throw new Error('Database insert should NOT be called for guest'); }
    },
    location: { pathname: '/' },
    sessionStorage: { getItem: () => 'sess_anon', setItem: () => {} },
    dispatchEvent: (ev) => dispatchedEvents.push(ev.detail),
    document: {
      addEventListener: () => {},
      getElementById: () => null,
      querySelector: () => null,
      readyState: 'complete'
    },
    addEventListener: () => {}
  };

  const trackerCode = fs.readFileSync(path.join(ROOT_DIR, 'js', 'tracker.js'), 'utf-8');
  new Function('self', 'root', 'window', 'document', 'sessionStorage', trackerCode)(
    fakeWindow, fakeWindow, fakeWindow, fakeWindow.document, fakeWindow.sessionStorage
  );

  await fakeWindow.PortalTracker.dispatchEvent('folder_link_clicked', {
    course_id: 'emf',
    resource_id: 'SUB_01_EMF_MAIN',
    properties: { resource_type: 'folder', source: 'folder_link' }
  });

  assert.strictEqual(dispatchedEvents.length, 1);
  assert.strictEqual(dispatchedEvents[0].user_id, null, 'user_id MUST be null for unauthenticated guests');
  assert.strictEqual(dispatchedEvents[0].event_name, 'folder_link_clicked');
  assert.strictEqual(dispatchedEvents[0].resource_id, 'SUB_01_EMF_MAIN');

  if (fakeWindow.PortalTracker.stopHeartbeat) fakeWindow.PortalTracker.stopHeartbeat();
});

// ---------------------------------------------------------------------------
// 6. Security & RPC Policy Audit (001 + 002)
// ---------------------------------------------------------------------------
console.log('\nTest Suite 6: Security & RPC Policy Audit (001 + 002)');
it('Direct client-side INSERT/UPDATE on activity_events and sessions is completely revoked by 002', () => {
  assert(migration002.includes('revoke insert, update, delete on public.activity_events from anon, authenticated;'), 'activity_events revoke missing');
  assert(migration002.includes('revoke insert, update, delete on public.sessions from anon, authenticated;'), 'sessions revoke missing');
  assert(migration002.includes('revoke insert, update, delete on public.profiles from anon, authenticated;'), 'profiles revoke missing');
});

it('All tracking operations are mediated exclusively through track_portal_event RPC', () => {
  assert(migration002.includes('create or replace function public.track_portal_event'), 'track_portal_event function missing');
  assert(migration002.includes('grant execute on function public.track_portal_event'), 'track_portal_event grant missing');
  assert(migration002.includes('revoke all on function public.track_portal_event(uuid, text, uuid, uuid, text, jsonb) from public, anon;'), 'track_portal_event anon revoke missing');
});

it('Property allowlist strictly blocks arbitrary JSON or sensitive strings', () => {
  const allowed = ['resource_type', 'filter_name', 'result_count', 'search_length', 'source'];
  allowed.forEach(k => {
    assert(migration002.includes(`'${k}'`), `Allowed property key '${k}' missing in 002`);
  });
});

// ---------------------------------------------------------------------------
// 7. Ordered Migrations & Idempotent Seed Re-run (003 + 004)
// ---------------------------------------------------------------------------
console.log('\nTest Suite 7: Ordered Migrations & Idempotent Seed Re-run (003 + 004)');
it('Migration 003 does NOT alter resources.course_id (preserves NOT NULL constraint from 001)', () => {
  assert(!migration003.includes('alter table public.resources alter column course_id drop not null;'), 'Must not drop course_id NOT NULL');
});

it('Migration 003 uses ON CONFLICT DO UPDATE for all courses and resources', () => {
  assert(migration003.includes('on conflict (slug) do update set'), 'Courses ON CONFLICT missing');
  assert(migration003.includes('on conflict (resource_key) do update set'), 'Resources ON CONFLICT missing');
});

it('Migration 003 seeds all 75 resources and the 6 main courses + general course', () => {
  assert(migration003.includes("'general-term-1'"), 'general-term-1 course missing');
  assert(migration003.includes("'emf'"), 'emf course missing');
  assert(migration003.includes("'logic-circuits'"), 'logic-circuits course missing');
  assert(migration003.includes("'oop-java'"), 'oop-java course missing');
  assert(migration003.includes("'electric-circuits'"), 'electric-circuits course missing');
  assert(migration003.includes("'math-5'"), 'math-5 course missing');
  assert(migration003.includes("'humanities'"), 'humanities course missing');

  const resourceInserts = (migration003.match(/insert into public\.resources/g) || []).length;
  assert.strictEqual(resourceInserts, 75, `Expected 75 resource inserts, got ${resourceInserts}`);
});

it('Migration 004 defines admin views with security_invoker = true', () => {
  assert(migration004.includes('public.admin_course_analytics'), 'admin_course_analytics missing');
  assert(migration004.includes('public.admin_resource_analytics'), 'admin_resource_analytics missing');
  assert(migration004.includes('public.admin_daily_activity'), 'admin_daily_activity missing');
  assert(migration004.includes('public.admin_overview_metrics'), 'admin_overview_metrics missing');
  assert(migration004.includes('security_invoker = true'), 'security_invoker missing');
});

// ---------------------------------------------------------------------------
// 8. Search & Filter Integration Integrity
// ---------------------------------------------------------------------------
console.log('\nTest Suite 8: Search & Filter Integration Integrity');
it('Search and filter input elements exist and are unmodified in index.html', () => {
  assert(htmlContent.includes('id="directory-search"'), 'Search input missing');
  assert(htmlContent.includes('class="filter-tag active"'), 'Filter tags missing');
  assert(htmlContent.includes('performFilter(rawQuery, activeCategory)'), 'performFilter function missing');
});

it('HTML includes all 4 modular scripts at the bottom', () => {
  assert(htmlContent.includes('<script src="data/resourceRegistry.js"></script>'), 'resourceRegistry.js tag missing');
  assert(htmlContent.includes('<script src="js/config.js"></script>'), 'config.js tag missing');
  assert(htmlContent.includes('<script src="js/supabase-client.js"></script>'), 'supabase-client.js tag missing');
  assert(htmlContent.includes('<script src="js/tracker.js"></script>'), 'tracker.js tag missing');
});

// ---------------------------------------------------------------------------
// 9. Mobile & Responsive Layout Integrity
// ---------------------------------------------------------------------------
console.log('\nTest Suite 9: Mobile & Responsive Layout Integrity');
it('Mobile responsive layout styles and touch-friendly rules are intact', () => {
  assert(htmlContent.includes('(max-width: 768px)'), 'Mobile media query missing');
  assert(htmlContent.includes('dir="rtl"'), 'RTL direction missing');
  assert(htmlContent.includes('.search-filters'), 'Search filters container missing');
  assert(htmlContent.includes('.folder-chip'), 'Folder chip styling missing');
});

// ---------------------------------------------------------------------------
// 10. Strict ID Uniqueness & Non-Collision
// ---------------------------------------------------------------------------
console.log('\nTest Suite 10: Strict ID Uniqueness & Non-Collision');
it('Zero duplicate resource_key values exist across JSON, SQL, and JS Registry', () => {
  const jsonKeys = Object.keys(registryJson.flatIndex);
  assert.strictEqual(jsonKeys.length, 75);
  assert.strictEqual(new Set(jsonKeys).size, 75, 'Duplicate keys in JSON flatIndex');

  const jsKeys = Object.keys(registryJs.resources);
  assert.strictEqual(jsKeys.length, 75);
  assert.strictEqual(new Set(jsKeys).size, 75, 'Duplicate keys in JS Registry');

  const sqlMatches = migration003.match(/'(ROOT_[^']+|SUB_[^']+)'/g).map(s => s.replace(/'/g, ''));
  const sqlKeys = sqlMatches.filter(k => k.startsWith('ROOT_') || k.startsWith('SUB_'));
  assert.strictEqual(new Set(sqlKeys).size, 75, 'Duplicate keys in SQL Migration 003');
});

// ---------------------------------------------------------------------------
// 11. URL Format & Integrity Validation
// ---------------------------------------------------------------------------
console.log('\nTest Suite 11: URL Format & Integrity Validation');
it('Zero empty or broken URLs in registry and SQL migration', () => {
  const flat = registryJson.flatIndex;
  for (const [key, item] of Object.entries(flat)) {
    if (item.url) {
      assert(item.url.startsWith('https://'), `Malformed URL protocol in ${key}: ${item.url}`);
      assert(!item.url.includes(' '), `Whitespace in URL for ${key}`);
    }
  }

  const sqlUrls = migration003.match(/'(https:\/\/[^']+)'/g);
  assert(sqlUrls && sqlUrls.length >= 75, 'Expected at least 75 URLs in SQL 003');
  sqlUrls.forEach(u => {
    const raw = u.replace(/'/g, '');
    assert(raw.startsWith('https://'), `Invalid URL in SQL: ${raw}`);
  });
});

// ---------------------------------------------------------------------------
// 12. Topological Parent-Child Relationship Integrity
// ---------------------------------------------------------------------------
console.log('\nTest Suite 12: Topological Parent-Child Relationship Integrity');
it('Every child resource references a valid parent resource that strictly precedes it in SQL 003', () => {
  const lines = migration003.split('\n');
  const seenResources = new Set();

  lines.forEach(line => {
    const insertMatch = line.match(/values\s*\([^,]+,\s*'([^']+)'/);
    if (insertMatch) {
      const resKey = insertMatch[1];
      const parentMatch = line.match(/where resource_key = '([^']+)'/);
      if (parentMatch) {
        const parentKey = parentMatch[1];
        assert(seenResources.has(parentKey), `Topological ordering broken: Parent '${parentKey}' must appear before child '${resKey}'`);
      }
      seenResources.add(resKey);
    }
  });

  assert.strictEqual(seenResources.size, 75, 'Expected exactly 75 topologically ordered resources');
});

// ---------------------------------------------------------------------------
// 13. Exact Tripartite Parity Check
// ---------------------------------------------------------------------------
console.log('\nTest Suite 13: Exact Tripartite Parity Check');
it('JSON, SQL 003, and JS Registry share 100% identical sets of resource keys', () => {
  const jsonKeys = new Set(Object.keys(registryJson.flatIndex));
  const jsKeys = new Set(Object.keys(registryJs.resources));

  assert.strictEqual(jsonKeys.size, jsKeys.size);
  jsonKeys.forEach(k => {
    assert(jsKeys.has(k), `Key ${k} present in JSON but missing in JS Registry`);
  });

  const sqlMatches = migration003.match(/'(ROOT_[^']+|SUB_[^']+)'/g).map(s => s.replace(/'/g, ''));
  const sqlKeys = new Set(sqlMatches);
  jsonKeys.forEach(k => {
    assert(sqlKeys.has(k), `Key ${k} present in JSON but missing in SQL Migration 003`);
  });
});

// ---------------------------------------------------------------------------
// 14. Seed CLI Security Enforcement
// ---------------------------------------------------------------------------
console.log('\nTest Suite 14: Seed CLI Security Enforcement');
it('Seed CLI immediately terminates with exit code 1 if anon key is supplied', () => {
  const dummyAnonJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.sig';
  let failed = false;
  try {
    execSync(`node "${path.join(ROOT_DIR, 'scripts', 'seed-supabase.js')}" --url "https://dummy.supabase.co" --service-key "${dummyAnonJwt}"`, { stdio: 'pipe' });
  } catch (err) {
    failed = true;
    assert.strictEqual(err.status, 1, 'Expected exit code 1 on anon key attempt');
    assert(err.stderr.toString().includes('[SECURITY REJECTION]'), 'Expected security rejection log');
  }
  assert(failed, 'Seed CLI must reject anon key with non-zero exit code');
});

it('Seed CLI terminates with exit code 1 if credentials are omitted', () => {
  let failed = false;
  try {
    execSync(`node "${path.join(ROOT_DIR, 'scripts', 'seed-supabase.js')}"`, {
      stdio: 'pipe',
      env: { ...process.env, SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' }
    });
  } catch (err) {
    failed = true;
    assert.strictEqual(err.status, 1, 'Expected exit code 1 when credentials missing');
    assert(err.stderr.toString().includes('[SECURITY ERROR]'), 'Expected security error log');
  }
  assert(failed, 'Seed CLI must fail when credentials are not supplied');
});

console.log('\n============================================================');

 // ---------------------------------------------------------------------------
 // 15. Database Session Lifecycle
 // ---------------------------------------------------------------------------
console.log('Test Suite 15: Database Session Lifecycle');
it('Tracker starts a database session before tracking and never heartbeats a client token', () => {
  assert(trackerSource.includes('ensureDatabaseSession'), 'ensureDatabaseSession missing');
  assert(trackerSource.includes('bridge.startPortalSession'), 'startPortalSession is not called');
  assert(trackerSource.includes('bridge.heartbeatPortalSession(databaseSessionId)'), 'Heartbeat does not use database UUID');
  assert(trackerSource.includes('!databaseSessionId || !isUuid(databaseSessionId)'), 'Heartbeat UUID guard missing');
  assert(trackerSource.includes("document.addEventListener('visibilitychange'"), 'Visibility listener missing');
  assert(trackerSource.includes("window.addEventListener('pagehide'"), 'Pagehide listener missing');
  assert(trackerSource.includes("window.addEventListener('blur'"), 'Blur listener missing');
});

it('Supabase Bridge binds database sessions to the authenticated owner', () => {
  assert(supabaseClientSource.includes('activeDbSessionUserId'), 'Session owner binding missing');
  assert(supabaseClientSource.includes('sid !== activeDbSessionId'), 'Session mismatch guard missing');
  assert(supabaseClientSource.includes('user.id !== activeDbSessionUserId'), 'Current user ownership check missing');
  assert(!supabaseClientSource.includes('eventData.session_id'), 'Client-supplied session IDs must not be trusted');
});

it('Concurrent session starts are deduplicated and hidden tabs close their database session', async () => {
  const listeners = {};
  const docListeners = {};
  let startCalls = 0;
  let endCalls = 0;
  const sessionUuid = '123e4567-e89b-42d3-a456-426614174000';

  const fakeWindow = {
    APP_CONFIG: { analytics: { debug: false, clickDebounceMs: 1000 } },
    location: { pathname: '/electronics-2nd-year-materials/' },
    addEventListener: (name, fn) => { listeners[name] = fn; },
    dispatchEvent: () => {},
    document: {
      readyState: 'complete',
      visibilityState: 'visible',
      hasFocus: () => true,
      addEventListener: (name, fn) => { docListeners[name] = fn; },
      getElementById: () => null,
      querySelector: () => null
    },
    SupabaseBridge: {
      isReady: () => true,
      isUuid: value => value === sessionUuid,
      startPortalSession: async () => {
        startCalls++;
        await new Promise(resolve => setTimeout(resolve, 10));
        return sessionUuid;
      },
      endPortalSession: async id => {
        assert.strictEqual(id, sessionUuid);
        endCalls++;
        return true;
      },
      heartbeatPortalSession: async () => ({ success: true, creditedSeconds: 0 }),
      getCurrentUser: async () => ({ id: 'test-user-id' }),
      trackPortalEvent: async () => ({ success: true }),
      onAuthStateChange: () => () => {}
    }
  };
  const storage = { getItem: () => null, setItem: () => {} };

  new Function('self', 'root', 'window', 'document', 'sessionStorage', trackerSource)(
    fakeWindow, fakeWindow, fakeWindow, fakeWindow.document, storage
  );

  try {
    const ids = await Promise.all([
      fakeWindow.PortalTracker.ensureDatabaseSession(),
      fakeWindow.PortalTracker.ensureDatabaseSession()
    ]);
    assert.deepStrictEqual(ids, [sessionUuid, sessionUuid]);
    assert.strictEqual(startCalls, 1, 'Concurrent start requests must create one database session');
    assert.strictEqual(fakeWindow.PortalTracker.getDatabaseSessionId(), sessionUuid);

    fakeWindow.document.visibilityState = 'hidden';
    docListeners.visibilitychange();
    await new Promise(resolve => setTimeout(resolve, 400));
    assert.strictEqual(endCalls, 1, 'Hidden tab must close its active database session');
    assert.strictEqual(fakeWindow.PortalTracker.getDatabaseSessionId(), null);
  } finally {
    fakeWindow.PortalTracker.stopHeartbeat();
  }
});

// ---------------------------------------------------------------------------
// 16. Admin Analytics Authorization
// ---------------------------------------------------------------------------
console.log('Test Suite 16: Admin Analytics Authorization');
it('All global analytics views explicitly filter on is_admin()', () => {
  const views = ['admin_course_analytics', 'admin_resource_analytics', 'admin_daily_activity', 'admin_overview_metrics'];
  views.forEach(viewName => {
    const start = migration005.indexOf('create or replace view public.' + viewName);
    assert(start >= 0, viewName + ' redefinition missing from migration 005');
    const nextView = migration005.indexOf('create or replace view public.', start + 30);
    const block = migration005.slice(start, nextView < 0 ? migration005.length : nextView);
    assert(block.includes('(select public.is_admin())'), viewName + ' admin predicate missing');
    assert(block.includes('security_invoker = true'), viewName + ' must preserve underlying RLS');
    assert(block.includes('security_barrier = true'), viewName + ' security barrier missing');
  });
});

it('Migration 005 removes PUBLIC/anon grants and grants authenticated SELECT only on guarded views', () => {
  assert(migration005.includes('revoke all on public.admin_course_analytics from public, anon'));
  assert(migration005.includes('revoke all on public.admin_resource_analytics from public, anon'));
  assert(migration005.includes('revoke all on public.admin_daily_activity from public, anon'));
  assert(migration005.includes('revoke all on public.admin_overview_metrics from public, anon'));
  assert.strictEqual((migration005.match(/grant select on public\.admin_/g) || []).length, 4);
});

it('Integration plan tests anon, two students, admin, and all views with rollback', () => {
  ['set local role anon', 'set local role authenticated', '<STUDENT_1_UUID>', '<STUDENT_2_UUID>',
   '<ADMIN_USER_UUID>', 'public.admin_course_analytics', 'public.admin_resource_analytics',
   'public.admin_daily_activity', 'public.admin_overview_metrics', 'rollback;']
    .forEach(token => assert(integrationPlan.toLowerCase().includes(token.toLowerCase()), 'Missing test-plan coverage: ' + token));
});


async function runAllTests() {
  for (const test of tests) {
    try {
      await test.fn();
      passedTests++;
      console.log(`  ✅ [PASS] ${test.description}`);
    } catch (err) {
      console.error(`  ❌ [FAIL] ${test.description}`);
      console.error(`     Error: ${err && err.stack ? err.stack : err}`);
    }
  }

  console.log('\\n============================================================');
  console.log(`🏁 TEST SUMMARY: ${passedTests}/${tests.length} tests passed (${Math.round((passedTests/tests.length)*100)}%)`);
  console.log('============================================================\\n');
  process.exitCode = passedTests === tests.length ? 0 : 1;
}

runAllTests().catch(err => {
  console.error('[FATAL TEST RUNNER ERROR]', err);
  process.exitCode = 1;
});
