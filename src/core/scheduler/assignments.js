/**
 * Student group and facility assignment helpers for schedule generation.
 */

import {
  emptySchedule,
  getClinicalGroups,
  getSimGroups
} from '../data-model/index.js';
import * as RosterBalance from '../roster-balance.js';
import * as ClinicalSites from '../clinical-sites.js';

export function assignSimGroups(students, config) {
  var clinicalGroups = getClinicalGroups(config);
  var simGroups = getSimGroups(config);
  if (RosterBalance) {
    var forceAlign = RosterBalance.shouldForceClinicalSimAlignment(clinicalGroups, simGroups);
    RosterBalance.assignSimGroupsByClinicalCohort(
      students, clinicalGroups, simGroups, { force: forceAlign }
    );
    return;
  }
  students.forEach(function (s, i) {
    if (!s.simGroup) s.simGroup = simGroups[i % simGroups.length];
  });
}

export function assignFacilities(students, facilities, config) {
  if (!facilities.length) return;
  students.forEach(function (s, i) {
    if (s.facilityId) return;
    if (config && ClinicalSites) {
      var pseudo = { config: config, facilities: facilities };
      var primary = ClinicalSites.getPrimaryGroupFacility(pseudo, s.clinicalGroup);
      if (primary) {
        s.facilityId = primary;
        return;
      }
    }
    s.facilityId = facilities[i % facilities.length].id;
  });
}

export function clearSchedules(students) {
  students.forEach(function (s) {
    s.schedule = emptySchedule();
  });
}

export function markInactiveWeeks(data) {
  if (!data || !data.students || !data.calendar || !data.calendar.weeks) return;
  data.students.forEach(function (s) {
    if (!s || !s.schedule) return;
    data.calendar.weeks.forEach(function (w, i) {
      if (w && w.inactive && s.schedule[i]) {
        s.schedule[i].inactive = true;
      }
    });
  });
}

export function assignClinicalCellFacility(data, student, cell, weekIndex, ordinalIndex) {
  if (!ClinicalSites) return;
  var facId = ClinicalSites.resolveFacilityForWeek(
    data, student.clinicalGroup, weekIndex, ordinalIndex
  );
  if (facId) cell.facilityId = facId;
}
