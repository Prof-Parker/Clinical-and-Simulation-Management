'use strict';

var harness = require('./_harness');
harness.loadCore();
harness.load('js/proposal-format.js');
harness.load('js/proposals.js');

var passed = 0;
var failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; return; }
  failed++;
  console.error('FAIL: ' + msg);
}

function makeSem(overrides) {
  var sem = {
    id: 'sem_test',
    meta: { semesterSeason: 'spring', semesterYear: 2026, semesterName: 'Spring 2026', leadFaculty: { name: '', email: '' } },
    calendar: { semesterStartDate: '2026-01-12', weeks: [] },
    config: { clinicalDaysRequired: 10, simDaysRequired: 5, clinicalGroups: ['C1'], simGroups: ['SG1'] },
    sections: [{ id: 'sec1', name: 'F6011' }],
    faculty: [{ id: 'fac_test1', name: 'Faculty 1', clinicalGroup: 'C1' }],
    facilities: [{ id: 'fac1', name: 'Site A' }],
    holidays: [],
    orientations: [],
    students: [
      { id: 'stu1', name: 'Student 1', clinicalGroup: 'C1', simGroup: 'SG1', section: 'F6011', facilityId: 'fac1', schedule: {}, absences: [], makeups: [] }
    ],
    proposals: []
  };
  if (overrides) Object.keys(overrides).forEach(function (k) { sem[k] = overrides[k]; });
  return sem;
}

var sem = makeSem();
var proposer = { userId: 'usr_a', name: 'Faculty A', email: 'a@example.edu' };

var draft = makeSem();
draft.config.clinicalDaysRequired = 12;

var count = App.Proposals.submitSetupProposals(sem, draft, proposer);
assert(count === 1, 'one config change proposed');
assert(sem.proposals.length === 1, 'proposal stored');
assert(sem.proposals[0].status === 'pending', 'pending status');

var reviewer = { userId: 'usr_admin', name: 'Admin' };
assert(App.Proposals.approve(sem, sem.proposals[0].id, reviewer) === true, 'approve applies');
assert(sem.config.clinicalDaysRequired === 12, 'active config updated');

sem = makeSem();
draft = makeSem();
draft.sections[0].name = 'F6012';
count = App.Proposals.submitSetupProposals(sem, draft, proposer);
assert(count === 1, 'section name change proposed');
assert(sem.proposals[0].path === 'sections.sec1', 'section path by id');

sem = makeSem();
draft = makeSem();
draft.students[0].section = 'F6099';
count = App.Proposals.submitSetupProposals(sem, draft, proposer);
assert(count === 1, 'student section change proposed');
assert(sem.proposals[0].path === 'students.stu1.section', 'student field path');

sem = makeSem();
draft = makeSem();
draft.students.push({
  id: 'stu2', name: 'Student 2', clinicalGroup: 'C1', simGroup: 'SG1', section: '', facilityId: 'fac1', schedule: {}, absences: [], makeups: []
});
count = App.Proposals.submitSetupProposals(sem, draft, proposer);
assert(count === 1, 'roster add is one structural proposal');
assert(sem.proposals[0].path === 'students', 'whole students array path');

sem.config.clinicalDaysRequired = 15;
sem.proposals.push({
  id: 'prop_stale',
  status: 'pending',
  path: 'config.clinicalDaysRequired',
  currentValue: 10,
  proposedValue: 14,
  proposedBy: proposer,
  proposedAt: new Date().toISOString()
});
assert(App.Proposals.isStale(sem.proposals[1], sem) === true, 'stale when active changed');

assert(App.Proposals.getValueAtPath(sem, 'students.stu1.section') === 'F6011', 'get student field');
App.Proposals.setValueAtPath(sem, 'students.stu1.section', 'F6020');
assert(sem.students[0].section === 'F6020', 'set student field');

var merged = App.Proposals.mergeProposalLists(
  [{ id: 'p1', proposedAt: '2026-01-02', status: 'pending' }],
  [{ id: 'p1', proposedAt: '2026-01-01', status: 'denied' }]
);
assert(merged.length === 1 && merged[0].proposedAt === '2026-01-02', 'merge keeps newer');

sem = makeSem();
draft = makeSem();
draft.faculty[0].name = 'Dr. Jones';
count = App.Proposals.submitSetupProposals(sem, draft, proposer);
assert(count === 1, 'faculty name change is one proposal');
assert(sem.proposals[0].path === 'faculty.fac_test1.name', 'faculty name path by id');
assert(App.Proposals.approve(sem, sem.proposals[0].id, reviewer) === true, 'approve faculty name');
assert(sem.faculty[0].name === 'Dr. Jones', 'faculty name applied');

console.log('\nProposals tests: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
