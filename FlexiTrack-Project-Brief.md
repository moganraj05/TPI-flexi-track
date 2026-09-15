# FlexiTrack — Full Project Brief for AI Review

**Purpose of this document:** Give another AI (ChatGPT, etc.) enough context to understand FlexiTrack as it exists today, then suggest improvements. This describes **what was actually built**, not only the original 30-day plan.

**Company / context:** TPI (manufacturing). Flexi workers (contract / flexible manpower) must confirm **Yes (coming)** or **No (not coming)** for the **next shift**, so the department incharge can arrange replacements **before the line starts**.

**Product name:** FlexiTrack  
**Android package:** `com.tpi.flexitrack`  
**Expo EAS project ID:** `92209084-1890-4015-ba20-e3826eade6ab`

---

## 1. The business problem

On a factory floor, incharges used to chase workers on phone/WhatsApp to know who will come for the next shift. If many people say no at the last minute, production is short of people.

FlexiTrack’s job:

1. Ask each worker (for their shift group): “Are you coming for the next shift?”
2. Show the incharge **Coming / Not coming / No response** in real time.
3. Let HR see all departments, download Excel/PDF, and follow up (call + mark attendance).

Pilot thinking in an older plan: TCD department (~220 people, mixed 12-hour and 8-hour shifts). The software is **not TCD-only**; it is department + shift-timing based.

---

## 2. What exists today (three apps, one API)

| Piece | Folder | Who uses it | Stack |
|-------|--------|-------------|--------|
| Backend API | `backend/` | All clients | Node.js, Express, MongoDB (Mongoose), JWT |
| Mobile app | `mobile/` | Workers + Incharges | Expo SDK 57, React Native, Expo Router |
| HR website | `hr-new/` | HR only | React + Vite (static site in production) |

The older folder `hr-web/` is not the production HR site. **Deploy `hr-new/`.**

There is **no super-admin web panel** (roles `admin` / `superadmin` exist in the User model but are not a product).

---

## 3. Users and how they log in

| Role | Login | Where | Scope |
|------|--------|--------|--------|
| Worker | Employee ID + password | Mobile | Own department, own shift poll |
| Incharge (also supervisor) | Employee ID + password | Mobile | Own department only |
| HR | Email + password | **hr-new website** | All departments |
| Admin / Superadmin | Reserved in DB | Not a separate site | Same HR APIs if used |

**Sample accounts (dev, password `password123` unless noted):**

| Role | Login | Notes |
|------|--------|--------|
| Incharge | `INC001` | Production |
| Incharge | `INC002` | Packing |
| Worker | `EMP001`, `EMP002` | Production, default shift 08:00–20:00 |
| Worker | `EMP003` | Packing, 08:00–20:00 |
| HR | `hr@tpi.local` | Web: `hr-new/` — `npm run seed:hr` |


Workers/incharges **stay logged in** until Logout. JWT expiry is **365 days**. Token is stored in Expo Secure Store. App startup does **not** wipe the session on a temporary network error (only on HTTP 401).

---

## 4. Core idea: polls are automatic (not created by incharge)

**Original design:** Incharge manually created a poll (title, date, open/close times) and the team got a push.

**Current design (this was a product change):** Incharge **cannot create polls**. The Create Poll tab was removed.

Each **worker** has **shift start** and **shift end** (HH:mm), e.g. EMP001 **08:00–20:00**. Incharge can change this on the **Team** tab.

Automation rules (defaults, env-configurable):

- After a shift **ends**, wait **30 minutes**, then **open** a poll.
- Poll **closes 2 hours before the next shift start**.

Example (08:00–20:00):

- Shift ends 20:00  
- Poll opens **20:30**  
- Next shift starts 08:00 next day  
- Poll closes **06:00**

The poll asks: **are you coming for the next shift?** (not “today” in the old sense).

**Grouping:** One poll per **department + same shiftStart + same shiftEnd + target date**. Workers who share the same department and same shift times share one poll. Different timings = different polls.

**Overnight shifts** (end time ≤ start time, e.g. 20:00–08:00) are supported in the shift math.

Scheduler:

- Poll automation: every **60 seconds** (`POLL_AUTOMATION_INTERVAL_MS`)
- Reminder: every **5 minutes** by default — push ~30 minutes before poll close to workers who have not answered and have a push token.

Old **manually created** polls (without `autoCreated` / without shift times) are deleted on server start as a one-time-style migration.

---

## 5. Worker mobile app (tabs)

1. **Live poll** — shift timing card + Yes/No if a poll is open for their shift. Empty state explains: poll opens 30 min after shift end, closes 2 h before next start.
2. **History** — calendar of past Yes/No (up to 90 responses).
3. **Profile** — department, phone, **shift times**, theme (system/light/dark), push notification status.

Push: Expo push tokens (`ExponentPushToken[...]`) saved on the User. Requires **EAS APK**, not Expo Go; FCM via `google-services.json`. One device token is owned by one account (login on another phone/account clears the old mapping). Logout clears the worker’s token.

---

## 6. Incharge mobile app (tabs)

1. **Dashboard** — list of auto polls for **their department** (open/closed, coming/not coming/pending). Tap for report. **No poll create. No poll delete.** Can still **close** a poll early from poll detail.
2. **Team** — add/edit/remove workers (soft delete `isActive: false`). **Edit shift start/end** per worker. See Notify ON vs no token, and live poll answer if any.
3. **Profile** — theme + logout.

Poll detail: roster filters (coming / not coming / pending), session report card, CSV share from the phone (older in-app export). HR website is the nicer Excel/PDF path.

---



## 8. Backend data model (MongoDB)

**Department:** name, code, isActive.

**User:** employeeId, name, email (optional, unique sparse — used by HR), phone, hashed password, role, department (optional for HR), shiftStart/shiftEnd, pushToken, isActive.

**Poll:** title, description, department, date (next-shift calendar day), shift label, shiftStart/shiftEnd, status open|closed, opensAt, closesAt, createdBy (often null), autoCreated, reminder fields. Unique index: department + shiftStart + shiftEnd + date.

**Response:** poll + user + answer yes|no + answeredAt. Unique pair poll+user (worker can change answer while poll is open).

---

## 9. Important API surface (mental map)

**Auth:** `POST /api/auth/login` (employeeId), `GET /api/auth/me`, push-token POST/GET/DELETE.

**Employee (worker):** today’s/live poll, respond, my responses.

**Incharge:** team CRUD, list polls, poll detail, close poll. **No POST create poll, no DELETE poll.**

**HR:** `POST /api/hr/login` (email), dashboard, polls, poll detail, mark attendance, workforce, live board, departments, `export.xlsx` / `export.pdf`, manpower.xlsx.

---

## 10. Folder map (ignore `node_modules`)

```
backend/src/
  index.js                 # Express + schedulers
  models/                  # User, Poll, Response, Department
  controllers/             # auth, employee, incharge, hr, notification
  services/                # push, reminders, poll-automation, hr-export
  routes/
  utils/                   # dates, shift math, poll close, pollReport
  scripts/seed.js, seed-hr.js

mobile/
  app/(tabs)/              # worker
  app/(incharge-tabs)/     # incharge dashboard, team, profile
  app/incharge-poll/[id]   # poll report
  context/AuthContext, ThemeContext
  services/api.ts, notifications.ts


## 11. Notifications (how they really work)

1. Worker APK requests permission → Expo push token → `POST /auth/push-token`.
2. When an auto-poll is **created**, backend sends Expo Push API messages to workers in that **department + shift times** who have tokens.
3. Reminder: same, but only people who have **not responded**.
4. Incharge does **not** register for those poll pushes (workers only).

Limits: physical Android device, FCM configured on Expo, backend reachable from phone (same Wi‑Fi in current LAN setup), one worker per phone recommended.

---

## 12. How to run (local) and deploy

**Local**

1. MongoDB (Atlas or local) in `backend/.env`.
2. `cd backend && npm run dev` → API `0.0.0.0:5000`.
3. HR site: `cd hr-new && npm run dev` → http://localhost:5173
4. Mobile: set PC LAN IP in `mobile/constants/theme.ts`, EAS preview APK or Expo as allowed; OTA channel `preview`.

JWT: `JWT_EXPIRES_IN=365d`. Poll timing env: `POLL_OPEN_AFTER_SHIFT_MINUTES=30`, `POLL_CLOSE_BEFORE_NEXT_SHIFT_HOURS=2`.

**HR website deployment (requirements only)**

- Build static files: `cd hr-new && npm ci && npm run build` → publish `hr-new/dist`.
- Set `VITE_API_URL` to the public API origin **including `/api`** (example: `https://api.example.com/api`) **before** build.
- Host as a SPA: every path must fall back to `index.html`.
- API + MongoDB must already be running; the HR site does not include a server of its own.
- Full checklist: `hr-new/CLAUDE.md` (Deployment requirements).

---

## 13. What is intentionally not built / weak spots (for suggestions)

Use these as starting points when asking ChatGPT for advice:

1. **Cloud production** of API + HR static site is not a locked hosting vendor — follow `hr-new` deployment requirements (static `dist`, `VITE_API_URL`, SPA fallback). Typical use is still PC + LAN + Atlas until IT assigns hosts.
2. **No iOS app** focus; Android APK via EAS.
3. **No real HR identity** (SSO, company email domain, 2FA) — sample `hr@tpi.local`.
4. **No holiday / weekly-off calendar** — polls still auto-create after every shift end, including weekends unless someone changes process.
5. **No minimum manpower target** per shift (the 30-day plan wanted this; app only shows counts, not “need 80, have 65”).
6. **No gate/biometric attendance merge** — this is **intent** (coming/not coming), not punch-in.
7. **No multi-plant / timezone** model; server uses machine local time for shift math.
8. **JWT 365d** is “stay logged in”, not refresh-token rotation.
9. **HR can override Yes/No** without audit log of who changed it.
10. **Supervisor vs incharge** — both use incharge APIs; no extra supervisor screens.
11. **Admin/superadmin UI** missing.
12. **Poll unique index** assumes one poll per dept+shift+date; changing a worker’s shift mid-window can leave orphan polls / empty rosters.
13. **Push does not deep-link** to a specific poll screen (receive alert, open app home).
14. **English-only** UI.
15. **Cleartext HTTP** allowed on Android for LAN API (`usesCleartextTraffic`).
16. Original 30-day plan still mentions **incharge-created polls**; that is **outdated** vs current auto-shift engine.

---

## 14. Original 30-day plan vs current product

The file `FlexiTrack-30Day-Plan.md` is a **management Gantt / TCD pilot** document. It still says incharge creates polls. That process is outdated.

**Trust this brief** for “what the code does now.” HR production website is **`hr-new/`**. Use the 30-day plan for business goals, TCD numbers, and hosting budget discussion.

---

## 15. Prompt you can paste after this file

> You are reviewing FlexiTrack (factory flexi-worker next-shift Yes/No attendance). Read the brief. Suggest: (1) production architecture, (2) HR/incharge process gaps, (3) shift/holiday edge cases, (4) security, (5) a realistic next 2-week backlog. Do not assume incharges still create polls.

---

*Generated from the FlexiTrack codebase (backend + mobile + hr-new) as of 2026.*
