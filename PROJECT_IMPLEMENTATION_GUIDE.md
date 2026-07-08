# Project implementation guide

This document summarizes the **Clinical & Simulation Management** app for engineers and agents implementing or extending behavior described in [`000_sim_clinical_tracker.md`](000_sim_clinical_tracker.md) (product scope) and [`Scheduling_rules.md`](Scheduling_rules.md) (scheduling contract). For install, FERPA, and deployment, see [`README.md`](README.md).

---

## 1. What the app does

A **browser-only PWA** (no Microsoft API calls) that:

- Schedules up to **30 students** across **18 weeks** (including break/holiday weeks).
- Tracks **10 clinical days** and **5 simulation days** per student (configurable).
- Assigns students to **clinical groups** (fixed weekday + facility), **simulation groups** (alternating-week pattern), and **registrar sections** (independent of clinical/sim groups).
- Generates and validates schedules, supports **makeup** placement, **role assignments**, **performance flags**, printing, and JSON import/export via **OneDrive** or local files.

**Authoritative scheduling behavior** is defined in [`Scheduling_rules.md`](Scheduling_rules.md). Product features and layout are defined in [`000_sim_clinical_tracker.md`](000_sim_clinical_tracker.md). When code and docs disagree, align code to `Scheduling_rules.md` unless the product scope explicitly overrides.

---

## 2. Architecture (Vite + ES modules)

```
index.html → src/main.js
├── css/                         UI + print styles (imported by main.js)
├── src/
│   ├── core/state.js            Reactive state, getData/setData, notifyChange
│   ├── core/data-model/         Schema, defaults, migration, student/semester shapes
│   ├── core/scheduler/          Clinical + sim generation, makeup slots
│   ├── core/calendar-engine.js  18-week calendar, holidays, inactive weeks
│   ├── core/course-defaults.js  Per-course default config templates
│   ├── core/clinical-sites-library.js  Program-wide site catalog
│   ├── storage/semester-storage.js     Semester JSON: IDB + File System Access
│   ├── auth/permissions.js      Tab/menu/action gating
│   ├── ui/chrome.js             Tab router, menus, semester switch
│   ├── ui/dialogs.js            Modal alert/confirm/custom dialogs
│   └── ui/                      Dashboard, setup, roles, makeup, audit, etc.
├── public/                      Icons + PWA manifest (copied to dist/)
└── tests/                       Vitest (imports from src/)
```

Each `src/**/*.js` module is capped at **500 lines** and starts with a brief header comment describing its purpose.

**Runtime model:** `state.fileRoot` holds all semesters; `getData()` returns the active semester. UI modules call `notifyChange()` (semester file) or `notifySimFacultyChange()` (faculty file).

**Boot order:** `UserSession.init()` → `semester-storage.init()` → `clinical-sites-library-storage.init()` → `sim-faculty-storage.init()` → `initUI()`. Until the user session validates, `#userGateModal` blocks the app shell.

**Local testing:** `npm test` runs Vitest. `node scripts/seed-mock-onedrive.js` creates gitignored `mock-onedrive/` fixtures. See [docs/MOCK_ONEDRIVE.md](docs/MOCK_ONEDRIVE.md).

**Role gating:** `Permissions.canTab()` / `canAction()` combined with `Audit.canEdit()` via `Permissions.guardEditable()`. Spec: [docs/Design Docs/User_roles_design.md](docs/Design%20Docs/User_roles_design.md).

---

## 3. Data files (FERPA split)

| File | Typical name | Contents |
|------|----------------|----------|
| **User file** | `*.user.json` | userId, name, email, key (tamper deterrence) |
| **Users registry** | `users-registry.json` | Authoritative roles + key hashes |
| **Clinical sites library** | `clinical-sites-library.json` | Program-wide site catalog |
| **Playground** | `user_{token}_playground.json` | Isolated semester experiments |
| **Semester file** | `{S\|F}{year}_{courseId}.json` (e.g. `F2026_REGN15P.json`); legacy `regn-tracker.json` | Roster, schedule, config, calendar, facilities, faculty, audit meta, **proposals** — **no sim roles** |
| **Sim faculty file** | `{S\|F}{year}_{courseId}_Faculty.json` (e.g. `F2026_REGN15P_Faculty.json`); legacy `regn-tracker-sim-faculty.json` | Role assignments (Primary/Secondary/Evaluator/Scribe) + performance flags (Strong/Weaker) |
| **Audit PDF** | `{Season}-{Year}-{courseId}-Audit-v{n}.pdf` (e.g. `Fall-2026-REGN15P-Audit-v1.pdf`) | Signed end-of-semester audit record (official record after closeout) |

Course-aware names are suggested automatically when `meta.courseId` and semester season/year are set (header course dropdown / Setup); legacy names still load and migrate. Schedulers can use only the semester file. The sim faculty team connects both. On load, embedded `semester.roles` (legacy) migrate into the faculty file and are stripped from the master export. Sim role edits remain allowed after audit export/lock — the audit lifecycle covers the semester file only (see [docs/AUDIT_TRACKING_IMPLEMENTATION.md](docs/AUDIT_TRACKING_IMPLEMENTATION.md)).

### Semester file shape (simplified)

```json
{
  "meta": { "fileVersion": 2, "activeSemesterId": "…", "schedulingDefaults": { } },
  "semesters": [{
    "id": "…",
    "meta": { "semesterName": "Spring 2026", "finalized": false },
    "config": { "clinicalDaysRequired": 10, "simDaysRequired": 5, "simDays": ["Mon","Tue"], … },
    "calendar": { "semesterStartDate": "2026-01-01", "weeks": [ ] },
    "holidays": [ ],
    "facilities": [ ],
    "faculty": [ ],
    "sections": [ ],
    "students": [{
      "id": "…", "name": "…", "clinicalGroup": "C1", "simGroup": "SG1",
      "facilityId": "…", "section": "…",
      "schedule": [ /* 18 cells */ ],
      "absences": [ ], "makeups": [ ]
    }]
  }]
}
```

### Schedule cell (`js/data-model.js` → `emptyCell()`)

| Field | Meaning |
|-------|---------|
| `clinical` | Scheduled clinical that week |
| `clinicalMissed` | Clinical missed due to sim priority conflict |
| `sim` | Sim scenario number 1–5 |
| `simDay` | `Mon` / `Tue` (or other configured sim weekday) |
| `simGuestGroup` | Host sim group when attending as guest |
| `simOverload` | Joined session above normal cap |
| `simMakeup` | Sim placed as makeup (not initial generation) |
| `makeupClinical` | Makeup clinical day |
| `inactive` | Holiday/break week |
| `facilityId` | Optional clinical site for that week (multi-site groups) |

### Sim faculty file shape

Keyed by `semesterId` → `studentId` → `{ flags: { primary, secondary }, "1": { iter1…iter4 }, … }`. See `js/sim-faculty-data.js`.

---

## 4. Default domain model (configurable)

From `js/data-model.js` `defaultConfig()`:

| Concept | Default |
|---------|---------|
| Clinical groups | C1–C5 on Sat / Mon / Mon / Mon / Tue |
| Sim groups | SG1–SG4; primary weekday + even/odd pattern per group (`simGroupDays`, `simGroupPattern` in Setup) |
| Sim weekdays | Mon, Tue (program-wide `simDays` list) |
| Clinical start | Week 5 (Saturday for C1) |
| Sim start | Week 5 (program blocks); drives `getSimWeekPatterns()` |
| Caps | 6/clinical group (7 overload), 8/sim session (9 overload) — session cap is program-wide per weekday |
| Makeup headroom | `simMakeupHeadroomReserved: 1` (soft preference during initial gen) |
| Makeup target weeks | Optional `clinicalMakeupPrimaryWeek`, `clinicalMakeupFallbackWeek`, `simMakeupLastResortWeek`; blank = last active weeks via `CalendarEngine.resolveMakeupWeeks()` |

**Facilities:** Students attend clinical at the site assigned per week (`cell.facilityId`). Multi-site groups may use **round-robin** (default) or optional **`clinicalGroupSiteWeeks`** ranges (facility + start/end week index). `student.facilityId` holds the primary/home site.

**Sim group patterns** (`js/scheduler.js` → `getSimGroupSchedule()` reading semester config):

- Each sim group: primary weekday from `simGroupDays`, even/odd block weeks from `simGroupPattern` and `simStartWeek`
- Default SG1/SG2: even pattern; SG3/SG4: odd pattern (Mon/Tue respectively)
- When clinical and sim group **counts match**, `regenerateAll()` forces C*n*→SG*n* alignment

Program calendar pairs even+odd weeks into **sim blocks** (Sim 1 = weeks 5–6, Sim 2 = 7–8, …) via `buildProgramSimCalendar()`.

---

## 5. Scheduling pipeline

`App.Scheduler.regenerateAll(data)` runs in order:

1. **Calendar** — `App.CalendarEngine.rebuildWeeks`; mark inactive weeks.
2. **Assignments** — sim groups (`roster-balance.js`; force C*n*→SG*n* when group counts match), facilities.
3. **Clear** schedules and sim makeup records.
4. **Program sim calendar** — `buildProgramSimCalendar` → `data._simCalendar` (block weeks per scenario).
5. **Clinical** — `scheduleClinicalForStudent` per student from `clinicalStartWeek` on group weekday.
6. **Simulations** — `scheduleSimsForAllStudents` with placement tiers (below).
7. **Conflict makeups** — clinical missed for sim → primary/fallback makeup weeks (`resolveMakeupWeeks`); same facility.
8. **Other makeups** — `scheduleMissedMakeups` for absence-driven gaps.

Single-student regen: `regenerateStudent()` clears that student’s sims and re-runs sim + makeup steps.

### Sim placement priority (`Scheduling_rules.md` → `buildSimPlacementCandidates` / `tryPlaceSim`)

1. Primary pattern week + weekday for student’s sim group  
2. Alternate sim weekday in same block week  
3. Alternate week in same program block  
4. **Guest** in another sim group (prefer lighter sessions)  
5. **Overload** join (only when normal/headroom exhausted; flagged `simOverload`)  
6. **Week 18** last resort (only after calendar exhausted for that scenario)

**Session load balancing** (same tier tie-breaks):

- **A** — Prefer lowest attendance for that scenario on `(week, day)`.
- **B** — Guest slots sorted ascending by session count.
- **C** — Soft headroom: defer overload while block has capacity below `normal - simMakeupHeadroomReserved`; may still fill to normal cap to place all students.
- **D** — If clinical weekday ∈ `simDays`, route to non-overlapping sim day when no same-week clinical conflict.

**Conflict rules:** Sim wins over clinical on same weekday; at most **one** sim/clinical weekday conflict per student per semester; conflict makeup clinical is tier “conflict” (orange in UI).

### Makeup finder (`findMakeupSlots` / `applyMakeupSlot`)

- **Sim makeup:** Join existing session with same scenario number (weeks 1–17); overload only when session at normal cap.
- **Clinical makeup:** Join existing clinical at student’s facility when possible; week 18 last resort.
- Manual makeup does **not** apply headroom reserve.

---

## 6. Validation and feasibility

| Module | When | Purpose |
|--------|------|---------|
| `js/feasibility.js` | Setup / config change | Pre-check: roster vs caps, slot counts, holidays, headroom config |
| `js/schedule-status.js` | Setup panel | Post-generation tier: green / yellow / red |
| `js/validator.js` | Dashboard render | Per-student counts, sim order, double-booking, session caps, conflict makeup rules |

**Setup schedule status tiers** (`js/schedule-status.js`):

| Tier | Meaning |
|------|---------|
| Green | All students meet clinical + sim requirements; no substitutions or makeups |
| Yellow | All students complete; substitutions (non-primary sim, guest, overload) and/or makeups used |
| Red | Students incomplete after generation, or blocking pre-generation config issues |

Clinical/sim weekday overlap is **informational** in `feasibility.js` (not a generation failure when schedules complete).

Tests in `tests/scheduling-rules.test.js` assert program calendar, guest spread, week-18 defer, load balance, headroom, and overlap routing against `Scheduling_rules.md`. `tests/schedule-status.test.js` covers the setup tiers.

---

## 7. UI map (`000_sim_clinical_tracker.md` → code)

| Feature | Tab / area | Module |
|---------|------------|--------|
| Master calendar + filters | Dashboard | `js/ui/dashboard.js` |
| Sim progression table (guest cells highlighted) | Dashboard | `dashboard.js` → `renderSimTable` |
| Student calendar + print | Student View | `js/ui/student-view.js` |
| Simulation roles + flags | Simulation Roles | `js/ui/sim-roles.js` + sim faculty storage |
| Makeup search | Makeup Finder | `js/ui/makeup-finder.js` |
| Audit lifecycle, attestation, audit PDF | Audit | `js/ui/audit-closeout.js`, `js/audit.js`, `js/audit-export.js` |
| Roster, holidays, facilities, rebalance | Setup | `js/ui/setup.js`, `setup-config.js` |
| Advanced caps / days / headroom / site library | Setup → Advanced | `js/ui/setup-config.js` |
| Course selection | Header dropdown | `js/main.js`, `js/course-defaults.js` |
| Semester add/switch | Header picker | `js/main.js`, `js/ui/config-modal.js` |
| Dark mode | Menu | `App.UI.toggleDarkMode` |

**Sim Roles tab** is disabled until a sim faculty file is connected. Role edits save only to `regn-tracker-sim-faculty.json`.

---

## 8. Configuration contract

From `000_sim_clinical_tracker.md` **Scheduling adjustment configuration**:

- `clinicalDaysRequired`, `simDaysRequired`
- `clinicalGroups`, `clinicalGroupDays`, `simGroups`, `simDays`
- `maxStudents`, `maxPerClinicalGroup`, `maxStudentsPerSimSession`, overload caps
- `clinicalStartWeek`, `simStartWeek`
- `simMakeupHeadroomReserved`

**Requirement:** Changing config must still allow placing all students for the new required day counts (`feasibility.js` + `regenerateAll`). Setup shows warnings when generation is likely impossible.

---

## 9. Testing

```bash
node tests/scheduling-rules.test.js   # Scheduling_rules.md contract (~2400+ assertions)
node tests/roster-balance.test.js     # Sim group assignment balance
node tests/sim-faculty-storage.test.js # Roles strip/migrate from semester file
```

Harness: `tests/_harness.js` loads core JS via Node `vm` (no DOM).

---

## 10. Implementation checklist for agents

When changing scheduling behavior:

1. Read [`Scheduling_rules.md`](Scheduling_rules.md) for the intended rule.
2. Implement in [`js/scheduler.js`](js/scheduler.js) (placement, makeups, calendar).
3. Mirror constraints in [`js/validator.js`](js/validator.js) if user-visible.
4. Add pre-checks to [`js/feasibility.js`](js/feasibility.js) if config-dependent.
5. Add assertions to [`tests/scheduling-rules.test.js`](tests/scheduling-rules.test.js).
6. Keep rules **config-agnostic** in docs (no hardcoded “C2 → Tuesday” in `Scheduling_rules.md`).

When changing data shape:

- Bump / migrate in `js/data-model.js` (`migrateFile`, `migrateSemester`).
- Semester export must **never** include `roles` (`storage.js` → `serialize` + `SimFacultyData.cloneFileRootWithoutRoles`).

When changing sim faculty data:

- `js/sim-faculty-data.js` (schema), `js/sim-faculty-storage.js` (persistence), `js/ui/sim-roles.js` (UI).

**Do not** commit real student JSON to git (see `README.md` FERPA section).

When implementing audit / closeout:

- Read [docs/AUDIT_TRACKING_IMPLEMENTATION.md](docs/AUDIT_TRACKING_IMPLEMENTATION.md) for schema, UI, and phases.
- Process SOP for staff: [docs/AUDIT_TRACKING_OPERATIONS.md](docs/AUDIT_TRACKING_OPERATIONS.md).
- Workflow diagram: [audit_tracking_workflow.md](audit_tracking_workflow.md).

---

## 11. Related files

| Document | Role |
|----------|------|
| [`000_sim_clinical_tracker.md`](000_sim_clinical_tracker.md) | Product scope, features, layout |
| [`Scheduling_rules.md`](Scheduling_rules.md) | Scheduling algorithm contract |
| [`README.md`](README.md) | Install, OneDrive workflow, Pages deploy |
| [`TODO.md`](TODO.md) | Maintainer task list |
| [`audit_tracking_workflow.md`](audit_tracking_workflow.md) | Audit closeout process diagram |
| [`docs/AUDIT_TRACKING_IMPLEMENTATION.md`](docs/AUDIT_TRACKING_IMPLEMENTATION.md) | Audit feature technical spec |
| [`docs/AUDIT_TRACKING_OPERATIONS.md`](docs/AUDIT_TRACKING_OPERATIONS.md) | Audit closeout SOP for staff |

---

## 12. High-level scheduling flow (diagram)

```mermaid
flowchart TD
  subgraph inputs [Inputs]
    Config[semester.config]
    Calendar[calendar + holidays]
    Roster[students + groups + facilities]
  end

  subgraph gen [regenerateAll]
    Clin[scheduleClinicalForStudent]
    ProgCal[buildProgramSimCalendar]
    Sims[scheduleSimsForAllStudents]
    ConflictMU[scheduleConflictClinicalMakeups]
    OtherMU[scheduleMissedMakeups]
  end

  subgraph outputs [Outputs]
    Schedule[student.schedule 18 weeks]
    Makeups[student.makeups metadata]
    Validate[Validator + Dashboard]
  end

  Config --> Clin
  Calendar --> Clin
  Roster --> Clin
  Config --> ProgCal
  Calendar --> ProgCal
  ProgCal --> Sims
  Roster --> Sims
  Sims --> ConflictMU
  ConflictMU --> OtherMU
  OtherMU --> Schedule
  OtherMU --> Makeups
  Schedule --> Validate
```

This guide is the entry point for understanding **what** the project implements and **where** the logic lives relative to the two specification documents.
