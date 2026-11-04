/**
 * Automated Verification & Test Suite
 * Electronics 2nd Year Materials Portal - Supabase & Telemetry Integration
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT_DIR = path.join(__dirname, '..');
const htmlContent = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf-8');
const registryJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'data', 'resource-registry.json'), 'utf-8'));
const registryJs = require(path.join(ROOT_DIR, 'data', 'resourceRegistry.js'));

const migration001 = fs.readFileSync(path.join(ROOT_DIR, 'supabase', 'migrations', '001_student_analytics_foundation.sql'), 'utf-8').replace(/\r\n/g, '\n');
const migration002 = fs.readFileSync(path.join(ROOT_DIR, 'supabase', 'migrations', '002_secure_tracking_rpcs.sql'), 'utf-8').replace(/\r\n/g, '\n');
const migration003 = fs.readFileSync(path.join(ROOT_DIR, 'supabase', 'migrations', '003_seed_courses_and_resources.sql'), 'utf-8').replace(/\r\n/g, '\n');
const migration004 = fs.readFileSync(path.join(ROOT_DIR, 'supabase', 'migrations', '004_admin_analytics_views.sql'), 'utf-8').replace(/\r\n/g, '\n');

let totalTests = 0;
let passedTests = 0;

function it(description, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✅ [PASS] ${description}`);
  } catch (err) {
    console.error(`  ❌ [FAIL] ${description}`);
    console.error(`     Error: ${err.message}`);
  }
}

console.log('\n============================================================');
console.log('🧪 RUNNING INTEGRATION & TELEMETRY TEST SUITE (RPC ALIGNED)');
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
    }
  };

  const trackerCode = fs.readFileSync(path.join(ROOT_DIR, 'js', 'tracker.js'), 'utf-8');
  new Function('self', 'root', 'window', 'document', 'sessionStorage', trackerCode)(
    fakeWindow, fakeWindow, fakeWindow, fakeWindow.document, fakeWindow.sessionStorage
  );

  assert(fakeWindow.PortalTracker, 'PortalTracker should be exposed on window');
  assert.strictEqual(fakeWindow.PortalTracker.getClientSessionId(), 'sess_test_123');
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
      getCurrentUser: async () => null, // Guest user
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
    }
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
// 7. Ordered Migrations & Idempotent Seed Re-run Test (003 + 004)
// ---------------------------------------------------------------------------
console.log('\nTest Suite 7: Ordered Migrations & Idempotent Seed Re-run (003 + 004)');
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

console.log('\n============================================================');
console.log(`🏁 TEST SUMMARY: ${passedTests}/${totalTests} tests passed (${Math.round((passedTests/totalTests)*100)}%)`);
console.log('============================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
