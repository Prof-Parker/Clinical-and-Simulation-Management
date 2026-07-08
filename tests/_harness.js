/**
 * Vitest test helpers — re-exports core modules formerly loaded via vm harness.
 */

export * as DataModel from '../src/core/data-model/index.js';
export * as CalendarEngine from '../src/core/calendar-engine.js';
export * as RosterBalance from '../src/core/roster-balance.js';
export * as Orientation from '../src/core/orientation.js';
export * as ClinicalSites from '../src/core/clinical-sites.js';
export * as Scheduler from '../src/core/scheduler/index.js';
export * as Validator from '../src/core/validator.js';
export * as Feasibility from '../src/core/feasibility.js';
export * as ScheduleStatus from '../src/core/schedule-status.js';
export * as MakeupDisplay from '../src/core/makeup-display.js';
export * as ProposalFormat from '../src/proposals/proposal-format.js';
export * as Proposals from '../src/proposals/proposals.js';
export * as SetupDraft from '../src/proposals/setup-draft.js';
export * as AuditSnapshot from '../src/audit/audit-snapshot.js';
export * as AuditExport from '../src/audit/audit-export.js';
export * as DashboardExport from '../src/export/dashboard-export.js';
export * as UserTemplate from '../src/auth/user-template.js';
export * as UserData from '../src/auth/user-data.js';
export * as UserSession from '../src/auth/user-session.js';
export * as UserDirectory from '../src/storage/user-directory.js';
export * as SimFacultyStorage from '../src/storage/sim-faculty-storage.js';
export * as SimFacultyData from '../src/auth/sim-faculty-data.js';
export * as SiteLibrary from '../src/core/clinical-sites-library.js';
export * as Audit from '../src/audit/audit.js';
export * as CourseDefaults from '../src/core/course-defaults.js';
