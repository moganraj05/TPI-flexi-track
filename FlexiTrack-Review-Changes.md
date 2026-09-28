# FlexiTrack: Manager Review Notes & Next-Phase Changes

| | |
|---|---|
| **Source** | Manager review of the end-to-end system flow |
| **Review date** | 2026-09-24 |
| **Status** | 📝 Planned. Not built yet. Each item needs design sign-off, then build, then testing. |
| **Scope** | Backend (`backend/`), Mobile (`mobile/`), HR web (`webfrontend/`) |

---

## 1. Summary

| # | Change | What it means in one line | Touches | Size (estimate) |
|---|---|---|---|---|
| **CR-1** | Weekly shift rotation | Workers rotate A → B → C → A every week | Backend · Web · Mobile | L |
| **CR-2** | Contract vs Trainee | Separate worker types. The incharge can mark attendance for **contract workers only** | Backend · Mobile · Web | M |
| **CR-3** | Automatic rotation + incharge override | Rotation runs on **Saturday** and takes effect **Monday**. The incharge can keep chosen workers on the same shift | Backend · Mobile · Web | M |
| **CR-4** | Reliability flags & warnings | Flag workers who don't respond for 3–4 days, or who say **Yes** and then don't come | Backend · Mobile · Web | L |
| **CR-5** | Alternate worker allocation | When a slot is empty, automatically find and send a free worker with the right skill | Backend · Mobile · Web | XL |

Suggested build order: **CR-2 → CR-1 + CR-3 → CR-4 → CR-5.** Each step builds on the data the one before it adds.

---

## 2. What exists today (baseline)

These are the parts of the current code that each change builds on:

- **Shifts** come from a fixed catalog in `backend/src/config/shiftCatalog.js`. **A** runs 8 AM–4 PM, **B** 4 PM–12 AM and **C** 12 AM–8 AM (8-hour, "general"). **D** runs 8 AM–8 PM and **E** 8 PM–8 AM (12-hour, "contract").
- **A worker's shift** is stored directly on `User` as `shiftStart`, `shiftEnd` and `shiftName`. It only changes when an incharge or HR edits it by hand. There's no history of past shifts.
- **Polls** are grouped by plant + shift times + date, and are created automatically 30 minutes after a shift ends.
- **HR "mark attendance"** (`POST /api/hr/polls/:pollId/attendance`) overwrites the worker's `Response`. Nothing records **who** changed it, or whether the answer came from the worker or from HR.
- **Worker profile** already has `equipment` and `process` fields. These are the starting point for skills (CR-5).
- **Not built yet:** worker type (contract/trainee), actual attendance (present/absent at the gate), manpower targets per shift, and a skills model.

---

## 3. Change details

### CR-1 · Weekly shift rotation

**Manager's ask:** Every worker changes shift every week: A → B, B → C, C → A.

**Proposal**
- **Rotation cycle:** A → B → C → A for the 8-hour general shifts. For the 12-hour shifts, probably D ↔ E (to be confirmed, see §5).
- **New table `ShiftAssignment`:** `userId`, `weekStart` (Monday), `shiftCode`, `source` (`auto` / `incharge` / `hr`), `changedById`, `note`.
  - This keeps a history of every week's shift, and it's how polls know which shift a worker is on for a given date.
- **New per-worker setting `rotates`** (true/false). Some workers may be fixed to one shift permanently.
- **`User.shiftStart` / `shiftEnd` stays as-is.** It becomes "this week's shift" and is copied from `ShiftAssignment` when the week starts.
- **Polls use the new week's shift.** Poll automation looks up the assignment for the **date of the next shift**, not the worker's current shift. This avoids the existing problem where changing a shift mid-window leaves a poll with no workers on it.

**Rules to decide**
- **Rest time.** Moving from C (ends Monday 8 AM) straight into A (starts Monday 8 AM) is back-to-back work. We need a minimum rest rule, or the switch has to happen after the weekly off day.

---

### CR-2 · Contract workers vs trainees

**Manager's ask:** Keep contract workers and trainees separate. The incharge can give attendance on behalf of **contract workers only**.

**Proposal**
- **New field `User.workerType`:** `contract` | `trainee`. Required for every worker.
  - Add it to the bulk-import Excel template and the worker form (mobile and web).
- **New endpoint `POST /api/incharge/polls/:pollId/attendance`.** It's allowed only when:
  - the worker is in the incharge's own plant,
  - `workerType = contract`, and
  - the poll is open, or closed less than *X* hours ago.
- **Trainees must answer for themselves.** The incharge can't mark them.
- **Audit on `Response`:** add `source` (`worker` / `incharge` / `hr`) and `recordedById`.
  - This also fixes today's gap where HR overrides leave no trail.
- **UI:**
  - Contract / Trainee filter and tag on Team (mobile), Workforce (web) and every roster.
  - A "Marked by incharge" badge on answers the worker didn't give.

**Rules to decide**
- **Name clash.** The shift catalog already labels D/E as "contract" shifts. Does "contract worker" mean the same group of people, or not?

---

### CR-3 · Automatic rotation on Saturday, live from Monday, with incharge override

**Manager's ask:** Rotation runs automatically on Saturday and takes effect Monday. After it runs, the incharge can keep selected workers on the same shift.

**Proposal (weekly timeline)**

| When | What happens |
|---|---|
| **Saturday, [time]** | A job creates next week's `ShiftAssignment` rows (`source = auto`) for every worker with `rotates = true` |
| **Saturday → Sunday cutoff** | The incharge sees a **"Next week's shifts"** screen and can keep a worker on the same shift or move them. Each change is saved with `source = incharge` and a note |
| **Sunday cutoff** | The plan locks. Workers get a push: "From Monday your shift is **B · 4 PM – 12 AM**" |
| **Monday** | New shifts go live. Polls follow the new assignment automatically |

- **HR's view:** read-only plan per plant, plus the ability to change it after the cutoff.
- **Audit:** every override records who made it and when.

---

### CR-4 · Reliability flags & warnings

**Manager's ask:**
- Flag a worker who doesn't respond for 3–4 days and send them a warning.
- Also flag a worker who says **Yes** but doesn't come.

**Proposal**
- **Needs actual attendance first.** Today the app only records intent. To catch "said Yes but absent" we need to know who actually turned up.
  - Add an `ActualAttendance` record (`pollId`, `userId`, `present`, `markedById`).
  - The incharge or HR marks present/absent after the shift starts. It could be imported from biometric data later.
- **Flag rules** (all thresholds are settings):

| Flag | Trigger | Action |
|---|---|---|
| 🟡 **No response** | No answer on **3** polls in a row | Warning push to the worker, and the flag appears on the incharge's Team screen |
| 🔴 **No-show** | Answered **Yes**, marked **absent** | Flag, a warning push, and HR is notified |
| ⚫ **Repeat** | **3** flags within 30 days | Goes on HR's review list for a follow-up conversation |
| ✅ **Cleared** | **5** good responses in a row | The flag closes automatically |

- **New table `WorkerFlag`:** `userId`, `type`, `status` (open/resolved), `details`, `resolvedById`, `note`.
- **When checks run:** a job runs after each poll closes and after each attendance mark.
- **Reliability score** per worker, over the last 30 days:
  - % of polls answered
  - % of "Yes" answers kept
  - Shown on Worker detail and used by CR-5.
- **UI:**
  - A warning card on the worker's app.
  - A flag chip on Team and Workforce.
  - A new **"Flagged workers"** list in HR web.

---

### CR-5 · Alternate worker allocation

**Manager's ask:** When a slot is empty, automatically find a free worker with the right skill and send them.

**Proposal**
- **New data:**
  - **`WorkerSkill`** (`userId`, `skill`, `level`). It starts from the existing `equipment` and `process` fields.
  - **`ShiftRequirement`** (`plant`, `shift`, `skill`, `requiredCount`): how many people each station needs.
- **When the matching runs:** as soon as the poll closes (1 hour before the shift), or immediately when someone says **No**.

**Matching algorithm (first version)**

```
gap = required people for (shift, skill) − workers confirmed "Coming"

candidates = workers who:
    are active and in the same plant
    have the matching skill
    are NOT already working that shift, and have had enough rest
    are not trainees (unless the slot allows trainees)

score = skill level × 3  +  reliability score × 2  +  fairness (fewer extra shifts this week)

rank the candidates by score, then offer the slot to the top person
    → push: "Can you cover Shift B at [equipment]?"  [Accept] [Decline]
    → no reply in 15 min, or Decline → offer it to the next person
    → Accept → added to the roster, and the incharge is notified
```

- **Phase 1 (suggest):** the app suggests the top 3 people and the incharge taps to send.
- **Phase 2 (automatic):** the system sends offers on its own, once the rules have been trusted in practice.
- **Dashboards:** a gap counter per shift, e.g. "Need 12, have 10, 2 being filled", on the incharge dashboard and the HR Live Board.

---

## 4. Test plan (per change)

| # | Must-pass tests |
|---|---|
| **CR-1** | • A→B, B→C, C→A are correct for 100+ workers<br>• Workers with `rotates=false` stay put<br>• Polls for Monday use the **new** shift<br>• No worker gets two polls or zero polls around the switch<br>• Rest-gap rule blocks back-to-back shifts<br>• Rerunning the Saturday job creates no duplicates |
| **CR-2** | • Incharge **can** mark a contract worker<br>• Incharge **can't** mark a trainee (403)<br>• Incharge **can't** mark a worker in another plant<br>• `source` and `recordedById` are saved and shown<br>• Bulk import rejects a missing or invalid `workerType` |
| **CR-3** | • Overrides before the cutoff are kept<br>• Overrides after the cutoff are blocked for the incharge but allowed for HR<br>• Workers get the "new shift" push once<br>• Audit trail shows who changed what |
| **CR-4** | • 3 missed polls → exactly one flag and one push<br>• "Yes" + absent → no-show flag<br>• 5 good responses → flag clears<br>• Changing a threshold setting changes the behaviour<br>• An HR override doesn't create a false flag |
| **CR-5** | • Gap is calculated correctly per skill<br>• Only eligible candidates are offered<br>• Decline or timeout moves to the next person<br>• Two gaps never get the same person<br>• Accepting updates the roster live on incharge and HR screens |

Every change also needs its migration tested on a **copy of the production database** before release.

---

## 5. Open questions for the manager

1. **Rotation for D/E:** do the 12-hour D/E shifts also rotate (D ↔ E), or only A/B/C?
2. **Weekly off day:** which day is the weekly off, and what's the minimum rest between shifts when rotating (for example C → A)?
3. **Contract workers vs D/E shifts:** is "contract worker" the same group as the D/E contract shifts?
4. **Other worker types:** are there types besides contract and trainee, such as permanent staff?
5. **Recording actual attendance:** who marks present/absent: the incharge, HR, or a biometric import?
6. **Flag thresholds:** is 3 days of no response right? Should warnings reach the worker only, or also their supervisor?
7. **Alternate workers:** can a worker be sent to **another plant**, and is there a maximum number of extra shifts per week?

---

## 6. Visual board prompt (paste into Claude Design)

> Paste everything below into Claude Design to make **one poster artboard** that shows these review notes visually.

Design **one single poster artboard**, **2400 × 3000 px** landscape-ish portrait, titled **"FlexiTrack: Review Changes, Next Phase"**. It's a static poster for a manager follow-up meeting: big headings, short text, simple diagrams, no paragraphs.

**Style (FlexiTrack brand, use exactly)**
- **Fonts:** Bricolage Grotesque 800 for headings (letter-spacing −0.03em), Figtree 400/600/700 for body, JetBrains Mono 600 for labels and times.
- **Colors:**
  - Background `#F4F4F7`, cards `#FFFFFF` with a 1 px `#E6E5EE` border, radius 24, no shadows.
  - Ink `#15131D`, muted `#6B6879`, arrows `#8A8799`.
  - Brand violet `#5A3FFF` / soft `#ECE8FF`. Incharge blue `#1667B8` / `#DDEFFF`. HR teal `#264653` / `#DCEAF0`. Push orange `#B4541C` / `#FFE8DA`.
  - Status colors are used only for attendance and flags: Good `#0B7A3B` on `#DCF5E5`, Bad `#B42328` on `#FDE3E3`, Warning `#8A5A00` on `#FFF1D4`.
- Inline stroke-SVG icons. No emoji, no gradients, no left-border cards.

**Layout**
- Padding 120 px.
- **Header:**
  - Eyebrow `FLEXITRACK · MANAGER REVIEW · 24 SEP 2026`
  - Title (110 px): **Five changes for the next phase**
  - Subtitle: "Reviewed with management. Planned, to be built and tested."
  - A small status pill on the right: `PLANNED`
- **Summary strip:** 5 numbered pills: CR-1 Shift rotation · CR-2 Contract vs Trainee · CR-3 Rotation override · CR-4 Reliability flags · CR-5 Alternate workers.
- Then **5 large cards** in a 2-column grid; CR-5 spans the full width at the bottom. Each card has a number badge, a title, a one-line "Manager's ask", a **visual**, and 3 short bullets for "How we'll build it".

1. **CR-1 · Weekly shift rotation**
   - **Visual:** a circular cycle of three shift chips, **A (8 AM–4 PM) → B (4 PM–12 AM) → C (12 AM–8 AM) → back to A**, with curved arrows. A small side note: "D ↔ E? to confirm".
   - **Bullets:** Week-by-week shift history · Polls follow the new week's shift · Rest-time rule between shifts.
2. **CR-2 · Contract vs Trainee**
   - **Visual:** two columns.
     - **Contract** (violet tag): a phone showing the incharge marking "Present" with a green tick, labelled "Incharge can mark for them".
     - **Trainee** (blue tag): a lock icon, labelled "Must answer themselves".
   - **Bullets:** New worker type field · Incharge proxy for contract only · Every answer shows who recorded it.
3. **CR-3 · Automatic rotation + override**
   - **Visual:** a horizontal week timeline:
     - **SAT** "Auto-rotate runs" (violet)
     - **SAT → SUN** "Incharge reviews & keeps chosen workers" (blue, with a toggle "Keep same shift")
     - **SUN** "Plan locks · push to workers" (orange bell)
     - **MON** "New shifts live" (green)
   - **Bullets:** Runs on its own every Saturday · Incharge override before the cutoff · Full audit trail.
4. **CR-4 · Reliability flags**
   - **Visual:** an escalation ladder of 4 steps:
     - 🟡 "3 missed polls → warning push" (warning colors)
     - 🔴 "Said Yes, didn't come → no-show flag" (bad colors)
     - ⚫ "3 flags in 30 days → HR review" (ink)
     - ✅ "5 good responses → flag cleared" (good colors)
   - Draw the icons as SVG shapes, not emoji.
   - Include a small gauge labelled "Reliability score · last 30 days".
   - **Bullets:** Needs actual present/absent marking · Thresholds are settings · Flagged workers list for HR.
5. **CR-5 · Alternate worker allocation** (full width)
   - **Visual:** a left-to-right flow:
     1. "Slot empty" (red chip, e.g. "Need 12 · Have 10")
     2. **funnel** "Find candidates", with filter chips: Same plant · Right skill · Free & rested · Not trainee
     3. **ranked list** of 3 candidate rows with score bars, using the score formula "Skill ×3 + Reliability ×2 + Fairness"
     4. phone push "Can you cover Shift B?" with [Accept] [Decline]
     5. branch: Accept → "Added to roster" (green); Decline / 15 min → "Next candidate" (loops back to the ranked list)
   - Under it, two phase pills: **Phase 1 · Suggest top 3 to incharge** → **Phase 2 · Fully automatic**.
- **Bottom strip:** "Build order" arrow row: **CR-2 → CR-1 + CR-3 → CR-4 → CR-5**.
- **Final row:** a card "Open questions" with 7 short items: D/E rotation? · Weekly off day & rest gap? · Contract = D/E shifts? · Other worker types? · Who marks actual attendance? · Flag thresholds? · Cross-plant cover & weekly cap?

**Rules:** keep all text editable, use flex/grid with gaps, text contrast ≥ 4.5:1, make the artboard taller instead of clipping, and use placeholders like `[Worker name]` instead of invented data.
