import { describe, it, expect, vi } from 'vitest';
import { state } from '../src/core/state.js';
import { Proposals, SetupDraft } from './_harness.js';

vi.mock('../src/auth/permissions.js', () => ({
  canAction: function (action) {
    if (action === 'proposals.submit') return true;
    if (action === 'setup.edit') return false;
    return false;
  }
}));

vi.mock('../src/auth/user-session.js', () => ({
  getSession: function () { return { userId: 'usr_fac', name: 'Faculty' }; }
}));

describe('setup-draft.test.js', () => {
  it('runs assertions', () => {
    let failed = 0;

    function assert(cond, msg) {
      if (cond) return;
      failed++;
      console.error('FAIL: ' + msg);
    }

    var sem = {
      id: 'sem_draft',
      meta: { semesterSeason: 'spring', semesterYear: 2026, finalized: true },
      calendar: { semesterStartDate: '2026-01-12' },
      config: { clinicalDaysRequired: 10 },
      sections: [],
      students: [],
      proposals: []
    };

    state.data = sem;

    assert(SetupDraft.usesDraftMode() === true, 'propose-only draft mode');

    var working = SetupDraft.ensureWorking('usr_fac');
    assert(working !== sem, 'working is a clone');
    assert(working.id === sem.id, 'working same semester id');

    working.config.clinicalDaysRequired = 11;
    assert(sem.config.clinicalDaysRequired === 10, 'active unchanged after working edit');

    assert(SetupDraft.hasWorkingChanges('usr_fac') === true, 'detects working changes');

    Proposals.submitSetupProposals(sem, working, { userId: 'usr_fac', name: 'Faculty' });
    assert(sem.proposals.length === 1, 'proposal on active semester');
    assert(sem.config.clinicalDaysRequired === 10, 'active still unchanged after propose');

    expect(failed).toBe(0);
  });
});
