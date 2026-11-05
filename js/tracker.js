/**
 * Student Telemetry & Tracking Module - Secure Supabase RPC Architecture.
 * A database session starts on the first authenticated user interaction.
 * It ends when the tab is left, hidden, or unloaded; hidden/idle time is not credited.
 */
(function(root) {
  'use strict';

  if (root.__PORTAL_TRACKER_INITIALIZED__) return;
  root.__PORTAL_TRACKER_INITIALIZED__ = true;

  function getOrCreateClientSessionId() {
    var key = 'portal_telemetry_client_session_id';
    try {
      var value = sessionStorage.getItem(key);
      if (value) return value;
      value = 'client_' + 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
      sessionStorage.setItem(key, value);
      return value;
    } catch (err) {
      return 'client_ephemeral_' + Date.now();
    }
  }

  var clientSessionId = getOrCreateClientSessionId();
  var databaseSessionId = null;
  var anonymousVisitorKey = null;
  var anonymousClientSessionId = null;
  var anonymousDatabaseSessionId = null;
  var anonymousStartPromise = null;
  var anonymousLifecycleGeneration = 0;
  var anonymousHeartbeatPromise = null;
  var anonymousPageViewRecorded = false;
  var sessionStartPromise = null;
  var sessionStartGeneration = -1;
  var sessionClosePromise = null;
  var lifecycleGeneration = 0;
  var pendingPauseTimer = null;
  var pendingTrackingWrites = 0;
  var heartbeatPromise = null;
  var recentClicks = {};
  var lastSearchQuery = '';
  var searchTimer = null;
  var currentCategory = 'all';
  var lastInteractionTime = 0;
  var lastMeaningfulInteractionTime = 0;
  var heartbeatInterval = null;
  var IDLE_TIMEOUT_MS = 180000;
  var PAUSE_GRACE_MS = 250;
  var MAX_TRACKING_DRAIN_MS = 1500;

  var SUBJECT_TO_COURSE = {
    'SUB_01_EMF': 'emf',
    'SUB_02_LOGIC': 'logic-circuits',
    'SUB_03_OOP_JAVA': 'oop-java',
    'SUB_04_CIRCUITS': 'electric-circuits',
    'SUB_05_MATH5': 'math-5',
    'SUB_06_HUMANITIES': 'humanities',
    'ROOT_DRIVE_TERM1': 'general-term-1'
  };

  function createUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function getOrCreateStoredUuid(storage, key) {
    try {
      var value = storage && storage.getItem(key);
      if (isUuid(value)) return value;
      value = createUuid();
      if (storage) storage.setItem(key, value);
      return value;
    } catch (err) {
      return createUuid();
    }
  }

  function renewAnonymousTabSessionId() {
    anonymousClientSessionId = createUuid();
    try {
      var storage = root.sessionStorage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
      if (storage) storage.setItem('portal_anonymous_session_id', anonymousClientSessionId);
    } catch (err) {}
  }

  function ensureAnonymousIdentifiers() {
    if (!anonymousVisitorKey) {
      var persistentStorage = null;
      try { persistentStorage = root.localStorage || null; } catch (err) {}
      anonymousVisitorKey = getOrCreateStoredUuid(persistentStorage, 'portal_anonymous_visitor_key');
    }
    if (!anonymousClientSessionId) {
      var tabStorage = null;
      try { tabStorage = root.sessionStorage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null); } catch (err) {}
      anonymousClientSessionId = getOrCreateStoredUuid(tabStorage, 'portal_anonymous_session_id');
    }
  }

  function isForeground() {
    if (typeof document !== 'undefined') {
      if (document.visibilityState && document.visibilityState !== 'visible') return false;
    }
    return true;
  }

  function isUuid(value) {
    if (root.SupabaseBridge && typeof root.SupabaseBridge.isUuid === 'function') {
      return root.SupabaseBridge.isUuid(value);
    }
    return typeof value === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  function resolveResource(resourceId) {
    if (root.ResourceRegistry && typeof root.ResourceRegistry.getResourceById === 'function') {
      return root.ResourceRegistry.getResourceById(resourceId);
    }
    return null;
  }

  function resolveCourseSlug(resourceId, resourceData) {
    if (resourceData && resourceData.subject) {
      return SUBJECT_TO_COURSE[resourceData.subject] || resourceData.subject;
    }
    for (var subjectKey in SUBJECT_TO_COURSE) {
      if (resourceId.indexOf(subjectKey) === 0) return SUBJECT_TO_COURSE[subjectKey];
    }
    return 'general-term-1';
  }

  function mapDbResourceType(resourceType, href) {
    if (resourceType === 'playlist' || (href && href.indexOf('youtube.com') !== -1)) return 'youtube';
    if (['root', 'subject', 'card', 'subfolder'].indexOf(resourceType) !== -1) return 'folder';
    return 'drive';
  }

  function cancelPendingPause() {
    if (pendingPauseTimer) {
      clearTimeout(pendingPauseTimer);
      pendingPauseTimer = null;
    }
  }

  /**
   * Only the Supabase Bridge may create/own the database session UUID.
   * A pending start is shared by all callers to prevent duplicate sessions.
   */
  async function ensureDatabaseSession() {
    var bridge = root.SupabaseBridge;
    if (!bridge || typeof bridge.isReady !== 'function' || !bridge.isReady() ||
        typeof bridge.startPortalSession !== 'function') {
      return null;
    }

    // Never create/reuse a session while the prior session's final heartbeat
    // and end RPC are still in flight.
    if (sessionClosePromise) {
      try { await sessionClosePromise; } catch (err) {}
    }

    if (databaseSessionId && isUuid(databaseSessionId)) return databaseSessionId;

    // A click can open another tab while its start RPC is in flight. Join that
    // pending start even after blur; the deferred pause will close it after the
    // click event has been written.
    if (sessionStartPromise) {
      var pending = sessionStartPromise;
      var pendingGeneration = sessionStartGeneration;
      await pending;
      if (pendingGeneration !== lifecycleGeneration) {
        return isForeground() ? ensureDatabaseSession() : null;
      }
      if (databaseSessionId && isUuid(databaseSessionId)) return databaseSessionId;
    }

    if (!isForeground()) return null;
    var generation = lifecycleGeneration;
    sessionStartGeneration = generation;
    var startPromise = bridge.startPortalSession(
      (root.location && root.location.pathname) || '/'
    ).then(async function(sessionId) {
      if (!isUuid(sessionId)) return null;

      // If the page went hidden while the start RPC was in flight, close the
      // just-created server session. Serialize any restart behind that close.
      if (generation !== lifecycleGeneration) {
        if (typeof bridge.endPortalSession === 'function') {
          var staleClose = Promise.resolve(bridge.endPortalSession(sessionId)).catch(function() {
            return false;
          });
          sessionClosePromise = staleClose;
          staleClose.then(function() {
            if (sessionClosePromise === staleClose) sessionClosePromise = null;
          });
          await staleClose;
        }
        return null;
      }

      databaseSessionId = sessionId;
      return databaseSessionId;
    }).catch(function(err) {
      var debug = root.APP_CONFIG && root.APP_CONFIG.analytics && root.APP_CONFIG.analytics.debug;
      if (debug) console.warn('[PortalTracker] Session start failed:', err);
      return null;
    });

    sessionStartPromise = startPromise;
    try {
      return await startPromise;
    } finally {
      if (sessionStartPromise === startPromise) {
        sessionStartPromise = null;
        sessionStartGeneration = -1;
      }
    }
  }

  function sendHeartbeat(databaseSessionId) {
    var bridge = root.SupabaseBridge;
    if (!databaseSessionId || !isUuid(databaseSessionId) || !bridge ||
        typeof bridge.heartbeatPortalSession !== 'function') {
      return Promise.resolve(null);
    }
    if (heartbeatPromise) return heartbeatPromise;

    var request = Promise.resolve().then(function() {
      return bridge.heartbeatPortalSession(databaseSessionId);
    }).catch(function() {
      return null;
    });
    heartbeatPromise = request;
    request.then(function() {
      if (heartbeatPromise === request) heartbeatPromise = null;
    });
    return request;
  }

  function pauseDatabaseSession(reason, interactionAtPause, allowFinalHeartbeat) {
    lifecycleGeneration++;
    var finalInteractionTime = interactionAtPause || lastMeaningfulInteractionTime;
    lastInteractionTime = 0;
    var sessionId = databaseSessionId;
    databaseSessionId = null;

    if (!sessionId || !isUuid(sessionId) || !root.SupabaseBridge ||
        typeof root.SupabaseBridge.endPortalSession !== 'function') {
      return Promise.resolve(false);
    }

    // Flush only on a confirmed transition away from the page/unload. A quick
    // focus return followed by a later interaction must not credit the time
    // spent in the background as active portal time.
    var inFlightWait = heartbeatPromise ? heartbeatPromise.catch(function() { return null; }) : Promise.resolve(null);
    var mayFlushFinalInterval = allowFinalHeartbeat === true && finalInteractionTime &&
      (Date.now() - finalInteractionTime) <= IDLE_TIMEOUT_MS;
    var finalHeartbeat = mayFlushFinalInterval ? sendHeartbeat(sessionId) : inFlightWait;
    var closePromise = Promise.resolve(finalHeartbeat).then(function() {
      return root.SupabaseBridge.endPortalSession(sessionId);
    }).then(function(result) {
      if (root.APP_CONFIG && root.APP_CONFIG.analytics && root.APP_CONFIG.analytics.debug) {
        console.info('[PortalTracker] Database session closed:', reason || 'pause');
      }
      return result;
    }).catch(function() {
      return false;
    });

    sessionClosePromise = closePromise;
    closePromise.then(function() {
      if (sessionClosePromise === closePromise) sessionClosePromise = null;
    });
    return closePromise;
  }

  function schedulePause(reason) {
    if (reason === 'window-blur' && typeof document !== 'undefined' && document.visibilityState === 'visible') return;
    // Stop accruing time immediately. The short grace period allows a just-fired
    // resource click RPC to finish before the session-end RPC closes the session.
    var interactionAtPause = lastInteractionTime;
    lastInteractionTime = 0;
    cancelPendingPause();
    var scheduledAt = Date.now();

    function attemptPause() {
      if (isForeground()) {
        pendingPauseTimer = null;
        return;
      }
      if (pendingTrackingWrites > 0 && Date.now() - scheduledAt < MAX_TRACKING_DRAIN_MS) {
        pendingPauseTimer = setTimeout(attemptPause, 100);
        return;
      }
      pendingPauseTimer = null;
      pauseDatabaseSession(reason || 'tab-hidden', interactionAtPause, true);
      pauseAnonymousSession(reason || 'tab-hidden', interactionAtPause, true);
    }

    pendingPauseTimer = setTimeout(attemptPause, PAUSE_GRACE_MS);
  }

  function markUserActive() {
    if (!isForeground()) return;
    cancelPendingPause();

    var now = Date.now();
    var wasIdle = !lastInteractionTime || (now - lastInteractionTime) > IDLE_TIMEOUT_MS;

    // A long idle gap ends the old session. A fresh user interaction starts a
    // new session baseline, so idle wall-clock time is never credited.
    if (wasIdle && databaseSessionId) {
      pauseDatabaseSession('idle-resume');
    }

    lastInteractionTime = now;
    lastMeaningfulInteractionTime = now;
    ensureDatabaseSession().then(function(sessionId) {
      if (!sessionId) return ensureAnonymousDatabaseSession();
      return sessionId;
    }).catch(function() {});
  }

  async function ensureAnonymousDatabaseSession() {
    var bridge = root.SupabaseBridge;
    if (!bridge || typeof bridge.isReady !== 'function' || !bridge.isReady() ||
        typeof bridge.startAnonymousVisitorSession !== 'function') return null;

    ensureAnonymousIdentifiers();
    if (anonymousDatabaseSessionId && isUuid(anonymousDatabaseSessionId)) return anonymousDatabaseSessionId;
    if (anonymousStartPromise) return anonymousStartPromise;

    var user = null;
    try {
      user = await bridge.getCurrentUser();
    } catch (err) {
      return null;
    }
    if (user && user.id) return null;

    var startGeneration = anonymousLifecycleGeneration;
    var requestVisitorKey = anonymousVisitorKey;
    var requestClientSessionId = anonymousClientSessionId;
    var request = Promise.resolve(bridge.startAnonymousVisitorSession(
      requestVisitorKey,
      requestClientSessionId,
      (root.location && root.location.pathname) || '/'
    )).then(async function(sessionId) {
      if (!isUuid(sessionId)) return null;
      var confirmedUser = null;
      try { confirmedUser = await bridge.getCurrentUser(); } catch (err) {}
      if ((confirmedUser && confirmedUser.id) || startGeneration !== anonymousLifecycleGeneration || !isForeground()) {
        if (typeof bridge.endAnonymousVisitorSession === 'function') {
          await bridge.endAnonymousVisitorSession(requestVisitorKey, requestClientSessionId);
        }
        return null;
      }
      anonymousDatabaseSessionId = sessionId;
      return sessionId;
    }).catch(function(err) {
      var debug = root.APP_CONFIG && root.APP_CONFIG.analytics && root.APP_CONFIG.analytics.debug;
      if (debug) console.warn('[PortalTracker] Anonymous session start failed:', err);
      return null;
    });

    anonymousStartPromise = request;
    try {
      return await request;
    } finally {
      if (anonymousStartPromise === request) anonymousStartPromise = null;
    }
  }

  function sendAnonymousHeartbeat(allowClosingSession, visitorKeyOverride, clientSessionIdOverride) {
    var bridge = root.SupabaseBridge;
    if ((!anonymousDatabaseSessionId && allowClosingSession !== true) || !bridge ||
        typeof bridge.heartbeatAnonymousVisitorSession !== 'function') {
      return Promise.resolve(0);
    }
    if (anonymousHeartbeatPromise) return anonymousHeartbeatPromise;
    var request = Promise.resolve().then(function() {
      return bridge.heartbeatAnonymousVisitorSession(
        visitorKeyOverride || anonymousVisitorKey,
        clientSessionIdOverride || anonymousClientSessionId
      );
    }).catch(function() {
      return 0;
    });
    anonymousHeartbeatPromise = request;
    request.then(function() {
      if (anonymousHeartbeatPromise === request) anonymousHeartbeatPromise = null;
    });
    return request;
  }

  function pauseAnonymousSession(reason, interactionAtPause, allowFinalHeartbeat) {
    var bridge = root.SupabaseBridge;
    anonymousLifecycleGeneration++;
    var closingVisitorKey = anonymousVisitorKey;
    var closingClientSessionId = anonymousClientSessionId;
    var sessionId = anonymousDatabaseSessionId;
    anonymousDatabaseSessionId = null;

    // Rotate the tab key before navigation/unload. A reload or resumed tab
    // must create a fresh database session so an old end RPC cannot close it.
    renewAnonymousTabSessionId();

    if (!sessionId || !bridge || typeof bridge.endAnonymousVisitorSession !== 'function') {
      return Promise.resolve(false);
    }

    var finalInteractionTime = interactionAtPause || lastMeaningfulInteractionTime;
    var mayFlush = allowFinalHeartbeat === true && finalInteractionTime &&
      (Date.now() - finalInteractionTime) <= IDLE_TIMEOUT_MS;
    var pending = anonymousHeartbeatPromise
      ? anonymousHeartbeatPromise.catch(function() { return 0; })
      : Promise.resolve(0);
    var finalHeartbeat = mayFlush
      ? sendAnonymousHeartbeat(true, closingVisitorKey, closingClientSessionId)
      : pending;

    return Promise.resolve(finalHeartbeat).then(function() {
      return bridge.endAnonymousVisitorSession(closingVisitorKey, closingClientSessionId);
    }).then(function(result) {
      if (root.APP_CONFIG && root.APP_CONFIG.analytics && root.APP_CONFIG.analytics.debug) {
        console.info('[PortalTracker] Anonymous session closed:', reason || 'pause');
      }
      return result;
    }).catch(function() {
      return false;
    });
  }

  async function recordAnonymousPageView() {
    if (anonymousPageViewRecorded) return;
    var bridge = root.SupabaseBridge;
    if (!bridge || typeof bridge.trackAnonymousVisitorEvent !== 'function') return;
    var sessionId = await ensureAnonymousDatabaseSession();
    if (!sessionId) return;

    var result = await bridge.trackAnonymousVisitorEvent({
      event_name: 'page_view',
      page_path: (root.location && root.location.pathname) || '/',
      properties: { source: 'page_load' }
    }, anonymousVisitorKey, anonymousClientSessionId);

    if (result && result.success) {
      anonymousPageViewRecorded = true;
      lastInteractionTime = Date.now();
      lastMeaningfulInteractionTime = lastInteractionTime;
      dispatchLocalTelemetry({
        event_name: 'page_view',
        user_id: null,
        session_id: sessionId,
        visitor_key: anonymousVisitorKey,
        page_path: (root.location && root.location.pathname) || '/',
        occurred_at: new Date().toISOString(),
        properties: { source: 'page_load' }
      });
    } else if (root.APP_CONFIG && root.APP_CONFIG.analytics && root.APP_CONFIG.analytics.debug) {
      console.warn('[PortalTracker] Anonymous page view was not recorded:', result && (result.reason || result.error));
    }
  }

  function initializeAnonymousTracking() {
    // Start on page load (not on first click), but only for a signed-out visitor.
    recordAnonymousPageView().catch(function(err) {
      if (root.APP_CONFIG && root.APP_CONFIG.analytics && root.APP_CONFIG.analytics.debug) {
        console.warn('[PortalTracker] Anonymous visitor initialization failed:', err);
      }
    });
  }

  function dispatchLocalTelemetry(payload) {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
    if (typeof CustomEvent !== 'undefined') {
      window.dispatchEvent(new CustomEvent('analytics:telemetry_event', { detail: payload }));
    } else {
      // Lightweight fallback for non-browser test harnesses.
      window.dispatchEvent({ type: 'analytics:telemetry_event', detail: payload });
    }
  }

  async function dispatchEventInternal(eventName, payload) {
    payload = payload || {};
    // Snapshot the interaction state before awaiting auth/network calls. A click
    // may blur the portal immediately because it opens a resource in a new tab.
    var wasActiveAtDispatch = isForeground() && lastInteractionTime &&
      (Date.now() - lastInteractionTime) <= IDLE_TIMEOUT_MS;
    var user = null;
    var bridge = root.SupabaseBridge;

    if (bridge && typeof bridge.getCurrentUser === 'function') {
      try { user = await bridge.getCurrentUser(); } catch (err) { user = null; }
    }

    var userId = user && user.id ? user.id : null;
    var dbSessionId = null;

    if (userId && wasActiveAtDispatch) {
      dbSessionId = await ensureDatabaseSession();
    }

    var fullPayload = {
      event_name: eventName,
      user_id: userId,
      session_id: dbSessionId,
      client_session_id: clientSessionId,
      course_id: payload.course_id || null,
      resource_id: payload.resource_id || null,
      page_path: (root.location && root.location.pathname) || '/',
      occurred_at: new Date().toISOString(),
      properties: payload.properties || {}
    };

    var debugMode = root.APP_CONFIG && root.APP_CONFIG.analytics && root.APP_CONFIG.analytics.debug;
    if (debugMode) console.log('[Telemetry Dispatched]', fullPayload);
    dispatchLocalTelemetry(fullPayload);

    if (userId && dbSessionId && bridge && typeof bridge.trackPortalEvent === 'function') {
      try {
        var result = await bridge.trackPortalEvent(fullPayload);
        if (debugMode && result && !result.success) {
          console.warn('[Telemetry Sync Warning]', result.reason || result.error || 'unknown');
        }
        return result;
      } catch (err) {
        if (debugMode) console.warn('[Telemetry Sync Warning]', err);
        return { success: false, error: err };
      }
    }

    // The mandatory login gate is the only anonymous experience. Do not
    // attribute hidden portal controls or resource interactions to guests.
    return { success: false, reason: userId ? 'no_active_session' : 'login_gate_only' };
  }

  // Count the full asynchronous dispatch (including auth lookup and session
  // creation) so a tab switch cannot close the session before a click is stored.
  function dispatchEvent(eventName, payload) {
    pendingTrackingWrites++;
    return dispatchEventInternal(eventName, payload).then(function(result) {
      pendingTrackingWrites = Math.max(0, pendingTrackingWrites - 1);
      return result;
    }, function(err) {
      pendingTrackingWrites = Math.max(0, pendingTrackingWrites - 1);
      return { success: false, error: err };
    });
  }

  function setupHeartbeat() {
    if (heartbeatInterval) clearInterval(heartbeatInterval);

    heartbeatInterval = setInterval(function() {
      var bridge = root.SupabaseBridge;
      if (!bridge || typeof bridge.isReady !== 'function' || !bridge.isReady()) return;
      if (!isForeground()) return;
      if (!lastInteractionTime || (Date.now() - lastInteractionTime) > IDLE_TIMEOUT_MS) return;
      if (databaseSessionId && isUuid(databaseSessionId) &&
          typeof bridge.heartbeatPortalSession === 'function') {
        sendHeartbeat(databaseSessionId);
        return;
      }
      if (anonymousDatabaseSessionId && typeof bridge.heartbeatAnonymousVisitorSession === 'function') {
        sendAnonymousHeartbeat();
      }
    }, 30000);
  }

  function setupLifecycleListeners() {
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('blur', function() { schedulePause('window-blur'); });
      window.addEventListener('focus', function() { cancelPendingPause(); });
      window.addEventListener('pagehide', function() {
        cancelPendingPause();
        var interactionAtHide = lastInteractionTime;
        pauseDatabaseSession('pagehide', interactionAtHide, true);
        pauseAnonymousSession('pagehide', interactionAtHide, true);
      });
      window.addEventListener('beforeunload', function() {
        cancelPendingPause();
        var interactionAtUnload = lastInteractionTime;
        pauseDatabaseSession('beforeunload', interactionAtUnload, true);
        pauseAnonymousSession('beforeunload', interactionAtUnload, true);
      });
    }

    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'hidden') {
          schedulePause('visibility-hidden');
        } else {
          cancelPendingPause();
        }
      });
    }

    if (root.SupabaseBridge && typeof root.SupabaseBridge.onAuthStateChange === 'function') {
      root.SupabaseBridge.onAuthStateChange(function(event, session) {
        if (event === 'SIGNED_OUT') {
          pauseDatabaseSession('signed-out', lastInteractionTime, false);
        } else {
          pauseAnonymousSession('signed-in', lastInteractionTime, false);
          // Do not auto-start identified time on auth refresh. The next user
          // interaction creates the authenticated session baseline.
          lastInteractionTime = 0;
        }
      });
    }
  }

  function setupClickListener() {
    if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;

    document.addEventListener('click', function(event) {
      if (!event.target || typeof event.target.closest !== 'function') return;
      var target = event.target.closest('[data-resource-id]');
      if (!target) return;

      var resourceId = target.getAttribute('data-resource-id');
      var resourceType = target.getAttribute('data-resource-type') || 'unknown';
      if (!resourceId) return;

      markUserActive();

      var now = Date.now();
      var debounceMs = (root.APP_CONFIG && root.APP_CONFIG.analytics &&
        root.APP_CONFIG.analytics.clickDebounceMs) || 1000;
      if (recentClicks[resourceId] && (now - recentClicks[resourceId]) < debounceMs) return;
      recentClicks[resourceId] = now;

      var resourceData = resolveResource(resourceId);
      var courseSlug = resolveCourseSlug(resourceId, resourceData);
      var href = target.getAttribute('href') || (resourceData && resourceData.url) || null;

      var eventName = 'resource_click';
      var sourceTag = 'resource_chip';
      if (resourceType === 'subject' ||
          (resourceId.indexOf('SUB_') === 0 && resourceId.indexOf('_MAIN') === -1 &&
           resourceId.indexOf('_MAT') === -1)) {
        eventName = 'course_click';
        sourceTag = 'course_header';
      } else if (resourceType === 'playlist' || (href && href.indexOf('youtube.com') !== -1)) {
        eventName = 'youtube_click';
        sourceTag = 'youtube_link';
      } else if (['card', 'subfolder', 'root'].indexOf(resourceType) !== -1 ||
          (target.classList && (target.classList.contains('folder') ||
           target.classList.contains('sub-drive-pill') || target.classList.contains('main-drive-btn')))) {
        eventName = 'folder_link_clicked';
        sourceTag = 'folder_link';
      }

      dispatchEvent(eventName, {
        course_id: courseSlug,
        resource_id: resourceId,
        properties: {
          resource_type: mapDbResourceType(resourceType, href),
          source: sourceTag
        }
      });
    }, true);
  }

  function setupSearchListener() {
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return;
    var searchInput = document.getElementById('directory-search');
    if (!searchInput) return;

    var debounceMs = (root.APP_CONFIG && root.APP_CONFIG.analytics &&
      root.APP_CONFIG.analytics.searchDebounceMs) || 1500;

    searchInput.addEventListener('input', function() {
      markUserActive();
      var query = searchInput.value.trim();
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(function() {
        if (query.length >= 2 && query !== lastSearchQuery) {
          lastSearchQuery = query;
          dispatchEvent('search_used', {
            course_id: null,
            resource_id: null,
            properties: { search_length: query.length, source: 'search_bar' }
          });
        }
      }, debounceMs);
    });
  }

  function setupFilterListener() {
    if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return;
    var filterContainer = document.querySelector('.search-filters');
    if (!filterContainer) return;

    filterContainer.addEventListener('click', function(event) {
      if (!event.target || typeof event.target.closest !== 'function') return;
      var tag = event.target.closest('.filter-tag');
      if (!tag) return;

      markUserActive();
      var selectedCategory = tag.getAttribute('data-filter') || 'all';
      if (selectedCategory !== currentCategory) {
        currentCategory = selectedCategory;
        dispatchEvent('filter_changed', {
          course_id: null,
          resource_id: null,
          properties: { filter_name: selectedCategory, source: 'quick_filter' }
        });
      }
    });
  }

  function initListeners() {
    setupLifecycleListeners();
    setupClickListener();
    setupSearchListener();
    setupFilterListener();
    setupHeartbeat();
    initializeAnonymousTracking();

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(function(eventName) {
        window.addEventListener(eventName, markUserActive, { passive: true });
      });
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initListeners);
    } else {
      initListeners();
    }
  }

  root.PortalTracker = {
    dispatchEvent: dispatchEvent,
    getClientSessionId: function() { return clientSessionId; },
    getDatabaseSessionId: function() { return databaseSessionId; },
    getAnonymousSessionId: function() { return anonymousDatabaseSessionId; },
    getAnonymousVisitorKey: function() { return anonymousVisitorKey; },
    getRecentClicks: function() { return recentClicks; },
    markUserActive: markUserActive,
    pauseDatabaseSession: pauseDatabaseSession,
    pauseAnonymousSession: pauseAnonymousSession,
    ensureDatabaseSession: ensureDatabaseSession,
    ensureAnonymousDatabaseSession: ensureAnonymousDatabaseSession,
    stopHeartbeat: function() {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      heartbeatInterval = null;
      cancelPendingPause();
      pauseAnonymousSession('tracker-stopped', lastInteractionTime, false);
    }
  };
})(typeof self !== 'undefined' ? self : this);
