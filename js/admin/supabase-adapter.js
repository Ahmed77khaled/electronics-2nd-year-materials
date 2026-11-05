/**
 * Live Supabase Data Adapter for Admin Dashboard
 * Connects the decoupled Admin UI directly to Supabase views and tables
 * Enforces server-side authorization via public.is_admin()
 */
(function(root) {
  'use strict';

  function getClient() {
    return root.SupabaseBridge && root.SupabaseBridge.getClient ? root.SupabaseBridge.getClient() : null;
  }

  function getBridge() {
    return root.SupabaseBridge || null;
  }

  // Preserve the distinction between a real zero and a metric not supplied by
  // the database (for example, before migration 007 has been applied).
  function toNullableNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    var number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function computeSessionStatus(session) {
    if (session.ended_at) return 'ended';
    var heartbeatAt = session.last_heartbeat_at ? new Date(session.last_heartbeat_at).getTime() : NaN;
    if (!Number.isFinite(heartbeatAt) || Date.now() - heartbeatAt > 5 * 60 * 1000) return 'interrupted';
    return 'active';
  }

  // Helper: compute student status
  function computeStudentStatus(lastSeen, totalSessions) {
    if (!totalSessions || Number(totalSessions) === 0) return 'never_active';
    if (!lastSeen) return 'inactive';
    var diff = Date.now() - new Date(lastSeen).getTime();
    if (diff < 15 * 60 * 1000) return 'active_now';
    if (diff < 24 * 60 * 60 * 1000) return 'active_today';
    return 'inactive';
  }

  function addDateRange(query, filters, column) {
    var f = filters || {};
    if (f.from) query = query.gte(column, f.from);
    if (f.to) query = query.lte(column, f.to);
    return query;
  }

  // Page through PostgREST results instead of silently stopping at its row limit.
  async function fetchAllRows(buildQuery, pageSize) {
    var rows = [];
    var size = pageSize || 500;
    var offset = 0;
    while (true) {
      var result = await buildQuery().range(offset, offset + size - 1);
      if (result.error) throw result.error;
      var page = result.data || [];
      rows = rows.concat(page);
      if (page.length < size) break;
      offset += size;
    }
    return rows;
  }

  function resolveEventFilters(client, filters) {
    var f = filters || {};
    return Promise.all([
      f.search ? fetchAllRows(function () {
        return client.from('admin_student_summary').select('user_id, full_name, email').order('user_id', { ascending: true });
      }).then(function (users) {
        var term = String(f.search).toLowerCase().trim();
        return users.filter(function (user) {
          return (user.full_name || '').toLowerCase().indexOf(term) !== -1 ||
            (user.email || '').toLowerCase().indexOf(term) !== -1;
        }).map(function (user) { return user.user_id; });
      }) : Promise.resolve(null),
      f.resourceType ? fetchAllRows(function () {
        return client.from('resources').select('id').eq('resource_type', f.resourceType).order('id', { ascending: true });
      }).then(function (resources) {
        return resources.map(function (resource) { return resource.id; });
      }) : Promise.resolve(null)
    ]).then(function (resolved) {
      return {
        userIds: resolved[0],
        resourceIds: resolved[1],
        impossible: (resolved[0] !== null && !resolved[0].length) ||
          (resolved[1] !== null && !resolved[1].length)
      };
    });
  }

  function buildEventQuery(client, filters, constraints, withCount) {
    var f = filters || {};
    var query = client.from('activity_events').select('*', withCount ? { count: 'exact' } : {});
    query = addDateRange(query, f, 'occurred_at');
    if (f.userId) query = query.eq('user_id', f.userId);
    if (f.sessionId) query = query.eq('session_id', f.sessionId);
    if (f.courseId) query = query.eq('course_id', f.courseId);
    if (f.eventName) query = query.eq('event_name', f.eventName);
    if (constraints && constraints.userIds !== null) query = query.in('user_id', constraints.userIds);
    if (constraints && constraints.resourceIds !== null) query = query.in('resource_id', constraints.resourceIds);
    return query;
  }

  async function fetchFilteredEvents(client, filters) {
    var constraints = await resolveEventFilters(client, filters);
    if (constraints.impossible) return [];
    return fetchAllRows(function () {
      return buildEventQuery(client, filters, constraints, false).order('occurred_at', { ascending: true }).order('id', { ascending: true });
    });
  }

  function sortAndPage(items, pagination, defaultField, defaultPageSize) {
    var p = pagination || {};
    var sort = p.sort || { field: defaultField, dir: 'desc' };
    var direction = sort.dir === 'asc' ? 1 : -1;
    var field = sort.field || defaultField;
    var sorted = items.slice().sort(function (a, b) {
      var left = a[field], right = b[field];
      if (left == null && right == null) return 0;
      if (left == null) return 1;
      if (right == null) return -1;
      if (typeof left === 'number' && typeof right === 'number') return (left - right) * direction;
      var l = String(left), r = String(right);
      return (l < r ? -1 : (l > r ? 1 : 0)) * direction;
    });
    var page = Math.max(1, Math.floor(Number(p.page) || 1));
    var pageSize = Math.max(1, Math.min(100000, Math.floor(Number(p.pageSize) || defaultPageSize || 15)));
    return {
      items: sorted.slice((page - 1) * pageSize, page * pageSize),
      total: sorted.length
    };
  }

  function csvCell(value) {
    if (value === null || value === undefined) return '""';
    var text = String(value);
    // Prevent spreadsheet formula execution in exported text cells.
    if (typeof value !== 'number' && /^[\s]*[=+\-@]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function toCsv(headers, rows) {
    return [headers].concat(rows).map(function (row) {
      return row.map(csvCell).join(',');
    }).join('\r\n');
  }

  function isResourceClick(eventName) {
    return ['resource_click', 'youtube_click', 'folder_link_clicked'].indexOf(eventName) !== -1;
  }

  function isCourseInteraction(eventName) {
    return ['course_click', 'resource_click', 'youtube_click', 'folder_link_clicked'].indexOf(eventName) !== -1;
  }

  // 1. checkAccess
  async function checkAccess() {
    var bridge = getBridge();
    var client = getClient();
    if (!bridge || !client) {
      return { granted: false };
    }

    var user = null;
    try {
      user = await bridge.getCurrentUser();
    } catch (e) {
      return { granted: false };
    }
    if (!user) {
      return { granted: false };
    }

    // Verify admin privileges via SECURITY DEFINER function public.is_admin()
    try {
      var rpcRes = await client.rpc('is_admin');
      if (rpcRes.error || !rpcRes.data) {
        return { granted: false };
      }
    } catch (e) {
      return { granted: false };
    }

    var meta = user.user_metadata || {};
    return {
      granted: true,
      admin: {
        name: meta.full_name || meta.name || (user.email ? user.email.split('@')[0] : 'المشرف'),
        email: user.email,
        avatarUrl: meta.avatar_url || meta.picture || null
      }
    };
  }

  // 2. getOverview — all activity aggregates honor the selected date range.
  async function getOverview(filters) {
    var client = getClient();
    if (!client) throw new Error('Supabase client unavailable');
    var f = filters || {};

    var results = await Promise.all([
      fetchAllRows(function () {
        return client.from('admin_student_summary').select('*').order('registered_at', { ascending: false }).order('user_id', { ascending: true });
      }),
      fetchFilteredEvents(client, f),
      fetchAllRows(function () {
        return addDateRange(
          client.from('admin_session_analytics').select('id, user_id, started_at, active_seconds'),
          f, 'started_at'
        ).order('started_at', { ascending: true }).order('id', { ascending: true });
      }),
      client.from('admin_overview_metrics').select('*').maybeSingle(),
      client.from('sessions').select('id, user_id').is('ended_at', null)
        .gte('last_heartbeat_at', new Date(Date.now() - 5 * 60 * 1000).toISOString()),
      fetchAllRows(function () {
        return client.from('courses').select('id, title').order('id', { ascending: true });
      }),
      fetchAllRows(function () {
        return client.from('resources').select('id, title, resource_type').order('id', { ascending: true });
      })
    ]);

    if (results[3].error) throw results[3].error;
    if (results[4].error) throw results[4].error;
    var students = results[0] || [];
    var events = results[1] || [];
    var sessions = results[2] || [];
    var metrics = results[3].data || {};
    var activeSessions = results[4].data || [];
    var courses = results[5] || [];
    var resources = results[6] || [];

    var studentMap = {}, courseMap = {}, resourceMap = {};
    students.forEach(function (student) {
      studentMap[student.user_id] = student.full_name || student.email || 'طالب';
    });
    courses.forEach(function (course) { courseMap[course.id] = course.title; });
    resources.forEach(function (resource) {
      resourceMap[resource.id] = { title: resource.title, type: resource.resource_type };
    });

    var activeUserIds = {}, activeNowIds = {}, courseCounts = {}, resourceCounts = {};
    var daily = {};
    var totalResourceClicks = 0;
    events.forEach(function (event) {
      if (event.user_id) activeUserIds[event.user_id] = true;
      var day = String(event.occurred_at || '').slice(0, 10);
      if (day) {
        daily[day] = daily[day] || { users: {}, sessions: {}, events: 0 };
        daily[day].events++;
        if (event.user_id) daily[day].users[event.user_id] = true;
        if (event.session_id) daily[day].sessions[event.session_id] = true;
      }
      if (event.event_name === 'course_click' && event.course_id) {
        courseCounts[event.course_id] = (courseCounts[event.course_id] || 0) + 1;
      }
      if (isResourceClick(event.event_name)) {
        totalResourceClicks++;
        if (event.resource_id) resourceCounts[event.resource_id] = (resourceCounts[event.resource_id] || 0) + 1;
      }
    });

    activeSessions.forEach(function (session) {
      if (session.user_id) activeNowIds[session.user_id] = true;
    });

    var registrations = {};
    students.forEach(function (student) {
      var date = String(student.registered_at || '').slice(0, 10);
      if (!date) return;
      if (f.from && new Date(student.registered_at) < new Date(f.from)) return;
      if (f.to && new Date(student.registered_at) > new Date(f.to)) return;
      registrations[date] = (registrations[date] || 0) + 1;
    });

    var dailyRows = Object.keys(daily).sort().map(function (date) {
      var row = daily[date];
      return {
        date: date,
        activeUsers: Object.keys(row.users).length,
        sessions: Object.keys(row.sessions).length,
        events: row.events
      };
    });
    var registrationRows = Object.keys(registrations).sort().map(function (date) {
      return { date: date, value: registrations[date] };
    });

    var recentActivity = events.slice().sort(function (a, b) {
      return String(b.occurred_at).localeCompare(String(a.occurred_at));
    }).slice(0, 10).map(function (event) {
      var resource = event.resource_id ? resourceMap[event.resource_id] : null;
      return {
        id: event.id,
        occurredAt: event.occurred_at,
        userId: event.user_id,
        userName: studentMap[event.user_id] || 'طالب',
        eventName: event.event_name,
        courseId: event.course_id,
        courseTitle: event.course_id ? (courseMap[event.course_id] || '') : null,
        resourceId: event.resource_id,
        resourceTitle: resource ? resource.title : null,
        resourceType: resource ? resource.type : null,
        pagePath: event.page_path,
        properties: event.properties
      };
    });

    var latestUsers = students.slice(0, 5).map(function (student) {
      return {
        id: student.user_id,
        name: student.full_name || 'طالب',
        email: student.email,
        avatarUrl: student.avatar_url,
        registeredAt: student.registered_at
      };
    });

    var seconds = sessions.reduce(function (sum, session) {
      return sum + (Number(session.active_seconds) || 0);
    }, 0);
    var today = new Date().toISOString().slice(0, 10);
    var sessionsToday = sessions.filter(function (session) {
      return String(session.started_at || '').slice(0, 10) === today;
    }).length;
    var activeUsersCount = Object.keys(activeUserIds).length;
    var topCourses = Object.keys(courseCounts).map(function (id) {
      return { id: id, title: courseMap[id] || 'مادة غير معروفة', value: courseCounts[id] };
    }).sort(function (a, b) { return b.value - a.value; }).slice(0, 6);
    var topResources = Object.keys(resourceCounts).map(function (id) {
      return { id: id, title: resourceMap[id] ? resourceMap[id].title : 'مورد غير معروف', value: resourceCounts[id] };
    }).sort(function (a, b) { return b.value - a.value; }).slice(0, 6);

    return {
      kpis: {
        registeredUsers: toNullableNumber(metrics.registered_students) == null ? students.length : toNullableNumber(metrics.registered_students),
        activeUsers: activeUsersCount,
        activeNow: Object.keys(activeNowIds).length,
        activeToday: toNullableNumber(metrics.active_students_24h),
        activeWeek: toNullableNumber(metrics.active_students_7d),
        totalSessions: sessions.length,
        sessionsToday: sessionsToday,
        totalSeconds: seconds,
        avgSessionSeconds: sessions.length ? Math.round(seconds / sessions.length) : 0,
        pageViews: null,
        resourceClicks: totalResourceClicks
      },
      series: {
        dailyActive: dailyRows.map(function (row) { return { date: row.date, value: row.activeUsers }; }),
        sessions: dailyRows.map(function (row) { return { date: row.date, value: row.sessions }; }),
        registrations: registrationRows,
        events: dailyRows.map(function (row) { return { date: row.date, value: row.events }; })
      },
      topCourses: topCourses,
      topResources: topResources,
      recentActivity: recentActivity,
      latestUsers: latestUsers
    };
  }

  // 3. getUsers
  async function getUsers(filters, pagination) {
    var client = getClient();
    if (!client) throw new Error('Supabase client unavailable');

    var res = await client.from('admin_student_summary').select('*');
    if (res.error) throw res.error;
    var students = res.data || [];

    // Filter
    var f = filters || {};
    var list = students.map(function(s) {
      return {
        id: s.user_id,
        name: s.full_name || 'طالب',
        email: s.email,
        avatarUrl: s.avatar_url,
        registeredAt: s.registered_at,
        lastLoginAt: null,
        lastActiveAt: s.last_active_at,
        sessions: Number(s.session_count || 0),
        totalSeconds: Number(s.total_active_seconds || 0),
        resourceClicks: toNullableNumber(s.resource_click_count),
        status: computeStudentStatus(s.last_active_at, s.session_count)
      };
    });

    if (f.search) {
      var q = f.search.toLowerCase().trim();
      list = list.filter(function(u) {
        return (u.name && u.name.toLowerCase().indexOf(q) !== -1) ||
               (u.email && u.email.toLowerCase().indexOf(q) !== -1);
      });
    }

    if (f.status) {
      list = list.filter(function(u) { return u.status === f.status; });
    }

    if (f.registeredFrom) {
      var tFrom = new Date(f.registeredFrom).getTime();
      list = list.filter(function(u) { return u.registeredAt && new Date(u.registeredAt).getTime() >= tFrom; });
    }

    if (f.registeredTo) {
      var tTo = new Date(f.registeredTo).getTime();
      list = list.filter(function(u) { return u.registeredAt && new Date(u.registeredAt).getTime() <= tTo; });
    }

    // Sort
    var sort = pagination && pagination.sort ? pagination.sort : { field: 'registeredAt', dir: 'desc' };
    list.sort(function(a, b) {
      var vA = a[sort.field], vB = b[sort.field];
      if (typeof vA === 'string' && typeof vB === 'string') {
        return sort.dir === 'asc' ? vA.localeCompare(vB) : vB.localeCompare(vA);
      }
      return sort.dir === 'asc' ? (vA - vB) : (vB - vA);
    });

    var total = list.length;
    var page = (pagination && pagination.page) || 1;
    var pageSize = (pagination && pagination.pageSize) || 15;
    var items = list.slice((page - 1) * pageSize, page * pageSize);

    return { items: items, total: total };
  }

  // 4. getUserDetails
  async function getUserDetails(userId) {
    var client = getClient();
    if (!client) throw new Error('Supabase client unavailable');

    var res = await client.from('admin_student_summary').select('*').eq('user_id', userId).maybeSingle();
    if (res.error) throw res.error;
    var s = res.data;
    if (!s) {
      var err = new Error('المستخدم غير موجود');
      err.code = 'NOT_FOUND';
      throw err;
    }

    var user = {
      id: s.user_id,
      name: s.full_name || 'طالب',
      email: s.email,
      avatarUrl: s.avatar_url,
      registeredAt: s.registered_at,
      lastLoginAt: null,
      lastActiveAt: s.last_active_at,
      sessions: Number(s.session_count || 0),
      totalSeconds: Number(s.total_active_seconds || 0),
      resourceClicks: toNullableNumber(s.resource_click_count),
      status: computeStudentStatus(s.last_active_at, s.session_count)
    };

    return {
      user: user,
      stats: {
        sessions: user.sessions,
        totalSeconds: user.totalSeconds,
        pageViews: null,
        courseVisits: toNullableNumber(s.course_visit_count),
        resourceClicks: toNullableNumber(s.resource_click_count),
        firstActivityAt: s.first_activity_at || null,
        lastActiveAt: s.last_active_at
      }
    };
  }

  // 5. getUserSessions
  async function getUserSessions(userId, filters, pagination) {
    var client = getClient();
    if (!client) throw new Error('Supabase client unavailable');
    var f = filters || {};
    var rows = await fetchAllRows(function () {
      return addDateRange(
        client.from('admin_session_analytics').select('*').eq('user_id', userId).order('started_at', { ascending: true }).order('id', { ascending: true }),
        f, 'started_at'
      );
    });
    var items = rows.map(function (session) {
      return {
        id: session.id,
        userId: session.user_id,
        userName: '',
        startedAt: session.started_at,
        endedAt: session.ended_at,
        activeSeconds: Number(session.active_seconds) || 0,
        entryPath: session.entry_path || '/index.html',
        lastPath: session.last_path || null,
        eventCount: toNullableNumber(session.event_count),
        status: computeSessionStatus(session)
      };
    });
    if (f.sessionStatus) items = items.filter(function (item) { return item.status === f.sessionStatus; });
    if (f.minSeconds != null) items = items.filter(function (item) { return item.activeSeconds >= Number(f.minSeconds); });
    if (f.maxSeconds != null) items = items.filter(function (item) { return item.activeSeconds <= Number(f.maxSeconds); });
    return sortAndPage(items, pagination, 'startedAt', 10);
  }

  // 6. getSessions — filtering is completed before sorting and pagination.
  async function getSessions(filters, pagination) {
    var client = getClient();
    if (!client) throw new Error('Supabase client unavailable');
    var f = filters || {};
    var results = await Promise.all([
      fetchAllRows(function () {
        return addDateRange(
          client.from('admin_session_analytics').select('*').order('started_at', { ascending: true }).order('id', { ascending: true }),
          f, 'started_at'
        );
      }),
      fetchAllRows(function () {
        return client.from('admin_student_summary').select('user_id, full_name, email').order('user_id', { ascending: true });
      })
    ]);
    var students = {};
    results[1].forEach(function (student) {
      students[student.user_id] = {
        name: student.full_name || 'طالب',
        email: student.email || ''
      };
    });

    var matchingSessionIds = null;
    if (f.courseId || f.eventName || f.resourceType) {
      var matchingEvents = await fetchFilteredEvents(client, f);
      matchingSessionIds = {};
      matchingEvents.forEach(function (event) {
        if (event.session_id) matchingSessionIds[event.session_id] = true;
      });
    }

    var items = results[0].map(function (session) {
      var student = students[session.user_id] || {};
      return {
        id: session.id,
        userId: session.user_id,
        userName: student.name || 'طالب',
        userEmail: student.email || '',
        startedAt: session.started_at,
        endedAt: session.ended_at,
        activeSeconds: Number(session.active_seconds) || 0,
        entryPath: session.entry_path || '/index.html',
        lastPath: session.last_path || null,
        eventCount: toNullableNumber(session.event_count),
        status: computeSessionStatus(session)
      };
    });

    if (f.search) {
      var term = String(f.search).toLowerCase().trim();
      items = items.filter(function (item) {
        return item.userName.toLowerCase().indexOf(term) !== -1 ||
          item.userEmail.toLowerCase().indexOf(term) !== -1;
      });
    }
    if (f.sessionStatus) items = items.filter(function (item) { return item.status === f.sessionStatus; });
    if (f.minSeconds != null) items = items.filter(function (item) { return item.activeSeconds >= Number(f.minSeconds); });
    if (f.maxSeconds != null) items = items.filter(function (item) { return item.activeSeconds <= Number(f.maxSeconds); });
    if (matchingSessionIds) {
      items = items.filter(function (item) { return !!matchingSessionIds[item.id]; });
    }
    return sortAndPage(items, pagination, 'startedAt', 15);
  }

  // 7. getSessionDetails
  async function getSessionDetails(sessionId) {
    var client = getClient();
    if (!client) throw new Error('Supabase client unavailable');

    var res = await client.from('admin_session_analytics').select('*').eq('id', sessionId).maybeSingle();
    if (res.error) throw res.error;
    var s = res.data;
    if (!s) {
      var err = new Error('الجلسة غير موجودة');
      err.code = 'NOT_FOUND';
      throw err;
    }

    var userRes = await getUserDetails(s.user_id).catch(function() { return { user: { id: s.user_id, name: 'طالب' } }; });

    return {
      session: {
        id: s.id,
        userId: s.user_id,
        userName: userRes.user.name,
        startedAt: s.started_at,
        endedAt: s.ended_at,
        activeSeconds: s.active_seconds || 0,
        entryPath: s.entry_path || '/index.html',
        lastPath: s.last_path || null,
        eventCount: toNullableNumber(s.event_count),
        status: computeSessionStatus(s)
      },
      user: userRes.user
    };
  }

  // 8. getActivityEvents — date, identity, course, event and resource-type filters.
  async function getActivityEvents(filters, pagination) {
    var client = getClient();
    if (!client) throw new Error('Supabase client unavailable');
    var f = filters || {};
    var constraints = await resolveEventFilters(client, f);
    if (constraints.impossible) return { items: [], total: 0 };

    var p = pagination || {};
    var page = Math.max(1, Math.floor(Number(p.page) || 1));
    var pageSize = Math.max(1, Math.min(500, Math.floor(Number(p.pageSize) || 20)));
    var sort = p.sort || { field: 'occurredAt', dir: 'desc' };
    var query = buildEventQuery(client, f, constraints, true)
      .order('occurred_at', { ascending: sort.dir === 'asc' })
      .range((page - 1) * pageSize, page * pageSize - 1);

    var result = await query;
    if (result.error) throw result.error;
    var events = result.data || [];
    if (!events.length) return { items: [], total: result.count == null ? 0 : result.count };

    var userIds = Array.from(new Set(events.map(function (event) { return event.user_id; }).filter(Boolean)));
    var courseIds = Array.from(new Set(events.map(function (event) { return event.course_id; }).filter(Boolean)));
    var resourceIds = Array.from(new Set(events.map(function (event) { return event.resource_id; }).filter(Boolean)));
    var related = await Promise.all([
      userIds.length ? client.from('admin_student_summary').select('user_id, full_name').in('user_id', userIds) : Promise.resolve({ data: [], error: null }),
      courseIds.length ? client.from('courses').select('id, title').in('id', courseIds) : Promise.resolve({ data: [], error: null }),
      resourceIds.length ? client.from('resources').select('id, title, resource_type').in('id', resourceIds) : Promise.resolve({ data: [], error: null })
    ]);
    related.forEach(function (response) { if (response.error) throw response.error; });
    var studentMap = {}, courseMap = {}, resourceMap = {};
    (related[0].data || []).forEach(function (student) { studentMap[student.user_id] = student.full_name; });
    (related[1].data || []).forEach(function (course) { courseMap[course.id] = course.title; });
    (related[2].data || []).forEach(function (resource) {
      resourceMap[resource.id] = { title: resource.title, type: resource.resource_type };
    });

    return {
      items: events.map(function (event) {
        var resource = event.resource_id ? resourceMap[event.resource_id] : null;
        return {
          id: event.id,
          occurredAt: event.occurred_at,
          userId: event.user_id,
          userName: studentMap[event.user_id] || 'طالب',
          eventName: event.event_name,
          courseId: event.course_id,
          courseTitle: event.course_id ? (courseMap[event.course_id] || '') : null,
          resourceId: event.resource_id,
          resourceTitle: resource ? resource.title : null,
          resourceType: resource ? resource.type : null,
          pagePath: event.page_path,
          properties: event.properties,
          sessionId: event.session_id
        };
      }),
      total: result.count == null ? events.length : result.count
    };
  }

  // 9. getCourseAnalytics — derive each value from recorded events in the selected period.
  async function getCourseAnalytics(filters) {
    var client = getClient();
    if (!client) throw new Error('Supabase client unavailable');
    var f = filters || {};
    var results = await Promise.all([
      fetchAllRows(function () { return client.from('courses').select('id, slug, title').order('id', { ascending: true }); }),
      fetchAllRows(function () { return client.from('resources').select('id, title').order('id', { ascending: true }); }),
      fetchFilteredEvents(client, f)
    ]);
    var courseMap = {}, resourceMap = {}, aggregates = {};
    results[0].forEach(function (course) {
      courseMap[course.id] = course;
      aggregates[course.id] = { visits: 0, users: {}, resourceClicks: 0, lastInteractionAt: null, days: {}, resources: {} };
    });
    results[1].forEach(function (resource) { resourceMap[resource.id] = resource.title; });

    results[2].forEach(function (event) {
      var aggregate = aggregates[event.course_id];
      if (!aggregate || !isCourseInteraction(event.event_name)) return;
      if (event.event_name === 'course_click') aggregate.visits++;
      if (isResourceClick(event.event_name)) {
        aggregate.resourceClicks++;
        if (event.resource_id) aggregate.resources[event.resource_id] = (aggregate.resources[event.resource_id] || 0) + 1;
      }
      if (event.user_id) aggregate.users[event.user_id] = true;
      if (!aggregate.lastInteractionAt || event.occurred_at > aggregate.lastInteractionAt) {
        aggregate.lastInteractionAt = event.occurred_at;
      }
      var day = String(event.occurred_at || '').slice(0, 10);
      if (day) aggregate.days[day] = (aggregate.days[day] || 0) + 1;
    });

    var items = Object.keys(aggregates).map(function (id) {
      var value = aggregates[id], course = courseMap[id];
      var trend = Object.keys(value.days).sort().map(function (date) {
        return { date: date, value: value.days[date] };
      });
      var topResources = Object.keys(value.resources).map(function (resourceId) {
        return { title: resourceMap[resourceId] || 'مورد غير معروف', clicks: value.resources[resourceId] };
      }).sort(function (a, b) { return b.clicks - a.clicks; }).slice(0, 5);
      return {
        courseId: id,
        title: course.title,
        visits: value.visits,
        uniqueUsers: Object.keys(value.users).length,
        resourceClicks: value.resourceClicks,
        avgEngagementSeconds: null,
        lastInteractionAt: value.lastInteractionAt,
        trend: trend,
        topResources: topResources
      };
    });
    if (f.courseId) items = items.filter(function (item) { return item.courseId === f.courseId; });
    return { items: items.sort(function (a, b) { return b.visits - a.visits; }) };
  }

  // 10. getResourceAnalytics — filter resource rows and event aggregates by the active scope.
  async function getResourceAnalytics(filters) {
    var client = getClient();
    if (!client) throw new Error('Supabase client unavailable');
    var f = filters || {};
    var results = await Promise.all([
      fetchAllRows(function () { return client.from('resources').select('id, title, resource_key, resource_type, course_id').order('id', { ascending: true }); }),
      fetchAllRows(function () { return client.from('courses').select('id, title').order('id', { ascending: true }); }),
      fetchFilteredEvents(client, f)
    ]);
    var courseMap = {}, resources = {}, aggregates = {};
    results[1].forEach(function (course) { courseMap[course.id] = course.title; });
    results[0].forEach(function (resource) {
      if (f.courseId && resource.course_id !== f.courseId) return;
      if (f.resourceType && resource.resource_type !== f.resourceType) return;
      resources[resource.id] = resource;
      aggregates[resource.id] = { clicks: 0, users: {}, lastClickedAt: null };
    });

    results[2].forEach(function (event) {
      var aggregate = aggregates[event.resource_id];
      if (!aggregate || !isResourceClick(event.event_name)) return;
      aggregate.clicks++;
      if (event.user_id) aggregate.users[event.user_id] = true;
      if (!aggregate.lastClickedAt || event.occurred_at > aggregate.lastClickedAt) {
        aggregate.lastClickedAt = event.occurred_at;
      }
    });

    var items = Object.keys(resources).map(function (id) {
      var resource = resources[id], aggregate = aggregates[id];
      return {
        resourceId: id,
        title: resource.title,
        courseId: resource.course_id,
        courseTitle: courseMap[resource.course_id] || '',
        type: resource.resource_type || 'other',
        clicks: aggregate.clicks,
        uniqueUsers: Object.keys(aggregate.users).length,
        lastClickedAt: aggregate.lastClickedAt
      };
    });
    var byDay = {};
    results[2].forEach(function (event) {
      if (!isResourceClick(event.event_name) || !aggregates[event.resource_id]) return;
      var day = String(event.occurred_at || '').slice(0, 10);
      if (day) byDay[day] = (byDay[day] || 0) + 1;
    });
    var series = Object.keys(byDay).sort().map(function (date) { return { date: date, value: byDay[date] }; });
    return { items: items.sort(function (a, b) { return b.clicks - a.clicks; }), series: series };
  }

  // 11. exportReport — every report uses the same period and filter scope as its dashboard.
  async function exportReport(type, filters) {
    var client = getClient();
    if (!client) throw new Error('Supabase client unavailable');
    var f = filters || {};
    var filename = 'report_' + type + '_' + new Date().toISOString().slice(0, 10) + '.csv';
    var headers, rows = [];

    if (type === 'users') {
      var results = await Promise.all([
        fetchAllRows(function () { return client.from('admin_student_summary').select('*').order('registered_at', { ascending: false }).order('user_id', { ascending: true }); }),
        fetchFilteredEvents(client, f),
        fetchAllRows(function () {
          return addDateRange(client.from('admin_session_analytics').select('user_id, active_seconds, started_at').order('started_at', { ascending: true }).order('id', { ascending: true }), f, 'started_at');
        })
      ]);
      var activityByUser = {}, sessionsByUser = {};
      results[1].forEach(function (event) {
        if (!event.user_id) return;
        activityByUser[event.user_id] = activityByUser[event.user_id] || { courseVisits: 0, resourceClicks: 0 };
        if (event.event_name === 'course_click') activityByUser[event.user_id].courseVisits++;
        if (isResourceClick(event.event_name)) activityByUser[event.user_id].resourceClicks++;
      });
      results[2].forEach(function (session) {
        if (!session.user_id) return;
        sessionsByUser[session.user_id] = sessionsByUser[session.user_id] || { count: 0, seconds: 0 };
        sessionsByUser[session.user_id].count++;
        sessionsByUser[session.user_id].seconds += Number(session.active_seconds) || 0;
      });
      var activityUserIds = Object.keys(activityByUser);
      rows = results[0].filter(function (student) {
        if (f.search) {
          var term = String(f.search).toLowerCase().trim();
          if ((student.full_name || '').toLowerCase().indexOf(term) === -1 &&
              (student.email || '').toLowerCase().indexOf(term) === -1) return false;
        }
        // Activity reports are scoped to users who generated a matching event in the selected period.
        return !!activityByUser[student.user_id];
      }).map(function (student) {
        var activity = activityByUser[student.user_id] || { courseVisits: 0, resourceClicks: 0 };
        var session = sessionsByUser[student.user_id] || { count: 0, seconds: 0 };
        return [
          student.user_id, student.full_name || '', student.email || '',
          session.count, session.seconds, activity.courseVisits, activity.resourceClicks,
          student.registered_at, student.first_activity_at, student.last_active_at
        ];
      });
      headers = ['User ID', 'Name', 'Email', 'Sessions in Period', 'Active Seconds in Period',
        'Course Visits in Period', 'Resource Clicks in Period', 'Registered At', 'First Activity', 'Last Active At'];
    } else if (type === 'sessions') {
      var sessionsReport = await getSessions(f, { page: 1, pageSize: 100000, sort: { field: 'startedAt', dir: 'desc' } });
      rows = sessionsReport.items.map(function (session) {
        return [session.id, session.userName, session.userEmail, session.startedAt, session.endedAt || '',
          session.activeSeconds, session.eventCount, session.lastPath || '', session.status];
      });
      headers = ['Session ID', 'Student Name', 'Email', 'Started At', 'Ended At', 'Active Seconds', 'Event Count', 'Last Path', 'Status'];
    } else if (type === 'courses') {
      var coursesReport = await getCourseAnalytics(f);
      rows = coursesReport.items.map(function (course) {
        return [course.courseId, course.title, course.visits, course.uniqueUsers,
          course.resourceClicks, course.lastInteractionAt || ''];
      });
      headers = ['Course ID', 'Course Title', 'Course Visits', 'Unique Users', 'Resource Clicks', 'Last Interaction'];
    } else if (type === 'resources') {
      var resourcesReport = await getResourceAnalytics(f);
      rows = resourcesReport.items.map(function (resource) {
        return [resource.resourceId, resource.title, resource.courseTitle, resource.type,
          resource.clicks, resource.uniqueUsers, resource.lastClickedAt || ''];
      });
      headers = ['Resource ID', 'Title', 'Course', 'Type', 'Clicks', 'Unique Users', 'Last Clicked'];
    } else if (type === 'daily') {
      var events = await fetchFilteredEvents(client, f);
      var days = {};
      events.forEach(function (event) {
        var day = String(event.occurred_at || '').slice(0, 10);
        if (!day) return;
        days[day] = days[day] || { users: {}, sessions: {}, events: 0 };
        days[day].events++;
        if (event.user_id) days[day].users[event.user_id] = true;
        if (event.session_id) days[day].sessions[event.session_id] = true;
      });
      rows = Object.keys(days).sort().map(function (day) {
        return [day, Object.keys(days[day].users).length, Object.keys(days[day].sessions).length, days[day].events];
      });
      headers = ['Date (UTC)', 'Active Users', 'Sessions With Activity', 'Events'];
    } else {
      var unsupported = new Error('نوع التقرير غير مدعوم');
      unsupported.code = 'UNSUPPORTED_REPORT';
      throw unsupported;
    }

    return { filename: filename, csv: toCsv(headers, rows) };
  }

  // 12. getFilterOptions
  async function getFilterOptions() {
    var client = getClient();
    if (!client) return { courses: [] };
    var res = await client.from('courses').select('id, title');
    if (res.error) throw res.error;
    var courses = (res.data || []).map(function(c) {
      return { id: c.id, title: c.title };
    });
    return { courses: courses };
  }

  // 13. signOut
  async function signOut() {
    var bridge = getBridge();
    if (bridge && typeof bridge.signOut === 'function') {
      await bridge.signOut();
    }
    root.location.href = '../';
  }

  // Register real adapter automatically unless mock=1
  var isMock = /[?&]mock=1(&|$)/.test(root.location.search);
  if (!isMock && root.AdminData && typeof root.AdminData.register === 'function') {
    root.AdminData.register({
      checkAccess: checkAccess,
      getOverview: getOverview,
      getUsers: getUsers,
      getUserDetails: getUserDetails,
      getUserSessions: getUserSessions,
      getSessions: getSessions,
      getSessionDetails: getSessionDetails,
      getActivityEvents: getActivityEvents,
      getCourseAnalytics: getCourseAnalytics,
      getResourceAnalytics: getResourceAnalytics,
      exportReport: exportReport,
      getFilterOptions: getFilterOptions,
      signOut: signOut
    });
  }

})(window);
