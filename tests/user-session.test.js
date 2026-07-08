import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { UserData } from './_harness.js';

describe('user-session.test.js', () => {
  beforeEach(() => {
    vi.spyOn(UserData, 'hashKeySync').mockImplementation(function (key) {
      return 'sha256:' + createHash('sha256').update(String(key)).digest('hex');
    });
    vi.spyOn(UserData, 'hashKey').mockImplementation(function (key) {
      return Promise.resolve(UserData.hashKeySync(key));
    });
  });

  it('runs assertions', async () => {
    let failed = 0;

    function assert(cond, msg) {
      if (cond) return;
      failed++;
      console.error('FAIL: ' + msg);
    }

    var key = 'k_test_key_abc';
    var hash = UserData.hashKeySync(key);
    assert(hash && hash.indexOf('sha256:') === 0, 'hashKeySync returns sha256 prefix');

    assert(UserData.formatFullName('Ada', 'Lovelace') === 'Ada Lovelace', 'formatFullName joins names');
    var legacyFile = UserData.migrateUserFile({
      userId: 'usr_legacy',
      name: 'Jane Q Public',
      email: 'j@example.edu',
      key: 'k_x'
    });
    assert(legacyFile.firstName === 'Jane', 'legacy user file splits first name');
    assert(legacyFile.lastName === 'Q Public', 'legacy user file splits last name');

    var userId = 'usr_test1';
    var registry = UserData.createEmptyRegistry();
    registry.users[userId] = UserData.createRegistryEntry('admin_staff', hash, 'Seeder');

    var userFile = UserData.createUserFile(userId, 'Test', 'Admin', 'test@example.edu', key);

    var r = await UserData.validateSession(userFile, registry);
    assert(r.ok === true, 'valid session passes');
    assert(r.role === 'admin_staff', 'registry role is authoritative');
    assert(r.name === 'Test Admin', 'full name from user file');
    assert(r.firstName === 'Test', 'first name from user file');

    var badKey = UserData.createUserFile(userId, 'Test', 'Admin', 'test@example.edu', 'wrong');
    r = await UserData.validateSession(badKey, registry);
    assert(r.ok === false, 'wrong key fails');

    registry.users[userId].status = 'revoked';
    r = await UserData.validateSession(userFile, registry);
    assert(r.ok === false, 'revoked user fails');
    assert(r.error && r.error.indexOf('revoked') >= 0, 'revoked message');

    expect(failed).toBe(0);
  });
});
