/**
 * Human-readable proposal diffs.
 */

var SENTINEL = {
    notSet: '(not set)',
    none: '(none)',
    unnamed: '(unnamed)',
    removed: '(removed)',
    added: '(added)',
    complex: '(complex change)',
    unknownSite: '(unknown site)'
  };
  var CONFIG_SCALAR_LABELS = {
    clinicalDaysRequired: 'Required clinical days',
    simDaysRequired: 'Required simulation days',
    maxStudents: 'Max students',
    maxPerClinicalGroup: 'Max per clinical group',
    maxPerClinicalGroupOverload: 'Clinical group overload cap',
    maxStudentsPerSimSession: 'Max students per sim session',
    maxStudentsPerSimSessionOverload: 'Sim session overload cap',
    simMakeupHeadroomReserved: 'Sim makeup headroom (seats reserved)',
    numSimGroups: 'Simulation groups count',
    numClinicalGroups: 'Clinical groups count',
    clinicalStartWeek: 'Clinical start week',
    simStartWeek: 'Simulation start week',
    clinicalMakeupPrimaryWeek: 'Clinical makeup target week',
    clinicalMakeupFallbackWeek: 'Clinical makeup last-resort week',
    simMakeupLastResortWeek: 'Sim makeup last-resort week',
    clinicalGroups: 'Clinical groups list',
    simGroups: 'Simulation groups list',
    simDays: 'Simulation weekdays'
  };
  var META_LABELS = {
    semesterSeason: 'Semester season',
    semesterYear: 'Semester year',
    semesterName: 'Semester name',
    leadFaculty: 'Lead course faculty'
  };
  var CALENDAR_LABELS = {
    semesterStartDate: 'Semester start date'
  };
  var STUDENT_FIELD_LABELS = {
    name: 'name',
    clinicalGroup: 'clinical group',
    simGroup: 'simulation group',
    section: 'registrar section',
    facilityId: 'clinical facility'
  };
  var WEEK_CONFIG_KEYS = {
    clinicalStartWeek: true,
    simStartWeek: true,
    clinicalMakeupPrimaryWeek: true,
    clinicalMakeupFallbackWeek: true,
    simMakeupLastResortWeek: true
  };
  var SEASON_LABELS = {
    spring: 'Spring',
    summer: 'Summer',
    fall: 'Fall',
    winter: 'Winter'
  };
  function isBlank(str) {
    return str == null || String(str).trim() === '';
  }
  function titleCaseSeason(val) {
    if (val == null) return SENTINEL.notSet;
    var key = String(val).toLowerCase();
    return SEASON_LABELS[key] || String(val);
  }
  function formatDateFriendly(iso) {
    if (isBlank(iso)) return SENTINEL.notSet;
    var parts = String(iso).split('-');
    if (parts.length !== 3) return String(iso);
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var m = parseInt(parts[1], 10) - 1;
    var d = parseInt(parts[2], 10);
    if (m < 0 || m > 11 || isNaN(d)) return String(iso);
    return months[m] + ' ' + d + ', ' + parts[0];
  }
  function findStudent(semester, studentId) {
    return (semester && semester.students || []).find(function (s) { return s.id === studentId; });
  }
  function studentIndex(semester, studentId) {
    var list = semester && semester.students || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === studentId) return i + 1;
    }
    return 0;
  }
  function studentDisplayName(semester, studentId) {
    var st = findStudent(semester, studentId);
    if (st && !isBlank(st.name)) return st.name;
    var n = studentIndex(semester, studentId);
    return n ? 'Student ' + n : 'Student';
  }
  function findFaculty(semester, facultyId) {
    return (semester && semester.faculty || []).find(function (f) { return f.id === facultyId; });
  }
  function facultyIndex(semester, facultyId) {
    var list = semester && semester.faculty || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === facultyId) return i + 1;
    }
    return 0;
  }
  function facultyDisplayName(semester, entry, index) {
    if (entry && !isBlank(entry.name)) return entry.name;
    if (typeof index === 'number' && index > 0) return 'Clinical Faculty ' + index;
    if (entry && entry.id && semester) {
      var n = facultyIndex(semester, entry.id);
      if (n) return 'Clinical Faculty ' + n;
    }
    return 'Clinical Faculty';
  }
  function sectionDisplayName(semester, sectionId) {
    var sec = (semester && semester.sections || []).find(function (s) { return s.id === sectionId; });
    return (sec && sec.name) ? sec.name : sectionId;
  }
  function facilityDisplayName(semester, facilityId) {
    if (isBlank(facilityId)) return SENTINEL.none;
    var fac = (semester && semester.facilities || []).find(function (f) { return f.id === facilityId; });
    if (fac) {
      if (!isBlank(fac.shortName)) return fac.shortName;
      if (!isBlank(fac.name)) return fac.name;
    }
    return SENTINEL.unknownSite;
  }
  function formatSimPattern(val) {
    if (val === 'even') return 'Even weeks';
    if (val === 'odd') return 'Odd weeks';
    if (val == null || val === '') return SENTINEL.notSet;
    return String(val);
  }
  function formatScalarConfigValue(key, val) {
    if (val == null || val === '') return SENTINEL.notSet;
    if (WEEK_CONFIG_KEYS[key]) return 'Week ' + val;
    return String(val);
  }
  function formatLeadFaculty(val) {
    if (!val || (isBlank(val.name) && isBlank(val.email))) return SENTINEL.notSet;
    var parts = [];
    if (!isBlank(val.name)) parts.push(String(val.name).trim());
    if (!isBlank(val.email)) parts.push(String(val.email).trim());
    return parts.join(', ') || SENTINEL.notSet;
  }
  function formatSectionObject(val) {
    if (!val) return SENTINEL.removed;
    return val.name || SENTINEL.unnamed;
  }
  function formatFacilityObject(val, semester) {
    if (!val) return SENTINEL.removed;
    if (!isBlank(val.shortName)) return val.shortName;
    if (!isBlank(val.name)) return val.name;
    return facilityDisplayName(semester, val.id);
  }
  function facultyEntryLabel(entry, semester) {
    if (!entry) return SENTINEL.removed;
    var idx = facultyIndex(semester, entry.id);
    var name = facultyDisplayName(semester, entry, idx);
    var group = entry.clinicalGroup || '';
    if (isBlank(entry.name)) {
      return group + ': ' + name + ' (' + SENTINEL.unnamed.slice(1, -1) + ')';
    }
    return group ? group + ': ' + name : name;
  }
  function summarizeFacultyArray(arr, semester) {
    if (!arr || !arr.length) return SENTINEL.none;
    return arr.map(function (f) {
      return facultyEntryLabel(f, semester);
    }).join('; ');
  }
  function diffFacultyArrays(current, proposed, semester) {
    var aById = {};
    var dById = {};
    (current || []).forEach(function (f) { if (f && f.id) aById[f.id] = f; });
    (proposed || []).forEach(function (f) { if (f && f.id) dById[f.id] = f; });
    var ids = {};
    Object.keys(aById).concat(Object.keys(dById)).forEach(function (id) { ids[id] = true; });
    var beforeParts = [];
    var afterParts = [];
    Object.keys(ids).forEach(function (id) {
      var a = aById[id];
      var d = dById[id];
      if (!a && d) {
        afterParts.push(facultyEntryLabel(d, semester) + ' ' + SENTINEL.added);
      } else if (a && !d) {
        beforeParts.push(facultyEntryLabel(a, semester));
        afterParts.push(SENTINEL.removed);
      } else if (a && d && JSON.stringify(a) !== JSON.stringify(d)) {
        if (a.name !== d.name) {
          beforeParts.push(facultyEntryLabel(a, semester));
          afterParts.push(facultyEntryLabel(d, semester));
        } else if (a.clinicalGroup !== d.clinicalGroup) {
          beforeParts.push(facultyDisplayName(semester, a) + ': ' + (a.clinicalGroup || SENTINEL.none));
          afterParts.push(facultyDisplayName(semester, d) + ': ' + (d.clinicalGroup || SENTINEL.none));
        }
      }
    });
    return {
      before: beforeParts.length ? beforeParts.join('; ') : summarizeFacultyArray(current, semester),
      after: afterParts.length ? afterParts.join('; ') : summarizeFacultyArray(proposed, semester)
    };
  }
  function formatStudentFieldValue(field, val, semester) {
    if (field === 'name') {
      return isBlank(val) ? SENTINEL.unnamed : String(val);
    }
    if (field === 'section') {
      return isBlank(val) ? SENTINEL.none : String(val);
    }
    if (field === 'facilityId') {
      return facilityDisplayName(semester, val);
    }
    if (val == null || val === '') return SENTINEL.none;
    return String(val);
  }
  function summarizeRoster(arr, semester) {
    if (!arr || !arr.length) return '0 students';
    return arr.length + ' student' + (arr.length === 1 ? '' : 's');
  }
  function diffRoster(current, proposed, semester) {
    var aIds = {};
    var dIds = {};
    (current || []).forEach(function (s) { aIds[s.id] = s; });
    (proposed || []).forEach(function (s) { dIds[s.id] = s; });
    var added = [];
    var removed = [];
    Object.keys(dIds).forEach(function (id) {
      if (!aIds[id]) {
        var st = dIds[id];
        var label = !isBlank(st.name) ? st.name : ('Student ' + (proposed.indexOf(st) + 1));
        added.push('+ ' + label);
      }
    });
    Object.keys(aIds).forEach(function (id) {
      if (!dIds[id]) {
        var st = aIds[id];
        var label = !isBlank(st.name) ? st.name : studentDisplayName(semester, id);
        removed.push('− ' + label);
      }
    });
    if (added.length || removed.length) {
      var parts = [];
      if (removed.length) parts.push(removed.join(', '));
      if (added.length) parts.push(added.join(', '));
      return {
        before: summarizeRoster(current, semester),
        after: summarizeRoster(proposed, semester) + (parts.length ? ' (' + parts.join('; ') + ')' : '')
      };
    }
    return {
      before: summarizeRoster(current, semester),
      after: summarizeRoster(proposed, semester)
    };
  }
  function summarizeHolidayEntry(h) {
    if (!h) return '';
    var label = h.label || 'Holiday';
    if (h.date) return label + ' (' + formatDateFriendly(h.date) + ')';
    if (h.weekIndex != null) return label + ' (week ' + (h.weekIndex + 1) + ')';
    return label;
  }
  function summarizeHolidays(arr) {
    if (!arr || !arr.length) return '0 entries';
    return arr.length + ' entr' + (arr.length === 1 ? 'y' : 'ies');
  }
  function summarizeOrientations(arr, semester) {
    if (!arr || !arr.length) return '0 days';
    return arr.length + ' day' + (arr.length === 1 ? '' : 's');
  }
  function formatLabel(path, semester) {
    if (!path) return '';
    if (path === 'students') return 'Student roster';
    if (path === 'faculty') return 'Clinical faculty assignments';
    if (path === 'holidays') return 'Holidays & breaks';
    if (path === 'orientations') return 'Orientation days';
    if (path.indexOf('config.') === 0) {
      var configRest = path.slice(7);
      if (CONFIG_SCALAR_LABELS[configRest]) return CONFIG_SCALAR_LABELS[configRest];
      var cgd = configRest.match(/^clinicalGroupDays\.(.+)$/);
      if (cgd) return cgd[1] + ' clinical weekday';
      var sgd = configRest.match(/^simGroupDays\.(.+)$/);
      if (sgd) return sgd[1] + ' simulation weekday';
      var sgp = configRest.match(/^simGroupPattern\.(.+)$/);
      if (sgp) return sgp[1] + ' simulation pattern';
      var cgf = configRest.match(/^clinicalGroupFacilities\.(.+)$/);
      if (cgf) return cgf[1] + ' oriented facilities';
      var cgsw = configRest.match(/^clinicalGroupSiteWeeks\.(.+)$/);
      if (cgsw) return cgsw[1] + ' site week ranges';
      return 'Scheduling: ' + configRest;
    }
    var sec = path.match(/^sections\.([^.]+)$/);
    if (sec) {
      return 'Registrar section — ' + sectionDisplayName(semester, sec[1]);
    }
    var facPath = path.match(/^facilities\.([^.]+)$/);
    if (facPath) {
      return 'Clinical facility — ' + facilityDisplayName(semester, facPath[1]);
    }
    var fm = path.match(/^faculty\.([^.]+)\.(\w+)$/);
    if (fm) {
      var entry = findFaculty(semester, fm[1]);
      var fname = facultyDisplayName(semester, entry);
      if (fm[2] === 'name') return fname + ' — name';
      if (fm[2] === 'clinicalGroup') return fname + ' — clinical group';
      return fname + ' — ' + fm[2];
    }
    var fwhole = path.match(/^faculty\.([^.]+)$/);
    if (fwhole) {
      var fentry = findFaculty(semester, fwhole[1]);
      return 'Clinical faculty — ' + facultyDisplayName(semester, fentry);
    }
    var sm = path.match(/^students\.([^.]+)\.(\w+)$/);
    if (sm) {
      var fieldLabel = STUDENT_FIELD_LABELS[sm[2]] || sm[2];
      return studentDisplayName(semester, sm[1]) + ' — ' + fieldLabel;
    }
    if (path.indexOf('meta.leadFaculty') === 0) return META_LABELS.leadFaculty;
    var metaKey = path.match(/^meta\.(\w+)$/);
    if (metaKey && META_LABELS[metaKey[1]]) return META_LABELS[metaKey[1]];
    var calKey = path.match(/^calendar\.(\w+)$/);
    if (calKey && CALENDAR_LABELS[calKey[1]]) return CALENDAR_LABELS[calKey[1]];
    return 'Other setup change';
  }
  function formatSingleValue(path, val, semester) {
    if (val === undefined) return SENTINEL.none;
    if (path === 'faculty') {
      return summarizeFacultyArray(val, semester);
    }
    if (path === 'students') {
      return summarizeRoster(val, semester);
    }
    if (path === 'holidays') {
      return summarizeHolidays(val);
    }
    if (path === 'orientations') {
      return summarizeOrientations(val, semester);
    }
    if (path.indexOf('meta.leadFaculty') === 0) {
      return formatLeadFaculty(val);
    }
    var metaKey = path.match(/^meta\.(\w+)$/);
    if (metaKey) {
      if (metaKey[1] === 'semesterSeason') return titleCaseSeason(val);
      return val == null || val === '' ? SENTINEL.notSet : String(val);
    }
    var calKey = path.match(/^calendar\.(\w+)$/);
    if (calKey && calKey[1] === 'semesterStartDate') {
      return formatDateFriendly(val);
    }
    if (path.indexOf('config.') === 0) {
      var configRest = path.slice(7);
      if (configRest.indexOf('simGroupPattern.') === 0) return formatSimPattern(val);
      var scalarKey = configRest.split('.')[0];
      if (WEEK_CONFIG_KEYS[scalarKey] || CONFIG_SCALAR_LABELS[scalarKey]) {
        return formatScalarConfigValue(scalarKey, val);
      }
      if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
        return String(val);
      }
    }
    var sec = path.match(/^sections\.([^.]+)$/);
    if (sec) {
      return formatSectionObject(val);
    }
    var facPath = path.match(/^facilities\.([^.]+)$/);
    if (facPath) {
      return formatFacilityObject(val, semester);
    }
    var fm = path.match(/^faculty\.([^.]+)\.(\w+)$/);
    if (fm) {
      var entry = typeof val === 'object' && val !== null ? val : findFaculty(semester, fm[1]);
      if (fm[2] === 'name') {
        if (typeof val === 'string') {
          return isBlank(val) ? SENTINEL.unnamed : val;
        }
        return facultyEntryLabel(entry, semester);
      }
      if (fm[2] === 'clinicalGroup') {
        return isBlank(val) ? SENTINEL.none : String(val);
      }
    }
    var fwhole = path.match(/^faculty\.([^.]+)$/);
    if (fwhole && typeof val === 'object') {
      return facultyEntryLabel(val, semester);
    }
    var sm = path.match(/^students\.([^.]+)\.(\w+)$/);
    if (sm) {
      return formatStudentFieldValue(sm[2], val, semester);
    }
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
      return String(val);
    }
    if (Array.isArray(val) || (typeof val === 'object' && val !== null)) {
      return SENTINEL.complex;
    }
    return String(val);
  }
  function formatChange(path, current, proposed, semester) {
    if (path === 'faculty') {
      return diffFacultyArrays(current, proposed, semester);
    }
    if (path === 'students') {
      return diffRoster(current, proposed, semester);
    }
    var fm = path.match(/^faculty\.([^.]+)\.name$/);
    if (fm) {
      var entry = findFaculty(semester, fm[1]);
      var group = (entry && entry.clinicalGroup) || '';
      var idx = facultyIndex(semester, fm[1]);
      var beforeName = isBlank(current)
        ? (group + ': ' + facultyDisplayName(semester, entry, idx) + ' (' + SENTINEL.unnamed.slice(1, -1) + ')')
        : facultyEntryLabel(Object.assign({}, entry, { name: current }), semester);
      var afterName = isBlank(proposed) ? SENTINEL.unnamed : String(proposed);
      return { before: beforeName, after: afterName };
    }
    var fmg = path.match(/^faculty\.([^.]+)\.clinicalGroup$/);
    if (fmg) {
      var fentry = findFaculty(semester, fmg[1]);
      var fname = facultyDisplayName(semester, fentry);
      return {
        before: fname + ': ' + (current || SENTINEL.none),
        after: fname + ': ' + (proposed || SENTINEL.none)
      };
    }
    return {
      before: current === undefined ? SENTINEL.none : formatSingleValue(path, current, semester),
      after: proposed === undefined ? SENTINEL.removed : formatSingleValue(path, proposed, semester)
    };
  }
export {
  SENTINEL,
  formatLabel,
  formatChange,
  formatSingleValue,
  studentDisplayName,
  facultyDisplayName,
  sectionDisplayName,
  facilityDisplayName
};
