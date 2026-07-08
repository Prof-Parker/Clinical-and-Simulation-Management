/* eslint-disable no-console */
import { describe, it, expect } from 'vitest';
import { DataModel, SimFacultyData } from './_harness.js';

describe('sim-faculty-storage.test.js', () => {
  it('runs assertions', () => {
    let failed = 0;

    function assert(condition, message) {
      if (!condition) {
        failed++;
        console.error('FAIL: ' + message);
        return;
      }
    }

    function assertNoRolesInJson(jsonText) {
      var parsed = JSON.parse(jsonText);
      (parsed.semesters || []).forEach(function (sem, i) {
        assert(sem.roles === undefined, 'semester ' + i + ' must not include roles in export');
      });
    }

    var fileRoot = DataModel.createDefaultFile();
    var sem = fileRoot.semesters[0];
    var studentId = sem.students[0].id;

    sem.roles = {};
    sem.roles[studentId] = {
      flags: { primary: 'high', secondary: 'weak' },
      1: { iter1: 'Primary', iter2: 'Secondary', iter3: '', iter4: 'Evaluator' }
    };

    var facultyRoot = SimFacultyData.createEmptySimFacultyFile();
    var migrated = SimFacultyData.migrateRolesFromFileRoot(facultyRoot, fileRoot);

    assert(migrated, 'migrateRolesFromFileRoot returns true when roles present');
    assert(sem.roles === undefined, 'semester roles stripped after migration');
    assert(facultyRoot.semesters[sem.id][studentId].flags.primary === 'high', 'flags migrated');
    assert(facultyRoot.semesters[sem.id][studentId]['1'].iter1 === 'Primary', 'assignments migrated');

    var exportRoot = SimFacultyData.cloneFileRootWithoutRoles(fileRoot);
    sem.roles = { legacy: { flags: { primary: 'weak' } } };
    exportRoot = SimFacultyData.cloneFileRootWithoutRoles(fileRoot);
    assert(exportRoot.semesters[0].roles === undefined, 'cloneFileRootWithoutRoles omits roles');

    assertNoRolesInJson(JSON.stringify(exportRoot));

    SimFacultyData.setStudentRoleAssignment(facultyRoot, sem.id, studentId, '2', 'iter1', 'Scribe');
    SimFacultyData.setStudentFlag(facultyRoot, sem.id, studentId, 'secondary', null);
    var rd = SimFacultyData.getStudentRoles(facultyRoot, sem.id, studentId);
    assert(rd['2'].iter1 === 'Scribe', 'setStudentRoleAssignment round-trip');
    assert(rd.flags.secondary === null, 'setStudentFlag round-trip');

    var legacyFile = DataModel.createDefaultFile();
    legacyFile._legacySimRoles = {};
    legacyFile._legacySimRoles[legacyFile.semesters[0].students[0].id] = {
      flags: { primary: null, secondary: 'weak' }
    };
    var legacyFaculty = SimFacultyData.createEmptySimFacultyFile();
    SimFacultyData.migrateRolesFromFileRoot(legacyFaculty, legacyFile);
    assert(
      legacyFaculty.semesters[legacyFile.semesters[0].id][legacyFile.semesters[0].students[0].id].flags.secondary === 'weak',
      'legacy _legacySimRoles migrated'
    );
    assert(legacyFile._legacySimRoles === undefined, '_legacySimRoles removed after migration');

    expect(failed).toBe(0);
  });
});
