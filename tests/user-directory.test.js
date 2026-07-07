'use strict';

var harness = require('./_harness');
harness.load('js/user-data.js');
harness.load('js/user-directory.js');

var App = harness.App;
var passed = 0;
var failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; return; }
  failed++;
  console.error('FAIL: ' + msg);
}

App.UsersRegistryStorage = {
  isReady: function () { return true; },
  getRegistry: function () { return App.state.usersRegistry; }
};
App.state = { usersRegistry: null };

App.state.usersRegistry = App.UserData.createEmptyRegistry();
App.state.usersRegistry.users.usr_lead1 = App.UserData.createRegistryEntry(
  'lead_course_faculty', 'hash1', 'admin', { firstName: 'Lead', lastName: 'One', email: 'lead1@example.edu' }
);
App.state.usersRegistry.users.usr_lead2 = App.UserData.createRegistryEntry(
  'lead_course_faculty', 'hash2', 'admin', { firstName: 'Lead', lastName: 'Two', email: 'lead2@example.edu' }
);
App.state.usersRegistry.users.usr_adj1 = App.UserData.createRegistryEntry(
  'adjunct_faculty', 'hash3', 'admin', { firstName: 'Adjunct', lastName: 'Alpha', email: 'adj1@example.edu' }
);
App.state.usersRegistry.users.usr_revoked = App.UserData.createRegistryEntry(
  'adjunct_faculty', 'hash4', 'admin', { firstName: 'Revoked', lastName: 'User', email: 'rev@example.edu' }
);
App.state.usersRegistry.users.usr_revoked.status = 'revoked';

var leads = App.UserDirectory.getLeadCourseFaculty();
assert(leads.length === 2, 'lists active lead course faculty only');
assert(leads[0].displayName === 'Lead One', 'lead faculty sorted by name');
assert(leads[0].email === 'lead1@example.edu', 'lead faculty includes email');

var adjuncts = App.UserDirectory.getAdjunctFaculty();
assert(adjuncts.length === 1, 'lists active adjunct faculty only');
assert(adjuncts[0].displayName === 'Adjunct Alpha', 'adjunct display name');

var found = App.UserDirectory.findByDisplayName('adjunct_faculty', 'Adjunct Alpha');
assert(found && found.email === 'adj1@example.edu', 'findByDisplayName matches adjunct');

assert(App.UserDirectory.getActiveUsersByRole('lead_course_faculty', { limit: 1 }).length === 1,
  'role list respects limit');

console.log('\nUser directory tests: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
