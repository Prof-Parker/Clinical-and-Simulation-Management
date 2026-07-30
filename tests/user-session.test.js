import { describe, it, expect } from 'vitest';
import { UserData } from './_harness.js';
import {
  hashPassword,
  verifyPassword,
  isArgon2idHash,
  isLegacySha256Hash,
  passwordPolicyError
} from '../src/auth/password.js';

describe('password argon2id', () => {
  it('hashes and verifies round-trip', async () => {
    var hash = await hashPassword('test-pass-ok');
    expect(isArgon2idHash(hash)).toBe(true);
    expect(await verifyPassword('test-pass-ok', hash)).toBe(true);
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });

  it('rejects short passwords', async () => {
    expect(passwordPolicyError('short')).toMatch(/at least/);
    await expect(hashPassword('short')).rejects.toThrow(/at least/);
  });

  it('does not verify legacy sha256 hashes', async () => {
    expect(isLegacySha256Hash('sha256:abc')).toBe(true);
    expect(await verifyPassword('anything', 'sha256:abc')).toBe(false);
  });
});

describe('user-session.test.js', () => {
  it('validates argon2id passwords and rejects legacy hashes', async () => {
    let failed = 0;

    function assert(cond, msg) {
      if (cond) return;
      failed++;
      console.error('FAIL: ' + msg);
    }

    assert(UserData.formatFullName('Ada', 'Lovelace') === 'Ada Lovelace', 'formatFullName joins names');
    var legacyFile = UserData.migrateUserFile({
      userId: 'usr_legacy',
      name: 'Jane Q Public',
      email: 'j@example.edu',
      key: 'k_x'
    });
    assert(legacyFile.firstName === 'Jane', 'legacy user file splits first name');
    assert(legacyFile.lastName === 'Q Public', 'legacy user file splits last name');
    assert(!('key' in legacyFile), 'migrateUserFile strips plaintext key');

    var userId = 'usr_test1';
    var password = 'admin-pass';
    var passwordHash = await UserData.hashPassword(password);
    var registry = UserData.createEmptyRegistry();
    registry.users[userId] = UserData.createRegistryEntry(
      'admin_staff',
      passwordHash,
      'Seeder',
      { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.edu' }
    );

    var userFile = UserData.createUserFile(userId, 'Ada', 'Lovelace', 'a@example.edu');
    assert(!('key' in userFile), 'createUserFile has no key');

    var r = await UserData.validateSession(userFile, registry, password);
    assert(r.ok === true, 'valid password signs in');
    assert(r.role === 'admin_staff', 'role from registry');

    r = await UserData.validateSession(userFile, registry, 'wrong-password');
    assert(r.ok === false && /Invalid password/.test(r.error), 'wrong password rejected');

    r = await UserData.validateSession(userFile, registry, '');
    assert(r.ok === false && /password/i.test(r.error), 'empty password rejected');

    registry.users[userId].passwordHash = 'sha256:deadbeef';
    r = await UserData.validateSession(userFile, registry, password);
    assert(r.ok === false && /reset required/i.test(r.error), 'legacy sha256 requires reset');

    registry.users[userId].passwordHash = undefined;
    registry.users[userId].keyHash = 'sha256:deadbeef';
    r = await UserData.validateSession(userFile, registry, password);
    assert(r.ok === false && /reset required/i.test(r.error), 'legacy keyHash requires reset');

    expect(failed).toBe(0);
  });

  it('signs in by normalized email and detects duplicate registry emails', async () => {
    var registry = UserData.createEmptyRegistry();
    var passwordHash = await UserData.hashPassword('email-pass');
    registry.users.usr_email = UserData.createRegistryEntry(
      'lead_course_faculty',
      passwordHash,
      'Seeder',
      { firstName: 'Grace', lastName: 'Hopper', email: 'Grace.Hopper@Example.edu' }
    );

    var result = await UserData.validateSessionByEmail(
      '  grace.hopper@example.EDU ',
      registry,
      'email-pass'
    );
    expect(result).toMatchObject({
      ok: true,
      userId: 'usr_email',
      name: 'Grace Hopper',
      email: 'Grace.Hopper@Example.edu'
    });

    result = await UserData.validateSessionByEmail('missing@example.edu', registry, 'email-pass');
    expect(result).toMatchObject({ ok: false, error: 'Invalid email or password' });

    expect(UserData.isRegistryEmailAvailable(registry, 'new@example.edu')).toBe(true);
    expect(UserData.isRegistryEmailAvailable(registry, 'GRACE.HOPPER@example.edu')).toBe(false);
    expect(UserData.isRegistryEmailAvailable(registry, 'GRACE.HOPPER@example.edu', 'usr_email')).toBe(true);

    registry.users.usr_duplicate = UserData.createRegistryEntry(
      'admin_staff',
      passwordHash,
      'Seeder',
      { firstName: 'Duplicate', lastName: 'User', email: 'grace.hopper@example.edu' }
    );
    result = await UserData.validateSessionByEmail('grace.hopper@example.edu', registry, 'email-pass');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Multiple accounts/);
  });

  it('migrates and resolves help desk engineer assignment', async () => {
    var empty = UserData.createEmptyRegistry();
    expect(empty.meta.helpDeskEngineerUserId).toBe('');

    var migrated = UserData.migrateRegistry({
      meta: { version: 1, revision: 2 },
      users: {}
    });
    expect(migrated.meta.helpDeskEngineerUserId).toBe('');

    var passwordHash = await UserData.hashPassword('engineer-pass');
    var registry = UserData.createEmptyRegistry();
    registry.users.usr_eng = UserData.createRegistryEntry(
      'program_engineer',
      passwordHash,
      'Seeder',
      { firstName: 'Program', lastName: 'Engineer', email: 'engineer@example.edu' }
    );
    registry.users.usr_admin = UserData.createRegistryEntry(
      'admin_staff',
      passwordHash,
      'Seeder',
      { firstName: 'Admin', lastName: 'Staff', email: 'admin@example.edu' }
    );

    expect(UserData.getHelpDeskEngineer(registry).error).toMatch(/No help desk engineer/);
    expect(UserData.listProgramEngineers(registry)).toHaveLength(1);

    var setBad = UserData.setHelpDeskEngineerUserId(registry, 'usr_admin');
    expect(setBad.error).toMatch(/program engineer/);

    var setOk = UserData.setHelpDeskEngineerUserId(registry, 'usr_eng');
    expect(setOk.ok).toBe(true);
    expect(setOk.registry.meta.helpDeskEngineerUserId).toBe('usr_eng');

    var helpDesk = UserData.getHelpDeskEngineer(setOk.registry);
    expect(helpDesk).toMatchObject({
      userId: 'usr_eng',
      email: 'engineer@example.edu'
    });

    setOk.registry.users.usr_eng.status = 'revoked';
    expect(UserData.getHelpDeskEngineer(setOk.registry).error).toMatch(/No help desk engineer/);

    var cleared = UserData.setHelpDeskEngineerUserId(setOk.registry, '');
    expect(cleared.ok).toBe(true);
    expect(cleared.registry.meta.helpDeskEngineerUserId).toBe('');
  });

  it('generates temporary passwords and enforces 72-hour forced change', async () => {
    var a = UserData.generateTemporaryPassword();
    var b = UserData.generateTemporaryPassword();
    expect(a).toHaveLength(UserData.TEMP_PASSWORD_LENGTH);
    expect(b).toHaveLength(UserData.TEMP_PASSWORD_LENGTH);
    expect(a).not.toBe(b);
    expect(UserData.passwordPolicyError(a)).toBeNull();
    expect(/^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789]+$/.test(a)).toBe(true);

    var tempPassword = 'TempPass99';
    var passwordHash = await UserData.hashPassword(tempPassword);
    var registry = UserData.createEmptyRegistry();
    registry.users.usr_temp = UserData.createRegistryEntry(
      'admin_staff',
      passwordHash,
      'Seeder',
      { firstName: 'Temp', lastName: 'User', email: 'temp@example.edu' }
    );
    var issued = new Date('2026-07-29T12:00:00.000Z');
    UserData.markTemporaryPassword(registry.users.usr_temp, issued);
    expect(registry.users.usr_temp.mustChangePassword).toBe(true);
    expect(registry.users.usr_temp.temporaryPasswordExpiresAt).toBe('2026-08-01T12:00:00.000Z');

    var okChange = await UserData.validateSessionByEmail('temp@example.edu', registry, tempPassword);
    expect(okChange).toMatchObject({
      ok: true,
      mustChangePassword: true,
      userId: 'usr_temp'
    });

    expect(UserData.isTemporaryPasswordExpired(
      registry.users.usr_temp,
      new Date('2026-08-01T12:00:01.000Z')
    )).toBe(true);
    registry.users.usr_temp.temporaryPasswordExpiresAt = '2026-07-28T12:00:00.000Z';
    var expired = await UserData.validateSessionByEmail('temp@example.edu', registry, tempPassword);
    expect(expired.ok).toBe(false);
    expect(expired.error).toMatch(/expired/i);

    UserData.markTemporaryPassword(registry.users.usr_temp, issued);
    var newHash = await UserData.hashPassword('BrandNewPass1');
    UserData.finalizePasswordChange(registry.users.usr_temp, newHash);
    expect(registry.users.usr_temp.mustChangePassword).toBe(false);
    expect(registry.users.usr_temp.temporaryPasswordExpiresAt).toBe('');
    var afterChange = await UserData.validateSessionByEmail('temp@example.edu', registry, 'BrandNewPass1');
    expect(afterChange).toMatchObject({ ok: true, userId: 'usr_temp' });
    expect(afterChange.mustChangePassword).toBeFalsy();
  });
});
