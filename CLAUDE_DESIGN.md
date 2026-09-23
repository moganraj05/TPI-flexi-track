# FlexiTrack — Web Frontend Design Brief

This file is context for generating a **new** HR/Ops web frontend with Claude Design.
It documents the backend and mobile app as background information only — the new
design should **not** copy the look of `hrfrontend/`, which was a throwaway build.

## 1. What FlexiTrack is

A department-based Yes/No attendance polling system for **flexi workers in
manufacturing**. Workers get a poll after each shift ends asking if they're coming to
the next shift. Supervisors ("incharges") and HR track responses in real time, follow
up with non-responders, and export manpower reports.

Two clients already exist and one is being replaced:

| Client | Status | Role(s) served |
|---|---|---|
| `mobile/` (Expo React Native) | **Keep as-is** — reference only | worker, incharge |
| `hrfrontend/` (React + Vite) | **Throwaway — do not reference visually** | hr, admin, superadmin |
| New web frontend (to design) | **This brief is for this** | hr, admin, superadmin |

## 2. Backend structure (reference only)

Node.js/Express + MongoDB (Mongoose), JWT auth. Location: `backend/src/`.

```
backend/src/
├── index.js                  # app bootstrap, mounts routes, starts schedulers
├── config/db.js
├── middleware/auth.js         # authenticate + authorize(...roles)
├── models/
│   ├── User.js                # roles: worker, incharge, supervisor, admin, superadmin, hr
│   ├── Department.js          # name, code
│   ├── Poll.js                # per-department/shift attendance poll, auto-created
│   ├── Response.js            # worker's yes/no answer to a poll
│   └── FollowUp.js            # HR follow-up status on a non-responder
├── controllers/
│   ├── auth.controller.js     # worker/incharge login
│   ├── employee.controller.js
│   ├── incharge.controller.js
│   ├── hr.controller.js       # everything the new frontend will consume
│   └── notification.controller.js
├── routes/
│   ├── auth.routes.js  employee.routes.js  incharge.routes.js  hr.routes.js
├── services/
│   ├── hr-export.service.js       # Excel/PDF builders
│   ├── notification.service.js    # push notifications (Expo)
│   ├── poll-automation.service.js # auto-open/close polls per shift
│   └── reminder.service.js
└── utils/  date.js  poll.js  pollReport.js  shift.js
```

### Domain model

- **Department**: `name`, `code` (e.g. Production / PROD, Packing / PACK).
- **User**: `employeeId`, `name`, `email`, `phone`, `role`, `department`, `shiftStart`/`shiftEnd`, `pushToken`, `isActive`.
- **Poll**: belongs to a department + shift, has `opensAt`/`closesAt` (auto-computed: opens 30 min after shift ends, closes 1 hour before the next shift starts), `status`: `open` | `closed`.
- **Response**: one per (poll, user), `answer`: `yes` | `no`.
- **FollowUp**: HR's manual tracking of a non-responder, `status`: `pending` | `contacted` | `confirmed_coming` | `confirmed_not_coming`, with a free-text `note`.

### HR API surface (`/api/hr`, roles: hr/admin/superadmin, Bearer JWT)

| Method | Endpoint | Returns |
|---|---|---|
| POST | `/login` | `{ token, user }` |
| GET | `/me` | current HR user |
| PATCH | `/me/password` | change password |
| GET | `/dashboard` | org-wide stats, live polls, per-department breakdown, recent closed polls |
| GET | `/polls` | poll list, filterable by `status`/`department`/`q`, each with a response summary |
| GET | `/polls/:pollId` | one poll + summary + team roster |
| POST | `/polls/:pollId/attendance` | HR manually marks a worker yes/no |
| GET | `/polls/:pollId/export.xlsx` \| `/export.pdf` | per-poll report file |
| GET | `/workforce` | all workers + incharges, with department, shift, notification status |
| GET | `/employees/:employeeId` | one worker's profile + response history |
| GET | `/live` | currently-open polls across all departments, plus flattened coming/not-coming/pending rosters |
| GET | `/departments` | per-department stats (workers, incharges, live polls, coming/not-coming/pending) |
| GET | `/departments/:id` | one department's detail (incharges, employees, live polls) |
| GET | `/follow-ups` | flattened list of non-responders across open polls, with follow-up status |
| PATCH | `/follow-ups` | update a follow-up's status/note (can also resolve the underlying response) |
| GET | `/export/manpower.xlsx` | bulk Excel across recent polls |

This is the full set of data the new frontend has to work with — treat it as the
product's real capability surface when deciding what screens/widgets to design.

## 3. Mobile app (reference only, `mobile/`)

Expo + React Native (Expo Router, file-based routes), TypeScript. Serves **worker**
and **incharge** roles only — HR does not use it.

```
mobile/app/
├── login.tsx
├── (tabs)/            # worker: index (today's poll, yes/no), history, profile
└── (incharge-tabs)/   # incharge: index (poll list w/ filters+search), team, profile
```

Style notes (for brand-family continuity, not for copying layout): card-based
lists with rounded corners and subtle borders, a light/dark theme via
`ThemeContext`/`constants/theme.ts`, status colors for coming (green) / not coming
(red) / pending (amber), and a LIVE badge with countdown for open polls. The new web
frontend can share this color language (semantic status colors, department codes as
tags) so the products feel related, but it should read as a proper **desktop web
app**, not a mobile screen stretched wide.

## 4. Why the new design exists

`hrfrontend/` (`hrfrontend/src/`) was built quickly as a **phone-shaped React SPA**:
a single-column `AppShell` with a `BottomNav`, mobile card lists, inline `style={}`
objects, no real desktop layout. Pages: `Login`, `Dashboard`, `Attendance`, `Reports`,
`ShiftLive`, `Settings`. It proves out the API integration (see
`hrfrontend/src/api/hr.js` for exact request/response shapes) but is not a design to
build on — **do not reuse its layout, components, or visual style.** It should be
treated as scaffolding to be replaced.

## 5. What to design instead

A genuine **website-style web app** for HR/admin — the kind of layout you'd expect
from a modern SaaS ops/analytics product (persistent sidebar nav, top bar with
search/profile, real dashboard grid, data tables with sorting/pagination), not a
mobile app ported to a browser. Desktop-first, responsive down to tablet.

### Screens to design

1. **Login** — HR/admin sign-in (email + password).
2. **Dashboard / Overview** — org-wide stat cards (departments, workers, live polls,
   coming/not-coming/pending, notified count), live polls strip, per-department
   summary grid. Auto-refreshing feel (dashboard polls every 30s today).
3. **Live Board** — currently-open polls in real time, grouped by department/shift,
   with countdown to close and a roster split into coming / not coming / pending.
   Refreshes every ~8s today — should feel like an operations monitor.
4. **Attendance / Poll history** — browse closed polls by department/date, drill into
   one poll's full worker roster and answers.
5. **Workforce / Departments** — directory of workers + incharges by department, with
   shift timing and notification/push status; department detail view.
6. **Follow-ups** — worklist of non-responders across live polls, each with a status
   (pending/contacted/confirmed) and a note field — this is the closest thing to a
   lightweight CRM view in the product and deserves a proper table/kanban treatment.
7. **Reports / Exports** — bulk manpower Excel export, plus per-poll Excel/PDF export.
8. **Settings** — HR profile, change password, logout.

### Design direction

- Manufacturing/ops context, not corporate HR paperwork — favor a clear, operational,
  status-driven feel (think shift-floor monitoring dashboard) over a soft "people ops"
  aesthetic.
- Keep the semantic status colors from mobile (green=coming, red=not coming,
  amber=pending) as the backbone of the palette.
- Departments are short codes (PROD, PACK, ...) — good candidates for tag/chip
  treatment throughout tables and cards.
- Data should feel live: emphasize timestamps, countdowns, and "auto-refreshing"
  affordances on the dashboard and live board.
- This is an internal tool used by a handful of HR/admin staff, not a consumer
  product — prioritize scanability and information density over marketing polish,
  but it should still look like a deliberately designed piece of software, not a
  quick internal script's UI.

## 6. Next step

Use this file as the brief for the `design` skill to draft the new frontend's
screens as a Claude Design canvas.
