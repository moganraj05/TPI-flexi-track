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
| `/home`, `/history`, `/profile` | Workers | Answer the shift poll, see past answers, settings |
| `/incharge`, `/incharge/team`, `/incharge/poll/:id`, `/incharge/profile` | Incharges / supervisors | Polls dashboard, team management, poll report |
| `/staff/login` | HR / admin | Sign in to the ops console |
| `/staff/app/...` | HR / admin | Dashboard, live board, attendance, workforce, reports, settings |

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
