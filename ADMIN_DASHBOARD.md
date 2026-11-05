# Admin Dashboard — Architecture & Data Adapter Contract

Route: `/admin/` (static page `admin/index.html`, hash routes `#/overview`, `#/users`, `#/users/<id>`, `#/sessions`, `#/sessions/<id>`, `#/logs`, `#/courses`, `#/resources`, `#/reports`).
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

## Registering the real adapter (next phase)
Add a script **before** `js/admin/app.js` in `admin/index.html` that calls:
```js
AdminData.register({ checkAccess, getOverview, getUsers, getUserDetails, getUserSessions, getSessions,
                     getSessionDetails, getActivityEvents, getCourseAnalytics, getResourceAnalytics, exportReport,
                     /* optional */ getFilterOptions, signOut });
```
Missing required methods make `register` throw. Every method may return a Promise or a value; throw/reject to show the error + retry state.
Any field may be `null` → UI shows «غير متاح».

### Common parameters
- `filters`: `{ preset, from, to }` (ISO) always present, plus per page: `search`, `userId`, `sessionId`, `courseId`, `resourceType`, `eventName`, `status`, `sessionStatus`, `minSeconds`, `maxSeconds`, `registeredFrom`, `registeredTo`.
- `pagination`: `{ page (1-based), pageSize, sort: { field, dir: 'asc'|'desc' } }`. Paged result: `{ items, total }`.
- Sort fields used: users `registeredAt | lastActiveAt | totalSeconds`; sessions `startedAt | activeSeconds`; logs `occurredAt`.
- Event names (as recorded by the current tracking RPC): `page_view, login_success, course_click, folder_link_clicked, resource_click, youtube_click, search_used, filter_changed, return_to_portal, session_started, session_ended`. Unknown names are shown raw.

### Methods
| Method | Returns |
|---|---|
| `checkAccess()` | `{ granted: boolean, admin?: { name, email, avatarUrl } }` — UI shows the "unauthorized" screen unless `granted === true` |
| `getOverview(filters)` | `{ kpis: { registeredUsers, activeUsers, activeNow, activeToday, activeWeek, totalSessions, sessionsToday, totalSeconds, avgSessionSeconds, pageViews, resourceClicks }, series: { dailyActive, sessions, registrations, events } (each `[{date:'YYYY-MM-DD', value}]`), topCourses: [{id,title,value}], topResources: [{id,title,value}], recentActivity: [event], latestUsers: [user] }` |
| `getUsers(filters, pagination)` | paged `user`: `{ id, name, email, avatarUrl, registeredAt, lastLoginAt, lastActiveAt, sessions, totalSeconds, resourceClicks, status }` — `status` ∈ `active_now | active_today | inactive | never_active` (computed server-side) |
| `getUserDetails(userId)` | `{ user, stats: { sessions, totalSeconds, pageViews, courseVisits, resourceClicks, firstActivityAt, lastActiveAt } }` |
| `getUserSessions(userId, filters, pagination)` | paged `session` |
| `getSessions(filters, pagination)` | paged `session`: `{ id, userId, userName, startedAt, endedAt, activeSeconds, entryPath, lastPath, eventCount, status }` — `status` ∈ `active | ended | interrupted` |
| `getSessionDetails(sessionId)` | `{ session, user }` *(addition to the brief: needed to open one session)* |
| `getActivityEvents(filters, pagination)` | paged `event`: `{ id, occurredAt, userId, userName, eventName, courseId, courseTitle, resourceId, resourceTitle, resourceType, pagePath, properties, sessionId }` |
| `getCourseAnalytics(filters)` | `{ items: [{ courseId, title, visits, uniqueUsers, resourceClicks, avgEngagementSeconds|null, lastInteractionAt, trend:[{date,value}], topResources:[{title,clicks}] }] }` |
| `getResourceAnalytics(filters)` | `{ items: [{ resourceId, title, courseId, courseTitle, type, clicks, uniqueUsers, lastClickedAt }], series: [{date,value}] }` (UI sorts/paginates this list client-side) |
| `exportReport(type, filters)` | `{ filename, csv }`; `type` ∈ `users | sessions | courses | resources | daily`. Must honour the same filters. Empty `csv` → "no data" toast |
| `getFilterOptions()` *(optional)* | `{ courses: [{id,title}], resourceTypes?: [...] }` — fills the course / resource-type selects |
| `signOut()` *(optional)* | Promise; the UI also dispatches `admin:logout-request` on `document` |

## Backend gaps to cover in the Supabase phase
Existing views (`admin_overview_metrics`, `admin_daily_activity`, `admin_course_analytics`, `admin_resource_analytics`) cover part of this. Still needed (new views/RPCs, to be approved — none were created here):
- Users list with computed `status`, `lastLoginAt`, per-user totals; server-side search/sort/pagination.
- `activeNow` / "currently active" (heartbeat window), `sessionsToday`, `avgSessionSeconds`, registrations-per-day series.
- Session `lastPath`, `eventCount`, and `status` (active / ended / interrupted) — `sessions` table has `entry_path`, `ended_at`, `last_heartbeat_at`, but not `last_path` / count.
- Course `visits`, `uniqueUsers`, `trend`, `topResources`; `avgEngagementSeconds` is not measurable today (return `null`).
- Resource types `pdf` / `video` / `document` do not exist in `resources.resource_type` (only `drive, youtube, website, folder, other`).
- CSV export (server-side function or client assembly from paged calls, respecting filters).
- "Login" events: only `login_success` exists; "left a session" maps to `session_ended`.

## Security requirements (backend, not UI)
Access is enforced by RLS / `is_admin()` (already used by the admin views), never by this UI. Never put service-role keys in the browser, never trust a client-supplied role, no self-promotion to admin. The UI's "unauthorized" screen is a convenience only.
The student portal was not modified; link to `/admin/` from the portal only after `is_admin()` is confirmed server-side.
