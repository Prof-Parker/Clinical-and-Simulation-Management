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

export function assignDefaultStudentNames(students) {
  students.forEach(function (s, i) {
    s.name = defaultStudentName(i);
  });
}

export function nextDefaultStudentName(students) {
  var max = 0;
  students.forEach(function (s) {
    var m = String(s.name || '').match(/^Student (\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return defaultStudentName(max > 0 ? max : students.length);
}

export function createStudent(name, clinicalGroup, simGroup, facilityId, section) {
  return {
    id: uid(),
    name: name == null ? 'Student' : name,
    clinicalGroup: clinicalGroup,
    simGroup: simGroup || 'SG1',
    section: section || '',
    facilityId: facilityId || null,
    schedule: emptySchedule(),
    absences: [],
    makeups: []
  };
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
