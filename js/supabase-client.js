/**
 * Supabase Client Wrapper (Vanilla JavaScript) - Secure RPC Architecture
 * Electronics 2nd Year Materials Portal
 * 
 * Complies with 002_secure_tracking_rpcs.sql:
 * - All tracking writes use SECURITY DEFINER RPCs (track_portal_event, start_portal_session, etc.)
 * - Zero direct table INSERTs to activity_events or sessions
 * - Maps textual resource_keys (e.g. 'SUB_03_OOP_JAVA_MAT_LECTURE') to database UUIDs
 * - Never passes non-UUID strings to UUID parameters
 * - Safe offline / fallback mode: Never throws unhandled exceptions
 */

(function(root) {
  'use strict';

  var clientInstance = null;
  var isConfigured = false;
  var isReady = false;

  // UUID Caches
  var resourceKeyToUuidMap = {};
  var courseSlugToUuidMap = {};
  var activeDbSessionId = null;

  var UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function isUuid(val) {
    return typeof val === 'string' && UUID_REGEX.test(val);
  }

  function init() {
    var config = root.APP_CONFIG && root.APP_CONFIG.supabase;
    if (!config || !config.url || !config.anonKey) {
      if (root.APP_CONFIG && root.APP_CONFIG.analytics && root.APP_CONFIG.analytics.debug) {
        console.info('[SupabaseBridge] Operating in offline mode. Credentials missing in js/config.js');
      }
      return;
    }

    if (typeof root.supabase === 'undefined' || typeof root.supabase.createClient !== 'function') {
      if (root.APP_CONFIG && root.APP_CONFIG.analytics && root.APP_CONFIG.analytics.debug) {
        console.warn('[SupabaseBridge] Supabase library is not loaded.');
      }
      return;
    }

    try {
      clientInstance = root.supabase.createClient(config.url, config.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
      isConfigured = true;
      isReady = true;

      // Prefetch course and resource UUID mappings in background
      prefetchUuidMappings();

    } catch (err) {
      console.error('[SupabaseBridge] Initialization error:', err);
      clientInstance = null;
      isReady = false;
    }
  }

  /**
   * Prefetch course and resource UUIDs to ensure text keys map cleanly to database UUIDs
   */
  async function prefetchUuidMappings() {
    if (!isReady || !clientInstance) return;
    try {
      var coursesRes = await clientInstance.from('courses').select('id, slug').eq('is_active', true);
      if (coursesRes && coursesRes.data) {
        coursesRes.data.forEach(function(c) {
          courseSlugToUuidMap[c.slug] = c.id;
        });
      }

      var resourcesRes = await clientInstance.from('resources').select('id, resource_key, course_id').eq('is_active', true);
      if (resourcesRes && resourcesRes.data) {
        resourcesRes.data.forEach(function(r) {
          resourceKeyToUuidMap[r.resource_key] = r.id;
        });
      }
    } catch (e) {
      // Non-blocking background fetch
    }
  }

  // Attempt initialization
  init();

  /**
   * Get current authenticated user safely
   */
  async function getCurrentUser() {
    if (!isReady || !clientInstance) return null;
    try {
      var res = await clientInstance.auth.getUser();
      if (res && res.data && res.data.user) {
        return res.data.user;
      }
      return null;
    } catch (err) {
      return null;
    }
  }

  /**
   * Start a secure portal session via RPC (002_secure_tracking_rpcs.sql)
   */
  async function startPortalSession(entryPath) {
    if (!isReady || !clientInstance) return null;
    try {
      var res = await clientInstance.rpc('start_portal_session', {
        p_entry_path: entryPath || window.location.pathname
      });
      if (res && res.data && isUuid(res.data)) {
        activeDbSessionId = res.data;
        return activeDbSessionId;
      }
      return null;
    } catch (err) {
      return null;
    }
  }

  /**
   * Send heartbeat for the active session
   */
  async function heartbeatPortalSession(sessionId) {
    var sid = sessionId || activeDbSessionId;
    if (!isReady || !clientInstance || !isUuid(sid)) return 0;
    try {
      var res = await clientInstance.rpc('heartbeat_portal_session', {
        p_session_id: sid
      });
      return (res && res.data) || 0;
    } catch (err) {
      return 0;
    }
  }

  /**
   * End portal session
   */
  async function endPortalSession(sessionId) {
    var sid = sessionId || activeDbSessionId;
    if (!isReady || !clientInstance || !isUuid(sid)) return false;
    try {
      var res = await clientInstance.rpc('end_portal_session', {
        p_session_id: sid
      });
      activeDbSessionId = null;
      return !!(res && res.data);
    } catch (err) {
      return false;
    }
  }

  /**
   * Record portal event via secure RPC: track_portal_event
   * Strictly validates UUIDs and allowlisted property keys
   */
  async function trackPortalEvent(eventData) {
    if (!isReady || !clientInstance) {
      return { success: false, reason: 'unconfigured' };
    }

    // Must be an authenticated student
    var user = await getCurrentUser();
    if (!user || !user.id) {
      return { success: false, reason: 'unauthenticated_user_skipped' };
    }

    // Resolve or establish a valid database session ID
    var dbSessionId = activeDbSessionId;
    if (!dbSessionId && isUuid(eventData.session_id)) {
      dbSessionId = eventData.session_id;
    }

    if (!dbSessionId) {
      dbSessionId = await startPortalSession(eventData.page_path);
    }

    if (!isUuid(dbSessionId)) {
      return { success: false, reason: 'no_active_db_session' };
    }

    // Resolve UUID for resource: Text keys MUST NEVER be passed as UUIDs!
    var resourceUuid = null;
    if (eventData.resource_id) {
      if (isUuid(eventData.resource_id)) {
        resourceUuid = eventData.resource_id;
      } else if (resourceKeyToUuidMap[eventData.resource_id]) {
        resourceUuid = resourceKeyToUuidMap[eventData.resource_id];
      }
    }

    // Resolve UUID for course
    var courseUuid = null;
    if (eventData.course_id) {
      if (isUuid(eventData.course_id)) {
        courseUuid = eventData.course_id;
      } else if (courseSlugToUuidMap[eventData.course_id]) {
        courseUuid = courseSlugToUuidMap[eventData.course_id];
      }
    }

    // Whitelist event properties per 002_secure_tracking_rpcs.sql
    // Allowed keys: 'resource_type', 'filter_name', 'result_count', 'search_length', 'source'
    var cleanProps = {};
    if (eventData.properties && typeof eventData.properties === 'object') {
      var allowedKeys = ['resource_type', 'filter_name', 'result_count', 'search_length', 'source'];
      allowedKeys.forEach(function(k) {
        if (eventData.properties[k] !== undefined && eventData.properties[k] !== null) {
          cleanProps[k] = eventData.properties[k];
        }
      });
    }

    try {
      var rpcPayload = {
        p_session_id: dbSessionId,
        p_event_name: eventData.event_name,
        p_course_id: courseUuid,
        p_resource_id: resourceUuid,
        p_page_path: eventData.page_path || window.location.pathname,
        p_properties: cleanProps
      };

      var res = await clientInstance.rpc('track_portal_event', rpcPayload);
      if (res.error) {
        return { success: false, error: res.error };
      }
      return { success: true, event_id: res.data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // Public Interface
  root.SupabaseBridge = {
    isConfigured: function() { return isConfigured; },
    isReady: function() { return isReady; },
    getClient: function() { return clientInstance; },
    getCurrentUser: getCurrentUser,
    startPortalSession: startPortalSession,
    heartbeatPortalSession: heartbeatPortalSession,
    endPortalSession: endPortalSession,
    trackPortalEvent: trackPortalEvent,
    // Alias for backwards compatibility with tests
    insertActivityEvent: trackPortalEvent,
    isUuid: isUuid,
    reinit: init
  };

})(typeof self !== 'undefined' ? self : this);
