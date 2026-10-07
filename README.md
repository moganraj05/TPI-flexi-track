# FlexiTrack

Department-based Yes/No attendance poll for flexi workers in manufacturing.

## Stack

- **Backend:** Node.js, Express, PostgreSQL via Prisma, Socket.IO (realtime), JWT auth, Web Push
- **Web (`webfrontend/`):** React, Vite, TanStack Query, installable web app (PWA). One site, two apps:
  - **`/`** — worker / incharge app (the web version of the mobile app)
  - **`/staff`** — HR / admin ops console
- **Mobile (`mobile/`):** Expo, React Native — the Android APK, kept working while
  everyone moves to the web app (separate git repo)

## Project Structure

```
flexitrack/
├── backend/       # API server (Express + Prisma/PostgreSQL + Socket.IO + Web Push)
├── webfrontend/   # The website: worker/incharge app at "/", HR console at "/staff"
│   └── src/mobile/   # worker/incharge app (web port of the Expo app)
└── mobile/        # Expo Android app — separate git repo
```

## Website addresses

| Address | Who | What |
|---|---|---|
| `/login` | Workers, incharges, supervisors | Sign in with Employee ID + password |
| `/forgot` | Workers, incharges, supervisors | Forgot password: ask their incharge for a temporary password |
| `/home`, `/history`, `/profile` | Workers | Answer the shift poll, see past answers, settings |
| `/incharge`, `/incharge/team`, `/incharge/requests`, `/incharge/poll/:id`, `/incharge/profile` | Incharges / supervisors | Polls dashboard, team management, password reset requests, poll report |
| `/staff/login` | HR / admin | Sign in to the ops console |
| `/staff/app/...` | HR / admin | Dashboard, live board, attendance, workforce, password requests, reports, settings |

`/` sends everyone to their own home after sign-in. Old HR links (`/app/...`,
`/register`, `/forgot-password`) redirect to the same page under `/staff`.
The two apps keep separate sign-ins, so signing out of one never signs you
out of the other. HR/admin accounts can't sign in on `/login`: they get a
message pointing to `/staff/login`.

## Prerequisites

- Node.js 20+
- A PostgreSQL database (a connection string is all that's needed)

## Local development

```bash
# backend
cd backend
npm install            # postinstall runs `prisma generate`
cp .env.example .env   # fill in DATABASE_URL/DIRECT_URL/JWT_SECRET at minimum
npx prisma migrate deploy
npm run seed:design    # optional: demo plant/workers/polls (WIPES the database it points at)
npm run dev            # API on http://localhost:5000

# website (second terminal)
cd webfrontend
npm install
npm run dev            # http://localhost:5174  (worker app at /, HR console at /staff)
```

Demo logins after `seed:design`: worker `EMP1042`, incharge `INC001` (password
`password123`) at `/login`; HR `hr.admin@flexitrack.com` / `password123` at
`/staff/login`. In development the worker login also shows one-tap demo buttons.

## Notifications (Web Push)

Workers get an alert when their poll opens and a reminder before it closes;
incharges get the final head count when one of their polls closes. They are
delivered to every device the person turned them on for (Profile →
Notifications), and to the Android APK as before.

1. Generate the server's key pair once: `cd backend && npm run push:vapid-keys`.
2. Put both keys in `backend/.env` as `WEB_PUSH_VAPID_PUBLIC_KEY` /
   `WEB_PUSH_VAPID_PRIVATE_KEY`, and a contact in `WEB_PUSH_SUBJECT`
   (`mailto:...`). Keep the keys: changing them drops every browser's
   subscription until its owner opens the app again.
3. Restart the backend. Without keys the app runs normally and just shows
   "Notifications are not set up yet".

**Browser rules you cannot work around:**

- Notifications (and installing the app) only work on **`https://`** addresses,
  or `http://localhost` for development. Opened as `http://<server-ip>:8080`,
  the app works but says notifications need the https address. The site
  needs a real domain with a certificate, or an internal certificate that
  every phone trusts.
- **iPhone (iOS 16.4+):** only after *Share → Add to Home Screen*, opened from
  that icon. The Profile screen shows these steps.
- **Android Chrome:** works in the browser and as an installed app.
- The server needs outbound internet access to the browsers' push services
  (Google FCM, Mozilla, Apple), as it already does for Expo push.

Profile → Notifications has a **Send a test notification** button to check a
phone end to end.

## Staying signed in

Both apps keep you signed in until you press **Log out** on that device —
closing the browser, restarting the phone, no internet or the server
sleeping/restarting never signs anyone out (the app retries in the
background). Tokens last `JWT_EXPIRES_IN` (365 days) and are renewed
automatically while the app is used.

- **Log out** ends only that device's session (`revoked_sessions` table);
  the same person stays signed in on their other devices.
- **Signing out everywhere** happens when the password is changed or reset
  (`users.token_version`), or the account is deactivated.

## Offline use

Both apps (worker / incharge at `/`, staff console at `/staff`) keep working
without internet once they have been opened online once on that device:

- **Every page opens offline.** The service worker (`webfrontend/public/sw.js`)
  downloads every file of the build at install — the build writes the file
  list and a cache version into `dist/sw.js` (`vite.config.js`). Fonts are
  bundled with the site (`@fontsource/*`), no Google Fonts.
- **Last data stays visible.** Loaded data is saved in IndexedDB on the device
  (`src/offline/persist.js`, kept 3 days) and shown offline with a banner;
  on reconnect every screen refreshes by itself. Signing out deletes that
  app's saved data. A page never opened before says "You're offline".
- **Poll answers offline.** A worker can answer the poll with no connection:
  it is saved on the phone ("Waiting to send"), survives closing the app, and
  is sent automatically when the phone is back online
  (`src/mobile/offline/`). If the poll closed meanwhile, the server refuses it
  and the worker is told.
- **Other changes are blocked offline** (staff console actions, incharge
  actions) with "You're offline — this change wasn't saved", instead of being
  queued and applied later out of order.
- **Staying signed in.** No connection never signs anyone out; only the
  server rejecting the session does.

Offline caching is off on the Vite dev server (`npm run dev`); test it with
`npm run build && npx vite preview` or the deployed site. No Redis or other
server-side component is involved.

## Staff console logins

Console logins have two tags: **Admin** and **Staff** (stored roles
`superadmin`/`admin` and `hr` are unchanged). Admin-only: Notifications,
Audit log, and managing logins in Settings.

An admin adds a login in **Settings → Staff & admin logins** with name,
employee ID, email and role — no password. The person gets an email with a
**Set my password** link (works once, valid 72 hours; "Resend invitation"
sends a new one and cancels the old) and signs in after setting it. Set
`PUBLIC_APP_URL` on the backend to the website address so the link points
to the right place.

## Worker & incharge passwords

No shared default password: every new worker/incharge account (HR → Workforce,
the incharge app, or Excel import) gets its own random temporary password
like `K7MQ-42XA`, shown once to whoever created it (Excel import: a
downloadable list of the new logins). It works for 7 days.

The first sign-in with a temporary password opens **Set your password**;
the server refuses every other request until it's done. Rules: 8+
characters with a letter and a number, not the Employee ID / phone number /
a common password, not the same as before. Setting it signs out every other
session.

- Forgot password (self-service): **Forgot password?** on the sign-in page
  (`/forgot`). The person enters their Employee ID + the last 4 digits of
  the phone number on file and always sees the same "request sent" answer
  (it never reveals whether the account exists). The request goes to their
  incharge — or, for incharges, supervisors and workers without an active
  incharge, to the plant's supervisors — as a push notification and a badge
  on the **Requests** tab. The incharge calls them, ticks "I confirmed it's
  really them", then **Reset password** (a 24-hour temporary password, shown
  once) or **Reject** with a reason. Status: waiting → temporary password
  issued → completed (they set their own password); also rejected, expired
  (after 48 hours) or cancelled (they signed in normally). One open request
  per person (asking again refreshes it), at most 3 a day; the endpoint is
  rate limited by `RATE_LIMIT_FORGOT_MAX` (default 30 per 15 min per IP).
  Every request, approval and rejection is in the audit log.
- Moving up: a request nobody acts on within 12 hours
  (`RESET_REQUEST_ESCALATE_HOURS`) moves from the incharge to the plant's
  supervisors, then to HR; the new handlers get a push notification and the
  incharge still sees it, marked overdue. A supervisor's own request, or one
  from a plant with no active supervisor, goes straight to HR. A background
  job checks every 5 minutes (`RESET_REQUEST_CHECK_INTERVAL_MS`) and also
  expires requests after 48 hours; both are recorded in the audit log as
  "FlexiTrack (automatic)".
- Staff console **Password requests** (Staff and Admin): every plant, with
  *Waiting for HR* / *All open* / *Done* tabs, plant filter and search; a
  red sidebar badge counts the ones waiting for HR (live). Staff and Admins
  can handle any request the same way (call, confirm, reset or reject).
- **Password history** on each worker's / incharge's page in Workforce:
  current state (own password / must set a new one / temporary password
  expired), when they last set their own password, last sign-in, reset
  requests in the last 30 days, any open request, and every password event
  from the audit log (never the password itself).
- HR or an admin can also reset directly: **Workforce → Edit → Reset
  password** — a new temporary password valid for 24 hours, and the person is
  signed out everywhere.
- Existing accounts still on a shared password: admins use **Settings →
  Worker & incharge passwords** (a plant or everyone) or select people in
  Workforce → **Require new password**.
- Incharges can't type or change a worker's password.
- Workers/incharges can change their own password in **Profile**.

## Audit log

Every action that changes data or takes it out of the system is recorded:
staff sign-ins (including failed ones, with the reason), password changes and
resets, HR/admin login and registration changes, workers/incharges added,
edited, imported or deactivated (from the HR console or the incharge app),
plants, attendance marked on a worker's behalf, follow-ups, polls closed
early, notifications sent, and every report/export downloaded.

Each entry stores who (name, role, login), what (a plain sentence plus
before → after for each changed field), which record, when, and from where
(IP address, device, request ID). Passwords are only ever recorded as
"changed". Admins see it in the staff console under **Audit log** (search,
filter by category and date, download CSV); Staff logins don't.

Entries are permanent. The `audit_logs` table has a database trigger that
rejects UPDATE, and rejects DELETE/TRUNCATE unless a retention purge is done
deliberately in one transaction:

```sql
BEGIN;
SET LOCAL flexitrack.allow_audit_delete = 'on';
DELETE FROM audit_logs WHERE created_at < now() - interval '3 years';
COMMIT;
```

## Deploy: Render (backend) + Vercel (website)

**Render** — New → Blueprint → this repo (uses `render.yaml`). Fill in when asked:
`DATABASE_URL`, `DIRECT_URL`, `CORS_ALLOWED_ORIGINS` (the Vercel address),
`WEB_PUSH_VAPID_PUBLIC_KEY` / `WEB_PUSH_VAPID_PRIVATE_KEY` (`npm run push:vapid-keys`),
`RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`. Keep the Starter plan (free instances
sleep, and then no polls are created) and 1 instance.

**Vercel** — Add New → Project → this repo. Root Directory `webfrontend`.
Environment variable `API_URL=https://<render-service>.onrender.com/api`.
Deploy (`webfrontend/vercel.json` handles page routing and the service worker).

Then put the Vercel address in Render's `CORS_ALLOWED_ORIGINS`, and create the
first admin by running `npm run seed:admin` with `backend/.env` pointing at the
production database.

## Production Deployment

### Required environment variables (backend)

Copy `backend/.env.example` and fill in every value — the app fails closed
(refuses requests / exits at boot) rather than guessing when these are
missing, which is intentional. At minimum, set:

- `NODE_ENV=production` — without this, CORS falls back to its dev
  allowlist and 500 errors leak raw internal messages to clients.
- `DATABASE_URL` / `DIRECT_URL` — pooled and direct Postgres connections
  respectively; `DIRECT_URL` is what `prisma migrate deploy` uses (DDL
  doesn't reliably work through a transaction-mode pooler).
- `JWT_SECRET` — must be a real random secret, not the placeholder value.
- `CORS_ALLOWED_ORIGINS` — comma-separated browser origins for the web
  frontend(s). Left unset in production, the API allows **no** browser
  origin (mobile/curl/server-to-server calls are unaffected — CORS is
  browser-only).
- `TRUST_PROXY` — only if actually deployed behind a reverse proxy/load
  balancer; leave at `0` for direct access.

### Deploying the backend

```bash
cd backend
npm ci                       # postinstall runs `prisma generate`
npx prisma migrate deploy    # applies any pending migrations; no-op if already current
npm start                    # or run under your process manager of choice
```

The schema is now tracked under Prisma Migrate (`backend/prisma/migrations/`,
baselined from the existing production database with zero schema changes
executed). Going forward, schema changes must go through
`npx prisma migrate dev --name <description>` in development, with the
generated migration committed — **never** `prisma db push` against a
database holding real data; Prisma itself does not guarantee that command is
non-destructive on divergence.

The process must run under a supervisor that restarts it on exit (systemd,
pm2, or your platform's own restart policy) — if the database is unreachable
at boot, the process now logs `server.startup_failed` and exits(1) rather
than lingering as a zombie with no port bound; the supervisor's restart is
what actually recovers once the database comes back. During normal
operation, a lost DB connection fails individual requests safely (a normal
5xx via the shared error handler) and recovers on its own the moment the
database is reachable again — no manual reconnect needed, Prisma's client
retries per-query.

Health/readiness for load balancers or orchestration:

- `GET /api/health` — liveness only (process is up). Deliberately does not
  touch the database — the mobile app also hits this during its LAN
  discovery scan, up to 254 times per subnet.
- `GET /api/health/ready` — readiness; runs `SELECT 1`, returns 503 if the
  database isn't reachable.

A normal restart/redeploy does not create duplicate polls or reminders —
poll creation is protected by a real unique database constraint
(`(departmentId, shiftStart, shiftEnd, date)`), and reminder sends are
claimed atomically (`reminderSentAt IS NULL` as part of the same UPDATE), so
re-running either scheduler tick after a restart is a safe no-op if the work
was already done.

### Deploying the web frontend

```bash
cd webfrontend
npm ci
npm run build     # outputs static files to dist/
```

Set `API_URL` at build time if the web frontend is ever served from a
different host than the backend (e.g. a separate domain, not the same
machine on port 5000) — left unset, it defaults to
`http://<the host the page was loaded from>:5000/api`, which only works when
both are on the same machine/LAN. Serve `dist/` from any static host with
SPA fallback (any unmatched path → `index.html`) — the service worker
(`public/sw.js`) handles the rest: it precaches the app shell, cache-busts
automatically on every deploy since built assets are content-hashed, and
purges its own old cache version on activate.

### Android APK (Expo) constraints

The web app (`/`) has none of these constraints: it uses the same address as the
page. They apply only to the Android APK, kept working during the switch to
the web app. The APK is built for a factory-LAN deployment, not a public-internet
API: it discovers the backend by scanning the phone's own subnet for a host
answering `/api/health` on a **hardcoded port 5000**. This means:

- The backend must be reachable by IP on port 5000 from the same
  Wi-Fi/hotspot the phones are on. It is not designed to reach a backend
  behind a reverse proxy on 443 or a public domain without rebuilding the
  app with a different discovery/base-URL strategy.
- If that assumption ever changes (e.g. backend moves behind HTTPS on a
  public domain), the mobile app needs a corresponding change — this is a
  known, accepted architectural constraint of the current design, not a bug.

### PostgreSQL backup and restore

Backups are **not implemented in this application** and must be handled by
whoever operates the database — this is a deliberate scope boundary, not an
oversight:

- **Managed Postgres (Supabase, RDS, etc.):** enable the provider's
  automatic daily backups and point-in-time recovery. This is almost always
  the right choice — it requires no app-side code and the provider handles
  retention/verification.
- **Self-managed Postgres:** schedule `pg_dump` (or `pg_basebackup` for
  physical backups) via cron/your OS scheduler, store the output somewhere
  durable off the database host, and periodically test restoring it into a
  scratch database — an untested backup is not a backup.
- Either way, document (outside this repo, in your ops runbook) who owns
  running a restore, how long it takes, and what RPO/RTO the business
  actually needs — attendance data loss has a real operational cost during
  a shift change, so this shouldn't be left undecided until an incident.
