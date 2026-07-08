import { describe, it, expect, vi } from 'vitest';
import { state } from '../src/core/state.js';
import { UserData, UserDirectory } from './_harness.js';

vi.mock('../src/storage/users-registry-storage.js', () => ({
  isReady: function () { return true; },
  getRegistry: function () { return state.usersRegistry; }
}));

describe('user-directory.test.js', () => {
  it('runs assertions', () => {
    let failed = 0;

    function assert(cond, msg) {
      if (cond) return;
      failed++;
      console.error('FAIL: ' + msg);
    }

    state.usersRegistry = UserData.createEmptyRegistry();
    state.usersRegistry.users.usr_lead1 = UserData.createRegistryEntry(
      'lead_course_faculty', 'hash1', 'admin', { firstName: 'Lead', lastName: 'One', email: 'lead1@example.edu' }
    );
    state.usersRegistry.users.usr_lead2 = UserData.createRegistryEntry(
      'lead_course_faculty', 'hash2', 'admin', { firstName: 'Lead', lastName: 'Two', email: 'lead2@example.edu' }
    );
    state.usersRegistry.users.usr_adj1 = UserData.createRegistryEntry(
      'adjunct_faculty', 'hash3', 'admin', { firstName: 'Adjunct', lastName: 'Alpha', email: 'adj1@example.edu' }
    );
    state.usersRegistry.users.usr_revoked = UserData.createRegistryEntry(
      'adjunct_faculty', 'hash4', 'admin', { firstName: 'Revoked', lastName: 'User', email: 'rev@example.edu' }
    );
    state.usersRegistry.users.usr_revoked.status = 'revoked';

    var leads = UserDirectory.getLeadCourseFaculty();
    assert(leads.length === 2, 'lists active lead course faculty only');
    assert(leads[0].displayName === 'Lead One', 'lead faculty sorted by name');
    assert(leads[0].email === 'lead1@example.edu', 'lead faculty includes email');

    var adjuncts = UserDirectory.getAdjunctFaculty();
    assert(adjuncts.length === 1, 'lists active adjunct faculty only');
    assert(adjuncts[0].displayName === 'Adjunct Alpha', 'adjunct display name');

    var found = UserDirectory.findByDisplayName('adjunct_faculty', 'Adjunct Alpha');
    assert(found && found.email === 'adj1@example.edu', 'findByDisplayName matches adjunct');

    assert(UserDirectory.getActiveUsersByRole('lead_course_faculty', { limit: 1 }).length === 1,
      'role list respects limit');

    expect(failed).toBe(0);
  });
});
