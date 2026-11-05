# Admin Dashboard — Architecture & Data Adapter Contract

Route: `/admin/` (static page `admin/index.html`, hash routes `#/overview`, `#/users`, `#/users/<id>`, `#/visitors`, `#/sessions`, `#/sessions/<id>`, `#/logs`, `#/courses`, `#/resources`, `#/reports`).
No framework, no new dependencies, no Supabase code in the admin UI.

## Files
| File | Role |
|---|---|
| `admin/index.html` | Shell (sidebar, top bar, date range, notifications, admin profile, logout) |
| `css/admin.css` | RTL styles, tables, charts, skeletons, responsive layout |
| `js/admin/contract.js` | `window.AdminData` — adapter registry + contract validation |
| `js/admin/ui.js` | Formatting (Arabic, Latin digits), labels, SVG charts, tables, states |
| `js/admin/app.js` | Router + all views; talks ONLY to `AdminData` |
| `js/admin/mock-adapter.js` | Fabricated preview data. Loaded only with `?mock=1` on localhost/127.0.0.1/file:// |

## Behaviour without an adapter
`AdminData.isRegistered() === false` → full-page "مصدر البيانات غير متاح". No numbers are ever shown.
Mock mode shows a permanent warning banner and "(تجريبي)" in every page title, and cannot load on a production host.

## Adapter registration
The live Supabase adapter is loaded by `admin/index.html` and registers the required `AdminData` methods, including `getAnonymousVisitors`. The UI talks only to this adapter.
Missing required methods make `register` throw. Every method may return a Promise or a value; throw/reject to show the error + retry state.
Any field may be `null` → UI shows «غير متاح».

### Common parameters
- `filters`: `{ preset, from, to }` (ISO) always present, plus per page: `search`, `visitorSearch`, `userId`, `sessionId`, `courseId`, `resourceType`, `eventName`, `status`, `sessionStatus`, `minSeconds`, `maxSeconds`, `registeredFrom`, `registeredTo`.
- `pagination`: `{ page (1-based), pageSize, sort: { field, dir: 'asc'|'desc' } }`. Paged result: `{ items, total }`.
- Sort fields used: users `registeredAt | lastActiveAt | totalSeconds`; sessions `startedAt | activeSeconds`; logs `occurredAt`.
- Event names (as recorded by the current tracking RPC): `page_view, login_success, course_click, folder_link_clicked, resource_click, youtube_click, search_used, filter_changed, return_to_portal, session_started, session_ended`. Unknown names are shown raw.

### Methods
| Method | Returns |
|---|---|
| `checkAccess()` | `{ granted: boolean, admin?: { name, email, avatarUrl } }` — UI shows the "unauthorized" screen unless `granted === true` |
| `getOverview(filters)` | `{ kpis: { registeredUsers, activeUsers, activeNow, activeToday, activeWeek, totalSessions, sessionsToday, totalSeconds, avgSessionSeconds, pageViews, resourceClicks, anonymousVisitors, anonymousSessions, anonymousActiveNow, anonymousPageViews }, series: { dailyActive, sessions, registrations, events, dailyVisitors, anonymousPageViews } (each `[{date:'YYYY-MM-DD', value}]`), topCourses: [{id,title,value}], topResources: [{id,title,value}], recentActivity: [event], latestUsers: [user], latestAnonymousVisitors: [visitor] }` |
| `getUsers(filters, pagination)` | paged `user`: `{ id, name, email, avatarUrl, registeredAt, lastLoginAt, lastActiveAt, sessions, totalSeconds, resourceClicks, status }` — `status` ∈ `active_now | active_today | inactive | never_active` (computed server-side) |
| `getAnonymousVisitors(filters, pagination)` | paged anonymous visitor: `{ id, visitorKey, firstSeenAt, lastSeenAt, firstPath, lastPath, sessions, totalSeconds, pageViews, eventCount, activeNow }` — `visitorKey` is a random browser UUID, not a person/account identity |
| `getUserDetails(userId)` | `{ user, stats: { sessions, totalSeconds, pageViews, courseVisits, resourceClicks, firstActivityAt, lastActiveAt } }` |
| `getUserSessions(userId, filters, pagination)` | paged `session` |
| `getSessions(filters, pagination)` | paged `session`: `{ id, userId, userName, startedAt, endedAt, activeSeconds, entryPath, lastPath, eventCount, status }` — `status` ∈ `active | ended | interrupted` |
| `getSessionDetails(sessionId)` | `{ session, user }` *(addition to the brief: needed to open one session)* |
| `getActivityEvents(filters, pagination)` | paged `event`: `{ id, occurredAt, userId, userName, eventName, courseId, courseTitle, resourceId, resourceTitle, resourceType, pagePath, properties, sessionId }` |
| `getCourseAnalytics(filters)` | `{ items: [{ courseId, title, visits, uniqueUsers, resourceClicks, avgEngagementSeconds|null, lastInteractionAt, trend:[{date,value}], topResources:[{title,clicks}] }] }` |
| `getResourceAnalytics(filters)` | `{ items: [{ resourceId, title, courseId, courseTitle, type, clicks, uniqueUsers, lastClickedAt }], series: [{date,value}] }` (UI sorts/paginates this list client-side) |
| `exportReport(type, filters)` | `{ filename, csv }`; `type` ∈ `users | visitors | sessions | courses | resources | daily`. Must honour the same filters. Visitor report accepts `visitorSearch`. Empty `csv` → "no data" toast |
| `getFilterOptions()` *(optional)* | `{ courses: [{id,title}], resourceTypes?: [...] }` — fills the course / resource-type selects |
| `signOut()` *(optional)* | Promise; the UI also dispatches `admin:logout-request` on `document` |

## Measurement definitions and limitations
- `lastLoginAt` is populated from the authenticated `login_success` event introduced by migration 009.
- Authenticated `pageViews` count page views recorded after the student passes the mandatory login gate. Entry events do not create an engagement session or credit active time.
- Anonymous records represent visits to the mandatory login screen only. They are not views of course content and are not counted as student usage. The short technical visit session is closed after its gate-view event is recorded.
- Anonymous visitor IDs represent browser storage, not verified people. Clearing site data or changing browsers/devices produces a new visitor ID. Counts can be affected by private browsing, blockers, or automated traffic.
- The overview and login-gate visits list refresh every 10 seconds while the tab is visible, without reloading the whole page.
- `avgEngagementSeconds` does not measure time spent in external Drive documents or YouTube videos. Portal active time is an estimate while the portal is visible and recently active.

## Security requirements (backend, not UI)
Access is enforced by RLS / `is_admin()` (already used by the admin views), never by this UI. Never put service-role keys in the browser, never trust a client-supplied role, no self-promotion to admin. The UI's "unauthorized" screen is a convenience only.
The portal tracker records anonymous page views and interactions separately from authenticated student activity. The admin route remains protected by `is_admin()` on the backend; never rely on the UI alone for access control.
