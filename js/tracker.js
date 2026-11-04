/**
 * Student Telemetry & Tracking Module (Vanilla JavaScript)
 * Electronics 2nd Year Materials Portal
 * 
 * Features:
 * - Robust Event Tracking: course_click, folder_link_clicked, resource_click, youtube_click, search_used, filter_changed
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

  // Session Management (UUID v4 in sessionStorage)
  function getOrCreateSessionId() {
    var key = 'portal_telemetry_session_id';
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

  var sessionId = getOrCreateSessionId();
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

  /**
   * Resolve resource metadata using ResourceRegistry if available
   */
  function resolveResource(resourceId) {
    if (root.ResourceRegistry && typeof root.ResourceRegistry.getResourceById === 'function') {
      return root.ResourceRegistry.getResourceById(resourceId);
    }
    return null;
  }

  /**
   * Determine course slug from resource ID
   */
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
      session_id: sessionId,
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

    // Always dispatch local DOM event for unit testing & decoupled integrations
    window.dispatchEvent(new CustomEvent('analytics:telemetry_event', { detail: fullPayload }));

    // Send to Supabase only if user is logged in and SupabaseBridge is ready
    if (userId && root.SupabaseBridge && typeof root.SupabaseBridge.insertActivityEvent === 'function') {
      root.SupabaseBridge.insertActivityEvent(fullPayload).catch(function(err) {
        if (debugMode) console.warn('[Telemetry Sync Warning]', err);
      });
    }
  }

  /**
   * 1. Click Listener (Delegated on document)
   * Tracks: course_click, folder_link_clicked, resource_click, youtube_click
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
      if (resourceType === 'subject' || resourceId.endsWith('_EMF') || resourceId.endsWith('_LOGIC') || resourceId.endsWith('_OOP_JAVA') || resourceId.endsWith('_CIRCUITS') || resourceId.endsWith('_MATH5') || resourceId.endsWith('_HUMANITIES')) {
        eventName = 'course_click';
      } else if (resourceType === 'playlist' || (href && href.indexOf('youtube.com') !== -1)) {
        eventName = 'youtube_click';
      } else if (resourceType === 'card' || resourceType === 'subfolder' || resourceType === 'root' || (target.classList && (target.classList.contains('folder') || target.classList.contains('sub-drive-pill') || target.classList.contains('main-drive-btn')))) {
        eventName = 'folder_link_clicked';
      }

      var payload = {
        course_id: courseSlug,
        resource_id: resourceId,
        properties: {
          resource_key: resourceId,
          resource_type: resourceType,
          title: (resData && (resData.title || resData.name)) || target.innerText.trim().slice(0, 80),
          url: href,
          target_blank: target.getAttribute('target') === '_blank'
        }
      };

      dispatchEvent(eventName, payload);
    }, true); // Use capturing to ensure event triggers even if link navigates
  }

  /**
   * 2. Search Listener (Debounced 1500ms)
   * Tracks: search_used
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
          dispatchEvent('search_used', {
            course_id: null,
            resource_id: null,
            properties: {
              search_term: query,
              query_length: query.length
            }
          });
        }
      }, debounceMs);
    });
  }

  /**
   * 3. Filter Category Listener
   * Tracks: filter_changed
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
            selected_category: selectedCategory,
            tag_label: tag.innerText.trim()
          }
        });
      }
    });
  }

  // Initialize all listeners when DOM is loaded
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

  // Expose Tracker helpers for manual tests or external dispatch
  root.PortalTracker = {
    dispatchEvent: dispatchEvent,
    getSessionId: function() { return sessionId; },
    getRecentClicks: function() { return recentClicks; }
  };

})(typeof self !== 'undefined' ? self : this);
