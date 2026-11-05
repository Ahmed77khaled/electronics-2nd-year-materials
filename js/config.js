/**
 * Electronics 2nd Year Materials Portal - Application Configuration
 * 
 * ⚠️ SECURITY INSTRUCTIONS:
 * 1. ONLY add your Supabase Project URL and your public Publishable / Anon Key here.
 * 2. NEVER put the 'service_role' key in this file or anywhere in the static website.
 * 3. The system operates gracefully in offline/fallback mode when credentials are not configured.
 */

(function(root) {
  'use strict';

  var APP_CONFIG = {
    supabase: {
      // 1. Enter your Supabase Project URL (e.g. 'https://your-project.supabase.co')
      url: 'https://qgcabhbwlzalvfqpdzfl.supabase.co',

      // 2. Enter your Supabase public Anon / Publishable Key (e.g. 'eyJhbGciOi...')
      anonKey: 'sb_publishable_54sxb1vc-L00EjQhNg7AVQ_BjPs_oxu'
    },
    analytics: {
      // Set to true to see telemetry events in the browser console
      debug: false,
      // Debounce window for rapid clicks (ms)
      clickDebounceMs: 1000,
      // Debounce window for search input (ms)
      searchDebounceMs: 1500
    },
    meta: {
      portalName: 'Electronics 2nd Year Materials Portal',
      academicTerm: 'Year 2 - Term 1',
      version: '1.1.0'
    }
  };

  root.APP_CONFIG = APP_CONFIG;
})(typeof self !== 'undefined' ? self : this);
