/**
 * Student Authentication & Login Gate UI (Vanilla JavaScript)
 * Seamlessly integrates Google Identity Services (GSI) & Supabase OAuth
 * Enforces mandatory login before entering the portal while preserving 100% responsiveness.
 */
(function(root) {
  'use strict';

  var CLIENT_ID = '29419790387-b4a54ckom00nmc0lgi3jn8o14fca869a.apps.googleusercontent.com';
  var SLOT_ID = 'auth-widget';
  var GATE_ID = 'login-gate';
  var SPINNER_TIMEOUT_MS = 15000;

  var TEXT = {
    signIn: 'تسجيل الدخول بحساب Google',
    hint: '(اختياري لحفظ وقت استذكارك وسجل تفاعلك)',
    live: 'جلسة نشطة',
    exit: 'تسجيل الخروج'
  };

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

  function getGate() {
    return document.getElementById(GATE_ID);
  }

  function getPage() {
    return document.querySelector('.page') || document.querySelector('main');
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

  function showLoginGate() {
    var gate = getGate();
    var page = getPage();
    if (gate) gate.hidden = false;
    if (page) page.classList.add('portal-locked');

    // Try initializing Google Identity Services (GSI)
    initGoogleGSI();
  }

  function hideLoginGate() {
    var gate = getGate();
    var page = getPage();
    if (gate) gate.hidden = true;
    if (page) page.classList.remove('portal-locked');
  }

  function initGoogleGSI() {
    if (!root.google || !root.google.accounts || !root.google.accounts.id) {
      // Retry in 300ms if GSI script is still loading asynchronously
      setTimeout(function() {
        if (root.google && root.google.accounts && root.google.accounts.id) {
          initGoogleGSI();
        }
      }, 300);
      return;
    }

    try {
      root.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: handleGoogleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true
      });



      // Display One Tap if appropriate
      root.google.accounts.id.prompt();
    } catch (err) {
      console.warn('Google GSI initialization warning:', err);
    }
  }

  async function handleGoogleCredentialResponse(response) {
    if (!response || !response.credential) return;
    var errEl = document.getElementById('login-gate-error');
    if (errEl) errEl.textContent = 'جاري التحقق وتسجيل الدخول...';

    try {
      if (root.SupabaseBridge && typeof root.SupabaseBridge.signInWithIdToken === 'function') {
        var res = await root.SupabaseBridge.signInWithIdToken(response.credential);
        if (res && res.error) {
          if (errEl) errEl.textContent = 'تعذّر تسجيل الدخول: ' + res.error.message;
        } else if (res && res.data && res.data.user) {
          renderSignedIn(res.data.user);
        }
      }
    } catch (e) {
      if (errEl) errEl.textContent = 'حدث خطأ أثناء الاتصال. حاول مرة أخرى.';
    }
  }

  function renderGuest(options) {
    options = options || {};
    var slot = getSlot();
    if (slot) {
      slot.innerHTML = '';
      slot.hidden = true;
    }

    // Show the mandatory full-screen login gate
    showLoginGate();

    var gateBtn = document.getElementById('login-gate-google-btn');
    var gateErr = document.getElementById('login-gate-error');
    if (gateBtn) {
      var spinner = gateBtn.querySelector('.auth-spinner');
      gateBtn.onclick = async function() {
        if (gateBtn.disabled) return;
        gateBtn.disabled = true;
        if (spinner) spinner.hidden = false;
        if (gateErr) gateErr.textContent = '';

        try {
          if (typeof options.onSignIn === 'function') {
            await options.onSignIn();
          } else if (root.SupabaseBridge && typeof root.SupabaseBridge.signInWithGoogle === 'function') {
            await root.SupabaseBridge.signInWithGoogle();
          }
        } catch (err) {
          gateBtn.disabled = false;
          if (spinner) spinner.hidden = true;
          if (gateErr) gateErr.textContent = 'تعذّر فتح نافذة تسجيل الدخول. حاول مجددًا.';
        }
      };
    }
  }

  function renderSignedIn(profile, options) {
    options = options || {};
    // Hide mandatory login gate and unlock portal
    hideLoginGate();

    var el = getSlot();
    if (!el) return null;
    el.hidden = false;

    var first = firstName(profile);
    var greeting = first
      ? ['أهلاً يا ', h('span', { id: 'user-name', style: 'color: var(--cyan-bright, #22D3EE);' }, first), ' 👋']
      : ['أهلاً بك 👋'];

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

    if (root.SupabaseBridge && root.SupabaseBridge.getClient) {
      var client = root.SupabaseBridge.getClient();
      if (client) {
        client.rpc('is_admin').then(function(res) {
          if (res && res.data === true) {
            var adminLink = h('a', {
              class: 'auth-menu-item',
              href: 'admin/',
              style: 'color: #0891B2; font-weight: 800;'
            }, '⚡ لوحة تحكم المشرف');
            menu.insertBefore(adminLink, menu.firstChild);
          }
        }).catch(function() {});
      }
    }

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
    // Clean OAuth redirect params if present in URL
    if (root.location && (root.location.search.indexOf('code=') !== -1 || root.location.hash.indexOf('access_token') !== -1)) {
      cleanUrl();
    }

    try {
      if (root.SupabaseBridge && typeof root.SupabaseBridge.getCurrentUser === 'function') {
        var user = await root.SupabaseBridge.getCurrentUser();
        if (user) {
          renderSignedIn(user);
        } else {
          renderGuest();
        }
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
