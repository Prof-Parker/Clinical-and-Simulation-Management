'use strict';

var crypto = require('crypto');
var harness = require('./_harness');
harness.load('js/user-data.js');

// vm-loaded modules cannot access require(); stub hash for Node tests.
App.UserData.hashKey = function (key) {
  var hex = crypto.createHash('sha256').update(String(key)).digest('hex');
  return Promise.resolve('sha256:' + hex);
};
App.UserData.hashKeySync = function (key) {
  return 'sha256:' + crypto.createHash('sha256').update(String(key)).digest('hex');
};

var passed = 0;
var failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; return; }
  failed++;
  console.error('FAIL: ' + msg);
}

var key = 'k_test_key_abc';
var hash = App.UserData.hashKeySync(key);
assert(hash && hash.indexOf('sha256:') === 0, 'hashKeySync returns sha256 prefix');

assert(App.UserData.formatFullName('Ada', 'Lovelace') === 'Ada Lovelace', 'formatFullName joins names');
var legacyFile = App.UserData.migrateUserFile({
  userId: 'usr_legacy',
  name: 'Jane Q Public',
  email: 'j@example.edu',
  key: 'k_x'
});
assert(legacyFile.firstName === 'Jane', 'legacy user file splits first name');
assert(legacyFile.lastName === 'Q Public', 'legacy user file splits last name');

var userId = 'usr_test1';
var registry = App.UserData.createEmptyRegistry();
registry.users[userId] = App.UserData.createRegistryEntry('admin_staff', hash, 'Seeder');

var userFile = App.UserData.createUserFile(userId, 'Test', 'Admin', 'test@example.edu', key);

App.UserData.validateSession(userFile, registry).then(function (r) {
  assert(r.ok === true, 'valid session passes');
  assert(r.role === 'admin_staff', 'registry role is authoritative');
  assert(r.name === 'Test Admin', 'full name from user file');
  assert(r.firstName === 'Test', 'first name from user file');

  var badKey = App.UserData.createUserFile(userId, 'Test', 'Admin', 'test@example.edu', 'wrong');
  return App.UserData.validateSession(badKey, registry);
}).then(function (r) {
  assert(r.ok === false, 'wrong key fails');

  registry.users[userId].status = 'revoked';
  return App.UserData.validateSession(userFile, registry);
}).then(function (r) {
  assert(r.ok === false, 'revoked user fails');
  assert(r.error && r.error.indexOf('revoked') >= 0, 'revoked message');

  console.log('\nUser session tests: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
}).catch(function (e) {
  console.error(e);
  process.exit(1);
});
