/** Admin dashboard app: shell, router, views. Talks only to AdminData (adapter) — never to a backend directly. */
(function (root) {
  'use strict';
  var U = root.AdminUI, D = root.AdminData, esc = U.esc, DAY = 86400000;
  var main;
  var routeVersion = 0;
  var ADMIN_LOADING_TIMEOUT_MS = 15000;
  var ADMIN_REPORT_TIMEOUT_MS = 20000;
  var AUTO_REFRESH_INTERVAL_MS = 10000;
  var autoRefreshTimer = null;
  var currentViewRefresh = null;
  var state = { preset: '30d', from: '', to: '', options: { courses: [] }, access: null };
  var vs = {};               // per-view state (filters, page, sort)

  function $(id) { return document.getElementById(id); }
  function qa(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }

  // ---------------- date range ----------------
  var PRESETS = [['today', 'اليوم'], ['yesterday', 'أمس'], ['7d', 'آخر 7 أيام'], ['30d', 'آخر 30 يوم'], ['month', 'هذا الشهر'], ['custom', 'فترة مخصصة']];
  function sod(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function range() {
    var now = new Date(), s = sod(now), e = new Date(now), p = state.preset;
    if (p === 'yesterday') { s = new Date(s.getTime() - DAY); e = new Date(s.getTime() + DAY - 1); }
    else if (p === '7d') s = new Date(s.getTime() - 6 * DAY);
    else if (p === '30d') s = new Date(s.getTime() - 29 * DAY);
    else if (p === 'month') s = new Date(now.getFullYear(), now.getMonth(), 1);
    else if (p === 'custom') {
      if (state.from) s = new Date(state.from + 'T00:00:00'); else s = new Date(s.getTime() - 29 * DAY);
      if (state.to) e = new Date(state.to + 'T23:59:59.999');
    }
    return { from: s, to: e };
  }
  function globalFilters() { var r = range(); return { preset: state.preset, from: r.from.toISOString(), to: r.to.toISOString() }; }
  function rangeLabel() { var r = range(); return U.date(r.from) + ' — ' + U.date(r.to); }
  function isoDay(v) { return v ? new Date(v + 'T00:00:00').toISOString() : ''; }

  // ---------------- generic helpers ----------------
  function userLink(id, name) { return id ? '<a class="lnk" href="#/users/' + encodeURIComponent(id) + '">' + esc(name || id) + '</a>' : U.NA; }
  function sessionLink(id) { return id ? '<a class="lnk mono" href="#/sessions/' + encodeURIComponent(id) + '">' + esc(String(id).slice(0, 8)) + '</a>' : U.NA; }
  function evContext(e) {
    var b = [];
    if (e.courseTitle) b.push('<span class="tl-chip tl-chip-course">' + esc(e.courseTitle) + '</span>');
    if (e.resourceTitle) b.push('<span class="tl-chip tl-chip-res">' + esc(e.resourceTitle) + (e.resourceType ? ' (' + esc(U.typeLabel(e.resourceType)) + ')' : '') + '</span>');
    if (!e.courseTitle && !e.resourceTitle) {
      if (e.eventName === 'session_started') b.push('بدء جلسة تصفح في المنصة');
      else if (e.eventName === 'session_ended') b.push('انتهاء الجلسة وتسجيل الخروج');
      else if (e.pagePath && e.pagePath !== '/' && e.pagePath !== '/index.html') b.push('<span class="mono" dir="ltr">' + esc(e.pagePath) + '</span>');
      else b.push('الصفحة الرئيسية');
    } else if (e.pagePath && e.pagePath !== '/' && e.pagePath !== '/index.html') {
      b.push('<span class="mono" dir="ltr">' + esc(e.pagePath) + '</span>');
    }
    return b.join(' ');
  }
  function propChips(p) {
    if (!p || typeof p !== 'object' || !Object.keys(p).length) return '—';
    var sourceMap = {
      course_header: 'كارت المادة',
      resource_card: 'كارت المورد',
      accordion: 'قائمة منسدلة',
      quick_link: 'رابط سريع',
      button: 'زر',
      portal_header: 'ترويسة الموقع'
    };
    var typeMap = {
      folder: 'مجلد',
      youtube: 'يوتيوب',
      pdf: 'ملف PDF',
      sheet: 'شيت',
      drive: 'درايف',
      link: 'رابط خارجي'
    };
    var chips = [];
    if (p.source) {
      var s = sourceMap[p.source] || p.source;
      chips.push('<span class="prop-chip prop-chip-source"><span class="chip-k">المصدر:</span> ' + esc(s) + '</span>');
    }
    if (p.resource_type) {
      var t = typeMap[p.resource_type] || p.resource_type;
      chips.push('<span class="prop-chip prop-chip-type"><span class="chip-k">النوع:</span> ' + esc(t) + '</span>');
    }
    Object.keys(p).forEach(function (k) {
      if (k === 'source' || k === 'resource_type') return;
      var val = p[k];
      if (val === null || val === undefined || val === '') return;
      var displayVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
      chips.push('<span class="prop-chip"><span class="chip-k">' + esc(k) + ':</span> ' + esc(displayVal) + '</span>');
    });
    return chips.length ? '<div class="prop-chips">' + chips.join(' ') + '</div>' : '—';
  }
  function pageHead(title, sub, actions) {
    return '<div class="page-head"><div><h2>' + esc(title) + '</h2><p class="muted">' + (sub || 'الفترة: ' + esc(rangeLabel())) + '</p></div>' + (actions || '') + '</div>';
  }
  function guard(el, promise, render, retry, isRequestCurrent, timeoutMs) {
    if (!el) return Promise.resolve();
    var startedOnRoute = routeVersion;
    var requestId = (el._adminRequestId || 0) + 1;
    var ms = Number(timeoutMs);
    if (!isFinite(ms) || ms <= 0) ms = ADMIN_LOADING_TIMEOUT_MS;
    el._adminRequestId = requestId;
    var timer = null;

    function cleanupTimer() {
      if (timer !== null) { clearTimeout(timer); timer = null; }
    }
    function canUpdate() {
      return el.isConnected !== false &&
        startedOnRoute === routeVersion &&
        el._adminRequestId === requestId &&
        (typeof isRequestCurrent !== 'function' || isRequestCurrent());
    }
    function showError(err) {
      if (!canUpdate()) return;
      el._retry = typeof retry === 'function' ? retry : null;
      el.innerHTML = U.errorState(err, 'retry');
      if (root.console && err && err.code !== 'UNAVAILABLE' && root.console.error) {
        root.console.error('[AdminUI] Request failed:', err);
      }
    }

    var timeoutPromise = new Promise(function (_, reject) {
      timer = setTimeout(function () {
        var error = new Error('استغرق تحميل البيانات وقتًا أطول من المتوقع. يمكنك المحاولة مرة أخرى.');
        error.code = 'TIMEOUT';
        reject(error);
      }, ms);
    });

    return Promise.race([Promise.resolve(promise), timeoutPromise])
      .then(function (data) {
        cleanupTimer();
        if (!canUpdate()) return;
        return render(data);
      })
      .catch(function (error) {
        cleanupTimer();
        showError(error);
      });
  }

  function withTimeout(promise, timeoutMs, message) {
    var timer = null;
    var timeoutPromise = new Promise(function (_, reject) {
      timer = setTimeout(function () {
        var error = new Error(message || 'استغرق تحميل البيانات وقتًا أطول من المتوقع.');
        error.code = 'TIMEOUT';
        reject(error);
      }, timeoutMs);
    });
    return Promise.race([Promise.resolve(promise), timeoutPromise]).then(function (value) {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      return value;
    }, function (error) {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      throw error;
    });
  }

  function handleRetryClick(event) {
    var target = event && event.target;
    var button = target && typeof target.closest === 'function' ? target.closest('[data-retry]') : null;
    if (!button) return false;
    if (event.preventDefault) event.preventDefault();
    var errorState = button.closest('.state-err');
    var container = errorState && errorState.parentElement;
    if (container && typeof container._retry === 'function') container._retry();
    return true;
  }
  function timeline(items) {
    if (!items.length) return U.empty('لا توجد أحداث مسجّلة');
    return '<ol class="tl">' + items.map(function (e) {
      return '<li class="tl-item"><span class="tl-dot ev-' + esc(e.eventName) + '"></span><div class="tl-body"><div class="tl-title">' + esc(U.eventLabel(e.eventName)) + '</div>' +
        (evContext(e) ? '<div class="tl-meta">' + evContext(e) + '</div>' : '') + '</div><time class="tl-time" datetime="' + esc(e.occurredAt) + '">' + U.dateTime(e.occurredAt) + '</time></li>';
    }).join('') + '</ol>';
  }

  // ---------------- filter toolbar ----------------
  function courseOptions() { return [['', 'كل المواد']].concat((state.options.courses || []).map(function (c) { return [c.id, c.title]; })); }
  function typeOptions() { var t = state.options.resourceTypes || ['drive', 'youtube', 'folder', 'website', 'other']; return [['', 'كل الأنواع']].concat(t.map(function (k) { return [k, U.typeLabel(k)]; })); }
  function eventOptions() { return [['', 'كل الأحداث']].concat(Object.keys(U.EVENTS).map(function (k) { return [k, U.EVENTS[k]]; })); }
  function fieldHtml(f, val) {
    val = val == null ? '' : val;
    if (f.type === 'search') {
      var searchControl = '<label class="fld fld-search">' + U.icon('search') + '<input type="search" data-f="' + f.key + '" placeholder="' + esc(f.ph) + '" value="' + esc(val) + '" aria-label="' + esc(f.ph) + '" autocomplete="off"></label>';
      if (!f.autocomplete) return searchControl;
      return '<div class="autocomplete-wrap" data-autocomplete-wrap="' + esc(f.key) + '">' + searchControl +
        '<div class="autocomplete-list" data-autocomplete-list="' + esc(f.key) + '" role="listbox" aria-label="اقتراحات المستخدمين" hidden></div></div>';
    }
    var opts = typeof f.options === 'function' ? f.options() : f.options;
    if (f.type === 'select') return '<label class="fld"><span>' + esc(f.label) + '</span><select data-f="' + f.key + '">' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(val) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></label>';
    return '<label class="fld"><span>' + esc(f.label) + '</span><input type="date" data-f="' + f.key + '" value="' + esc(val) + '"></label>';
  }
  function toolbarHtml(fields, s) { return '<div class="card toolbar">' + fields.map(function (f) { return fieldHtml(f, s.f[f.key]); }).join('') + '<button type="button" class="btn btn-ghost" data-reset>مسح الفلاتر</button></div>'; }
  function bindToolbar(s, onChange, defaults) {
    qa('[data-f]', main).forEach(function (el) {
      var fn = function () { s.f[el.getAttribute('data-f')] = el.value; s.page = 1; onChange(); };
      el.addEventListener(el.type === 'search' ? 'input' : 'change', el.type === 'search' ? U.debounce(fn, 300) : fn);
    });
    var r = main.querySelector('[data-reset]');
    if (r) r.addEventListener('click', function () { s.f = JSON.parse(JSON.stringify(defaults)); s.page = 1; qa('[data-f]', main).forEach(function (el) { el.value = s.f[el.getAttribute('data-f')] || ''; }); onChange(); });
  }
  function cleanFilters(f, map) {
    var o = Object.assign({}, globalFilters());
    Object.keys(f).forEach(function (k) { if (f[k] !== '' && f[k] != null) o[k] = f[k]; });
    if (map) map(o, f);
    return o;
  }

  // Generic paged list view (server-side pagination, sort, filters).
  function listView(name, cfg) {
    return function () {
      var s = vs[name] = vs[name] || { page: 1, pageSize: 15, sort: cfg.sort, f: JSON.parse(JSON.stringify(cfg.defaults)), req: 0 };
      main.innerHTML = pageHead(cfg.title, cfg.sub) + toolbarHtml(cfg.fields, s) + '<div id="results"></div>';
      var res = $('results');
      function load(silent) {
        var id = ++s.req;
        if (!silent) res.innerHTML = U.skeleton('table');
        guard(res, cfg.fetch(cleanFilters(s.f, cfg.map), { page: s.page, pageSize: s.pageSize, sort: s.sort }), function (r) {
          if (id !== s.req) return;
          if (!r || !r.items || !r.items.length) { res.innerHTML = U.empty(cfg.emptyMsg || 'لا توجد نتائج', 'جرّب تغيير الفلاتر أو الفترة الزمنية.'); return; }
          res.innerHTML = '<div class="card flush">' + U.table(cfg.cols, r.items, { sort: s.sort, clickable: !!cfg.href, rowAttr: cfg.href ? function (x) { return 'data-href="' + esc(cfg.href(x)) + '" tabindex="0"'; } : null }) + U.pager(r.total, s.page, s.pageSize) + '</div>';
          qa('[data-sort]', res).forEach(function (b) { b.addEventListener('click', function () { var f = b.getAttribute('data-sort'); s.sort = { field: f, dir: s.sort.field === f && s.sort.dir === 'desc' ? 'asc' : 'desc' }; s.page = 1; load(); }); });
          qa('[data-page]', res).forEach(function (b) { b.addEventListener('click', function () { s.page = +b.getAttribute('data-page'); load(); }); });
        }, load, function () { return id === s.req; });
      }
      bindToolbar(s, load, cfg.defaults);
      currentViewRefresh = name === 'visitors' ? function() { load(true); } : null;
      load(false);
    };
  }

  // ---------------- Overview ----------------
  var KPIS = [
    ['registeredUsers', 'إجمالي المسجّلين', U.num], ['activeUsers', 'المستخدمون النشطون (الفترة)', U.num], ['activeNow', 'نشطون الآن', U.num],
    ['activeToday', 'نشطون اليوم', U.num], ['activeWeek', 'نشطون هذا الأسبوع', U.num], ['totalSessions', 'إجمالي الجلسات', U.num],
    ['sessionsToday', 'جلسات اليوم', U.num], ['totalSeconds', 'إجمالي وقت التصفح', U.dur], ['avgSessionSeconds', 'متوسط مدة الجلسة', U.dur],
    ['pageViews', 'مشاهدات صفحات الطلاب المسجّلين', U.num], ['resourceClicks', 'ضغطات الموارد', U.num],
    ['anonymousVisitors', 'متصفحات وصلت لشاشة تسجيل الدخول', U.num],
    ['anonymousSessions', 'مرات فتح شاشة تسجيل الدخول', U.num], ['anonymousPageViews', 'مشاهدات شاشة تسجيل الدخول', U.num]
  ];
  function overview() {
    function load(silent) {
      if (!silent) main.innerHTML = pageHead('نظرة عامة', 'تتحدّث الإحصائيات تلقائيًا كل 10 ثوانٍ.') + U.skeleton('kpis');
      guard(main, D.call('getOverview', globalFilters()), function (o) {
      o = o || {}; var k = o.kpis || {}, s = o.series || {};
      var card = function (title, body) { return '<section class="card"><h3 class="card-t">' + title + '</h3>' + body + '</section>'; };
      var recent = (o.recentActivity || []).length ? '<ul class="feed">' + o.recentActivity.map(function (e) { return '<li><div><strong>' + userLink(e.userId, e.userName) + '</strong> — ' + esc(U.eventLabel(e.eventName)) + (evContext(e) ? '<div class="tl-meta">' + evContext(e) + '</div>' : '') + '</div><time>' + U.dateTime(e.occurredAt) + '</time></li>'; }).join('') + '</ul>' : U.empty('لا يوجد نشاط حديث');
      var latest = (o.latestUsers || []).length ? '<ul class="feed">' + o.latestUsers.map(function (u) { return '<li><div class="who">' + U.avatar(u) + '<div><strong>' + userLink(u.id, u.name) + '</strong><div class="tl-meta" dir="ltr">' + esc(u.email || '') + '</div></div></div><time>' + U.date(u.registeredAt) + '</time></li>'; }).join('') + '</ul>' : U.empty('لا يوجد مستخدمون جدد');
      var latestAnonymous = (o.latestAnonymousVisitors || []).length ? '<ul class="feed">' + o.latestAnonymousVisitors.map(function (v) {
        var shortKey = String(v.visitorKey || '').slice(0, 8);
        return '<li><div><strong>زائر ' + esc(shortKey) + '</strong><div class="tl-meta mono" dir="ltr">' + esc(v.lastPath || '/') + '</div></div><time>' + U.dateTime(v.lastSeenAt) + '</time></li>';
      }).join('') + '</ul>' : U.empty('لا يوجد زوار مجهولون في الفترة المحددة');
      main.innerHTML = pageHead('نظرة عامة', 'تتحدّث الإحصائيات تلقائيًا كل 10 ثوانٍ.') +
        '<div class="kpi-grid">' + KPIS.map(function (d) { return '<div class="card kpi"><span class="kpi-l">' + d[1] + '</span><strong class="kpi-v">' + d[2](k[d[0]]) + '</strong></div>'; }).join('') + '</div>' +
        '<div class="grid-2">' + card('المستخدمون النشطون يوميًا', U.chart(s.dailyActive, { label: 'المستخدمون النشطون يوميًا' })) + card('الجلسات عبر الزمن', U.chart(s.sessions, { label: 'الجلسات' })) +
        card('اتجاه التسجيل', U.chart(s.registrations, { bars: true, label: 'التسجيلات' })) + card('اتجاه التفاعل (الأحداث)', U.chart(s.events, { label: 'الأحداث' })) +
        card('زيارات شاشة تسجيل الدخول يوميًا', U.chart(s.dailyVisitors, { label: 'زيارات شاشة تسجيل الدخول' })) +
        card('مشاهدات شاشة تسجيل الدخول', U.chart(s.anonymousPageViews, { label: 'مشاهدات شاشة تسجيل الدخول' })) +
        card('المواد الأكثر زيارة بعد تسجيل الدخول', U.barList(o.topCourses)) + card('الموارد الأكثر ضغطًا', U.barList(o.topResources)) +
        card('آخر نشاط للمستخدمين المسجّلين', recent) + card('أحدث الحسابات المسجّلة', latest) +
        card('أحدث زيارات شاشة الدخول', latestAnonymous) + '</div>';
      }, load);
    }
    currentViewRefresh = function() { load(true); };
    load(false);
  }

  // ---------------- Users ----------------
  var users = listView('users', {
    title: 'المستخدمون', sub: 'كل الطلاب المسجّلين — البحث والفلاتر لا تعتمد على الفترة الزمنية العامة إلا في الجلسات والنشاط.',
    defaults: { search: '', status: '', registeredFrom: '', registeredTo: '' }, sort: { field: 'registeredAt', dir: 'desc' },
    fields: [{ type: 'search', key: 'search', ph: 'بحث بالاسم أو البريد' },
      { type: 'select', key: 'status', label: 'الحالة', options: [['', 'الكل'], ['active_now', 'نشط الآن'], ['active_today', 'نشط اليوم'], ['inactive', 'غير نشط'], ['never_active', 'لم يتفاعل بعد']] },
      { type: 'date', key: 'registeredFrom', label: 'تسجيل من' }, { type: 'date', key: 'registeredTo', label: 'تسجيل إلى' }],
    map: function (o, f) { delete o.preset; delete o.from; delete o.to; if (f.registeredFrom) o.registeredFrom = isoDay(f.registeredFrom); if (f.registeredTo) o.registeredTo = isoDay(f.registeredTo); },
    fetch: function (f, p) { return D.call('getUsers', f, p); }, href: function (u) { return '#/users/' + encodeURIComponent(u.id); },
    cols: [
      { label: 'المستخدم', render: function (u) { return '<div class="who">' + U.avatar(u) + '<div><strong>' + esc(u.name || '—') + '</strong><div class="tl-meta" dir="ltr">' + esc(u.email || '') + '</div></div></div>'; } },
      { label: 'تاريخ التسجيل', sort: 'registeredAt', render: function (u) { return U.date(u.registeredAt); } },
      { label: 'آخر تسجيل دخول', render: function (u) { return U.dateTime(u.lastLoginAt); } },
      { label: 'آخر نشاط', sort: 'lastActiveAt', render: function (u) { return U.dateTime(u.lastActiveAt); } },
      { label: 'الجلسات', render: function (u) { return U.num(u.sessions); } },
      { label: 'إجمالي الوقت', sort: 'totalSeconds', render: function (u) { return U.dur(u.totalSeconds); } },
      { label: 'ضغطات الموارد', render: function (u) { return U.num(u.resourceClicks); } },
      { label: 'الحالة', render: function (u) { return U.chip(U.STATUS, u.status); } }]
  });

  function userDetail(id) {
    main.innerHTML = '<a class="back" href="#/users">' + U.icon('back') + ' كل المستخدمين</a>' + U.skeleton('x') + U.skeleton('table');
    var s = { page: 1, pageSize: 10, sort: { field: 'startedAt', dir: 'desc' }, tl: 1, tlItems: [], tlTotal: 0 };

    guard(main, D.call('getUserDetails', id), function (r) {
      r = r || {};
      var u = r.user || {}, st = r.stats || {};
      var kv = function (k, v) { return '<div class="kv"><span>' + k + '</span><strong>' + v + '</strong></div>'; };
      var avg = st.sessions ? st.totalSeconds / st.sessions : null;
      main.innerHTML = '<a class="back" href="#/users">' + U.icon('back') + ' كل المستخدمين</a>' +
        '<section class="card profile"><div class="who big">' + U.avatar(u) + '<div><h2>' + esc(u.name || '—') + '</h2><div class="muted" dir="ltr">' + esc(u.email || '') + '</div></div></div>' + U.chip(U.STATUS, u.status) + '</section>' +
        '<div class="grid-2"><section class="card"><h3 class="card-t">بيانات المستخدم</h3><div class="kvs">' + kv('معرّف المستخدم', '<span class="mono" dir="ltr">' + esc(u.id) + '</span>') + kv('تاريخ التسجيل', U.dateTime(u.registeredAt)) + kv('آخر تسجيل دخول', U.dateTime(u.lastLoginAt)) + kv('آخر نشاط', U.dateTime(u.lastActiveAt)) + '</div></section>' +
        '<section class="card"><h3 class="card-t">إحصاءات التفاعل</h3><div class="kvs">' + kv('إجمالي الجلسات', U.num(st.sessions)) + kv('إجمالي الوقت', U.dur(st.totalSeconds)) + kv('متوسط مدة الجلسة', U.dur(avg)) + kv('الصفحات المفتوحة', U.num(st.pageViews)) + kv('زيارات المواد', U.num(st.courseVisits)) + kv('ضغطات الموارد', U.num(st.resourceClicks)) + kv('أول نشاط', U.dateTime(st.firstActivityAt)) + kv('آخر نشاط', U.dateTime(st.lastActiveAt || u.lastActiveAt)) + '</div></section></div>' +
        '<section class="card flush"><h3 class="card-t pad">سجل الجلسات</h3><div id="u-sessions"></div></section>' +
        '<section class="card"><h3 class="card-t">الخط الزمني للنشاط</h3><div id="u-tl"></div></section>';
      loadSessions();
      loadTimeline(true);
    }, function () { userDetail(id); });

    function loadSessions() {
      var el = $('u-sessions');
      if (!el) return;
      el.innerHTML = U.skeleton('x');
      guard(el, D.call('getUserSessions', id, {}, {
        page: s.page, pageSize: s.pageSize, sort: s.sort
      }), function (r) {
        var items = r && Array.isArray(r.items) ? r.items : [];
        if (!items.length) { el.innerHTML = U.empty('لا توجد جلسات مسجّلة'); return; }
        el.innerHTML = U.table(sessionCols(false), items, {
          clickable: true,
          rowAttr: function (x) { return 'data-href="#/sessions/' + encodeURIComponent(x.id) + '" tabindex="0"'; }
        }) + U.pager(Number(r.total) || items.length, s.page, s.pageSize);
        qa('[data-page]', el).forEach(function (button) {
          button.addEventListener('click', function () {
            s.page = Number(button.getAttribute('data-page')) || 1;
            loadSessions();
          });
        });
      }, loadSessions);
    }

    function renderTimeline() {
      var el = $('u-tl');
      if (!el) return;
      var hasMore = s.tlItems.length < s.tlTotal;
      el.innerHTML = timeline(s.tlItems) + (hasMore
        ? '<div id="u-tl-more-wrap"><button type="button" class="btn" id="u-tl-more">تحميل المزيد</button></div>'
        : '');
      var moreButton = $('u-tl-more');
      if (moreButton) moreButton.addEventListener('click', loadTimelineMore);
    }

    function loadTimeline(reset) {
      var el = $('u-tl');
      if (!el) return;
      if (reset) {
        s.tl = 1; s.tlItems = []; s.tlTotal = 0;
        el.innerHTML = U.skeleton('x');
      }
      var requestedPage = reset ? 1 : s.tl;
      guard(el, D.call('getActivityEvents', { userId: id }, {
        page: requestedPage, pageSize: 20,
        sort: { field: 'occurredAt', dir: 'desc' }
      }), function (r) {
        var items = r && Array.isArray(r.items) ? r.items : [];
        s.tlItems = reset ? items : s.tlItems.concat(items);
        s.tlTotal = Number(r && r.total) || s.tlItems.length;
        s.tl = requestedPage;
        renderTimeline();
      }, function () { loadTimeline(!!reset); });
    }

    function loadTimelineMore() {
      var wrap = $('u-tl-more-wrap');
      if (!wrap) return;
      var nextPage = s.tl + 1;
      wrap.innerHTML = U.skeleton('x');
      guard(wrap, D.call('getActivityEvents', { userId: id }, {
        page: nextPage, pageSize: 20,
        sort: { field: 'occurredAt', dir: 'desc' }
      }), function (r) {
        var items = r && Array.isArray(r.items) ? r.items : [];
        s.tl = nextPage;
        s.tlItems = s.tlItems.concat(items);
        s.tlTotal = Number(r && r.total) || s.tlItems.length;
        renderTimeline();
      }, loadTimelineMore);
    }
  }


  function sessionCols(withUser) {
    var cols = [{ label: 'معرّف الجلسة', render: function (x) { return sessionLink(x.id); } }];
    if (withUser) cols.push({ label: 'المستخدم', render: function (x) { return userLink(x.userId, x.userName); } });
    return cols.concat([
      { label: 'بدء الجلسة', sort: 'startedAt', render: function (x) { return U.dateTime(x.startedAt); } },
      { label: 'نهاية الجلسة', render: function (x) { return U.dateTime(x.endedAt); } },
      { label: 'المدة', sort: 'activeSeconds', render: function (x) { return U.dur(x.activeSeconds); } },
      { label: 'صفحة الدخول', render: function (x) { return x.entryPath ? '<span class="mono" dir="ltr">' + esc(x.entryPath) + '</span>' : U.NA; } },
      { label: 'آخر صفحة', render: function (x) { return x.lastPath ? '<span class="mono" dir="ltr">' + esc(x.lastPath) + '</span>' : U.NA; } },
      { label: 'عدد الأحداث', render: function (x) { return U.num(x.eventCount); } },
      { label: 'الحالة', render: function (x) { return U.chip(U.SESSION_STATUS, x.status); } }]);
  }
  var visitors = listView('visitors', {
    title: 'زيارات شاشة تسجيل الدخول', sub: 'تتحدّث القائمة تلقائيًا كل 10 ثوانٍ. هذه زيارات لشاشة الدخول فقط وليست مشاهدات لمحتوى المواد.',
    defaults: { search: '' }, sort: { field: 'lastSeenAt', dir: 'desc' },
    fields: [{ type: 'search', key: 'search', ph: 'بحث بمعرّف الزائر أو الصفحة' }],
    fetch: function (f, p) { return D.call('getAnonymousVisitors', f, p); },
    cols: [
      { label: 'معرّف المتصفح', render: function (v) { return '<span class="mono" dir="ltr">' + esc(String(v.visitorKey || '').slice(0, 16)) + '…</span>'; } },
      { label: 'أول زيارة', sort: 'firstSeenAt', render: function (v) { return U.dateTime(v.firstSeenAt); } },
      { label: 'آخر زيارة', sort: 'lastSeenAt', render: function (v) { return U.dateTime(v.lastSeenAt); } },
      { label: 'مرات فتح شاشة الدخول', render: function (v) { return U.num(v.sessions); } },
      { label: 'مشاهدات شاشة الدخول', render: function (v) { return U.num(v.pageViews); } },
      { label: 'الأحداث', render: function (v) { return U.num(v.eventCount); } },
      { label: 'آخر مسار', render: function (v) { return '<span class="mono" dir="ltr">' + esc(v.lastPath || '/') + '</span>'; } },
      { label: 'الحالة', render: function () { return '<span class="chip chip-muted">زائر غير مسجّل</span>'; } }
    ]
  });

  var sessions = listView('sessions', {
    title: 'الجلسات', defaults: { search: '', courseId: '', duration: '', sessionStatus: '' }, sort: { field: 'startedAt', dir: 'desc' },
    fields: [{ type: 'search', key: 'search', ph: 'بحث بالمستخدم (الاسم أو البريد)' }, { type: 'select', key: 'courseId', label: 'المادة', options: courseOptions },
      { type: 'select', key: 'duration', label: 'المدة', options: [['', 'أي مدة'], ['lt1', 'أقل من دقيقة'], ['1-10', '1 – 10 دقائق'], ['10-30', '10 – 30 دقيقة'], ['gt30', 'أكثر من 30 دقيقة']] },
      { type: 'select', key: 'sessionStatus', label: 'الحالة', options: [['', 'الكل'], ['active', 'نشطة'], ['ended', 'منتهية'], ['interrupted', 'منقطعة']] }],
    map: function (o, f) {
      delete o.duration;
      var d = { lt1: [0, 59], '1-10': [60, 600], '10-30': [600, 1800], gt30: [1800, null] }[f.duration];
      if (d) { o.minSeconds = d[0]; if (d[1] != null) o.maxSeconds = d[1]; }
    },
    fetch: function (f, p) { return D.call('getSessions', f, p); }, href: function (x) { return '#/sessions/' + encodeURIComponent(x.id); }, cols: sessionCols(true)
  });

  function sessionDetail(id) {
    main.innerHTML = '<a class="back" href="#/sessions">' + U.icon('back') + ' كل الجلسات</a>' + U.skeleton('x');
    var timelineState = { page: 1, pageSize: 50, items: [], total: 0 };

    guard(main, D.call('getSessionDetails', id), function (r) {
      r = r || {};
      var s = r.session || {}, u = r.user || {};
      var kv = function (k, v) { return '<div class="kv"><span>' + k + '</span><strong>' + v + '</strong></div>'; };
      main.innerHTML = '<a class="back" href="#/sessions">' + U.icon('back') + ' كل الجلسات</a>' +
        '<section class="card"><div class="page-head"><h2>جلسة <span class="mono">' + esc(String(s.id || '').slice(0, 8)) + '</span></h2>' + U.chip(U.SESSION_STATUS, s.status) + '</div><div class="kvs">' +
        kv('المستخدم', userLink(s.userId || u.id, s.userName || u.name)) + kv('بدء الجلسة', U.dateTime(s.startedAt)) + kv('نهاية الجلسة', U.dateTime(s.endedAt)) + kv('المدة', U.dur(s.activeSeconds)) +
        kv('صفحة الدخول', s.entryPath ? '<span class="mono" dir="ltr">' + esc(s.entryPath) + '</span>' : U.NA) + kv('آخر صفحة', s.lastPath ? '<span class="mono" dir="ltr">' + esc(s.lastPath) + '</span>' : U.NA) + kv('عدد الأحداث', U.num(s.eventCount)) + '</div></section>' +
        '<section class="card"><h3 class="card-t">الخط الزمني للجلسة</h3><div id="s-tl">' + U.skeleton('x') + '</div></section>';
      loadSessionEvents(true);
    }, function () { sessionDetail(id); });

    function renderSessionEvents() {
      var el = $('s-tl');
      if (!el) return;
      var hasMore = timelineState.items.length < timelineState.total;
      el.innerHTML = timeline(timelineState.items) + (hasMore
        ? '<div id="s-more-wrap"><button type="button" class="btn" id="s-more">تحميل المزيد</button></div>'
        : '');
      var moreButton = $('s-more');
      if (moreButton) moreButton.addEventListener('click', loadMoreSessionEvents);
    }

    function loadSessionEvents(reset) {
      var el = $('s-tl');
      if (!el) return;
      if (reset) {
        timelineState.page = 1; timelineState.items = []; timelineState.total = 0;
        el.innerHTML = U.skeleton('x');
      }
      var requestedPage = reset ? 1 : timelineState.page;
      guard(el, D.call('getActivityEvents', { sessionId: id }, {
        page: requestedPage, pageSize: timelineState.pageSize,
        sort: { field: 'occurredAt', dir: 'asc' }
      }), function (result) {
        var items = result && Array.isArray(result.items) ? result.items : [];
        timelineState.items = reset ? items : timelineState.items.concat(items);
        timelineState.total = Number(result && result.total) || timelineState.items.length;
        timelineState.page = requestedPage;
        renderSessionEvents();
      }, function () { loadSessionEvents(!!reset); });
    }

    function loadMoreSessionEvents() {
      var wrap = $('s-more-wrap');
      if (!wrap) return;
      var nextPage = timelineState.page + 1;
      wrap.innerHTML = U.skeleton('x');
      guard(wrap, D.call('getActivityEvents', { sessionId: id }, {
        page: nextPage, pageSize: timelineState.pageSize,
        sort: { field: 'occurredAt', dir: 'asc' }
      }), function (result) {
        var items = result && Array.isArray(result.items) ? result.items : [];
        timelineState.page = nextPage;
        timelineState.items = timelineState.items.concat(items);
        timelineState.total = Number(result && result.total) || timelineState.items.length;
        renderSessionEvents();
      }, loadMoreSessionEvents);
    }
  }


  var logs = listView('logs', {
    title: 'سجل النشاط', defaults: { search: '', eventName: '', courseId: '', resourceType: '' }, sort: { field: 'occurredAt', dir: 'desc' },
    fields: [{ type: 'search', key: 'search', ph: 'بحث بالمستخدم' }, { type: 'select', key: 'eventName', label: 'نوع الحدث', options: eventOptions },
      { type: 'select', key: 'courseId', label: 'المادة', options: courseOptions }, { type: 'select', key: 'resourceType', label: 'نوع المورد', options: typeOptions }],
    fetch: function (f, p) { return D.call('getActivityEvents', f, p); },
    cols: [
      { label: 'الوقت', sort: 'occurredAt', render: function (e) { return U.dateTime(e.occurredAt); } },
      { label: 'المستخدم', render: function (e) { return userLink(e.userId, e.userName); } },
      { label: 'الحدث', render: function (e) { return esc(U.eventLabel(e.eventName)) + '<div class="tl-meta mono" dir="ltr">' + esc(e.eventName) + '</div>'; } },
      { label: 'المادة', render: function (e) { return e.courseTitle ? esc(e.courseTitle) : U.NA; } },
      { label: 'المورد', render: function (e) { return e.resourceTitle ? esc(e.resourceTitle) + '<div class="tl-meta">' + esc(U.typeLabel(e.resourceType)) + '</div>' : U.NA; } },
      { label: 'الصفحة', render: function (e) { return e.pagePath ? '<span class="mono" dir="ltr">' + esc(e.pagePath) + '</span>' : U.NA; } },
      { label: 'الخصائص', render: function (e) { return propChips(e.properties); } },
      { label: 'الجلسة', render: function (e) { return sessionLink(e.sessionId); } }]
  });

  // ---------------- Courses ----------------
  function courses() {
    main.innerHTML = pageHead('تحليلات المواد') + U.skeleton('x') + U.skeleton('table');
    guard(main, D.call('getCourseAnalytics', globalFilters()), function (r) {
      var items = (r && r.items) || [];
      if (!items.length) { main.innerHTML = pageHead('تحليلات المواد') + U.empty('لا توجد بيانات للمواد'); return; }
      var sorted = items.slice().sort(function (a, b) { return (b.visits || 0) - (a.visits || 0); });
      main.innerHTML = pageHead('تحليلات المواد') +
        '<section class="card"><h3 class="card-t">مقارنة المواد حسب الزيارات</h3>' + U.barList(sorted.map(function (c) { return { title: c.title, value: c.visits || 0 }; })) + '</section>' +
        '<div class="cards-3">' + sorted.map(function (c, i) {
          return '<article class="card course"><header><span class="rank">#' + U.num(i + 1) + '</span><h3>' + esc(c.title) + '</h3></header>' +
            '<div class="mini"><div><span>الزيارات</span><strong>' + U.num(c.visits) + '</strong></div><div><span>مستخدمون فريدون</span><strong>' + U.num(c.uniqueUsers) + '</strong></div><div><span>ضغطات الموارد</span><strong>' + U.num(c.resourceClicks) + '</strong></div><div><span>متوسط التفاعل</span><strong>' + U.dur(c.avgEngagementSeconds) + '</strong></div></div>' +
            '<div class="spark-row"><span class="muted">اتجاه النشاط</span>' + (U.spark(c.trend) || U.NA) + '</div>' +
            '<div class="muted small">أشهر الموارد</div>' + ((c.topResources || []).length ? '<ul class="plain">' + c.topResources.map(function (t) { return '<li><span>' + esc(t.title) + '</span><strong>' + U.num(t.clicks) + '</strong></li>'; }).join('') + '</ul>' : '<div>' + U.NA + '</div>') + '</article>';
        }).join('') + '</div>';
    }, courses);
  }

  // ---------------- Resources ----------------
  function resources() {
    var s = vs.resources = vs.resources || { f: { courseId: '', resourceType: '' }, page: 1, sort: { field: 'clicks', dir: 'desc' } };
    main.innerHTML = pageHead('تحليلات الموارد') + toolbarHtml([{ type: 'select', key: 'courseId', label: 'المادة', options: courseOptions }, { type: 'select', key: 'resourceType', label: 'نوع المورد', options: typeOptions }], s) + '<div id="results"></div>';
    var res = $('results');
    function load() {
      res.innerHTML = U.skeleton('x') + U.skeleton('table');
      guard(res, D.call('getResourceAnalytics', cleanFilters(s.f)), function (r) {
        var items = (r && r.items) || [];
        if (!items.length) { res.innerHTML = U.empty('لا توجد موارد مطابقة'); return; }
        var byClicks = items.slice().sort(function (a, b) { return (b.clicks || 0) - (a.clicks || 0); });
        var rank = {}; byClicks.forEach(function (x, i) { rank[x.resourceId] = i + 1; });
        var top = {}; byClicks.forEach(function (x) { if (!top[x.courseId]) top[x.courseId] = x; });
        var bars = function (l) { return U.barList(l.map(function (x) { return { title: x.title, value: x.clicks || 0 }; })); };
        var d = s.sort.dir === 'asc' ? 1 : -1, f = s.sort.field;
        var sortedItems = items.slice().sort(function (a, b) { var x = a[f], y = b[f]; if (x == null) return 1; if (y == null) return -1; return (x > y ? 1 : x < y ? -1 : 0) * d; });
        var size = 15, pages = Math.ceil(sortedItems.length / size); if (s.page > pages) s.page = pages;
        var cols = [
          { label: 'الترتيب', render: function (x) { return U.num(rank[x.resourceId]); } },
          { label: 'المورد', sort: 'title', render: function (x) { return esc(x.title); } }, { label: 'المادة', sort: 'courseTitle', render: function (x) { return esc(x.courseTitle || ''); } },
          { label: 'النوع', sort: 'type', render: function (x) { return esc(U.typeLabel(x.type)); } }, { label: 'الضغطات', sort: 'clicks', render: function (x) { return U.num(x.clicks); } },
          { label: 'مستخدمون فريدون', sort: 'uniqueUsers', render: function (x) { return U.num(x.uniqueUsers); } }, { label: 'آخر ضغطة', sort: 'lastClickedAt', render: function (x) { return U.dateTime(x.lastClickedAt); } }];
        res.innerHTML = '<div class="grid-2"><section class="card"><h3 class="card-t">الأكثر ضغطًا</h3>' + bars(byClicks.slice(0, 8)) + '</section><section class="card"><h3 class="card-t">الأقل ضغطًا</h3>' + bars(byClicks.slice(-8).reverse()) + '</section>' +
          '<section class="card"><h3 class="card-t">الأشهر في كل مادة</h3><ul class="plain">' + Object.keys(top).map(function (k) { return '<li><span>' + esc(top[k].courseTitle) + ' — ' + esc(top[k].title) + '</span><strong>' + U.num(top[k].clicks) + '</strong></li>'; }).join('') + '</ul></section>' +
          '<section class="card"><h3 class="card-t">التفاعل مع الموارد عبر الزمن</h3>' + U.chart(r.series, { label: 'ضغطات الموارد' }) + '</section></div>' +
          '<div class="card flush">' + U.table(cols, sortedItems.slice((s.page - 1) * size, s.page * size), { sort: s.sort }) + U.pager(sortedItems.length, s.page, size) + '</div>';
        qa('[data-sort]', res).forEach(function (b) { b.addEventListener('click', function () { var k = b.getAttribute('data-sort'); s.sort = { field: k, dir: s.sort.field === k && s.sort.dir === 'desc' ? 'asc' : 'desc' }; load(); }); });
        qa('[data-page]', res).forEach(function (b) { b.addEventListener('click', function () { s.page = +b.getAttribute('data-page'); load(); }); });
      }, load);
    }
    bindToolbar(s, load, { courseId: '', resourceType: '' }); load();
  }

  function bindReportUserAutocomplete(s) {
    var input = main.querySelector('[data-f="search"]');
    var wrap = main.querySelector('[data-autocomplete-wrap="search"]');
    var list = main.querySelector('[data-autocomplete-list="search"]');
    if (!input || !wrap || !list || !D.has('getUsers')) return;

    var requestId = 0;
    var timer = null;

    function closeSuggestions() {
      requestId++;
      if (timer) { clearTimeout(timer); timer = null; }
      list.hidden = true;
      list.innerHTML = '';
    }

    function renderSuggestions(items, query) {
      if (input.value.trim() !== query) return;
      if (!items.length) {
        list.innerHTML = '<div class="autocomplete-empty">لا توجد أسماء مطابقة</div>';
        list.hidden = false;
        return;
      }
      list.innerHTML = items.map(function (user) {
        var name = user.name || user.email || 'مستخدم بدون اسم';
        return '<button type="button" class="autocomplete-option" role="option" data-user-suggestion data-user-id="' +
          esc(user.id) + '" data-user-name="' + esc(name) + '">' +
          '<span>' + esc(name) + '</span>' +
          (user.email ? '<small dir="ltr">' + esc(user.email) + '</small>' : '') +
          '</button>';
      }).join('');
      list.hidden = false;
    }

    input.addEventListener('input', function () {
      s.f.userId = '';
      var query = input.value.trim();
      var currentRequest = ++requestId;
      if (timer) clearTimeout(timer);
      if (query.length < 2) {
        list.hidden = true;
        list.innerHTML = '';
        return;
      }

      list.innerHTML = '<div class="autocomplete-empty">جارٍ البحث عن المستخدمين…</div>';
      list.hidden = false;
      timer = setTimeout(function () {
        D.call('getUsers', { search: query }, {
          page: 1,
          pageSize: 8,
          sort: { field: 'registeredAt', dir: 'desc' }
        }).then(function (result) {
          if (currentRequest !== requestId) return;
          renderSuggestions(result && Array.isArray(result.items) ? result.items : [], query);
        }).catch(function () {
          if (currentRequest !== requestId) return;
          list.innerHTML = '<div class="autocomplete-empty">تعذّر تحميل الأسماء. حاول مرة أخرى.</div>';
          list.hidden = false;
        });
      }, 220);
    });

    list.addEventListener('click', function (event) {
      var option = event.target && event.target.closest ? event.target.closest('[data-user-suggestion]') : null;
      if (!option) return;
      var userId = option.getAttribute('data-user-id');
      var userName = option.getAttribute('data-user-name') || '';
      if (!userId) return;
      input.value = userName;
      s.f.search = userName;
      s.f.userId = userId;
      closeSuggestions();
    });

    main.addEventListener('click', function (event) {
      if (!wrap.contains(event.target)) closeSuggestions();
      if (event.target && event.target.closest && event.target.closest('[data-reset]')) {
        s.f.userId = '';
        closeSuggestions();
      }
    });
  }

  // ---------------- Reports ----------------
  var REPORTS = [['users', 'تقرير نشاط المستخدمين', 'بيانات المستخدمين المسجّلين: الجلسات والوقت والضغطات.'], ['visitors', 'تقرير زيارات شاشة تسجيل الدخول', 'معرّفات متصفحات وصلت إلى شاشة الدخول، دون احتسابها كمشاهدات لمحتوى المواد.'], ['sessions', 'تقرير الجلسات', 'كل الجلسات المسجّلة في الفترة المحددة.'],
    ['courses', 'تقرير تحليلات المواد', 'الزيارات والمستخدمون الفريدون وضغطات الموارد لكل مادة.'], ['resources', 'تقرير تحليلات الموارد', 'الضغطات والمستخدمون الفريدون لكل مورد.'], ['daily', 'تقرير النشاط اليومي', 'ملخص النشاط يومًا بيوم.']];
  function reports() {
    var s = vs.reports = vs.reports || { f: { search: '', userId: '', visitorSearch: '', courseId: '', resourceType: '', eventName: '' } };
    main.innerHTML = pageHead('التقارير والتصدير', 'يتم التصدير بصيغة CSV وفق الفترة والفلاتر المحددة أدناه — الفترة: ' + rangeLabel()) +
      toolbarHtml([{ type: 'search', key: 'search', ph: 'ابحث عن اسم المستخدم…', autocomplete: true }, { type: 'search', key: 'visitorSearch', ph: 'معرّف الزائر (اختياري)' }, { type: 'select', key: 'courseId', label: 'المادة', options: courseOptions }, { type: 'select', key: 'resourceType', label: 'نوع المورد', options: typeOptions }, { type: 'select', key: 'eventName', label: 'نوع النشاط', options: eventOptions }], s) +
      '<div class="cards-3">' + REPORTS.map(function (r) { return '<article class="card report"><h3>' + r[1] + '</h3><p class="muted">' + r[2] + '</p><button type="button" class="btn btn-primary" data-report="' + r[0] + '">' + U.icon('download') + ' تصدير CSV</button></article>'; }).join('') + '</div>';
    bindToolbar(s, function () {}, { search: '', userId: '', visitorSearch: '', courseId: '', resourceType: '', eventName: '' });
    bindReportUserAutocomplete(s);
    qa('[data-report]', main).forEach(function (button) {
      button.addEventListener('click', function () {
        if (button.disabled) return;
        var type = button.getAttribute('data-report');
        var filters = cleanFilters(s.f);
        var startedOnRoute = routeVersion;
        button.disabled = true;

        withTimeout(
          D.call('exportReport', type, filters),
          ADMIN_REPORT_TIMEOUT_MS,
          'استغرق تصدير التقرير وقتًا أطول من المتوقع. حاول مرة أخرى.'
        ).then(function (result) {
          if (startedOnRoute !== routeVersion || button.isConnected === false) return;
          if (!result || !result.csv) {
            U.toast('لا توجد بيانات للتصدير ضمن الفلاتر الحالية', 'warn');
            return;
          }
          var anchor = document.createElement('a');
          var objectUrl = URL.createObjectURL(new Blob(['\ufeff' + result.csv], { type: 'text/csv;charset=utf-8' }));
          anchor.href = objectUrl;
          anchor.download = result.filename || (type + '.csv');
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 1000);
          U.toast('تم تجهيز الملف للتنزيل', 'ok');
        }).catch(function (error) {
          if (startedOnRoute !== routeVersion || button.isConnected === false) return;
          U.toast(
            error && error.code === 'TIMEOUT'
              ? error.message
              : (error && error.code === 'UNAVAILABLE' ? 'مصدر البيانات غير متاح' : 'تعذّر تصدير التقرير. حاول مرة أخرى.'),
            'err'
          );
        }).then(function () {
          if (button.isConnected !== false) button.disabled = false;
        });
      });
    });
  }


  var NAV = [['overview', 'نظرة عامة', 'overview', overview], ['users', 'المستخدمون', 'users', users], ['visitors', 'الزوار بدون تسجيل', 'users', visitors], ['sessions', 'الجلسات', 'sessions', sessions], ['logs', 'سجل النشاط', 'logs', logs],
    ['courses', 'تحليلات المواد', 'courses', courses], ['resources', 'تحليلات الموارد', 'resources', resources], ['reports', 'التقارير', 'reports', reports]];

  function route() {
    routeVersion++;
    currentViewRefresh = null;
    var parts = (location.hash.replace(/^#\/?/, '') || 'overview').split('/'), name = parts[0], arg = parts[1] && decodeURIComponent(parts[1]);
    var nav = NAV.filter(function (n) { return n[0] === name; })[0] || NAV[0];
    qa('.nav a').forEach(function (a) { var on = a.getAttribute('data-nav') === nav[0]; a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    $('page-title').textContent = (arg ? (nav[0] === 'users' ? 'ملف المستخدم' : 'تفاصيل الجلسة') : nav[1]) + (D.isMock() ? ' (تجريبي)' : '');
    $('range-label').textContent = rangeLabel();
    document.body.classList.remove('nav-open'); root.scrollTo(0, 0);
    if (arg && nav[0] === 'users') userDetail(arg); else if (arg && nav[0] === 'sessions') sessionDetail(arg); else nav[3]();
    main.focus({ preventScroll: true });
  }

  function buildShell() {
    $('nav').innerHTML = NAV.map(function (n) { return '<a href="#/' + n[0] + '" data-nav="' + n[0] + '">' + U.icon(n[2]) + '<span>' + n[1] + '</span></a>'; }).join('');
    $('preset').innerHTML = PRESETS.map(function (p) { return '<option value="' + p[0] + '"' + (p[0] === state.preset ? ' selected' : '') + '>' + p[1] + '</option>'; }).join('');
    var ad = (state.access && state.access.admin) || {};
    $('admin-name').textContent = ad.name || ad.email || 'المشرف';
    $('admin-avatar').innerHTML = U.avatar(ad);
    $('menu-btn').innerHTML = U.icon('menu'); $('bell-btn').insertAdjacentHTML('afterbegin', U.icon('bell')); $('logout-btn').insertAdjacentHTML('afterbegin', U.icon('logout'));
    $('mock-banner').hidden = !D.isMock();

    var changed = function () { state.preset = $('preset').value; state.from = $('d-from').value; state.to = $('d-to').value; $('custom-range').hidden = state.preset !== 'custom'; route(); };
    $('preset').addEventListener('change', changed); $('d-from').addEventListener('change', changed); $('d-to').addEventListener('change', changed);
    $('menu-btn').addEventListener('click', function () { document.body.classList.toggle('nav-open'); });
    $('scrim').addEventListener('click', function () { document.body.classList.remove('nav-open'); });
    $('bell-btn').addEventListener('click', function (e) { e.stopPropagation(); var p = $('bell-pop'); p.hidden = !p.hidden; $('bell-btn').setAttribute('aria-expanded', String(!p.hidden)); });
    document.addEventListener('click', function () { $('bell-pop').hidden = true; $('bell-btn').setAttribute('aria-expanded', 'false'); });
    $('logout-btn').addEventListener('click', function () {
      document.dispatchEvent(new CustomEvent('admin:logout-request'));
      if (D.has('signOut')) D.call('signOut').then(function () { location.href = '../'; }).catch(function () { U.toast('تعذّر تسجيل الخروج', 'err'); });
    });
    main.addEventListener('click', function (e) {
      if (handleRetryClick(e)) return;
      var tr = e.target.closest('tr[data-href]'); if (tr && !e.target.closest('a,button,summary')) location.hash = tr.getAttribute('data-href');
    });
    main.addEventListener('keydown', function (e) { var tr = e.target.closest && e.target.closest('tr[data-href]'); if (tr && e.target === tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); location.hash = tr.getAttribute('data-href'); } });
    root.addEventListener('hashchange', route);
  }

  function screen(kind, retry) {
    var s = $('gate-screen'); $('shell').hidden = true; s.hidden = false;
    var m = {
      unavailable: ['مصدر البيانات غير متاح', 'لوحة التحكم جاهزة لكنها لم تُربط بمصدر بيانات بعد. لن يتم عرض أي أرقام إلى أن يتم الربط.'],
      denied: ['غير مصرّح بالدخول', 'هذه الصفحة مخصّصة للمشرفين فقط. سجّل الدخول بحساب مشرف مصرّح له.'],
      error: ['تعذّر التحقق من الصلاحية', 'حدث خطأ أثناء التحقق من صلاحيات الدخول. حاول مرة أخرى.']
    }[kind];
    s.innerHTML = '<div class="gate-card">' + U.icon('lock', 'state-ic') + '<h1>' + m[0] + '</h1><p>' + m[1] + '</p><div class="gate-actions">' +
      (retry ? '<button type="button" class="btn btn-primary" id="gate-retry">إعادة المحاولة</button>' : '') + '<a class="btn" href="../">العودة إلى الموقع</a></div></div>';
    var r = $('gate-retry'); if (r) r.addEventListener('click', retry);
  }

  function refreshFilterSelectOptions() {
    var factories = { courseId: courseOptions, resourceType: typeOptions, eventName: eventOptions };
    qa('select[data-f]', main).forEach(function (select) {
      var key = select.getAttribute('data-f');
      if (!factories[key]) return;
      var selected = select.value;
      var options = factories[key]();
      select.innerHTML = options.map(function (option) {
        return '<option value="' + esc(option[0]) + '">' + esc(option[1]) + '</option>';
      }).join('');
      select.value = selected;
      if (select.value !== selected) select.value = '';
    });
  }

  function startAutoRefresh() {
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    autoRefreshTimer = setInterval(function() {
      if (document.visibilityState === 'hidden' || !currentViewRefresh) return;
      currentViewRefresh();
    }, AUTO_REFRESH_INTERVAL_MS);
  }

  function start() {
    $('gate-screen').hidden = true;
    $('shell').hidden = false;
    buildShell();
    route();
    startAutoRefresh();
    if (D.has('getFilterOptions')) {
      Promise.resolve()
        .then(function () { return D.call('getFilterOptions'); })
        .then(function (options) {
          if (!options || typeof options !== 'object') return;
          state.options = Object.assign(state.options, options);
          refreshFilterSelectOptions();
        })
        .catch(function (error) {
          if (root.console) console.warn('[AdminUI] Filter options unavailable:', error);
        });
    }
  }

  function boot() {
    if (!D.isRegistered()) {
      screen('unavailable');
      document.addEventListener('admin-data:registered', boot, { once: true });
      return;
    }
    D.call('checkAccess').then(function (a) { state.access = a; if (a && a.granted === true) start(); else screen('denied'); }).catch(function () { screen('error', boot); });
  }

  function init() {
    main = $('main');
    var mock = /[?&]mock=1(&|$)/.test(location.search);
    if (mock) {
      var sc = document.createElement('script'); sc.src = '../js/admin/mock-adapter.js'; sc.onload = boot; sc.onerror = boot; document.head.appendChild(sc);
    } else boot();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window);
