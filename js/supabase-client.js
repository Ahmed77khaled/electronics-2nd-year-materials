/**
 * Supabase Client Wrapper (Vanilla JavaScript) - Secure RPC Architecture
 * All tracking writes use authenticated, ownership-checked RPCs.
 */
(function(root) {
  'use strict';

  var clientInstance = null;
  var isConfigured = false;
  var isReady = false;
  var resourceKeyToUuidMap = {};
  var courseSlugToUuidMap = {};
  var mappingPromise = null;
  var activeDbSessionId = null;
  var activeDbSessionUserId = null;
  var sessionStartPromise = null;
  var sessionStartPromiseUserId = null;
  var authListeners = [];

  var UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function isUuid(value) {
    return typeof value === 'string' && UUID_REGEX.test(value);
  }

  function getPathname() {
    return (root.location && root.location.pathname) || '/';
  }

  function init() {
    var config = root.APP_CONFIG && root.APP_CONFIG.supabase;
    if (!config || !config.url || !config.anonKey) {
      isConfigured = false;
      isReady = false;
      if (root.APP_CONFIG && root.APP_CONFIG.analytics && root.APP_CONFIG.analytics.debug) {
        console.info('[SupabaseBridge] Offline mode: Supabase credentials are not configured.');
      }
      return;
    }

    if (!root.supabase || typeof root.supabase.createClient !== 'function') {
      isConfigured = true;
      isReady = false;
      console.warn('[SupabaseBridge] Supabase SDK is not loaded.');
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

      if (clientInstance.auth && typeof clientInstance.auth.onAuthStateChange === 'function') {
        clientInstance.auth.onAuthStateChange(function(event, session) {
          var nextUserId = session && session.user ? session.user.id : null;
          if (!nextUserId || (activeDbSessionUserId && activeDbSessionUserId !== nextUserId)) {
            activeDbSessionId = null;
            activeDbSessionUserId = null;
          }
          // Never run async Supabase operations inside the auth callback itself.
          setTimeout(function() {
            authListeners.slice().forEach(function(listener) {
              try { listener(event, session || null); } catch (e) {}
            });
          }, 0);
        });
      }

      mappingPromise = prefetchUuidMappings();
    } catch (err) {
      console.error('[SupabaseBridge] Initialization error:', err);
      clientInstance = null;
      isReady = false;
    }
  }

  async function prefetchUuidMappings() {
    if (!isReady || !clientInstance) return false;
    try {
      var results = await Promise.all([
        clientInstance.from('courses').select('id, slug').eq('is_active', true),
        clientInstance.from('resources').select('id, resource_key').eq('is_active', true)
      ]);
      var coursesRes = results[0];
      var resourcesRes = results[1];

      if (coursesRes && coursesRes.error) throw coursesRes.error;
      if (resourcesRes && resourcesRes.error) throw resourcesRes.error;

      (coursesRes.data || []).forEach(function(course) {
        if (isUuid(course.id) && course.slug) courseSlugToUuidMap[course.slug] = course.id;
      });
      (resourcesRes.data || []).forEach(function(resource) {
        if (isUuid(resource.id) && resource.resource_key) {
          resourceKeyToUuidMap[resource.resource_key] = resource.id;
        }
      });
      return true;
    } catch (err) {
      if (root.APP_CONFIG && root.APP_CONFIG.analytics && root.APP_CONFIG.analytics.debug) {
        console.warn('[SupabaseBridge] UUID mapping prefetch failed:', err.message || err);
      }
      return false;
    }
  }

  init();

  async function getCurrentUser() {
    if (!isReady || !clientInstance) return null;
    try {
      var result = await clientInstance.auth.getUser();
      return result && result.data && result.data.user ? result.data.user : null;
    } catch (err) {
      return null;
    }
  }

  /**
   * Create at most one database session per signed-in browser-tab lifecycle.
   * The returned value is always the sessions.id UUID, never a client token.
   */
  async function startPortalSession(entryPath) {
    if (!isReady || !clientInstance) return null;

    var user = await getCurrentUser();
    if (!user || !user.id) return null;

    if (activeDbSessionId && activeDbSessionUserId === user.id) {
      return activeDbSessionId;
    }

    if (sessionStartPromise) {
      var pending = sessionStartPromise;
      var pendingUserId = sessionStartPromiseUserId;
      if (pendingUserId === user.id) return pending;
      await pending;
      return startPortalSession(entryPath);
    }

    sessionStartPromiseUserId = user.id;
    var requestedUserId = user.id;
    var promise = (async function() {
      try {
        var latestUser = await getCurrentUser();
        if (!latestUser || latestUser.id !== requestedUserId) return null;

        var result = await clientInstance.rpc('start_portal_session', {
          p_entry_path: entryPath || getPathname()
        });
        if (result && result.error) throw result.error;
        if (!result || !isUuid(result.data)) return null;

        var confirmedUser = await getCurrentUser();
        if (!confirmedUser || confirmedUser.id !== requestedUserId) {
          return null;
        }

        activeDbSessionId = result.data;
        activeDbSessionUserId = requestedUserId;
        return activeDbSessionId;
      } catch (err) {
        if (root.APP_CONFIG && root.APP_CONFIG.analytics && root.APP_CONFIG.analytics.debug) {
          console.warn('[SupabaseBridge] Could not start portal session:', err.message || err);
        }
        return null;
      }
    })();

    sessionStartPromise = promise;
    try {
      return await promise;
    } finally {
      if (sessionStartPromise === promise) {
        sessionStartPromise = null;
        sessionStartPromiseUserId = null;
      }
    }
  }

  async function heartbeatPortalSession(sessionId) {
    if (!isReady || !clientInstance || !activeDbSessionId) {
      return { success: false, creditedSeconds: 0, reason: 'no_active_session' };
    }

    var sid = sessionId || activeDbSessionId;
    if (!isUuid(sid) || sid !== activeDbSessionId) {
      return { success: false, creditedSeconds: 0, reason: 'session_mismatch' };
    }

    var user = await getCurrentUser();
    if (!user || user.id !== activeDbSessionUserId) {
      return { success: false, creditedSeconds: 0, reason: 'session_user_mismatch' };
    }

    try {
      var result = await clientInstance.rpc('heartbeat_portal_session', {
        p_session_id: sid
      });
      if (result && result.error) {
        return { success: false, creditedSeconds: 0, error: result.error };
      }
      return {
        success: true,
        creditedSeconds: Number(result && result.data) || 0
      };
    } catch (err) {
      return { success: false, creditedSeconds: 0, error: err };
    }
  }

  async function endPortalSession(sessionId) {
    var sid = sessionId || activeDbSessionId;
    if (!isReady || !clientInstance || !isUuid(sid)) return false;

    // Only the user who owns the currently active tab session may end it.
    if (!activeDbSessionId || sid !== activeDbSessionId) return false;
    var ownerId = activeDbSessionUserId;
    var user = await getCurrentUser();
    if (!user || !ownerId || user.id !== ownerId) return false;

    try {
      var result = await clientInstance.rpc('end_portal_session', {
        p_session_id: sid
      });
      if (result && result.error) return false;
      return !!(result && result.data);
    } catch (err) {
      return false;
    } finally {
      if (activeDbSessionId === sid) {
        activeDbSessionId = null;
        activeDbSessionUserId = null;
      }
    }
  }

  async function trackPortalEvent(eventData) {
    if (!isReady || !clientInstance) {
      return { success: false, reason: 'unconfigured' };
    }

    eventData = eventData || {};
    var user = await getCurrentUser();
    if (!user || !user.id) {
      return { success: false, reason: 'unauthenticated_user_skipped' };
    }

    var dbSessionId = activeDbSessionId;
    if (!dbSessionId || activeDbSessionUserId !== user.id) {
      dbSessionId = await startPortalSession(eventData.page_path);
    }
    if (!isUuid(dbSessionId)) {
      return { success: false, reason: 'no_active_db_session' };
    }

    // Wait for the initial key -> UUID lookup, then refresh once if needed.
    if (mappingPromise) await mappingPromise;

    var resourceUuid = null;
    if (eventData.resource_id) {
      resourceUuid = isUuid(eventData.resource_id)
        ? eventData.resource_id
        : resourceKeyToUuidMap[eventData.resource_id] || null;
      if (!resourceUuid) {
        mappingPromise = prefetchUuidMappings();
        await mappingPromise;
        resourceUuid = resourceKeyToUuidMap[eventData.resource_id] || null;
      }
      if (!isUuid(resourceUuid)) {
        return { success: false, reason: 'resource_mapping_missing' };
      }
    }

    var courseUuid = null;
    if (eventData.course_id) {
      courseUuid = isUuid(eventData.course_id)
        ? eventData.course_id
        : courseSlugToUuidMap[eventData.course_id] || null;
      if (!courseUuid) {
        mappingPromise = prefetchUuidMappings();
        await mappingPromise;
        courseUuid = courseSlugToUuidMap[eventData.course_id] || null;
      }
      if (!isUuid(courseUuid)) {
        return { success: false, reason: 'course_mapping_missing' };
      }
    }

    var allowedKeys = ['resource_type', 'filter_name', 'result_count', 'search_length', 'source'];
    var cleanProps = {};
    if (eventData.properties && typeof eventData.properties === 'object' && !Array.isArray(eventData.properties)) {
      allowedKeys.forEach(function(key) {
        var value = eventData.properties[key];
        if (value !== undefined && value !== null) cleanProps[key] = value;
      });
    }

    try {
      var result = await clientInstance.rpc('track_portal_event', {
        p_session_id: dbSessionId,
        p_event_name: eventData.event_name,
        p_course_id: courseUuid,
        p_resource_id: resourceUuid,
        p_page_path: eventData.page_path || getPathname(),
        p_properties: cleanProps
      });
      if (result && result.error) {
        return { success: false, error: result.error };
      }
      return { success: true, event_id: result ? result.data : null };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  }

  function onAuthStateChange(listener) {
    if (typeof listener !== 'function') return function() {};
    authListeners.push(listener);
    return function unsubscribe() {
      authListeners = authListeners.filter(function(item) { return item !== listener; });
    };
  }

  root.SupabaseBridge = {
    isConfigured: function() { return isConfigured; },
    isReady: function() { return isReady; },
    getClient: function() { return clientInstance; },
    getCurrentUser: getCurrentUser,
    startPortalSession: startPortalSession,
    heartbeatPortalSession: heartbeatPortalSession,
    endPortalSession: endPortalSession,
    getActiveSessionId: function() { return activeDbSessionId; },
    trackPortalEvent: trackPortalEvent,
    insertActivityEvent: trackPortalEvent,
    onAuthStateChange: onAuthStateChange,
    isUuid: isUuid,
    reinit: init
  };
})(typeof self !== 'undefined' ? self : this);
