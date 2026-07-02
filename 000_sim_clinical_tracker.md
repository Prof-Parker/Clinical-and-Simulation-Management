# Project Scope

Lightweight browser-based PWA for managing REGN clinical + simulation scheduling and closeout operations.

- Browser-only app with no Microsoft API calls.
- Real semester data lives in OneDrive-managed JSON files (import/export and desktop file-handle workflows).
- Supports multiple courses and semesters in one working file root.

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

## Implemented Product Features

- Semester setup: students, clinical groups, simulation groups, registrar sections, holidays, breaks, orientations, facilities, faculty.
- Program-level and semester-level configuration, including advanced scheduling caps/overload/headroom.
- Program clinical site library with short names and content tags (MS/OB/PEDS/MH), reused by facilities.
- Multi-course support with course defaults and course-aware filenames (for example `F2026_REGN15P.json`).
- Dashboard master schedule with filtering and Excel export.
- Student calendar view with print/export.
- Simulation roles and performance flags in a separate sim faculty file (`*_Faculty.json`).
- Makeup finder to identify and apply simulation/clinical makeup opportunities.
- Validation and schedule status indicators (green/yellow/red) for feasibility and completion quality.
- Audit lifecycle tab for closeout phases, lead faculty attestation, audit PDF export, and lock.

## Audit / Closeout Scope

- Audit phases: setup -> active -> makeup_review -> audit_exported -> locked.
- Setup, makeup, and master calendar edits are blocked in exported/locked phases.
- Lead faculty attestation is required before audit export.
- Audit PDF versioning and snapshot hash support closeout traceability.
- Signed PDF stored in OneDrive repository is the official end-of-semester record.

## Data and File Scope

- Semester file stores roster, schedules, setup config, facilities, faculty, and audit metadata.
- Sim faculty file stores simulation role assignments and performance flags.
- Legacy combined-role data migrates into the sim faculty file when loaded.
- No student JSON files are committed to source control.

## App Layout (Current)

- Dashboard: master calendar and summary views.
- Student View: single-student schedule and print.
- Simulation Roles: role assignments and flagging.
- Makeup Finder: absence/makeup workflows.
- Audit: closeout controls, attestation, export state.
- Setup: semester setup plus advanced configuration.
- Header: semester switcher, course selector, file management menu, dark mode.

## Scheduling Adjustment Configuration Submenu (Setup Advanced)

- Change required clinical/simulation days.
- Change simulation days and clinical group days.
- Change max students and per-group/per-session caps (including overload limits).
- Change clinical and simulation start weeks.
- Configure simulation makeup headroom reserve.
- Apply settings to future semesters or restore program defaults.

All configuration changes must preserve scheduler behavior so students can still be placed for required clinical/simulation counts under the configured rules.