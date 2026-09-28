# FlexiTrack — End-to-End System Poster · Claude Design Prompt

> Copy everything below the line into Claude Design as one prompt.
> It builds **one artboard**: a single tall poster explaining the whole FlexiTrack system for a manager meeting.

---

## PROMPT

Design **one single poster artboard** (not multiple artboards) titled **"FlexiTrack — How the whole system works"**. It is for a manager meeting, so it must be understandable in 2 minutes by a non-technical person: big headings, short sentences, clear arrows, color-coded roles. It's a static poster, not an interactive prototype.

### Canvas

- One artboard, **2400 × 4200 px**, portrait.
- Outer padding **120 px**. Sections stacked vertically with **96 px** gaps.
- Background `#F4F4F7`. Cards are white `#FFFFFF`, 1 px border `#E6E5EE`, radius 20–28 px, no shadows.
- Use a 12-column grid (gutter 32 px) inside the padding.
- Icons: simple inline stroke SVG (2 px stroke, round caps). **No emoji, no gradients, no left-border cards.**

### Design system (FlexiTrack brand — use exactly)

**Fonts** (Google Fonts)
| Role | Font | Weight |
|---|---|---|
| Display / headings | Bricolage Grotesque | 800, letter-spacing −0.03em |
| Body | Figtree | 400 / 600 / 700 |
| Times, labels, eyebrows | JetBrains Mono | 500 / 600, UPPERCASE eyebrows with 0.08em tracking |

**Type scale:** Poster title 120 px · Section title 64 px · Card title 32 px · Body 22 px (line-height 1.45) · Small / captions 18 px · Eyebrow 18 px mono.

**Neutral colors**
| Token | Hex | Use |
|---|---|---|
| bg | `#F4F4F7` | Poster background |
| card | `#FFFFFF` | Cards |
| field | `#EFEFF4` | Chips, subtle fills |
| ink | `#15131D` | Main text, "Server" role, start/end pills |
| muted | `#6B6879` | Secondary text |
| line | `#E6E5EE` | Borders, dividers |
| arrow | `#8A8799` | All connector arrows |

**Role colors (each role always uses its color)**
| Role | Strong | Soft bg | Text on soft |
|---|---|---|---|
| Worker (mobile) | `#5A3FFF` | `#ECE8FF` | `#4B34E0` |
| Incharge (mobile) | `#1667B8` | `#DDEFFF` | `#1667B8` |
| HR (web) | `#264653` | `#DCEAF0` | `#264653` |
| Server (automation) | `#15131D` | `#EFEFF4` | `#15131D` |
| Push notification | `#B4541C` | `#FFE8DA` | `#9A4515` |

**Attendance status colors (use ONLY for attendance answers, always with a text label)**
| Status | Text | Soft bg |
|---|---|---|
| Coming / Yes | `#0B7A3B` | `#DCF5E5` |
| Not coming / No | `#B42328` | `#FDE3E3` |
| Pending / No response | `#8A5A00` | `#FFF1D4` |

**Flowchart shapes:** Start/End = ink pill (radius 999, white text) · Decision = `#ECE8FF` fill + 2 px `#5A3FFF` border + small diamond icon · Action = white card, 1 px `#C9C6D6` border · Side outcome = white card, 1 px **dashed** `#A6A3B4` border, muted text · Yes/No edge labels = small mono pills (YES = ink filled, NO = ink outline).

---

### SECTION 1 — Header (full width)

- Eyebrow (mono, `#5A3FFF`): `FLEXITRACK · TPI · SYSTEM FLOW`
- Title (120 px, 2 lines max): **Know who is coming to the next shift, before the line starts.**
- Subtitle (28 px, muted): Flexi workers answer one question on their phone after every shift. Incharges and HR see the answers live and fill the gaps early.
- Right side: 3 small stat cards → **2** apps · **1** server · **3** user roles.

### SECTION 2 — Before vs After (2 cards side by side)

- **BEFORE** (red pill `#FDE3E3` / `#B42328`): Incharges chase each worker on phone and WhatsApp. Last-minute no-shows are found only when the line starts, and the shift runs short.
- **WITH FLEXITRACK** (green pill `#DCF5E5` / `#0B7A3B`): A poll opens automatically after every shift. Coming, Not coming and No response are counted live, and HR follows up hours before the next shift.

### SECTION 3 — Who uses it (4 cards in a row, 3 columns each)

Each card: 64 px rounded icon tile in role soft color, role name (32 px), channel line in role color, 4 bullets, footer line in mono.

1. **Worker** — *Mobile app · Android* (person icon, violet)
   - Gets a notification after the shift ends
   - Taps **Yes, coming** or **No** for the next shift
   - Can change the answer until the poll closes
   - Sees past answers on a calendar
   - Footer: `Signs in with Employee ID`
2. **Incharge** — *Mobile app · Android* (team icon, blue)
   - Sees own plant's polls with live counts
   - Opens the roster: Coming, Not coming, Pending
   - Adds, edits, removes workers and sets their shift
   - Can close a poll early
   - Footer: `Signs in with Employee ID`
3. **HR & Admin** — *Web console · PWA* (monitor icon, teal)
   - Sees every plant and shift on a live board
   - Calls non-responders and logs the follow-up
   - Marks attendance, exports Excel and PDF
   - Manages plants, workforce, bulk Excel import
   - Footer: `Signs in with email`
4. **FlexiTrack server** — *Runs on its own, every minute* (server icon; this card is **dark ink `#15131D` with white text**)
   - Opens a poll for every shift automatically
   - Sends the notification and one reminder
   - Closes the poll on time and locks answers
   - Pushes every answer live to all screens
   - Footer: `No one creates polls by hand`

### SECTION 4 — One shift, end to end (swimlane timeline — the hero section, biggest)

Section title: **One shift, end to end** · tag on the right: `EXAMPLE · Shift D · 8:00 AM – 8:00 PM`

Build a **grid: first column 260 px (lane labels) + 7 equal time columns**. Top row = time headers, each with a 6 px colored top bar, big mono time, bold label:

| # | Time (mono) | Label | Top-bar color |
|---|---|---|---|
| 1 | 8:00 PM | Shift ends | ink |
| 2 | 8:30 PM | Poll opens · +30 min | violet |
| 3 | Overnight | Answer window | violet dashed |
| 4 | 6:30 AM | Reminder · 30 min before close | orange |
| 5 | 7:00 AM | Poll closes · 1 h before shift | ink |
| 6 | 7:00 – 8:00 | Follow-up hour | teal |
| 7 | 8:00 AM | Next shift starts | green |

Then 4 lanes (lane label tile in role soft color with icon). Cells: bold title + one muted line. Empty cells stay empty.

- **Server lane:** 1 Spots the shift end — checks every minute, every plant and shift group · 2 Creates one poll for plant + shift + date, pushes it to every worker (orange `PUSH SENT` pill) · 3 Streams every answer live to incharge & HR · 4 Nudges only workers who haven't answered, sent once (orange `REMINDER PUSH` pill) · 5 Closes the poll, answers locked · 6 Final report ready: Coming / Not coming / No response · 7 dashed card: "Cycle repeats at 8:30 PM tonight"
- **Worker lane:** 1 Leaves the line · 2 Phone buzzes: "Are you coming for the next shift?" · 3 **Violet filled card**: Taps one button — two white mini buttons "Yes, coming" (green text) and "No" (red text), caption "Can change it any time until close" · 4 Gets a reminder, only if not answered · 5 Answer locked, shown in history · 6 May get a call from HR if silent · 7 Green soft card: Reports for shift
- **Incharge lane:** 1 empty · 2 Poll appears on dashboard — no need to create it · 3 Watches counts climb + 3 status chips (Coming / Not coming / Pending) · 4 Can close early if the roster is settled · 5 Plans replacements — knows who said No, with an hour to spare · 6 empty · 7 Green soft card: Line starts fully manned
- **HR lane:** 1 empty · 2 empty · 3 Live Board — every open poll across every plant, no refresh · 4 empty · 5 Attendance report with totals and response rate · 6 **Teal filled card**: Calls non-responders, logs follow-up, marks attendance, exports Excel/PDF · 7 Manpower & daily-shift reports

Footer line with clock icon: *The same three rules apply to every shift: poll opens **30 min after the shift ends**, closes **1 hour before the next shift**, reminder **30 min before close**. All three are settings, not code changes.*

### SECTION 5 — Decisions the system makes (3 flowchart columns)

Section title: **Decisions the system makes**. Small legend on the right (Start/End, Decision, Action, Side outcome). Three white panel cards side by side, each with a letter badge.

Layout rule for every decision: decision box on the left (~60% width) → arrow with NO/YES pill → side-outcome dashed card on the right. Main path continues **downward** with a down arrow + label pill.

**A · Should a poll open now?** *(Server · every 60 seconds)* — badge ink
1. Pill: Every minute, for every plant + shift group
2. Decision: Did this shift end at least 30 minutes ago? → **NO** → "Wait. Check again next minute." ↓ **YES**
3. Decision: Is there already a poll for this plant + shift + date? → **YES** → "Skip. Database blocks duplicates, restarts are safe." ↓ **NO**
4. Action (violet filled): Create the poll — opens now, closes 1 hour before the next shift
5. Action (with orange bell tile): Push "Are you coming for the next shift?" to every worker in the group
6. Decision: Has the close time passed (or did the incharge close it)? → **NO** → "Stay open, keep collecting answers." ↓ **YES**
7. Pill: Close poll · lock answers · go to C

**B · A worker answers** *(Worker mobile app)* — badge violet
1. Pill: Worker opens the app, from the push or home screen
2. Decision: Is a poll open for my shift right now? → **NO** → "Shows my shift card and when the next poll opens." ↓ **YES**
3. Action (violet filled): Tap one answer — [Yes, coming] [No, not coming]
4. Action: Saved and shown live — incharge and HR update within a second
5. Decision: Changes mind, and the poll is still open? → **YES** → "Answer is replaced. Still one answer per worker per poll." ↓ **NO**
6. Pill: Answer stands until the poll closes
7. Bottom box (`#FFF6EF` bg, `#F3D3BD` border, bell icon): **Meanwhile: reminder check, every 5 minutes** — "30 min before close: has this worker answered?" → NO → "One reminder push. Never repeated."

**C · After the poll closes** *(Incharge on mobile · HR on web)* — badge teal
1. Pill: Poll closed. Roster is final.
2. Decision: What did each worker say?
3. Three-way branch (3 mini columns):
   - `Coming` (green chip) → "Counted in the shift's manpower."
   - `Not coming` (red chip) → "Incharge arranges a replacement before the line starts."
   - `No response` (amber chip) → teal filled card "HR follows up by phone."
4. Box (`#F1F6F8` bg, `#C9DCE3` border): **HR follow-up, tracked per worker with a note** — `Pending` (amber) → `Contacted` (white) → stacked `Confirmed coming` (green) / `Confirmed not coming` (red)
5. Action: HR marks attendance where needed — sets the final Yes / No after the call
6. Pill: Reports: per-poll Excel / PDF, manpower, daily shifts

### SECTION 6 — The two apps (2 panels side by side)

**Left panel — Mobile app** (eyebrow `MOBILE APP · WORKERS & INCHARGES`)
- Top flow row: [App opens] → [Finds the server — scans factory Wi-Fi, remembers it] → [Sign in — Employee ID + password, stays signed in] → decision [Which role?]
- Row **WORKER** (violet pill) — 3 simple phone frames (220 × 400, 2 px ink outline, radius 34, **no fake status bar**):
  - *Live poll*: violet hero card "NEXT SHIFT · Tomorrow · Shift D 8 AM – 8 PM · Closes 7:00 AM", green "Yes, coming" button, soft red "No" button
  - *History*: 7-column calendar of small green/red/grey squares + 2 rows "Mon 22 Sep · Coming", "Sun 21 Sep · Not coming"
  - *Profile*: rows Plant, Shift, Notifications On, Theme, red "Log out"
- Row **INCHARGE** (blue pill) — 4 phone frames:
  - *Dashboard* (violet live card with 3 count tiles Yes / No / Pending) → arrow → *Poll detail* (filter chips All / Coming / No / Pending, 3 roster rows, dark "Close poll early" button)
  - *Team* (worker rows with shift chips, one red "No token" chip, violet "+ Add worker")
  - *Profile* (role, theme, log out)
- Use placeholder names like `[Worker name]` and `[count]` instead of real data.

**Right panel — HR web console** (eyebrow `HR WEB CONSOLE · ALL PLANTS`)
- Top flow row: [Open in browser / install as app] → [Sign in — work email + password] → [Lands on Dashboard] → teal soft card [Live everywhere — no refresh]
- Left: dark sidebar mock (`#0F1C22` bg, `#CADEE7` text, active item `#1F3943`): Dashboard · Live Board · Attendance · Workforce · Reports · Notification Demo · Settings
- Right: grid of 7 small cards:
  1. **Dashboard** — Active polls now, plant overview, recently closed
  2. **Live Board** — Every open poll updating live; mark attendance from the roster (+3 status chips)
  3. **Attendance** (teal filled, highlighted) — Closed polls → detail: roster, response rate, follow-up + note, mark attendance, export Excel/PDF
  4. **Workforce** — Workers & incharges, shift, equipment/process, notification status; add, edit, deactivate, bulk Excel import
  5. **Reports** — Per-poll exports, bulk manpower (date range), daily shift report (`.xlsx` `.pdf` chips)
  6. **Notification Demo** — Send a test push to check phones
  7. **Settings** — Password, manage plants, manage HR logins (admins only)
- Bottom teal strip: **A typical HR morning** — 6:00 Opens Live Board → 7:00 Poll closes, opens Attendance → 7:05 Calls non-responders → 7:30 Marks attendance → 7:45 Exports & shares with production

### SECTION 7 — Under the hood (full-width architecture strip)

Three columns connected by double-headed arrows:
- **Clients** — Mobile app (Expo React Native, Android APK; finds server on factory Wi-Fi, port 5000) · HR web console (React + Vite, installable PWA)
- Arrow label: `REST API + live socket`
- **Server — Node.js + Express** (dark ink block): Security gate (login tokens, role checks, rate limits, validation) · Worker API · Incharge API · HR API · violet tiles "Poll automation — every 60 s" and "Reminder check — every 5 min" · Realtime (Socket.IO) · Exports (Excel / PDF)
- Arrow label: `reads / writes · sends push`
- **Data & delivery** — PostgreSQL (via Prisma) · Push: Expo → Google FCM → worker's phone

Under it, a row of 4 small safeguard chips: **No duplicate polls** · **Reminders sent once** · **Health checks** · **Stays signed in on phones**

### SECTION 8 — Footer

Thin divider, then left: `FlexiTrack · TPI` (mono), right: `Shifts: A 8 AM–4 PM · B 4 PM–12 AM · C 12 AM–8 AM · D 8 AM–8 PM · E 8 PM–8 AM` as small chips (D and E in violet soft = 12-hour contract; A–C white = 8-hour general).

---

### Quality rules

- Everything fits inside the 2400 × 4200 artboard; if it's tight, make the artboard taller rather than clipping.
- Text contrast at least 4.5:1. Never put white text on the soft colors.
- Green/red/amber are **only** for attendance answers. Role colors are for people/systems.
- All arrows are the same gray `#8A8799`, 2 px, rounded, with open arrowheads.
- Keep copy exactly as written above; no lorem ipsum, no invented numbers.
- Use flex/grid layout with gaps. Keep all text editable (no text as images).
