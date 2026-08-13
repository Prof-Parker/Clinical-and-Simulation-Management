/**
 * Clinical / sim hour totals bucketed by specialty content tags.
 */

import * as DataModel from './data-model/index.js';
import * as ClinicalSites from './clinical-sites.js';
import * as CourseVisibility from './course-visibility.js';
import {
  resolveClinicalDayHours,
  resolveSimDayHours,
  studentClinicalHours,
  studentSimHours,
  studentOrientationHours
} from './schedule-hours.js';

function emptyByTag() {
  return { MS: 0, OB: 0, PEDS: 0, MH: 0 };
}

function primaryTag(tags) {
  var cleaned = CourseVisibility.normalizeContentTags(tags);
  return cleaned[0] || 'MS';
}

function cellFacilityId(student, cell) {
  return (cell && cell.facilityId) || student.facilityId || null;
}

function facilityTags(semester, facilityId) {
  var fac = DataModel.findFacilityById(semester, facilityId);
  if (!fac) return ['MS'];
  return CourseVisibility.normalizeContentTags(fac.contentTags);
}

/**
 * @returns {{
 *   clinicalHours: number,
 *   simHours: number,
 *   orientationHours: number,
 *   byTag: { MS: number, OB: number, PEDS: number, MH: number },
 *   clinicalByTag: object,
 *   simByTag: object
 * }}
 */
export function studentHoursBySpecialty(student, semester) {
  var clinicalByTag = emptyByTag();
  var simByTag = emptyByTag();
  var clinicalTotal = 0;
  var simTotal = 0;

  (student.schedule || []).forEach(function (cell, wi) {
    if (!cell || cell.inactive) return;
    if ((cell.clinical && !cell.clinicalMissed) || cell.makeupClinical) {
      var facId = cellFacilityId(student, cell);
      if (!facId && ClinicalSites.getStudentFacilityAtWeek) {
        facId = ClinicalSites.getStudentFacilityAtWeek(semester, student, wi);
      }
      var hours = resolveClinicalDayHours(semester, facId);
      clinicalTotal += hours;
      var tag = primaryTag(facilityTags(semester, facId));
      clinicalByTag[tag] = (clinicalByTag[tag] || 0) + hours;
    }
    if (cell.sim) {
      var simH = resolveSimDayHours(semester, cell.sim);
      simTotal += simH;
      var simTag = primaryTag(CourseVisibility.simContentTags(semester, cell.sim));
      simByTag[simTag] = (simByTag[simTag] || 0) + simH;
    }
  });

  function roundMap(map) {
    var out = emptyByTag();
    Object.keys(out).forEach(function (k) {
      out[k] = Math.round((map[k] || 0) * 100) / 100;
    });
    return out;
  }

  var clinMap = roundMap(clinicalByTag);
  var simMap = roundMap(simByTag);
  var byTag = emptyByTag();
  Object.keys(byTag).forEach(function (k) {
    byTag[k] = Math.round(((clinMap[k] || 0) + (simMap[k] || 0)) * 100) / 100;
  });

  return {
    clinicalHours: studentClinicalHours(student, semester),
    simHours: studentSimHours(student, semester),
    orientationHours: studentOrientationHours(student, semester),
    byTag: byTag,
    clinicalByTag: clinMap,
    simByTag: simMap,
    rolledClinicalHours: Math.round(clinicalTotal * 100) / 100,
    rolledSimHours: Math.round(simTotal * 100) / 100
  };
}

export function practicumLabelForClinicalCell(student, semester, weekIndex, cell) {
  var facId = cellFacilityId(student, cell);
  if (!facId && ClinicalSites.getStudentFacilityAtWeek) {
    facId = ClinicalSites.getStudentFacilityAtWeek(semester, student, weekIndex);
  }
  return CourseVisibility.formatCourseBadge(
    CourseVisibility.practicumCourseForContentTags(facilityTags(semester, facId))
  );
}

export function practicumLabelForSimCell(semester, simNum) {
  return CourseVisibility.formatCourseBadge(
    CourseVisibility.simPracticumCourse(semester, simNum)
  );
}
