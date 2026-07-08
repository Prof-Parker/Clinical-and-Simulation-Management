# Project Scope

**Shasta College ADN Course Manager** — a lightweight browser-based PWA for managing ADN program clinical + simulation scheduling, multi-user semester workflows, and audit closeout.

- Browser-only app with no Microsoft API calls.
- Real semester and program data lives in OneDrive-managed JSON files (import/export and desktop file-handle workflows).
- One semester file per course per term (for example `F2026_REGN15P.json`); REGN35P and REGN36P share one file (`REGN35P-36P`).
- Supports multiple courses: REGN15P, REGN25P, REGN35P-36P, REGN48P.
- App requires a validated user session (`user.json` + `users-registry.json`) before use; role controls UX only — OneDrive permissions enforce data access.

## Core Scheduling Goals

- Semester is 18 weeks, including break/holiday weeks.
- Supports up to 30 students per semester by default (configurable).
- Students must complete required clinical + simulation days (defaults: 10 clinical, 5 simulation).
- Clinical assignments remain cohort-based and day-based; simulation follows program block sequencing.
- Monday holidays and break weeks are treated as inactive calendar constraints.
- Absences and schedule conflicts support makeup placement and audit traceability.

### Clinical Defaults

- Default clinical groups: C1-C5.
- Default weekdays: Sat, Mon, Mon, Mon, Tue.
- Default start week: Week 5.
- Facilities are site-library backed and can be assigned per group and per week range.

### Simulation Defaults

- 5 simulation days per student (default, configurable).
- 4 simulation groups (SG1-SG4) on alternating block patterns.
- Default simulation days: Mon and Tue.
- Sim progression enforces ordered completion (Sim 1 through Sim 5).

## User Roles and Multi-User Workflow

Standard roles: **Program Engineer**, **Administrative Staff**, **Lead Course Faculty**, **Adjunct Faculty** (simulation and clinical).

- Roles gate tabs, menu items, and edit actions; combined with audit-phase gating for semester data.
- **Admin / Program Engineer** edit semester setup directly and review proposed changes.
- **Lead Course Faculty** save setup drafts and **propose changes**; changes are staged in the semester file until approved.
- **Adjunct Faculty** have read-only dashboard access; edit simulation roles in the semester file (Simulation Roles tab).
- Proposals are stored in `semester.proposals[]` with line-item approve/deny; saves use reload-merge with `meta.revision` to reduce overwrite conflicts.
- Basic tamper deterrence: each `user.json` carries a key validated against `users-registry.json` (not authentication — OneDrive ACLs remain authoritative).

See [docs/Design Docs/User_roles_design.md](docs/Design%20Docs/User_roles_design.md) for full role matrix and workflows.

## Implemented Product Features

### Scheduling and closeout

- Semester setup: students, clinical groups, simulation groups, registrar sections, holidays, breaks, orientations, facilities, faculty.
- Program-level and semester-level configuration, including advanced scheduling caps/overload/headroom.
- Multi-course support with course defaults (JS templates in repo) and course-aware filenames.
- Dashboard master schedule with filtering and Excel export.
- Student calendar view with print/export.
- Simulation roles and performance flags in the semester file (`meta.simRoles`, base64 obfuscated in JSON).
- Makeup finder to identify and apply simulation/clinical makeup opportunities.
- Validation and schedule status indicators (green/yellow/red) for feasibility and completion quality.
- Audit lifecycle tab for closeout phases, lead faculty attestation, audit PDF export, and lock.

### Multi-user and program management

- User gate on launch: load `user.json` and connect `users-registry.json`.
- **Users** tab: create users, assign roles, revoke/reissue keys, download user files.
- **New semester** wizard: shared season/year/dates, batch-create semester JSON per selected course (directory picker where supported).
- Setup **propose / approve / deny** workflow for lead faculty and admin.
- **Playground** tab: copy live semester or course template into an isolated file (`user_{token}_playground.json`) for configuration trials.
- Admin **import playground** and **create course template** export from Setup.
- **Clinical Sites** tab with standalone `clinical-sites-library.json` (program-wide site catalog: name, short name, content tags MS/OB/PEDS/MH).

## Planned / Not Yet Implemented

### Theory course integration *(placeholder)*

- Dedicated scheduling and tracking for theory-course components alongside clinical/simulation terms.
- Adjunct theory faculty workflows (view schedules, limited edits — TBD).
- Shared or linked calendar export for admin, faculty, and students.
- Integration points with semester batch creation and role permissions.
- **Status:** Theory Scheduling tab shows a stub only; no scheduling logic or data files yet.

### Future enhancements (from design backlog)

- Custom role templates beyond the four standard roles.
- Clinical site library proposals (same approve/deny pattern as setup).
- Dashboard item proposals for lead course faculty.
- REGN48P practicum placement assignment logic.

## Audit / Closeout Scope

- Audit phases: setup -> active -> makeup_review -> audit_exported -> locked.
- Setup, makeup, and master calendar edits are blocked in exported/locked phases.
- Lead faculty attestation is required before audit export.
- Audit PDF versioning and snapshot hash support closeout traceability.
- Signed PDF stored in OneDrive repository is the official end-of-semester record.

## Data and File Scope

| File | Pattern | Contents |
|------|---------|----------|
| Semester (working) | `{F\|S}{year}_{courseId}.json` | Roster, schedules, config, proposals, audit metadata, simulation roles (`meta.simRoles`) |
| User profile | `*.user.json` | userId, name, email, key |
| Users registry | `users-registry.json` | Authoritative roles, key hashes, revocation |
| Clinical site library | `clinical-sites-library.json` | Program-wide sites and tags |
| Playground | `user_{token}_playground.json` | Isolated semester experiments |
| Course defaults (OneDrive) | `course-defaults_{courseId}.json` | Exported course templates |
| Audit PDF | `{Season}-{Year}-{courseId}-Audit-v{n}.pdf` | Official signed closeout record |

- Legacy plain `semester.roles` in old semester exports still migrate into `meta.simRoles` on load. Separate `_Faculty.json` files are no longer supported (breaking change, fileVersion 4).
- No real student JSON files are committed to source control; local `mock-onedrive/` folder is gitignored for dev testing (see [docs/MOCK_ONEDRIVE.md](docs/MOCK_ONEDRIVE.md)).

## App Layout (Current)

- **Dashboard:** master calendar and summary views (read-only for adjunct faculty).
- **Student View:** single-student schedule and print.
- **Simulation Roles:** role assignments and flagging.
- **Makeup Finder:** absence/makeup workflows (admin/program engineer; gated by role).
- **Audit:** closeout controls, attestation, export state.
- **Setup:** semester setup, advanced configuration, proposal review, playground import.
- **Playground:** isolated configuration trials (lead faculty, program engineer).
- **Users:** user and registry management (admin, program engineer).
- **Clinical Sites:** program site library editor.
- **Theory Scheduling:** stub tab — integration not implemented.
- **Header:** course/audit status line, user role line, file management menu (hamburger), dark mode. Semester switching via menu when multiple semesters exist in one file.

## Scheduling Adjustment Configuration (Setup Advanced)

- Change required clinical/simulation days.
- Change simulation days and clinical group days.
- Change max students and per-group/per-session caps (including overload limits).
- Change clinical and simulation start weeks.
- Configure simulation makeup headroom reserve.
- Apply settings to future semesters or restore program defaults.
- Lead faculty: **Save draft** and **Propose changes**; admin: direct save and approve/deny pending proposals.

All configuration changes must preserve scheduler behavior so students can still be placed for required clinical/simulation counts under the configured rules.
