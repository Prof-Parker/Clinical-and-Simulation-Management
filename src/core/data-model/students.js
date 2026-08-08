/**
 * Student records, schedule cells, and roster naming helpers.
 */

export function uid() {
  return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

export function emptyCell() {
  return {
    clinical: false, clinicalMissed: false, sim: null, simDay: null, simGuestGroup: null,
    makeupClinical: false, inactive: false, simMakeup: false, simOverload: false,
    facilityId: null
  };
}

export function emptySchedule() {
  var s = [];
  for (var i = 0; i < 18; i++) s.push(emptyCell());
  return s;
}

export function defaultStudentName(index) {
  return 'Student ' + (index + 1);
}

export function parseLegacyStudentName(name) {
  var raw = String(name || '').trim();
  if (!raw) return { lastName: '', firstName: '' };
  var pipe = raw.indexOf('|');
  if (pipe >= 0) {
    return {
      lastName: raw.slice(0, pipe).trim(),
      firstName: raw.slice(pipe + 1).trim()
    };
  }
  return { lastName: raw, firstName: '' };
}

export function syncStudentDisplayName(student) {
  if (!student) return student;
  var last = String(student.lastName != null ? student.lastName : '').trim();
  var first = String(student.firstName != null ? student.firstName : '').trim();
  if (last || first) {
    student.name = [first, last].filter(Boolean).join(' ');
  } else if (student.name == null) {
    student.name = '';
  }
  return student;
}

export function ensureStudentNameParts(student) {
  if (!student) return student;
  if (student.lastName == null && student.firstName == null) {
    var parsed = parseLegacyStudentName(student.name);
    student.lastName = parsed.lastName;
    student.firstName = parsed.firstName;
  } else {
    if (student.lastName == null) student.lastName = '';
    if (student.firstName == null) student.firstName = '';
  }
  syncStudentDisplayName(student);
  return student;
}

export function compareStudentsByName(a, b) {
  var la = String((a && a.lastName) || '').toLowerCase();
  var lb = String((b && b.lastName) || '').toLowerCase();
  if (la !== lb) return la < lb ? -1 : 1;
  var fa = String((a && a.firstName) || '').toLowerCase();
  var fb = String((b && b.firstName) || '').toLowerCase();
  if (fa !== fb) return fa < fb ? -1 : 1;
  return String((a && a.name) || '').toLowerCase().localeCompare(String((b && b.name) || '').toLowerCase());
}

export function assignDefaultStudentNames(students) {
  students.forEach(function (s, i) {
    s.lastName = defaultStudentName(i);
    s.firstName = '';
    syncStudentDisplayName(s);
  });
}

export function nextDefaultStudentName(students) {
  var max = 0;
  students.forEach(function (s) {
    var candidates = [s.name, s.lastName, s.firstName];
    candidates.forEach(function (c) {
      var m = String(c || '').match(/^Student (\d+)$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
  });
  return defaultStudentName(max > 0 ? max : students.length);
}

export function createStudent(name, clinicalGroup, simGroup, facilityId, section) {
  var parsed = parseLegacyStudentName(name == null ? 'Student' : name);
  var student = {
    id: uid(),
    lastName: parsed.lastName,
    firstName: parsed.firstName,
    name: '',
    email: '',
    clinicalGroup: clinicalGroup,
    simGroup: simGroup || 'SG1',
    section: section || '',
    facilityId: facilityId || null,
    schedule: emptySchedule(),
    absences: [],
    makeups: []
  };
  syncStudentDisplayName(student);
  return student;
}

export function cellToLegacyString(cell, student) {
  if (!cell || cell.inactive) return 'H';
  if (cell.makeupClinical) return 'M';
  if (!cell.clinical && !cell.sim) return '-';
  var parts = [];
  if (cell.clinical || cell.clinicalMissed) {
    parts.push(cell.clinicalMissed ? 'C*' : 'C');
  }
  if (cell.sim) parts.push('S' + cell.sim + (cell.clinicalMissed && cell.sim ? '' : ''));
  if (cell.clinicalMissed && cell.sim) return 'C*+S' + cell.sim;
  if (cell.clinical && cell.sim) return 'C+S' + cell.sim;
  if (cell.sim) return 'S' + cell.sim;
  if (cell.clinicalMissed) return 'C*';
  return parts.join('+') || '-';
}

export function countStats(student) {
  var clinicals = 0;
  var sims = 0;
  var simNums = [];
  student.schedule.forEach(function (cell) {
    if (cell.inactive) return;
    if (cell.clinical && !cell.clinicalMissed) clinicals++;
    if (cell.makeupClinical) clinicals++;
    if (cell.sim) {
      sims++;
      simNums.push(cell.sim);
    }
  });
  return { clinicals: clinicals, sims: sims, simNums: simNums };
}
