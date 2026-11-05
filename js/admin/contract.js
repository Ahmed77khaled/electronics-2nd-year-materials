/**
 * Admin Data Adapter — contract & registry.
 *
 * The admin UI never talks to Supabase (or anything else) directly. It only calls the adapter registered here.
 * The real Supabase adapter is a separate integration phase: it must call AdminData.register(adapter).
 * Until one is registered the UI shows an "unavailable" state — it never invents numbers.
 *
 * Every method returns a Promise (or a plain value). Any field may be null/undefined when the backend cannot
 * measure it; the UI then shows "غير متاح". Full shapes are documented in ADMIN_DASHBOARD.md.
 *
 *   filters    : { preset, from, to (ISO strings), search, userId, courseId, resourceType, eventName, status,
 *                  sessionStatus, minSeconds, maxSeconds, registeredFrom, registeredTo, sessionId }
 *   pagination : { page (1-based), pageSize, sort: { field, dir: 'asc'|'desc' } }
 *   paged result: { items: [...], total: <number> }
 *
 * Authorization is enforced by the database (RLS / is_admin()), NOT by this UI.
 */
(function (root) {
  'use strict';

  var REQUIRED = [
    'checkAccess', 'getOverview', 'getUsers', 'getAnonymousVisitors', 'getUserDetails', 'getUserSessions', 'getSessions',
    'getSessionDetails', 'getActivityEvents', 'getCourseAnalytics', 'getResourceAnalytics', 'exportReport'
  ];
  var OPTIONAL = ['getFilterOptions', 'signOut', 'deleteUser'];

  var current = { adapter: null, mock: false };

  function register(adapter, meta) {
    if (!adapter || typeof adapter !== 'object') throw new Error('AdminData.register: adapter object required');
    var missing = REQUIRED.filter(function (m) { return typeof adapter[m] !== 'function'; });
    if (missing.length) throw new Error('AdminData.register: missing methods: ' + missing.join(', '));
    current = { adapter: adapter, mock: !!(meta && meta.mock) };
    document.dispatchEvent(new CustomEvent('admin-data:registered'));
  }

  function call(method) {
    var a = current.adapter;
    var args = Array.prototype.slice.call(arguments, 1);
    if (!a || typeof a[method] !== 'function') {
      var err = new Error('Data source unavailable');
      err.code = 'UNAVAILABLE';
      return Promise.reject(err);
    }
    try { return Promise.resolve(a[method].apply(a, args)); } catch (e) { return Promise.reject(e); }
  }

  root.AdminData = {
    REQUIRED: REQUIRED,
    OPTIONAL: OPTIONAL,
    register: register,
    call: call,
    has: function (m) { return !!(current.adapter && typeof current.adapter[m] === 'function'); },
    isRegistered: function () { return !!current.adapter; },
    isMock: function () { return current.mock; }
  };
})(window);
