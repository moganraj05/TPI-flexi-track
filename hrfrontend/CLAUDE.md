# CLAUDE.md — Flexi Worker Attendance HR Dashboard

This file gives Claude Code full context on the project. Keep it updated as decisions change — Claude Code re-reads this on every session.

---

## 1. Project Summary

**What exists already (do not rebuild):**
- Mobile app for **employees (flexi workers)** and **incharges**, built in **React Native (Expo Go)**.
- Backend: **Node.js + Express**.
- Core flow: each worker has a shift (e.g. 8:00 AM–8:00 PM). 30 minutes after shift start, an automatic **poll** is generated asking "Yes/No" for attendance. The poll stays open until **2 hours before the shift ends**, then auto-closes. The incharge for that worker's department sees the result.

**What we are building now:**
A **web dashboard for the HR team only** (single role — no worker/incharge login here) that reads attendance/poll data from the **existing backend** and presents it visually. This is a **consumer of existing APIs**, not a new source of truth — unless a gap below says otherwise.

**Stack for this new web app:**
- Frontend: **React** (web, not React Native)
- Backend: reuse **existing Express APIs** — new endpoints only where explicitly needed (see §8)
- Styling: clean, minimal, **blue/white** primary palette with clear status colors (see §10)

---

## 2. High-Level Architecture

```
┌─────────────────────────┐        ┌─────────────────────────┐
│   Mobile App (existing)  │        │  HR Web Dashboard (NEW) │
│  React Native + Expo Go  │        │        React (web)      │
│  Worker + Incharge roles │        │        HR role only     │
└────────────┬─────────────┘        └────────────┬────────────┘
             │                                    │
             │        REST (+ real-time?)         │
             ▼                                    ▼
        ┌─────────────────────────────────────────────┐
        │         Node.js + Express API (existing)      │
        │  Auth · Polls · Attendance · Departments ·    │
        │  Shifts · Employees · Reports                 │
        └────────────────────┬──────────────────────────┘
                              │
                              ▼
                        ┌───────────┐
                        │ Database   │  ← not specified, see Gap #1
                        └───────────┘
```

**Key architectural decision to confirm before coding:** does the HR dashboard talk to the **same** Express instance/DB as the mobile app, or a separate service? Assumption for this doc: **same backend, shared DB.**

---

## 3. Frontend Project Structure (proposed)

```
hr-dashboard/
├── src/
│   ├── api/                # axios instance + endpoint wrappers (one file per resource)
│   │   ├── client.js
│   │   ├── auth.js
│   │   ├── departments.js
│   │   ├── polls.js
│   │   ├── attendance.js
│   │   └── reports.js
│   ├── components/
│   │   ├── common/         # Button, Table, Pagination, CalendarPicker, StatusBadge
│   │   └── layout/          # Sidebar, Topbar, ProtectedRoute
│   ├── pages/
│   │   ├── Login/
│   │   ├── Dashboard/
│   │   ├── Attendance/      # Page 2
│   │   ├── ShiftLive/       # Page 3
│   │   ├── Reports/         # Page 4
│   │   └── Settings/        # Page 5
│   ├── hooks/               # usePolling, useAuth, usePagination
│   ├── context/             # AuthContext (or Redux/Zustand — decide, see Gap #6)
│   ├── utils/               # date/timezone helpers, export helpers
│   ├── constants/           # status colors, route paths
│   └── App.jsx
├── .env.example
└── package.json
```

---

## 4. Page-by-Page Flow

### Login
- Email + password → POST `/auth/login` → store JWT → redirect to Dashboard.
- Route guard: any page under `/app/*` requires valid token + HR role claim.

### Page 1 — Dashboard
1. Card/grid per **department**: total workers, count "came", count "not came" (derived from poll results).
   - Click a department card → navigate to **Attendance/Tracking** page, pre-filtered by that department.
2. A **"Live Polls"** section showing shifts currently in their open-poll window.
   - Click a live poll entry → navigate to **Shift Live** page, pre-filtered by that shift.
3. Data here must refresh periodically (see Gap #3 — live data strategy undefined).

### Page 2 — Attendance / Tracking (completed polls only)
1. Table of workers for the selected department/shift, each row: name, shift time, poll result (came / not came), status badge.
2. Click a row → detail panel/modal: employee info + their poll answer + timestamp.
3. Calendar control to filter by date.
4. Pagination for the table.

### Page 3 — Shift Live (in-progress polls)
1. Same table shape as Page 2, but for **currently open** polls — updates as responses come in.
2. Calendar filter (mostly "today", but allow browsing).
3. Pagination.
4. **This page has the strongest real-time requirement in the whole app** — flag any polling/websocket decision here first.

### Page 4 — Reports
1. HR selects department + shift + date (range).
2. Export as:
   - **Excel** (.xlsx) — structured columns, one row per worker.
   - **PDF** — same data plus a short narrative/summary section.
3. Decide generation location: client-side (e.g. `exceljs`/`jsPDF` in the browser) vs. server-side (Express generates and streams the file). Recommendation: **server-side**, so large exports aren't limited by browser memory and PDFs can be styled consistently — see Gap #7.

### Page 5 — Settings
1. HR user's own profile details (name, email, etc.).
2. Change password (requires current password + confirmation).
3. Placeholder for "other settings" — undefined, ask the user what belongs here.

---

## 5. Proposed Data Contracts (needs confirmation against real backend)

These are **assumed shapes** based on the requirements doc — Claude Code should treat these as a starting point and adjust once real API responses are seen.

```
Department:   { id, name, totalWorkers }
Shift:        { id, departmentId, startTime, endTime, pollOpensAt, pollClosesAt }
Employee:     { id, name, departmentId, ...contact fields TBD }
PollResponse: { id, employeeId, shiftId, response: "yes"|"no"|"pending", respondedAt }
HRUser:       { id, name, email, role }
```

## 6. API Endpoints Needed (draft — confirm with existing backend team)

| Purpose | Method | Endpoint (proposed) |
|---|---|---|
| HR login | POST | `/auth/login` |
| Change password | POST | `/auth/change-password` |
| Dashboard department summary | GET | `/departments/summary` |
| Live polls list | GET | `/polls/live` |
| Attendance by dept/date/shift | GET | `/attendance?departmentId=&date=&shiftId=&page=` |
| Employee detail | GET | `/employees/:id` |
| Shift-live detail | GET | `/polls/:shiftId/responses` |
| Generate report | GET/POST | `/reports/export?format=xlsx\|pdf&...` |

---

## 7. What's Missing From the Architecture (read this before coding)

The original spec describes *screens*, not a system. Below are the gaps that will cause real problems if left undecided. Recommend resolving at least #1–#5 before writing backend-dependent code.

1. **No database/schema specified.** The doc never says what stores employees, departments, shifts, or poll responses, or how they relate. Confirm this with whoever owns the existing Express backend before assuming the shapes in §5.

2. **Authentication & authorization model is undefined.** "Login with email and password" is stated, but not: token type (JWT vs session), token expiry/refresh, how the backend distinguishes an **HR** caller from a **worker/incharge** caller on the *same* API, and whether there's more than one HR role (e.g. admin HR vs regular HR) needing different permissions.

3. **"Live" data has no defined mechanism.** Page 1 and Page 3 both require near-real-time updates (poll responses arriving as workers answer). The spec doesn't say whether this is polling (and at what interval), WebSockets, or server-sent events. This decision affects component design (`usePolling` hook vs. a socket subscription) and should be made first — it touches the two most interactive pages.

4. **No handling for edge cases in the shift/poll timing logic:**
   - Shifts crossing midnight (e.g. night shift 8 PM–8 AM) — how is "date" attributed for filtering/reporting?
   - A worker who never responds before the poll closes — is that "not came," "no response," or a third state? The UI needs a distinct state for this, separate from an explicit "No."
   - Timezone: is everything server time, or does daylight/regional time matter for multi-site departments?

5. **Report generation location and format details are underspecified.** Client-side vs server-side generation (recommend server-side, see §4), and the PDF's "extra wordings about the report" is vague — HR should define what that narrative section actually contains (totals? absentee list? comparison to previous period?).

6. **No state-management or data-fetching library chosen.** For a dashboard with live-updating tables, pagination, and filters, plain `useState`/`useEffect` will get messy fast. Recommend deciding between React Context (simple), Redux Toolkit, Zustand, or a data-fetching library like **React Query/TanStack Query** (handles caching, polling, and pagination well — likely the best fit given the live-data requirement in #3).

7. **No error/empty/loading states designed.** Every page description covers the happy path only. Need: what a department card shows with 0 workers, what happens on an API failure, what a table looks like while loading, and network-retry behavior — especially important on Page 3 given the live polling.

8. **Employee detail fields aren't specified.** Page 2 says "click employee → show details" but doesn't list which fields (photo, phone, ID number, poll history, etc.). Needs a short spec before building the detail component.

9. **No pagination defaults given.** Page size, whether pagination is server-side (recommended, since worker counts could be large — e.g. 220 in one department alone) or client-side.

10. **No responsive/breakpoint requirement stated.** This is described as a "website," but it's not said whether it must work on tablet/mobile browsers or is desktop-only for HR staff at workstations. Affects layout decisions (sidebar vs. bottom nav, table vs. card list on small screens).

11. **CORS / environment configuration not addressed.** The new React app and existing Express backend will likely run on different origins/ports during development — needs CORS config on the backend and an `API_BASE_URL` env variable convention on the frontend (`.env` / `.env.production`).

12. **No mention of testing, deployment, or hosting.** Where does this get deployed (same server as the mobile backend, separate static hosting, internal network only since it's HR-only)? No test strategy mentioned (even a light one — component tests for the table/pagination logic, and an integration test for the login flow — would catch regressions early).

13. **Security details for an HR-only, sensitive-data tool are unaddressed:** rate limiting on login/change-password, HTTPS enforcement, session timeout/auto-logout for shared workstations, and audit logging of who exported which report (useful if reports are ever disputed).

14. **Notification of new/expiring polls isn't covered.** Should HR be alerted (in-app toast, badge count) when a new poll opens or is about to auto-close, or is passive viewing on Page 1/3 enough?

---

## 8. Open Questions to Ask the User

Before Claude Code starts implementation, confirm:
- Real API base URL and whether Swagger/Postman docs exist for the existing Express backend.
- Live-data mechanism: polling interval vs. WebSocket (§7.3).
- Server-side vs. client-side report generation (§7.5).
- Desktop-only or responsive (§7.10).
- Any existing design system/component library preference, or build from scratch with the blue/white palette.

---

## 9. UI/UX Guidelines

- Primary palette: **blue** (primary actions, active states) + **white** (backgrounds) + neutral grays for structure.
- Status colors must be immediately distinguishable at a glance:
  - Came / Yes → green
  - Not came / No → red
  - Pending / awaiting response → amber/yellow
  - Poll not yet open → gray
- Keep density high on tables (HR will scan many rows) but maintain clear row separation and hover states.

---

## 10. Mobile-App Visual Design System (mandatory)

This is a **browser web app that must look and behave like a native mobile app**, not a desktop dashboard shrunk down. A visual reference build exists at `hr-mobile-app-design.html` (open it directly in a browser) — treat it as the source of truth for spacing, color, and component shape. Build every page to match it, then extend the pattern for anything the reference doesn't cover.

**Global shell**
- Constrain the whole app to a phone-width column: `max-width: 430px; margin: 0 auto;` even on desktop browsers. Do not build a sidebar layout.
- Fixed **bottom tab bar** (5 tabs: Dashboard, Attendance, Shift Live, Reports, Settings) — this replaces all top-nav/sidebar navigation. Active tab is colored `--blue`, inactive tabs are `--ink-soft`/gray.
- Fixed **top bar** per screen: small eyebrow label (date or section context) + large page title + avatar chip, bottom border, white background.
- Content scrolls under the top bar and above the bottom nav; bottom nav and top bar never scroll away.
- Employee/worker detail opens as a **bottom sheet** (slide up from bottom, rounded top corners, drag handle), never a centered modal or a separate page.
- Department drill-down and live-poll drill-down are navigations (tap a card → switch screen), not accordions or inline expansion.

**Design tokens**
```
--ink:       #121826   (primary text)
--ink-soft:  #5B6472   (secondary text)
--line:      #E4E8F0   (borders)
--surface:   #F3F5FA   (page background)
--white:     #FFFFFF   (card background)
--blue-deep: #17306B   (headers, primary chip fills)
--blue:      #2B52D6   (primary actions, active nav)
--blue-bright:#4D7CFF
--blue-tint: #EAF0FF   (selected chip, info banner bg)
--green:     #1E9E5A / --green-tint:#E6F7EE   (Came / Yes)
--red:       #E14B4B / --red-tint:#FDECEC     (Not came / No)
--amber:     #D99A1B / --amber-tint:#FBF1DC   (Pending / no response)
```
- Fonts: **Manrope** (700/800) for headings, big numbers, and nav labels; **Inter** (400–700) for body text and form fields.
- Card radius 16px, small controls/rows 10px, sheets/login card 26px. No mixed radii on the same element type.
- Status is always a colored **pill**, never just a colored table cell — see the three `status-*` classes in the reference file.

**Per-page mapping to the reference build**
- Login → `#screen-login`
- Dashboard → `#screen-dashboard` (2-column department card grid + horizontally-scrolling "Live polls" strip)
- Attendance/Tracking → `#screen-attendance` (filter chips row, then stacked row-cards, tap → bottom sheet)
- Shift Live → `#screen-live` (progress banner with live dot + countdown at top, same row-card list, auto-refresh instead of pagination)
- Reports → `#screen-reports` (stacked form fields, then two export cards — Excel green, PDF red)
- Settings → `#screen-settings` (profile card, password fields, destructive-styled logout button)

Do not introduce a desktop table view, hover-dependent interactions, or a hamburger/sidebar menu — every interaction must work as a tap on a touch-sized target (44px minimum).

---

## 11. Development Conventions for Claude Code

- Work page-by-page in the order above (Login → Dashboard → Attendance → Shift Live → Reports → Settings), since each later page reuses components from the earlier ones (table, pagination, calendar filter, status badge).
- Build shared components (`StatusBadge`, `PaginatedTable`, `CalendarFilter`) once, in `components/common/`, before duplicating table logic across pages.
- Do not hardcode API responses long-term — stub with mock data behind the same `api/` wrapper functions so swapping in the real backend later is a one-file change.
- Flag any of the Section 7 gaps encountered mid-build rather than silently assuming an answer.
