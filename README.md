# FlexiTrack

Department-based Yes/No attendance poll for flexi workers in manufacturing.

## Stack

- **Backend:** Node.js, Express, PostgreSQL via Prisma, Socket.IO (realtime), JWT auth
- **Web (HR ops console):** React, Vite, TanStack Query, installable PWA
- **Mobile:** Expo, React Native (worker + incharge app, LAN-discovery based — see note below)

## Project Structure

```
flexitrack/
├── backend/       # API server (Express + Prisma/PostgreSQL + Socket.IO)
├── webfrontend/   # HR ops console (React + Vite, PWA)
└── mobile/        # Worker/incharge app (Expo) — separate git repo, see mobile/
```

## Prerequisites

- Node.js 18+
- A PostgreSQL database (a connection string is all that's needed — Supabase, RDS, a local instance, etc.)

## Backend Setup

```bash
cd backend
npm install            # postinstall runs `prisma generate` automatically
cp .env.example .env   # if .env doesn't exist — fill in DATABASE_URL/DIRECT_URL/JWT_SECRET at minimum
npx prisma migrate deploy   # applies any pending schema migrations (safe to re-run; no-op if already up to date)
npm run seed:design    # optional — seeds demo departments/workers/polls for local testing
npm run dev            # starts API on http://localhost:5000
```

## Mobile App Setup

```bash
cd mobile
npm install
npm start
```

Then press `w` for web, or scan QR for Expo Go on your phone.

### API URL for physical device

The mobile app finds the backend itself — no URL to configure. It scans the
phone's own LAN/hotspot subnet for a host answering `/api/health` (see
`mobile/services/serverDiscovery.ts`) and caches whatever it finds. If
auto-discovery can't find it (e.g. an unusual subnet), the app's login screen
has a manual "server IP" override. This assumes the backend is reachable
directly by IP on **port 5000** on the same local network as the phone — see
"Mobile app constraints" below.

## Test Employee Accounts

| Employee ID | Password    | Department  |
|-------------|-------------|-------------|
| EMP001      | password123 | Production  |
| EMP002      | password123 | Production  |
| EMP003      | password123 | Packing     |

## Employee Features (Phase 1)

- Login with Employee ID + password
- View today's department poll
- Answer **Yes** (coming) or **No** (not coming)
- Change answer before poll closes
- View response history
- Profile and logout

## API Endpoints (Employee)

| Method | Endpoint                        | Description              |
|--------|---------------------------------|--------------------------|
| POST   | `/api/auth/login`               | Login                    |
| GET    | `/api/auth/me`                  | Current user profile     |
| GET    | `/api/employee/polls/today`     | Today's open poll        |
| POST   | `/api/employee/polls/:id/respond` | Submit Yes/No answer   |
| GET    | `/api/employee/responses/mine`    | Response history         |

## Next Steps

- Supervisor dashboard
- Super Admin panel
- Push notifications
- Auto-generated reports after poll closes

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

Set `VITE_API_URL` at build time if the web frontend is ever served from a
different host than the backend (e.g. a separate domain, not the same
machine on port 5000) — left unset, it defaults to
`http://<the host the page was loaded from>:5000/api`, which only works when
both are on the same machine/LAN. Serve `dist/` from any static host with
SPA fallback (any unmatched path → `index.html`) — the service worker
(`public/sw.js`) handles the rest: it precaches the app shell, cache-busts
automatically on every deploy since built assets are content-hashed, and
purges its own old cache version on activate.

### Mobile app constraints

The mobile app is built for a factory-LAN deployment, not a public-internet
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
