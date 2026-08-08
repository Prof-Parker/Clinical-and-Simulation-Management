/**
 * Public data-model API — stable surface matching legacy DataModel.
 */

export {
  FILE_VERSION,
  VERSION,
  AUDIT_PHASES,
  ensureAuditMeta,
  migrateSemester,
  migrateFile,
  migrate,
  migrateFromLegacyLocalStorage
} from './migrations.js';

export {
  CLINICAL_GROUPS,
  SIM_GROUPS,
  WEEKDAY_OPTIONS,
  ROLE_OPTIONS,
  defaultConfig,
  normalizeConfig,
  getClinicalGroups,
  getSimGroups,
  getSimDays,
  getSimGroupDay,
  getSimGroupPattern,
  nextClinicalGroupName,
  nextSimGroupName,
  syncSemesterForConfig,
  cloneConfig,
  getSchedulingDefaults,
  setSchedulingDefaults,
  configsMatch,
  applyConfigToSemester,
  getClinicalDayForGroup
} from './config.js';

export {
  uid,
  emptyCell,
  emptySchedule,
  defaultStudentName,
  parseLegacyStudentName,
  syncStudentDisplayName,
  ensureStudentNameParts,
  compareStudentsByName,
  assignDefaultStudentNames,
  nextDefaultStudentName,
  createStudent,
  cellToLegacyString,
  countStats
} from './students.js';

export {
  defaultFacilities,
  getDefaultFacilityIdForClinicalGroup,
  buildDefaultClinicalGroupFacilities,
  migrateClinicalGroupFacilities,
  majorityFacilityIdForCohort,
  normalizeFacilityName,
  findFacilityById,
  getCanonicalFacilityId,
  sameFacilitySite,
  studentAtFacilitySite,
  getUniqueFacilitiesForSelect,
  normalizeFacilities,
  linkFacilitiesToSiteLibrary
} from './facilities.js';

export {
  defaultSections,
  defaultFaculty,
  createDefaultSemester,
  createDefaultFile,
  createNewSemesterFromTemplate,
  getSemesterLabel,
  parseSemesterDisplay,
  buildSemesterName,
  startDateForSeason,
  applySemesterSeasonYear,
  semesterSortKey,
  getFutureSemesters
} from './semester.js';
