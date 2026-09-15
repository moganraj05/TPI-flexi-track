# FlexiTrack — Data Fields Reference

Only the data entities and fields used by the current frontend design. Use this to shape backend models / API responses.

## Plant
- `code` (string, unique) — e.g. `TCD`, `CRSS`, `EXPORTS`
- `name` (string) — display name, e.g. `TCD Plant`

## Incharge
- `id` (string, unique)
- `name` (string)
- `plant` (string, FK → Plant.code)
- `shift` (string) — display label, e.g. `Shift A · 06:00–14:00`
- `phone` (string)
- `email` (string)

## Worker
- `id` (string, unique)
- `name` (string)
- `empId` (string) — employee ID
- `plant` (string, FK → Plant.code)
- `inchargeId` (string, FK → Incharge.id)
- `equipment` (string) — machine/line name
- `process` (string) — task performed on that equipment
- `shift` (string) — e.g. `Shift A`, `Shift B`
- `push` (boolean) — push notifications enabled
- `phone` (string)
- `email` (string)

## Live Poll (current shift attendance poll)
- `id` (string, unique)
- `plant` (string, FK → Plant.code)
- `shift` (string)
- `opensAt` / `closesAt` (time, e.g. `14:30`)
- `closesIn` (string, computed countdown, e.g. `1h 42m`)
- `total` (int) — total workers polled
- `coming` (int)
- `notComing` (int)
- `pending` (int)
- `roster.coming` / `roster.notComing` / `roster.pending` (array of Worker.id)

## Poll History (past attendance record, per plant+shift+date)
- `id` (string, unique)
- `plant` (string, FK → Plant.code)
- `shift` (string)
- `date` (date, `YYYY-MM-DD`)
- `total` (int)
- `coming` (int)
- `notComing` (int)
- `pending` (int)
- `rate` (int, %) — response rate
- Detail view also needs, per worker in that plant: `answer` (`coming`/`notComing`/`pending`) for that specific poll date — not persisted in current mock, needs backend support to show real per-date answers instead of a repeating pattern.

## Auth / Session
- `email` (string)
- `password` (string)
- Role: currently fixed to `HR` — no role field wired yet.

## Not yet backed by real data (mocked client-side only)
- Report export actions (Excel/PDF) — no export endpoint.
- Password change — no endpoint.

---

# Screen & Navigation Flow

## 1. Login
- Fields: `email`, `password`.
- Submit → authenticate → lands on Dashboard.
- No forgot-password / signup in this design.

## 2. App shell (after login)
- Persistent left sidebar: brand mark + nav (Dashboard, Live Board, Attendance, Workforce, Reports, Settings) + Log out.
- Top bar: current screen title + live "auto-refreshing" indicator (ticking seconds) + HR avatar.
- Log out (sidebar or Settings) → back to Login, clears session fields.

## 3. Dashboard (Overview)
- Stat cards: Plants, Workers, Live polls, Coming, Not coming, Pending (aggregated from all Live Polls).
- Live polls strip: one card per open Poll (plant, shift, closes-in, response bar, coming/not-coming/pending counts). Read-only here.
- Plants grid: one card per Plant (code, name, incharge count, worker count, today's response bar).
  - Click a plant card → jumps to **Workforce**, pre-filtered to that plant, Workers tab.

## 4. Live Board
- Filter row: All plants / TCD / CRSS / EXPORTS (filters the poll list below).
- One expandable card per open Poll: plant chip, shift, open/close time, closes-in badge, response bar, legend counts, "Show/Hide roster" toggle.
- Expanded roster: three columns (Coming / Not coming / Pending), each listing workers as clickable avatar rows (initials avatar + name + equipment·process tag).
  - Click a worker row → **Worker Detail** (back returns to Live Board, filters/expansion preserved).

## 5. Attendance
- Two states, toggled in place (no modal):
  - **List state** (default): filter row (All/plant) + table of Poll History rows (date, plant, shift, total, coming, not coming, pending, rate, "View").
  - **Detail state** (after clicking "View"): "← Back to attendance" button, summary card (plant/shift/date + 5 stat tiles: total/coming/not coming/pending/rate), then a roster table (worker name, equipment·process, incharge, answer badge).
    - Click a worker name → **Worker Detail** (back returns to this Attendance detail).
    - Back button → returns to the Attendance list.

## 6. Workforce
- Two view tabs: **Workers** / **Incharges**, plus a plant filter (All/TCD/CRSS/EXPORTS) — both persist when navigating in from Dashboard's plant click.
- **Workers view**: one table per plant (grouped), columns: worker name (link), emp ID, incharge (link), equipment·process, shift, push-enabled dot.
  - Click worker name → **Worker Detail**. Click incharge name → **Incharge Detail**.
- **Incharges view**: one table per plant (grouped), columns: incharge name (link), shift, worker count.
  - Click incharge name → **Incharge Detail**.

## 7. Worker Detail
- Reached from: Live Board roster, Attendance detail roster, Workforce Workers table.
- Shows: avatar+initials, name, plant chip, emp ID, equipment, process, shift, phone, email, push-notification badge.
- "Reports to" block: clickable incharge row (avatar, name, shift) → **Incharge Detail**.
- "← Back" returns to whichever screen/state the user came from (tracked, not hardcoded to Workforce).

## 8. Incharge Detail
- Reached from: Workforce Incharges table, Workforce Workers table (incharge link), Worker Detail "Reports to".
- Shows: avatar+initials, name, plant chip, shift, phone, email.
- Table of all workers reporting to them (name link, emp ID, equipment·process, shift) — clicking a worker name → **Worker Detail**.
- "← Back" returns to the originating screen.

## 9. Reports & Exports
- Bulk export card: "Export Manpower.xlsx" button (mock — shows a toast, no real file).
- Per-poll table (date, plant, shift, rate, Excel/PDF export buttons per row — also mock toasts).

## 10. Settings
- Profile card (read-only: name, email, role).
- Change-password card: current password, new password fields, "Update password" (mock — toast + clears fields).
- Log out button.

## Global behavior
- Toast notifications (bottom-right, auto-dismiss) confirm mock actions: export started, password updated.
- "Back" navigation from both detail pages remembers the exact screen/filter state the user drilled in from (Live Board / Attendance detail / Workforce), not just a fixed parent.
- Color palette, sidebar light/dark, and density (comfortable/compact) are Tweak-panel controlled — cosmetic only, no effect on data/flow.
