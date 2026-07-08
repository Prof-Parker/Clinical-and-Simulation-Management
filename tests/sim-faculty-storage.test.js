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

    function assertNoPlainRolesInExport(jsonText) {
      var parsed = JSON.parse(jsonText);
      (parsed.semesters || []).forEach(function (sem, i) {
        assert(sem.roles === undefined, 'semester ' + i + ' must not include plain roles in export');
      });
      if (parsed.meta && parsed.meta.simRoles && parsed.meta.simRoles.data) {
        var decoded = SimFacultyData.decodeUtf8Base64(parsed.meta.simRoles.data);
        var plain = JSON.stringify(decoded);
        assert(plain.indexOf('Primary') < 0 || parsed.meta.simRoles.encoding === 'b64v1',
          'role labels should not appear as plain JSON in export text when encoded');
        assert(jsonText.indexOf('"iter1":"Primary"') < 0, 'export JSON must not contain readable role assignments');
      }
    }

    var fileRoot = DataModel.createDefaultFile();
    var sem = fileRoot.semesters[0];
    var studentId = sem.students[0].id;

    sem.roles = {};
    sem.roles[studentId] = {
      flags: { primary: 'high', secondary: 'weak' },
      1: { iter1: 'Primary', iter2: 'Secondary', iter3: '', iter4: 'Evaluator' }
    };

    var facultyRoot = SimFacultyData.createEmptySimFacultyRoot();
    var migrated = SimFacultyData.migrateRolesFromFileRoot(facultyRoot, fileRoot);

    assert(migrated, 'migrateRolesFromFileRoot returns true when roles present');
    assert(sem.roles === undefined, 'semester roles stripped after migration');
    assert(facultyRoot.semesters[sem.id][studentId].flags.primary === 'high', 'flags migrated');
    assert(facultyRoot.semesters[sem.id][studentId]['1'].iter1 === 'Primary', 'assignments migrated');

    var exportRoot = SimFacultyData.embedSimRolesInFileRoot(fileRoot, facultyRoot);
    assert(exportRoot.semesters[0].roles === undefined, 'embedSimRolesInFileRoot omits plain semester.roles');
    assert(exportRoot.meta.simRoles && exportRoot.meta.simRoles.encoding === 'b64v1', 'export includes b64 simRoles blob');
    assert(exportRoot.meta.simRoles.data, 'export includes encoded payload');

    var exportJson = JSON.stringify(exportRoot);
    assertNoPlainRolesInExport(exportJson);

    var reloadedFaculty = SimFacultyData.createEmptySimFacultyRoot();
    var hydrate = SimFacultyData.hydrateFacultyRootFromFileRoot(exportRoot, reloadedFaculty);
    assert(hydrate.migrated, 'hydrate from encoded export returns migrated true');
    assert(
      reloadedFaculty.semesters[sem.id][studentId]['1'].iter1 === 'Primary',
      'hydrate round-trip restores assignments'
    );

    var roundTrip = SimFacultyData.decodeSimRolesFromMeta(exportRoot.meta);
    assert(roundTrip[sem.id][studentId].flags.secondary === 'weak', 'decodeSimRolesFromMeta round-trip');

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
    var legacyFaculty = SimFacultyData.createEmptySimFacultyRoot();
    SimFacultyData.migrateRolesFromFileRoot(legacyFaculty, legacyFile);
    assert(
      legacyFaculty.semesters[legacyFile.semesters[0].id][legacyFile.semesters[0].students[0].id].flags.secondary === 'weak',
      'legacy _legacySimRoles migrated'
    );
    assert(legacyFile._legacySimRoles === undefined, '_legacySimRoles removed after migration');

    expect(failed).toBe(0);
  });
});
