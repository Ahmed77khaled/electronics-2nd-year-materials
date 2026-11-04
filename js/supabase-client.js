/**
 * Supabase Client Wrapper (Vanilla JavaScript)
 * Graceful Fallback & Zero-Crash Architecture
 * 
 * Works seamlessly whether Supabase is configured or in offline/fallback mode.
 */

(function(root) {
  'use strict';

  var clientInstance = null;
  var isConfigured = false;
  var isReady = false;

  function init() {
    var config = root.APP_CONFIG && root.APP_CONFIG.supabase;
    if (!config || !config.url || !config.anonKey) {
      if (root.APP_CONFIG && root.APP_CONFIG.analytics && root.APP_CONFIG.analytics.debug) {
        console.info('[SupabaseClient] Operating in offline/unconfigured mode. Credentials missing in js/config.js');
      }
      return;
    }

    // Verify Supabase library is loaded
    if (typeof root.supabase === 'undefined' || typeof root.supabase.createClient !== 'function') {
      if (root.APP_CONFIG && root.APP_CONFIG.analytics && root.APP_CONFIG.analytics.debug) {
        console.warn('[SupabaseClient] Supabase CDN library is not available.');
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
      if (root.APP_CONFIG && root.APP_CONFIG.analytics && root.APP_CONFIG.analytics.debug) {
        console.info('[SupabaseClient] Initialized successfully with:', config.url);
      }
    } catch (err) {
      console.error('[SupabaseClient] Initialization error:', err);
      clientInstance = null;
      isReady = false;
    }
  }

  // Attempt initial initialization
  init();

  /**
   * Get current authenticated user safely
   * Returns null if unauthenticated or Supabase is not ready
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
   * Record activity event in Supabase
   * Strictly enforces: Only logs to database when a real authenticated user exists.
   * If unauthenticated, skips database write to prevent spoofing or database constraint failures.
   */
  async function insertActivityEvent(eventData) {
    if (!isReady || !clientInstance) {
      return { success: false, reason: 'unconfigured' };
    }

    // Strict rule: user_id must be provided and valid
    if (!eventData.user_id) {
      return { success: false, reason: 'unauthenticated_user_skipped' };
    }

    try {
      var payload = {
        user_id: eventData.user_id,
        session_id: eventData.session_id || null,
        course_id: eventData.course_id || null,
        resource_id: eventData.resource_id || null,
        event_name: eventData.event_name,
        page_path: eventData.page_path || window.location.pathname,
        properties: eventData.properties || {},
        occurred_at: eventData.occurred_at || new Date().toISOString()
      };

      var res = await clientInstance.from('activity_events').insert(payload);
      if (res.error) {
        return { success: false, error: res.error };
      }
      return { success: true, data: res.data };
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
    insertActivityEvent: insertActivityEvent,
    reinit: init
  };

})(typeof self !== 'undefined' ? self : this);
