'use strict';

var harness = require('./_harness');
harness.loadCore();
harness.load('js/proposals.js');
harness.load('js/setup-draft.js');

var passed = 0;
var failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; return; }
  failed++;
  console.error('FAIL: ' + msg);
}

App.Permissions = {
  canAction: function (action) {
    if (action === 'proposals.submit') return true;
    if (action === 'setup.edit') return false;
    return false;
  }
};

App.UserSession = {
  getSession: function () { return { userId: 'usr_fac', name: 'Faculty' }; }
};

var sem = {
  id: 'sem_draft',
  meta: { semesterSeason: 'spring', semesterYear: 2026, finalized: true },
  calendar: { semesterStartDate: '2026-01-12' },
  config: { clinicalDaysRequired: 10 },
  sections: [],
  students: [],
  proposals: []
};

App.state = { data: sem };
App.getData = function () { return App.state.data; };

assert(App.SetupDraft.usesDraftMode() === true, 'propose-only draft mode');

var working = App.SetupDraft.ensureWorking('usr_fac');
assert(working !== sem, 'working is a clone');
assert(working.id === sem.id, 'working same semester id');

working.config.clinicalDaysRequired = 11;
assert(sem.config.clinicalDaysRequired === 10, 'active unchanged after working edit');

assert(App.SetupDraft.hasWorkingChanges('usr_fac') === true, 'detects working changes');

App.Proposals.submitSetupProposals(sem, working, { userId: 'usr_fac', name: 'Faculty' });
assert(sem.proposals.length === 1, 'proposal on active semester');
assert(sem.config.clinicalDaysRequired === 10, 'active still unchanged after propose');

console.log('\nSetup draft tests: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
