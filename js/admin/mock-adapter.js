/**
 * MOCK adapter — development preview only.
 * Loaded dynamically by the admin app ONLY when the URL has ?mock=1 AND the page runs on localhost / 127.0.0.1 / file://.
 * Never loaded in production. Everything it returns is fabricated and the UI labels it as such.
 */
(function (root) {
  'use strict';
  var host = root.location.hostname;
  if (!(host === 'localhost' || host === '127.0.0.1' || host === '' || root.location.protocol === 'file:')) return;
  if (!root.AdminData) return;

  var seed = 20260101;
  function rnd() { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }
  function pick(a) { return a[Math.floor(rnd() * a.length)]; }
  var DAY = 86400000, NOW = Date.now();

  var courses = [];
  for (var c = 1; c <= 6; c++) courses.push({ id: 'c' + c, title: 'مقرر تجريبي ' + c });
  var types = ['drive', 'youtube', 'folder', 'website', 'other'];
  var resources = [];
  courses.forEach(function (co) {
    for (var r = 1; r <= 8; r++) resources.push({ id: co.id + 'r' + r, title: 'مورد تجريبي ' + co.id.slice(1) + '-' + r, courseId: co.id, type: pick(types) });
  });
  var byId = function (list, id) { return list.filter(function (x) { return x.id === id; })[0]; };

  var users = [], sessions = [], events = [], anonymousVisitors = [];
  for (var av = 1; av <= 24; av++) {
    var firstSeen = NOW - Math.floor(rnd() * 35) * DAY - Math.floor(rnd() * DAY);
    var lastSeen = Math.min(NOW, firstSeen + Math.floor(rnd() * 5) * DAY + Math.floor(rnd() * 6) * 3600000);
    anonymousVisitors.push({
      id: 'anon-' + av,
      visitorKey: 'a1b2c3d4-0000-4000-8000-' + String(av).padStart(12, '0'),
      firstSeenAt: iso(firstSeen),
      lastSeenAt: iso(lastSeen),
      lastSeenAtMs: lastSeen,
      firstPath: '/index.html',
      lastPath: pick(['/index.html', '/semester1_electronics_content_map.html', '/privacy.html']),
      sessions: 1 + Math.floor(rnd() * 6),
      totalSeconds: Math.floor(rnd() * 2400),
      pageViews: 1 + Math.floor(rnd() * 25),
      eventCount: 2 + Math.floor(rnd() * 45),
      activeNow: NOW - lastSeen < 5 * 60000
    });
  }
  var evNames = ['page_view', 'course_click', 'resource_click', 'youtube_click', 'folder_link_clicked', 'search_used', 'filter_changed', 'return_to_portal'];
  for (var u = 1; u <= 64; u++) {
    var reg = NOW - Math.floor(rnd() * 60) * DAY - Math.floor(rnd() * DAY);
    var never = rnd() < 0.1;
    users.push({ id: 'u' + u, name: 'طالب تجريبي ' + (u < 10 ? '0' + u : u), email: 'student' + u + '@example.test', avatarUrl: null, registeredAt: reg, _never: never });
    if (never) continue;
    var n = 1 + Math.floor(rnd() * 9);
    for (var s = 0; s < n; s++) {
      var start = Math.max(reg, NOW - Math.floor(rnd() * 45) * DAY - Math.floor(rnd() * DAY));
      var dur = Math.floor(60 + rnd() * 2400);
      var sid = 's' + u + '_' + s;
      var recent = NOW - start < 20 * 60000;
      var ses = { id: sid, userId: 'u' + u, startedAt: start, endedAt: recent ? null : start + dur * 1000, activeSeconds: dur, entryPath: '/index.html', lastPath: '/index.html', eventCount: 0 };
      ses.status = recent ? 'active' : (rnd() < 0.15 ? 'interrupted' : 'ended');
      if (ses.status === 'interrupted') ses.endedAt = null;
      var k = 2 + Math.floor(rnd() * 12), t = start;
      events.push({ id: events.length + 1, occurredAt: t, userId: 'u' + u, eventName: 'session_started', sessionId: sid, pagePath: '/index.html', properties: {} });
      for (var e = 0; e < k; e++) {
        t += Math.floor(rnd() * dur * 1000 / k);
        var name = pick(evNames), co = pick(courses), re = (/resource|youtube|folder/.test(name)) ? pick(resources.filter(function (x) { return x.courseId === co.id; })) : null;
        events.push({ id: events.length + 1, occurredAt: t, userId: 'u' + u, eventName: name, sessionId: sid, courseId: co.id, resourceId: re && re.id, pagePath: '/index.html', properties: name === 'search_used' ? { query_length: 6 } : {} });
      }
      ses.eventCount = k + 1;
      sessions.push(ses);
    }
  }
  events.sort(function (a, b) { return b.occurredAt - a.occurredAt; });

  function inRange(ts, f) { return (!f.from || ts >= Date.parse(f.from)) && (!f.to || ts <= Date.parse(f.to)); }
  function uStats(u) {
    var ss = sessions.filter(function (s) { return s.userId === u.id; });
    var es = events.filter(function (x) { return x.userId === u.id; });
    var last = es.length ? es[0].occurredAt : null;
    var status = !ss.length ? 'never_active' : (NOW - last < 15 * 60000 ? 'active_now' : (NOW - last < DAY ? 'active_today' : 'inactive'));
    return {
      id: u.id, name: u.name, email: u.email, avatarUrl: null, registeredAt: iso(u.registeredAt),
      lastLoginAt: ss.length ? iso(Math.max.apply(null, ss.map(function (s) { return s.startedAt; }))) : null,
      lastActiveAt: last ? iso(last) : null, sessions: ss.length,
      totalSeconds: ss.reduce(function (a, s) { return a + s.activeSeconds; }, 0),
      resourceClicks: es.filter(function (x) { return /resource_click|youtube_click|folder_link_clicked/.test(x.eventName); }).length,
      pageViews: es.filter(function (x) { return x.eventName === 'page_view'; }).length,
      courseVisits: es.filter(function (x) { return x.eventName === 'course_click'; }).length,
      firstActivityAt: es.length ? iso(es[es.length - 1].occurredAt) : null, status: status
    };
  }
  function iso(ms) { return new Date(ms).toISOString(); }
  function sortPage(list, p) {
    p = p || {};
    if (p.sort && p.sort.field) {
      var f = p.sort.field, d = p.sort.dir === 'asc' ? 1 : -1;
      list = list.slice().sort(function (a, b) { var x = a[f], y = b[f]; if (x == null) return 1; if (y == null) return -1; return (x > y ? 1 : x < y ? -1 : 0) * d; });
    }
    var size = p.pageSize || 15, page = p.page || 1;
    return { items: list.slice((page - 1) * size, page * size), total: list.length };
  }
  function evRow(x) {
    var u = byId(users, x.userId), co = x.courseId && byId(courses, x.courseId), re = x.resourceId && byId(resources, x.resourceId);
    return { id: x.id, occurredAt: iso(x.occurredAt), userId: x.userId, userName: u && u.name, eventName: x.eventName, courseId: x.courseId || null,
      courseTitle: co ? co.title : null, resourceId: x.resourceId || null, resourceTitle: re ? re.title : null, resourceType: re ? re.type : null,
      pagePath: x.pagePath, properties: x.properties, sessionId: x.sessionId };
  }
  function sesRow(s) {
    var u = byId(users, s.userId);
    return { id: s.id, userId: s.userId, userName: u.name, startedAt: iso(s.startedAt), endedAt: s.endedAt ? iso(s.endedAt) : null, activeSeconds: s.activeSeconds,
      entryPath: s.entryPath, lastPath: s.lastPath, eventCount: s.eventCount, status: s.status };
  }
  function daily(list, key, f) {
    var m = {};
    list.forEach(function (x) { var t = x[key]; if (!inRange(t, f)) return; var d = iso(t).slice(0, 10); m[d] = (m[d] || 0) + 1; });
    return Object.keys(m).sort().map(function (d) { return { date: d, value: m[d] }; });
  }
  function clickEv(x) { return /resource_click|youtube_click|folder_link_clicked/.test(x.eventName); }

  var raw = {
    checkAccess: function () { return { granted: true, admin: { name: 'مشرف تجريبي', email: 'admin@example.test', avatarUrl: null } }; },
    getFilterOptions: function () {
      return { courses: courses.map(function (c) { return { id: c.id, title: c.title }; }) };
    },
    getOverview: function (f) {
      var us = users.map(uStats), ev = events.filter(function (x) { return inRange(x.occurredAt, f); });
      var ss = sessions.filter(function (s) { return inRange(s.startedAt, f); });
      var today = NOW - DAY;
      var distinct = function (arr) { var o = {}; arr.forEach(function (x) { o[x.userId] = 1; }); return Object.keys(o).length; };
      var total = ss.reduce(function (a, s) { return a + s.activeSeconds; }, 0);
      var cnt = {}, rc = {};
      ev.forEach(function (x) { if (x.courseId && x.eventName === 'course_click') cnt[x.courseId] = (cnt[x.courseId] || 0) + 1; if (x.resourceId && clickEv(x)) rc[x.resourceId] = (rc[x.resourceId] || 0) + 1; });
      return {
        kpis: {
          registeredUsers: users.length, activeUsers: distinct(ev), activeNow: us.filter(function (x) { return x.status === 'active_now'; }).length,
          activeToday: distinct(events.filter(function (x) { return x.occurredAt > today; })), activeWeek: distinct(events.filter(function (x) { return x.occurredAt > NOW - 7 * DAY; })),
          totalSessions: ss.length, sessionsToday: sessions.filter(function (s) { return s.startedAt > today; }).length, totalSeconds: total,
          avgSessionSeconds: ss.length ? Math.round(total / ss.length) : null, pageViews: ev.filter(function (x) { return x.eventName === 'page_view'; }).length, resourceClicks: ev.filter(clickEv).length,
          anonymousVisitors: anonymousVisitors.filter(function (v) { return inRange(v.lastSeenAtMs, f); }).length,
          anonymousSessions: anonymousVisitors.filter(function (v) { return inRange(v.lastSeenAtMs, f); }).reduce(function (sum, v) { return sum + v.sessions; }, 0),
          anonymousActiveNow: anonymousVisitors.filter(function (v) { return v.activeNow && inRange(v.lastSeenAtMs, f); }).length,
          anonymousPageViews: anonymousVisitors.filter(function (v) { return inRange(v.lastSeenAtMs, f); }).reduce(function (sum, v) { return sum + v.pageViews; }, 0)
        },
        series: {
          dailyActive: (function () { var m = {}; ev.forEach(function (x) { var d = iso(x.occurredAt).slice(0, 10); (m[d] = m[d] || {})[x.userId] = 1; }); return Object.keys(m).sort().map(function (d) { return { date: d, value: Object.keys(m[d]).length }; }); })(),
          sessions: daily(ss, 'startedAt', f), registrations: daily(users, 'registeredAt', f), events: daily(ev, 'occurredAt', f),
          dailyVisitors: daily(anonymousVisitors, 'lastSeenAtMs', f).map(function (x) { return x; }),
          anonymousPageViews: daily(anonymousVisitors, 'lastSeenAtMs', f)
        },
        topCourses: Object.keys(cnt).map(function (k) { return { id: k, title: byId(courses, k).title, value: cnt[k] }; }).sort(function (a, b) { return b.value - a.value; }).slice(0, 6),
        topResources: Object.keys(rc).map(function (k) { return { id: k, title: byId(resources, k).title, value: rc[k] }; }).sort(function (a, b) { return b.value - a.value; }).slice(0, 8),
        recentActivity: ev.slice(0, 8).map(evRow),
        latestUsers: users.slice().sort(function (a, b) { return b.registeredAt - a.registeredAt; }).slice(0, 6).map(uStats),
        latestAnonymousVisitors: anonymousVisitors.slice().sort(function (a, b) { return b.lastSeenAtMs - a.lastSeenAtMs; }).slice(0, 5)
      };
    },
    getUsers: function (f, p) {
      f = f || {};
      var list = users.map(uStats).filter(function (u) {
        if (f.search && (u.name + ' ' + u.email).toLowerCase().indexOf(f.search.toLowerCase()) < 0) return false;
        if (f.status && u.status !== f.status) return false;
        if (f.registeredFrom && Date.parse(u.registeredAt) < Date.parse(f.registeredFrom)) return false;
        if (f.registeredTo && Date.parse(u.registeredAt) > Date.parse(f.registeredTo) + DAY) return false;
        return true;
      });
      return sortPage(list, p);
    },
    getAnonymousVisitors: function (f, p) {
      f = f || {};
      var list = anonymousVisitors.filter(function (v) {
        if (!inRange(v.lastSeenAtMs, f)) return false;
        var query = f.visitorSearch || (!f.userId ? f.search : '');
        if (query && (v.visitorKey + ' ' + v.lastPath).toLowerCase().indexOf(query.toLowerCase()) < 0) return false;
        return true;
      });
      return sortPage(list, p);
    },
    getUserDetails: function (id) { var u = byId(users, id); if (!u) throw new Error('not found'); var s = uStats(u); return { user: s, stats: s }; },
    getUserSessions: function (id, f, p) { return sortPage(sessions.filter(function (s) { return s.userId === id; }).sort(function (a, b) { return b.startedAt - a.startedAt; }).map(sesRow), p); },
    getSessions: function (f, p) {
      f = f || {};
      var list = sessions.filter(function (s) {
        if (!inRange(s.startedAt, f)) return false;
        if (f.search) { var u = byId(users, s.userId); if ((u.name + ' ' + u.email).toLowerCase().indexOf(f.search.toLowerCase()) < 0) return false; }
        if (f.sessionStatus && s.status !== f.sessionStatus) return false;
        if (f.minSeconds != null && s.activeSeconds < f.minSeconds) return false;
        if (f.maxSeconds != null && s.activeSeconds > f.maxSeconds) return false;
        if (f.courseId && !events.some(function (x) { return x.sessionId === s.id && x.courseId === f.courseId; })) return false;
        return true;
      }).map(sesRow);
      return sortPage(list, p || { sort: { field: 'startedAt', dir: 'desc' } });
    },
    getSessionDetails: function (id) { var s = byId(sessions, id); if (!s) throw new Error('not found'); return { session: sesRow(s), user: uStats(byId(users, s.userId)) }; },
    getActivityEvents: function (f, p) {
      f = f || {};
      var list = events.filter(function (x) {
        if (!inRange(x.occurredAt, f) && !f.userId && !f.sessionId) return false;
        if (f.userId && x.userId !== f.userId) return false;
        if (f.sessionId && x.sessionId !== f.sessionId) return false;
        if (f.eventName && x.eventName !== f.eventName) return false;
        if (f.courseId && x.courseId !== f.courseId) return false;
        if (f.resourceType) { var r = x.resourceId && byId(resources, x.resourceId); if (!r || r.type !== f.resourceType) return false; }
        if (f.search) { var u = byId(users, x.userId); if ((u.name + ' ' + u.email).toLowerCase().indexOf(f.search.toLowerCase()) < 0) return false; }
        return true;
      }).map(evRow);
      return sortPage(list, p || {});
    },
    getCourseAnalytics: function (f) {
      var ev = events.filter(function (x) { return inRange(x.occurredAt, f); });
      return { items: courses.map(function (c) {
        var ce = ev.filter(function (x) { return x.courseId === c.id; }), uq = {}; ce.forEach(function (x) { uq[x.userId] = 1; });
        var rc = {}; ce.filter(clickEv).forEach(function (x) { rc[x.resourceId] = (rc[x.resourceId] || 0) + 1; });
        return { courseId: c.id, title: c.title, visits: ce.filter(function (x) { return x.eventName === 'course_click'; }).length, uniqueUsers: Object.keys(uq).length,
          resourceClicks: ce.filter(clickEv).length, avgEngagementSeconds: null, lastInteractionAt: ce.length ? ce[0].occurredAt && iso(ce[0].occurredAt) : null,
          trend: daily(ce, 'occurredAt', f),
          topResources: Object.keys(rc).map(function (k) { return { title: byId(resources, k).title, clicks: rc[k] }; }).sort(function (a, b) { return b.clicks - a.clicks; }).slice(0, 3) };
      }) };
    },
    getResourceAnalytics: function (f) {
      var ev = events.filter(function (x) { return inRange(x.occurredAt, f) && x.resourceId && clickEv(x); });
      var items = resources.filter(function (r) { return (!f.courseId || r.courseId === f.courseId) && (!f.resourceType || r.type === f.resourceType); }).map(function (r) {
        var re = ev.filter(function (x) { return x.resourceId === r.id; }), uq = {}; re.forEach(function (x) { uq[x.userId] = 1; });
        return { resourceId: r.id, title: r.title, courseId: r.courseId, courseTitle: byId(courses, r.courseId).title, type: r.type, clicks: re.length, uniqueUsers: Object.keys(uq).length, lastClickedAt: re.length ? iso(re[0].occurredAt) : null };
      });
      return { items: items, series: daily(ev, 'occurredAt', f) };
    },
    exportReport: function (type, f) {
      var rows;
      if (type === 'users') rows = raw.getUsers(f, { pageSize: 5000 }).items;
      else if (type === 'visitors') rows = raw.getAnonymousVisitors(f, { pageSize: 5000 }).items;
      else if (type === 'sessions') rows = raw.getSessions(f, { pageSize: 5000 }).items;
      else if (type === 'courses') rows = raw.getCourseAnalytics(f).items.map(function (x) { return { course: x.title, visits: x.visits, uniqueUsers: x.uniqueUsers, resourceClicks: x.resourceClicks }; });
      else if (type === 'resources') rows = raw.getResourceAnalytics(f).items;
      else rows = raw.getOverview(f).series.events.map(function (x) { return { date: x.date, events: x.value }; });
      if (!rows.length) return { filename: 'mock-' + type + '.csv', csv: '' };
      var cols = Object.keys(rows[0]);
      var csv = [cols.join(',')].concat(rows.map(function (r) { return cols.map(function (k) { return '"' + String(r[k] == null ? '' : r[k]).replace(/"/g, '""') + '"'; }).join(','); })).join('\n');
      return { filename: 'MOCK-' + type + '.csv', csv: csv };
    }
  };

  // Simulate network latency so loading states are visible in previews.
  var adapter = {};
  Object.keys(raw).forEach(function (k) {
    adapter[k] = function () { var a = arguments; return new Promise(function (res, rej) { setTimeout(function () { try { res(raw[k].apply(raw, a)); } catch (e) { rej(e); } }, 250); }); };
  });
  root.AdminData.register(adapter, { mock: true });
})(window);
