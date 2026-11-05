/** Admin UI helpers: escaping, Arabic formatting, labels, SVG charts, skeletons, tables. No data access here. */
(function (root) {
  'use strict';

  var NF = new Intl.NumberFormat('ar-EG-u-nu-latn');
  var DF = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' });
  var DTF = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  var TF = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  var NA = '<span class="na">غير متاح</span>';

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function num(v) { return v == null || isNaN(v) ? NA : NF.format(v); }
  function dur(sec) {
    if (sec == null || isNaN(sec)) return NA;
    sec = Math.round(sec);
    if (sec < 60) return NF.format(sec) + ' ث';
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    return (h ? NF.format(h) + ' س ' : '') + (m || !h ? NF.format(m) + ' د' : '');
  }
  function date(v) { return v ? DF.format(new Date(v)) : NA; }
  function dateTime(v) { return v ? DTF.format(new Date(v)) : NA; }
  function time(v) { return v ? TF.format(new Date(v)) : ''; }

  var EVENTS = {
    page_view: 'فتح صفحة', login_success: 'تسجيل دخول', course_click: 'زيارة مادة', folder_link_clicked: 'فتح مجلد',
    resource_click: 'ضغط على مورد', youtube_click: 'ضغط على رابط YouTube', search_used: 'استخدام البحث',
    filter_changed: 'تغيير فلتر', return_to_portal: 'عودة إلى الموقع', session_started: 'بدء جلسة', session_ended: 'انتهاء جلسة'
  };
  var STATUS = { active_now: ['نشط الآن', 'ok'], active_today: ['نشط اليوم', 'info'], inactive: ['غير نشط', 'muted'], never_active: ['لم يتفاعل بعد', 'warn'] };
  var SESSION_STATUS = { active: ['نشطة', 'ok'], ended: ['منتهية', 'muted'], interrupted: ['منقطعة', 'warn'] };
  var RTYPES = { drive: 'Google Drive', youtube: 'YouTube', folder: 'مجلد', website: 'موقع', other: 'أخرى', pdf: 'PDF', video: 'فيديو', document: 'مستند' };

  function eventLabel(n) { return EVENTS[n] || n || ''; }
  function chip(map, key) { var m = map[key]; return m ? '<span class="chip chip-' + m[1] + '">' + esc(m[0]) + '</span>' : NA; }
  function typeLabel(t) { return RTYPES[t] || t || ''; }

  // ---- icons (stroke, 24px viewBox) ----
  var ICONS = {
    overview: 'M3 13h8V3H3zM13 21h8v-8h-8zM13 3v6h8V3zM3 21h8v-6H3z',
    users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
    sessions: 'M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
    logs: 'M4 6h16M4 12h16M4 18h10',
    courses: 'M2 4h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2zM22 4h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7z',
    resources: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
    reports: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6',
    bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
    menu: 'M3 6h18M3 12h18M3 18h18', search: 'M21 21l-4.3-4.3M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z',
    download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
    back: 'M5 12h14M13 6l6 6-6 6', logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
    refresh: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5', close: 'M18 6L6 18M6 6l12 12', alert: 'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
    inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z', lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4'
  };
  function icon(name, cls) {
    return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + ICONS[name] + '"/></svg>';
  }

  // ---- states ----
  function skeleton(kind) {
    var line = '<div class="sk sk-line"></div>';
    if (kind === 'kpis') return '<div class="kpi-grid">' + new Array(8).join('<div class="card kpi"><div class="sk sk-line w40"></div><div class="sk sk-big"></div></div>') + '</div>';
    if (kind === 'table') return '<div class="card"><div class="sk sk-line w30"></div>' + new Array(8).join('<div class="sk sk-row"></div>') + '</div>';
    return '<div class="card">' + line + line + line + '</div>';
  }
  function empty(msg, sub) { return '<div class="state">' + icon('inbox', 'state-ic') + '<h3>' + esc(msg || 'لا توجد بيانات') + '</h3>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>'; }
  function errorState(err, retryId) {
    var unavailable = err && err.code === 'UNAVAILABLE';
    var timedOut = err && err.code === 'TIMEOUT';
    var title = unavailable ? 'مصدر البيانات غير متاح' : (timedOut ? 'انتهت مهلة التحميل' : 'تعذّر تحميل البيانات');
    var message = unavailable
      ? 'لم يتم ربط لوحة التحكم بمصدر البيانات بعد.'
      : (timedOut ? (err.message || 'استغرق تحميل البيانات وقتًا أطول من المتوقع. يمكنك المحاولة مرة أخرى.') : 'حدث خطأ أثناء جلب البيانات. حاول مرة أخرى.');
    return '<div class="state state-err" role="alert">' + icon('alert', 'state-ic') + '<h3>' + esc(title) + '</h3>' +
      '<p>' + esc(message) + '</p>' +
      '<button type="button" class="btn" data-retry="' + (retryId || '') + '">' + icon('refresh') + ' إعادة المحاولة</button></div>';
  }

  // ---- charts (SVG, dependency-free; chronological axis kept left→right) ----
  function chart(series, opts) {
    opts = opts || {};
    if (!series || !series.length) return empty('لا توجد بيانات في هذه الفترة');
    var W = 640, H = opts.height || 220, P = { l: 40, r: 12, t: 12, b: 26 };
    var max = Math.max.apply(null, series.map(function (d) { return d.value; })) || 1;
    var nice = Math.pow(10, Math.floor(Math.log10(max))); max = Math.ceil(max / nice) * nice; if (max < 4) max = 4; max = Math.ceil(max / 4) * 4;
    var iw = W - P.l - P.r, ih = H - P.t - P.b, n = series.length;
    var x = function (i) { return P.l + (n === 1 ? iw / 2 : (i * iw) / (n - 1)); };
    var y = function (v) { return P.t + ih - (v / max) * ih; };
    var grid = '';
    for (var g = 0; g <= 4; g++) { var gv = (max / 4) * g, gy = y(gv); grid += '<line x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + gy + '" y2="' + gy + '" class="ch-grid"/><text x="' + (P.l - 6) + '" y="' + (gy + 4) + '" class="ch-tx" text-anchor="end">' + NF.format(Math.round(gv)) + '</text>'; }
    var labels = '', step = Math.max(1, Math.ceil(n / 6));
    series.forEach(function (d, i) { if (i % step === 0 || i === n - 1) labels += '<text x="' + x(i) + '" y="' + (H - 6) + '" class="ch-tx" text-anchor="middle">' + esc(new Intl.DateTimeFormat('ar-EG-u-nu-latn', { day: 'numeric', month: 'numeric' }).format(new Date(d.date))) + '</text>'; });
    var pts = series.map(function (d, i) { return x(i) + ',' + y(d.value); });
    var bars = opts.bars;
    var body;
    if (bars) {
      var bw = Math.max(2, Math.min(22, iw / n * 0.6));
      body = series.map(function (d, i) { return '<rect x="' + (x(i) - bw / 2) + '" y="' + y(d.value) + '" width="' + bw + '" height="' + (P.t + ih - y(d.value)) + '" rx="3" class="ch-bar"><title>' + esc(date(d.date)) + ': ' + NF.format(d.value) + '</title></rect>'; }).join('');
    } else {
      body = '<path d="M' + pts[0].split(',')[0] + ',' + (P.t + ih) + ' L' + pts.join(' L') + ' L' + x(n - 1) + ',' + (P.t + ih) + 'Z" class="ch-area"/>' +
        '<polyline points="' + pts.join(' ') + '" class="ch-line"/>' +
        series.map(function (d, i) { return '<circle cx="' + x(i) + '" cy="' + y(d.value) + '" r="' + (n > 40 ? 0 : 3) + '" class="ch-dot"><title>' + esc(date(d.date)) + ': ' + NF.format(d.value) + '</title></circle>'; }).join('');
    }
    return '<svg class="chart" dir="ltr" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opts.label || 'رسم بياني') + '">' + grid + body + labels + '</svg>';
  }
  function spark(series) {
    if (!series || series.length < 2) return '';
    var max = Math.max.apply(null, series.map(function (d) { return d.value; })) || 1, W = 120, H = 32;
    var pts = series.map(function (d, i) { return (i * W / (series.length - 1)).toFixed(1) + ',' + (H - 3 - (d.value / max) * (H - 6)).toFixed(1); }).join(' ');
    return '<svg class="spark" dir="ltr" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true"><polyline points="' + pts + '"/></svg>';
  }
  function barList(items, opts) {
    opts = opts || {};
    if (!items || !items.length) return empty('لا توجد بيانات');
    var max = Math.max.apply(null, items.map(function (d) { return d.value; })) || 1;
    return '<ol class="bars">' + items.map(function (d, i) {
      return '<li><span class="bars-rank">' + NF.format(i + 1) + '</span><div class="bars-main"><div class="bars-top"><span class="bars-label" title="' + esc(d.title) + '">' + esc(d.title) + '</span><strong>' + NF.format(d.value) + '</strong></div>' +
        '<div class="bars-track"><div class="bars-fill" style="width:' + Math.max(2, (d.value / max) * 100) + '%"></div></div></div></li>';
    }).join('') + '</ol>';
  }

  // ---- table ----
  function table(cols, rows, o) {
    o = o || {};
    var head = cols.map(function (c) {
      if (!c.sort) return '<th>' + esc(c.label) + '</th>';
      var on = o.sort && o.sort.field === c.sort, dir = on ? o.sort.dir : '';
      return '<th aria-sort="' + (on ? (dir === 'asc' ? 'ascending' : 'descending') : 'none') + '"><button type="button" class="th-sort' + (on ? ' on' : '') + '" data-sort="' + c.sort + '">' + esc(c.label) + '<span aria-hidden="true">' + (on ? (dir === 'asc' ? '▲' : '▼') : '↕') + '</span></button></th>';
    }).join('');
    var body = rows.map(function (r) {
      return '<tr' + (o.rowAttr ? ' ' + o.rowAttr(r) : '') + '>' + cols.map(function (c) { return '<td' + (c.cls ? ' class="' + c.cls + '"' : '') + ' data-label="' + esc(c.label) + '">' + c.render(r) + '</td>'; }).join('') + '</tr>';
    }).join('');
    return '<div class="table-wrap"><table class="tbl' + (o.clickable ? ' clickable' : '') + '"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }
  function pager(total, page, size) {
    var pages = Math.max(1, Math.ceil(total / size));
    if (total <= size) return '<div class="pager"><span>' + NF.format(total) + ' نتيجة</span></div>';
    var from = (page - 1) * size + 1, to = Math.min(total, page * size);
    return '<div class="pager"><span>' + NF.format(from) + '–' + NF.format(to) + ' من ' + NF.format(total) + '</span><div class="pager-btns">' +
      '<button type="button" class="btn btn-sm" data-page="' + (page - 1) + '"' + (page <= 1 ? ' disabled' : '') + '>السابق</button><span class="pager-cur">' + NF.format(page) + ' / ' + NF.format(pages) + '</span>' +
      '<button type="button" class="btn btn-sm" data-page="' + (page + 1) + '"' + (page >= pages ? ' disabled' : '') + '>التالي</button></div></div>';
  }
  function avatar(u) {
    var init = ((u && (u.name || u.email)) || '؟').trim().charAt(0).toUpperCase();
    return u && u.avatarUrl ? '<img class="avatar" src="' + esc(u.avatarUrl) + '" alt="" referrerpolicy="no-referrer" width="36" height="36">' : '<span class="avatar avatar-fb" aria-hidden="true">' + esc(init) + '</span>';
  }
  function toast(msg, kind) {
    var el = document.getElementById('toasts'); if (!el) return;
    var t = document.createElement('div'); t.className = 'toast ' + (kind || ''); t.textContent = msg; el.appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 300); }, 3200);
  }
  function debounce(fn, ms) { var t; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); }; }

  root.AdminUI = { esc: esc, num: num, dur: dur, date: date, dateTime: dateTime, time: time, NA: NA, eventLabel: eventLabel, chip: chip, typeLabel: typeLabel,
    EVENTS: EVENTS, STATUS: STATUS, SESSION_STATUS: SESSION_STATUS, RTYPES: RTYPES, icon: icon, skeleton: skeleton, empty: empty, errorState: errorState,
    chart: chart, spark: spark, barList: barList, table: table, pager: pager, avatar: avatar, toast: toast, debounce: debounce };
})(window);
