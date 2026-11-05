/**
 * Student Authentication Widget UI (Vanilla JavaScript)
 * Seamlessly integrates Google OAuth with SupabaseBridge and preserves site responsiveness.
 */
(function(root) {
  'use strict';

  var SLOT_ID = 'auth-widget';
  var SPINNER_TIMEOUT_MS = 15000;

  var TEXT = {
    signIn: 'تسجيل الدخول بحساب Google',
    hint: '(اختياري لحفظ وقت استذكارك وسجل تفاعلك)',
    live: 'جلسة نشطة',
    exit: 'خروج'
  };

  var GOOGLE_G =
    '<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true" focusable="false">' +
    '<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>' +
    '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>' +
    '<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>' +
    '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>' +
    '</svg>';

  function h(tag, attrs) {
    var el = document.createElement(tag);
    attrs = attrs || {};
    for (var k in attrs) {
      if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
      var v = attrs[k];
      if (k === 'class') el.className = v;
      else if (k.indexOf('on') === 0 && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (v !== false && v !== null && v !== undefined) el.setAttribute(k, v);
    }
    for (var i = 2; i < arguments.length; i++) {
      var kid = arguments[i];
      if (Array.isArray(kid)) {
        for (var j = 0; j < kid.length; j++) {
          appendKid(el, kid[j]);
        }
      } else {
        appendKid(el, kid);
      }
    }
    return el;
  }

  function appendKid(parent, kid) {
    if (kid === null || kid === undefined) return;
    if (kid && kid.nodeType) parent.appendChild(kid);
    else parent.appendChild(document.createTextNode(String(kid)));
  }

  function getSlot() {
    return document.getElementById(SLOT_ID);
  }

  function firstName(profile) {
    var n = (profile && (profile.full_name || (profile.user_metadata && (profile.user_metadata.full_name || profile.user_metadata.name)))) || '';
    n = n.trim();
    return n ? n.split(/\s+/)[0] : null;
  }

  function initialOf(profile) {
    var src = (profile && (profile.full_name || profile.email)) || '';
    src = src.trim();
    return src ? src.charAt(0).toUpperCase() : '؟';
  }

  function cleanUrl() {
    if (root.history && root.history.replaceState && root.location) {
      root.history.replaceState(root.history.state, '', root.location.pathname);
    }
  }

  function renderGuest(options) {
    options = options || {};
    var el = getSlot();
    if (!el) return null;
    el.hidden = false;

    var spinner = h('span', { class: 'auth-spinner', 'aria-hidden': 'true', hidden: true });
    var btn = h('button', { class: 'auth-google-btn', id: 'google-login-btn', type: 'button' });
    btn.insertAdjacentHTML('beforeend', GOOGLE_G);
    btn.appendChild(h('span', { class: 'auth-btn-label' }, TEXT.signIn));
    btn.appendChild(spinner);

    var msg = h('p', { class: 'auth-msg', role: 'alert' }, options.message || '');
    var timer = null;

    function reset() {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      spinner.hidden = true;
    }

    btn.addEventListener('click', async function() {
      if (btn.disabled) return;
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      spinner.hidden = false;
      msg.textContent = '';
      timer = setTimeout(function() {
        reset();
        msg.textContent = 'الاتصال بطيء. حاول مرة أخرى.';
      }, SPINNER_TIMEOUT_MS);

      try {
        if (typeof options.onSignIn === 'function') {
          await options.onSignIn();
        } else if (root.SupabaseBridge && typeof root.SupabaseBridge.signInWithGoogle === 'function') {
          await root.SupabaseBridge.signInWithGoogle();
        }
      } catch (err) {
        clearTimeout(timer);
        reset();
        msg.textContent = 'تعذّر بدء تسجيل الدخول. حاول مرة أخرى.';
      }
    });

    if (root.addEventListener) {
      root.addEventListener('pageshow', function(e) {
        if (e && e.persisted) {
          clearTimeout(timer);
          reset();
        }
      });
    }

    el.innerHTML = '';
    var container = h('div', { class: 'auth-widget', 'data-state': 'guest' },
      btn,
      h('p', { class: 'auth-hint' }, TEXT.hint),
      msg
    );
    el.appendChild(container);
    return btn;
  }

  function renderSignedIn(profile, options) {
    options = options || {};
    var el = getSlot();
    if (!el) return null;
    el.hidden = false;

    var first = firstName(profile);
    var greeting = first
      ? ['أهلاً، ', h('span', { id: 'user-name' }, first)]
      : ['أهلاً بك'];

    var avatarUrl = (profile && (profile.avatar_url || (profile.user_metadata && (profile.user_metadata.avatar_url || profile.user_metadata.picture)))) || null;
    var fallback = function() {
      return h('span', { class: 'auth-avatar auth-avatar-fallback', id: 'user-avatar', 'aria-hidden': 'true' }, initialOf(profile));
    };

    var avatar;
    if (avatarUrl) {
      avatar = h('img', {
        class: 'auth-avatar',
        id: 'user-avatar',
        src: avatarUrl,
        alt: '',
        width: 36,
        height: 36,
        referrerpolicy: 'no-referrer'
      });
      avatar.addEventListener('error', function() {
        avatar.replaceWith(fallback());
      }, { once: true });
    } else {
      avatar = fallback();
    }

    var menu = h('div', { class: 'auth-menu', id: 'auth-menu', hidden: true },
      profile && profile.email ? h('p', { class: 'auth-menu-email', id: 'user-email', dir: 'ltr' }, profile.email) : '',
      h('a', { class: 'auth-menu-item', href: 'privacy.html' }, 'سياسة الخصوصية'),
      h('button', {
        class: 'auth-menu-item',
        type: 'button',
        onclick: async function() {
          if (!confirm('هل تريد تسجيل الخروج؟')) return;
          if (typeof options.onSignOut === 'function') {
            await options.onSignOut();
          } else if (root.SupabaseBridge && typeof root.SupabaseBridge.signOut === 'function') {
            await root.SupabaseBridge.signOut();
          }
        }
      }, 'تسجيل الخروج')
    );

    var profileBtn = h('button', {
      class: 'auth-profile',
      type: 'button',
      'aria-expanded': 'false',
      'aria-controls': 'auth-menu'
    },
      avatar,
      h('span', { class: 'auth-who' },
        h('span', { class: 'auth-hello' }, greeting),
        h('span', { class: 'auth-live' }, h('i', { class: 'auth-dot', 'aria-hidden': 'true' }), TEXT.live)
      )
    );

    profileBtn.addEventListener('click', function() {
      menu.hidden = !menu.hidden;
      profileBtn.setAttribute('aria-expanded', String(!menu.hidden));
    });

    var exitBtn = h('button', { class: 'auth-exit', id: 'logout-btn', type: 'button' }, TEXT.exit);
    exitBtn.addEventListener('click', async function() {
      exitBtn.disabled = true;
      try {
        if (typeof options.onSignOut === 'function') {
          await options.onSignOut();
        } else if (root.SupabaseBridge && typeof root.SupabaseBridge.signOut === 'function') {
          await root.SupabaseBridge.signOut();
        }
      } finally {
        exitBtn.disabled = false;
      }
    });

    el.innerHTML = '';
    var container = h('div', { class: 'auth-widget', 'data-state': 'user' },
      h('div', { class: 'auth-chip' }, profileBtn, exitBtn),
      menu
    );
    el.appendChild(container);
    return el;
  }

  async function initAuthWidget() {
    var slot = getSlot();
    if (!slot) return;

    if (!root.SupabaseBridge || !root.SupabaseBridge.isConfigured || !root.SupabaseBridge.isConfigured()) {
      slot.hidden = true;
      return;
    }

    // Clean OAuth redirect params if present
    if (root.location && (root.location.search.indexOf('code=') !== -1 || root.location.hash.indexOf('access_token') !== -1)) {
      cleanUrl();
    }

    try {
      var user = await root.SupabaseBridge.getCurrentUser();
      if (user) {
        renderSignedIn(user);
      } else {
        renderGuest();
      }
    } catch (err) {
      renderGuest();
    }

    if (root.SupabaseBridge && typeof root.SupabaseBridge.onAuthStateChange === 'function') {
      root.SupabaseBridge.onAuthStateChange(function(event, session) {
        if (session && session.user) {
          renderSignedIn(session.user);
        } else {
          renderGuest();
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuthWidget);
  } else {
    setTimeout(initAuthWidget, 0);
  }

  root.AuthUI = {
    renderGuest: renderGuest,
    renderSignedIn: renderSignedIn,
    init: initAuthWidget
  };

})(typeof self !== 'undefined' ? self : this);
