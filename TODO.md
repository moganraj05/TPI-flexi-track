# FlexiTrack — Engineering Backlog

Generated from a full-system review of `backend/`, `webfrontend/`, and `mobile/`
on 2026-09-15. Ordered by priority within each section. Check items off as
they're done; keep this file as the single source of truth for outstanding work.

## Critical — do before real/production use

- [ ] **CRIT-1: Rotate the MongoDB Atlas credentials.** ⚠️ **Needs you** — I
  cannot do this myself, it requires logging into the Atlas dashboard.
  `backend/.env` has held a real Atlas connection string in plaintext across
  many terminal sessions this build. `.gitignore` protects it from git, but
  rotate the password in Atlas (Database Access → edit user → new password)
  and update `backend/.env` with the new one regardless — cheap insurance.

- [x] **CRIT-2: Add Department/Plant CRUD to the HR API + webfrontend.** Done
  2026-09-15. Added `POST/PATCH/DELETE /api/hr/departments` (`hr.controller.js`:
  `createDepartment`/`updateDepartment`/`deactivateDepartment`) — deactivate is
  a soft delete (`isActive: false`) and is blocked with a clear error if the
  plant still has active workers/incharges. UI: "Manage plants" card on
  `webfrontend/src/pages/Settings.jsx` (add/edit/deactivate/reactivate).
  Verified via direct API tests (create, duplicate-code rejection, rename,
  deactivate-guard) and a full browser run (add → edit → deactivate →
  reactivate, all confirmed in the UI with no console errors).

- [x] **CRIT-3: Add Worker/Incharge management to the HR API + webfrontend.**
  Done 2026-09-15. Added `POST/PATCH/DELETE /api/hr/team` (`hr.controller.js`:
  `createTeamMember`/`updateTeamMember`/`deactivateTeamMember`), covering both
  worker and incharge roles, any plant (not just the incharge's own, unlike the
  existing `/api/incharge/team` routes this was ported from). Deactivating an
  incharge is blocked while workers still report to them. UI: "+ Add worker" /
  "+ Add incharge" buttons and per-row Edit/Deactivate actions on
  `webfrontend/src/pages/Workforce.jsx`. Verified via direct API tests (create,
  duplicate-employeeId rejection, invalid-role rejection, short-password
  rejection, worker↔incharge linking, deactivate-guard) and a full browser run
  screenshotting every step including the guard-rail toast, with no console
  errors. All test data created during verification was deleted afterward —
  DB is back to the original 3 plants / 24 people.

- [x] **CRIT-4: Add a way to create additional HR/admin logins.** Done
  2026-09-16. Added `GET/POST/PATCH/DELETE /api/hr/admins` (`hr.controller.js`:
  `getHrAdmins`/`createHrAdmin`/`updateHrAdmin`/`deactivateHrAdmin`), layered
  with an extra `authorize('admin', 'superadmin')` on top of the router-wide
  HR authorization — a plain `hr` role gets a 403 even though it can use every
  other `/api/hr` route. Guard rails: can't deactivate your own login, can't
  deactivate the last active HR/admin (protects against a concurrent-request
  race, since sequential self-deactivation is already blocked separately).
  Promoted the seeded `hr.admin@flexitrack.com` account from role `hr` to
  `admin` (in both `seed-design.js` and the live database) so the feature is
  actually usable without a manual DB edit. UI: "Manage HR logins" card on
  `webfrontend/src/pages/Settings.jsx`, visible only to admin/superadmin
  (hidden entirely for plain `hr` users) — add/edit/deactivate/reactivate,
  with the same themed `ConfirmDialog` used elsewhere; the current user's own
  row has no Deactivate button at all. Verified via 15 direct API test cases
  (validation, duplicate employeeId/email, role-based 403 for a plain `hr`
  token, self-deactivation block, deactivate → login now rejected → reactivate
  → login works again) and a full browser run (create → edit → deactivate,
  screenshotted, zero console errors). One real bug caught during testing —
  in my own test script, not the app — that briefly edited HR001's phone
  number by mistake; caught immediately via the API and reverted before
  finishing, confirmed back to the original seeded value.

- [x] **CRIT-5: Fix JWT lifecycle.** Done 2026-09-16. Implemented the "at
  minimum" option: added `tokenVersion` (default `0`) to `User.js`, embedded
  it in every signed JWT (new shared `backend/src/utils/jwt.js`, replacing
  the two copy-pasted `signToken`s in `auth.controller.js`/`hr.controller.js`),
  and `middleware/auth.js`'s `authenticate` now rejects any token whose
  `tokenVersion` doesn't match the user's current one — a single choke point
  covering every route in the app. Added real logout endpoints,
  `POST /api/auth/logout` and `POST /api/hr/logout`, that increment
  `tokenVersion`, instantly invalidating every token already issued for that
  user (all devices/sessions) regardless of the 365-day expiry left on it —
  the kill switch that was missing. Wired both webfrontend (`AuthContext.jsx`
  now calls `hrApi.logout()` before clearing local storage, with the existing
  401-interceptor path left as a local-only `clearSession` to avoid a
  logout-call-triggers-401-triggers-logout-call loop) and mobile
  (`AuthContext.tsx`/`services/api.ts`) so logging out anywhere actually
  revokes the token server-side, not just locally. Verified end-to-end
  against the live dev DB: login → use token (200) → logout (200) → reuse
  same token (401 "Session expired, please log in again") → fresh login
  works again — confirmed on both `/api/auth` (worker/incharge) and `/api/hr`
  (admin) login paths, plus a malformed-token sanity check (401, no crash)
  and unrelated protected routes (`/api/hr/dashboard`, `/api/hr/workforce`)
  still working normally. Left `JWT_EXPIRES_IN` (365d) unchanged since
  `tokenVersion` is now the actual revocation mechanism — a full short-lived
  access + refresh token pair would add real complexity (refresh flow on 3
  clients) for no extra security benefit here.

- [ ] **CRIT-6: Rate-limit the login endpoints.**
  `POST /api/auth/login` and `POST /api/hr/login` have no rate limiting —
  brute-forceable indefinitely. Add `express-rate-limit` (or similar) scoped
  to these two routes at minimum.

- [ ] **CRIT-7: Restrict CORS.**
  `backend/src/index.js`: `app.use(cors())` allows every origin. Restrict to
  the known webfrontend origin(s) via an env-configured allowlist before this
  is reachable from anywhere but localhost.

- [ ] **CRIT-8: Add an input validation layer.**
  No Joi/Zod/express-validator anywhere — validation is manual `if` checks
  per controller, easy to miss on new routes. Adopt one library and apply it
  at least to every write endpoint (`POST`/`PATCH`/`DELETE`).

- [ ] **CRIT-9: Add automated tests.**
  Zero test files anywhere in the repo (backend, webfrontend, mobile). Start
  with backend controller/integration tests for auth, poll automation, and
  the HR workforce/attendance endpoints — the parts most likely to regress
  silently. No CI can be meaningful without this.

## Should-have — real gaps, not blocking day one

- [ ] **SH-1: Wire the Follow-ups feature into webfrontend.**
  Backend already has `GET/PATCH /api/hr/follow-ups` fully implemented and
  unused by any frontend. Add a Follow-ups screen to `webfrontend/src/pages/`.

- [ ] **SH-2: Add structured logging + error monitoring.**
  Replace scattered `console.log`/`console.error` with a real logger
  (pino/winston) and wire an error-tracking service (Sentry or similar) on
  both backend and mobile, so failures in the field are visible.

- [ ] **SH-3: Add an audit trail for manual HR actions.**
  `markAttendance` and `updateFollowUp` change data with no record of who
  did it or when beyond the raw value change. Add an `AuditLog` collection
  or at minimum `updatedBy`/`updatedAt` stamps surfaced in the UI.

- [ ] **SH-4: Add password reset.**
  No forgot-password flow anywhere, web or mobile.

- [ ] **SH-5: Remove the unused `supervisor` role**, or wire it to something —
  it's defined in `backend/src/models/User.js` `ROLES` but never referenced
  in any route or controller.

- [ ] **SH-6: Add API documentation** (OpenAPI/Swagger) covering `/api/hr`,
  `/api/auth`, `/api/employee`, `/api/incharge` — three separate clients
  currently each infer the contract from reading backend source.

- [ ] **SH-7: Add crash reporting/analytics to the mobile app** (Sentry or
  Expo's own error reporting) — no visibility into crashes on real devices.

- [ ] **SH-8: Delete `hrfrontend/`.** Fully superseded by `webfrontend/`;
  keeping both is confusing dead weight once webfrontend is confirmed stable.

- [ ] **SH-9: Add server-side pagination** to `GET /api/hr/workforce` and
  `GET /api/hr/polls` — fine at 18 workers, won't be once this scales.

- [ ] **SH-10: Add a way to reactivate a deactivated worker/incharge from
  webfrontend.** `Workforce.jsx` only ever fetches `getWorkforce('true')`
  (active people), so once someone is deactivated they disappear from the
  page entirely with no way back in the UI. The backend already supports it —
  `updateTeamMember` accepts `isActive: true` — only the frontend is missing.
  Mirror the pattern already built for plants in `Settings.jsx`'s "Manage
  plants" card (which does show inactive ones with a Reactivate button):
  add an "Active / Inactive" toggle to `Workforce.jsx` and a Reactivate
  button on inactive rows. Until then, the only way is a direct
  `PATCH /api/hr/team/:id` with `{"isActive": true}`.

## System design — architectural notes for future work

- **Single Node process, single Mongo cluster, no redundancy.** Reasonable
  for this scale; add PM2 (or similar) at minimum so a crash auto-restarts
  rather than requiring a manual `npm run dev` again.

- **Poll automation (`poll-automation.service.js`) is a bare `setInterval`,
  not a durable job.** Self-heals on restart, but running two backend
  instances would race the same automation. Needs a leader-election lock or
  dedicated worker before any horizontal scaling.

- **`User` model does triple duty** (worker/incharge/HR-admin) with
  role-specific fields (`equipment`, `process`, `incharge`) only meaningful
  for workers. Consider splitting into separate collections or Mongoose
  discriminators as the domain grows — this ambiguity already made the
  `directReports` logic in `getEmployee` awkward to add.

- **No shared types/SDK between mobile, webfrontend, and backend.** Every
  backend contract change has to be manually propagated to each client's own
  copy of API-calling code by hand. Even a hand-maintained shared `types.ts`
  would help.

- **No API versioning** (`/api/hr/...` has no version prefix). The mobile
  app is a compiled binary in the field — a breaking backend change has no
  migration path for installs that haven't updated yet.

- **LAN-discovery-by-subnet-scan (mobile) is inherently fragile** for a
  phone-hosted-hotspot topology (session-randomized subnets on newer
  Android). The manual-IP-override field added to the login screen is the
  intended permanent answer for that case — don't keep patching with more
  subnet guesses.
