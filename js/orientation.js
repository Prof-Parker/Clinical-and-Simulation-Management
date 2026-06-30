/* global App */
var App = App || {};

App.Orientation = (function () {
  var KNOWN_INITIALS = {
    'shasta regional medical center': 'SRMC',
    'saint elizabeth': 'SE',
    'cal vet': 'CV',
    'california veterans home': 'CV'
  };

  var SKIP_WORDS = { of: true, the: true, and: true, at: true, for: true };

  function normalizeName(name) {
    return String(name || '')
      .trim()
      .toLowerCase()
      .replace(/['']/g, '')
      .replace(/\s+/g, ' ');
  }

  function facilityInitials(data, facilityId) {
    var fac = App.DataModel.findFacilityById(data, facilityId);
    if (!fac || !fac.name) return 'OR';
    var key = normalizeName(fac.name);
    if (KNOWN_INITIALS[key]) return KNOWN_INITIALS[key];
    var words = key.split(' ').filter(function (w) { return w && !SKIP_WORDS[w]; });
    if (!words.length) return 'OR';
    var initials = words.map(function (w) { return w.charAt(0).toUpperCase(); }).join('');
    return initials.slice(0, 4) || 'OR';
  }

  function getGroupOrientations(data, clinicalGroup) {
    if (!data || !data.orientations || !clinicalGroup) return [];
    return data.orientations.filter(function (o) {
      return o && o.clinicalGroup === clinicalGroup;
    });
  }

  function getGroupOrientation(data, clinicalGroup, facilityId) {
    var list = getGroupOrientations(data, clinicalGroup);
    if (!list.length) return null;
    if (facilityId) {
      return list.find(function (o) {
        return App.DataModel.sameFacilitySite(data, o.facilityId, facilityId);
      }) || null;
    }
    return list[0];
  }

  function getOrientationForWeek(data, student, weekIndex) {
    if (!data || !student || weekIndex == null) return null;
    if (student.orientationWeekIndex != null && student.orientationWeekIndex >= 0) {
      if (student.orientationWeekIndex !== weekIndex) return null;
      return getGroupOrientation(data, student.clinicalGroup) || null;
    }
    var list = getGroupOrientations(data, student.clinicalGroup);
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (!o || !o.date) continue;
      if (!data.calendar || !data.calendar.weeks || !data.calendar.weeks.length) {
        App.CalendarEngine.rebuildWeeks(data);
      }
      if (App.CalendarEngine.getWeekIndexForDate(data, o.date) === weekIndex) return o;
    }
    return null;
  }

  function getOrientationFacilityId(data, student) {
    var groupOrient = getGroupOrientation(data, student.clinicalGroup);
    if (groupOrient && groupOrient.facilityId) return groupOrient.facilityId;
    if (App.ClinicalSites) {
      var primary = App.ClinicalSites.getPrimaryGroupFacility(data, student.clinicalGroup);
      if (primary) return primary;
    }
    return student.facilityId || null;
  }

  function getOrientationWeeksForStudent(data, student) {
    if (!data || !student) return [];
    if (student.orientationWeekIndex != null && student.orientationWeekIndex >= 0) {
      return [student.orientationWeekIndex];
    }
    var weeks = [];
    getGroupOrientations(data, student.clinicalGroup).forEach(function (o) {
      if (!o || !o.date) return;
      if (!data.calendar || !data.calendar.weeks || !data.calendar.weeks.length) {
        App.CalendarEngine.rebuildWeeks(data);
      }
      var wi = App.CalendarEngine.getWeekIndexForDate(data, o.date);
      if (wi >= 0 && weeks.indexOf(wi) < 0) weeks.push(wi);
    });
    return weeks;
  }

  function getEffectiveOrientationWeekIndex(data, student) {
    var weeks = getOrientationWeeksForStudent(data, student);
    return weeks.length ? weeks[0] : -1;
  }

  function isOrientationWeek(data, student, weekIndex) {
    return !!getOrientationForWeek(data, student, weekIndex);
  }

  function getOrientationLabel(data, student, weekIndex) {
    var orient = weekIndex != null ? getOrientationForWeek(data, student, weekIndex) : null;
    var facilityId = orient && orient.facilityId
      ? orient.facilityId
      : getOrientationFacilityId(data, student);
    return 'Orient ' + facilityInitials(data, facilityId);
  }

  function orientationLabelForExport(data, student, weekIndex) {
    if (!isOrientationWeek(data, student, weekIndex)) return '';
    return getOrientationLabel(data, student, weekIndex);
  }

  function weekHasOrientationConflict(data, student, weekIndex) {
    if (!isOrientationWeek(data, student, weekIndex)) return false;
    var cell = student.schedule && student.schedule[weekIndex];
    if (!cell || cell.inactive) return false;
    return !!(cell.clinical || cell.sim || cell.makeupClinical);
  }

  function findOrientationConflicts(data) {
    var violations = [];
    if (!data || !data.students) return violations;
    data.students.forEach(function (student) {
      getOrientationWeeksForStudent(data, student).forEach(function (orientWeek) {
        if (!weekHasOrientationConflict(data, student, orientWeek)) return;
        violations.push({
          studentId: student.id,
          studentName: student.name,
          week: orientWeek + 1,
          message: (student.name || 'Student') +
            ': orientation day conflicts with clinical/sim on week ' + (orientWeek + 1) +
            ' — reassign in Master Schedule.'
        });
      });
    });
    return violations;
  }

  return {
    facilityInitials: facilityInitials,
    getGroupOrientations: getGroupOrientations,
    getGroupOrientation: getGroupOrientation,
    getOrientationForWeek: getOrientationForWeek,
    getOrientationFacilityId: getOrientationFacilityId,
    getOrientationWeeksForStudent: getOrientationWeeksForStudent,
    getEffectiveOrientationWeekIndex: getEffectiveOrientationWeekIndex,
    isOrientationWeek: isOrientationWeek,
    getOrientationLabel: getOrientationLabel,
    orientationLabelForExport: orientationLabelForExport,
    weekHasOrientationConflict: weekHasOrientationConflict,
    findOrientationConflicts: findOrientationConflicts
  };
})();
