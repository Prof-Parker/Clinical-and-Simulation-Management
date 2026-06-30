/* eslint-disable no-console */
'use strict';

var harness = require('./_harness');
harness.load('js/state.js');
harness.load('js/data-model.js');
harness.load('js/sim-faculty-data.js');

var App = harness.App;
var passed = 0;
var failed = 0;

function assert(condition, message) {
  if (!condition) {
    failed++;
    console.error('FAIL: ' + message);
    return;
  }
  passed++;
}

function assertNoRolesInJson(jsonText) {
  var parsed = JSON.parse(jsonText);
  (parsed.semesters || []).forEach(function (sem, i) {
    assert(sem.roles === undefined, 'semester ' + i + ' must not include roles in export');
  });
}

var fileRoot = App.DataModel.createDefaultFile();
var sem = fileRoot.semesters[0];
var studentId = sem.students[0].id;

sem.roles = {};
sem.roles[studentId] = {
  flags: { primary: 'high', secondary: 'weak' },
  1: { iter1: 'Primary', iter2: 'Secondary', iter3: '', iter4: 'Evaluator' }
};

var facultyRoot = App.SimFacultyData.createEmptySimFacultyFile();
var migrated = App.SimFacultyData.migrateRolesFromFileRoot(facultyRoot, fileRoot);

assert(migrated, 'migrateRolesFromFileRoot returns true when roles present');
assert(sem.roles === undefined, 'semester roles stripped after migration');
assert(facultyRoot.semesters[sem.id][studentId].flags.primary === 'high', 'flags migrated');
assert(facultyRoot.semesters[sem.id][studentId]['1'].iter1 === 'Primary', 'assignments migrated');

var exportRoot = App.SimFacultyData.cloneFileRootWithoutRoles(fileRoot);
sem.roles = { legacy: { flags: { primary: 'weak' } } };
exportRoot = App.SimFacultyData.cloneFileRootWithoutRoles(fileRoot);
assert(exportRoot.semesters[0].roles === undefined, 'cloneFileRootWithoutRoles omits roles');

assertNoRolesInJson(JSON.stringify(exportRoot));

App.SimFacultyData.setStudentRoleAssignment(facultyRoot, sem.id, studentId, '2', 'iter1', 'Scribe');
App.SimFacultyData.setStudentFlag(facultyRoot, sem.id, studentId, 'secondary', null);
var rd = App.SimFacultyData.getStudentRoles(facultyRoot, sem.id, studentId);
assert(rd['2'].iter1 === 'Scribe', 'setStudentRoleAssignment round-trip');
assert(rd.flags.secondary === null, 'setStudentFlag round-trip');

var legacyFile = App.DataModel.createDefaultFile();
legacyFile._legacySimRoles = {};
legacyFile._legacySimRoles[legacyFile.semesters[0].students[0].id] = {
  flags: { primary: null, secondary: 'weak' }
};
var legacyFaculty = App.SimFacultyData.createEmptySimFacultyFile();
App.SimFacultyData.migrateRolesFromFileRoot(legacyFaculty, legacyFile);
assert(
  legacyFaculty.semesters[legacyFile.semesters[0].id][legacyFile.semesters[0].students[0].id].flags.secondary === 'weak',
  'legacy _legacySimRoles migrated'
);
assert(legacyFile._legacySimRoles === undefined, '_legacySimRoles removed after migration');

console.log('\nSim faculty storage tests: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
