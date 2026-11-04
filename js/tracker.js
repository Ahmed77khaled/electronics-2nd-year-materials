/**
 * Student Telemetry & Tracking Module (Vanilla JavaScript)
 * Electronics 2nd Year Materials Portal
 * 
 * Features:
 * - Robust Event Tracking: course_click, folder_link_clicked, resource_click, youtube_click, search_used, filter_changed
 * - Strict Schema & Allowlist: Conforms to 002_secure_tracking_rpcs.sql (no sensitive data or arbitrary keys)
 * - Deduplication: Prevents double-counting from multiple clicks or duplicate listeners
 * - Safe Identity: Never fakes student identities (user_id is null for unauthenticated guests)
 * - Non-blocking: External links open normally without interference
 */

(function(root) {
  'use strict';

  // Prevent multiple initializations
  if (root.__PORTAL_TRACKER_INITIALIZED__) {
    return;
  }
  root.__PORTAL_TRACKER_INITIALIZED__ = true;

  // Ephemeral Client Session Token
  function getOrCreateClientSessionId() {
    var key = 'portal_telemetry_client_session_id';
    var sid = null;
    try {
      sid = sessionStorage.getItem(key);
      if (!sid) {
        sid = 'sess_' + 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
        sessionStorage.setItem(key, sid);
      }
    } catch (e) {
      sid = 'sess_ephemeral_' + Date.now();
    }
    return sid;
  }

  var clientSessionId = getOrCreateClientSessionId();
  var recentClicks = {}; // Debounce click cache: { resourceId: timestamp }
  var lastSearchQuery = '';
  var searchTimer = null;
  var currentCategory = 'all';

  // Course Slug Mapping
  var SUBJECT_TO_COURSE = {
    'SUB_01_EMF': 'emf',
    'SUB_02_LOGIC': 'logic-circuits',
    'SUB_03_OOP_JAVA': 'oop-java',
    'SUB_04_CIRCUITS': 'electric-circuits',
    'SUB_05_MATH5': 'math-5',
    'SUB_06_HUMANITIES': 'humanities',
    'ROOT_DRIVE_TERM1': 'general-term-1'
  };

  function resolveResource(resourceId) {
    if (root.ResourceRegistry && typeof root.ResourceRegistry.getResourceById === 'function') {
      return root.ResourceRegistry.getResourceById(resourceId);
    }
    return null;
  }

  function resolveCourseSlug(resourceId, resData) {
    if (resData && resData.subject) {
      return SUBJECT_TO_COURSE[resData.subject] || resData.subject;
    }
    for (var subKey in SUBJECT_TO_COURSE) {
      if (resourceId.indexOf(subKey) === 0) {
        return SUBJECT_TO_COURSE[subKey];
      }
    }
    return 'general-term-1';
  }

  function mapDbResourceType(resType, href) {
    if (resType === 'playlist' || (href && href.indexOf('youtube.com') !== -1)) return 'youtube';
    if (['root', 'subject', 'card', 'subfolder'].indexOf(resType) !== -1) return 'folder';
    if (resType === 'chip') return 'drive';
    return 'drive';
  }

  /**
   * Core telemetry dispatch function
   */
  async function dispatchEvent(eventName, payload) {
    var user = null;
    if (root.SupabaseBridge && typeof root.SupabaseBridge.getCurrentUser === 'function') {
      try {
        user = await root.SupabaseBridge.getCurrentUser();
      } catch (e) {
        user = null;
      }
    }

    // Explicit constraint: Unauthenticated users are represented as null (never spoofed or faked)
    var userId = (user && user.id) ? user.id : null;

    var fullPayload = {
      event_name: eventName,
      user_id: userId,
      session_id: clientSessionId,
      course_id: payload.course_id || null,
      resource_id: payload.resource_id || null,
      page_path: window.location.pathname || '/',
      occurred_at: new Date().toISOString(),
      properties: payload.properties || {}
    };

    var debugMode = root.APP_CONFIG && root.APP_CONFIG.analytics && root.APP_CONFIG.analytics.debug;
    if (debugMode) {
      console.log('[Telemetry Dispatched]', fullPayload);
    }

    // Local DOM event for testing and decoupled analytics
    window.dispatchEvent(new CustomEvent('analytics:telemetry_event', { detail: fullPayload }));

    // Send to Supabase via secure RPC if user is authenticated and bridge is ready
    if (userId && root.SupabaseBridge && typeof root.SupabaseBridge.trackPortalEvent === 'function') {
      root.SupabaseBridge.trackPortalEvent(fullPayload).catch(function(err) {
        if (debugMode) console.warn('[Telemetry Sync Warning]', err);
      });
    }
  }

  /**
   * 1. Click Listener (Delegated on document)
   */
  function setupClickListener() {
    document.addEventListener('click', function(e) {
      var target = e.target.closest('[data-resource-id]');
      if (!target) return;

      var resourceId = target.getAttribute('data-resource-id');
      var resourceType = target.getAttribute('data-resource-type') || 'unknown';
      if (!resourceId) return;

      // Debounce rapid multiple clicks on the exact same resource within 1000ms
      var now = Date.now();
      var debounceMs = (root.APP_CONFIG && root.APP_CONFIG.analytics && root.APP_CONFIG.analytics.clickDebounceMs) || 1000;
      if (recentClicks[resourceId] && (now - recentClicks[resourceId]) < debounceMs) {
        return; // Ignore duplicate click
      }
      recentClicks[resourceId] = now;

      var resData = resolveResource(resourceId);
      var courseSlug = resolveCourseSlug(resourceId, resData);
      var href = target.getAttribute('href') || (resData && resData.url) || null;

      // Classify Event Name
      var eventName = 'resource_click';
      var sourceTag = 'resource_chip';
      if (resourceType === 'subject' || resourceId.indexOf('SUB_') === 0 && resourceId.indexOf('_MAIN') === -1 && resourceId.indexOf('_MAT') === -1) {
        eventName = 'course_click';
        sourceTag = 'course_header';
      } else if (resourceType === 'playlist' || (href && href.indexOf('youtube.com') !== -1)) {
        eventName = 'youtube_click';
        sourceTag = 'youtube_link';
      } else if (resourceType === 'card' || resourceType === 'subfolder' || resourceType === 'root' || (target.classList && (target.classList.contains('folder') || target.classList.contains('sub-drive-pill') || target.classList.contains('main-drive-btn')))) {
        eventName = 'folder_link_clicked';
        sourceTag = 'folder_link';
      }

      // Allowed properties per 002_secure_tracking_rpcs.sql:
      // 'resource_type', 'filter_name', 'result_count', 'search_length', 'source'
      var payload = {
        course_id: courseSlug,
        resource_id: resourceId,
        properties: {
          resource_type: mapDbResourceType(resourceType, href),
          source: sourceTag
        }
      };

      dispatchEvent(eventName, payload);
    }, true);
  }

  /**
   * 2. Search Listener (Debounced 1500ms)
   */
  function setupSearchListener() {
    var searchInput = document.getElementById('directory-search');
    if (!searchInput) return;

    var debounceMs = (root.APP_CONFIG && root.APP_CONFIG.analytics && root.APP_CONFIG.analytics.searchDebounceMs) || 1500;

    searchInput.addEventListener('input', function() {
      var query = searchInput.value.trim();

      if (searchTimer) clearTimeout(searchTimer);

      searchTimer = setTimeout(function() {
        if (query.length >= 2 && query !== lastSearchQuery) {
          lastSearchQuery = query;
          // Per 002_secure_tracking_rpcs.sql: Raw search query text is deliberately NOT stored for privacy.
          // Only search_length and source are transmitted.
          dispatchEvent('search_used', {
            course_id: null,
            resource_id: null,
            properties: {
              search_length: query.length,
              source: 'search_bar'
            }
          });
        }
      }, debounceMs);
    });
  }

  /**
   * 3. Filter Category Listener
   */
  function setupFilterListener() {
    var filterContainer = document.querySelector('.search-filters');
    if (!filterContainer) return;

    filterContainer.addEventListener('click', function(e) {
      var tag = e.target.closest('.filter-tag');
      if (!tag) return;

      var selectedCategory = tag.getAttribute('data-filter') || 'all';
      if (selectedCategory !== currentCategory) {
        currentCategory = selectedCategory;
        dispatchEvent('filter_changed', {
          course_id: null,
          resource_id: null,
          properties: {
            filter_name: selectedCategory,
            source: 'quick_filter'
          }
        });
      }
    });
  }

  function initListeners() {
    setupClickListener();
    setupSearchListener();
    setupFilterListener();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initListeners);
  } else {
    initListeners();
  }

  root.PortalTracker = {
    dispatchEvent: dispatchEvent,
    getClientSessionId: function() { return clientSessionId; },
    getRecentClicks: function() { return recentClicks; }
  };

})(typeof self !== 'undefined' ? self : this);
