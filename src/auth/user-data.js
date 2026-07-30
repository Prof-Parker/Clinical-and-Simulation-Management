/**
 * User file and registry data shapes.
 */

import {
  hashPassword,
  verifyPassword,
  isArgon2idHash,
  isLegacySha256Hash,
  passwordPolicyError,
  generateTemporaryPassword,
  MIN_PASSWORD_LENGTH,
  TEMP_PASSWORD_LENGTH
} from './password.js';

var REGISTRY_VERSION = 1;
var USER_FILE_VERSION = 1;
var TEMP_PASSWORD_TTL_MS = 72 * 60 * 60 * 1000;

function uid(prefix) {
  var p = prefix || 'usr';
  return p + '_' + Math.random().toString(36).slice(2, 10);
}

function createEmptyRegistry() {
  return {
    meta: {
      version: REGISTRY_VERSION,
      fileKind: 'users_registry',
      lastModified: new Date().toISOString(),
      revision: 1,
      helpDeskEngineerUserId: ''
    },
    users: {}
  };
}

function migrateRegistry(raw) {
  if (!raw || typeof raw !== 'object') return createEmptyRegistry();
  if (!raw.meta) raw.meta = {};
  raw.meta.version = REGISTRY_VERSION;
  if (!raw.meta.revision) raw.meta.revision = 1;
  if (raw.meta.helpDeskEngineerUserId == null) raw.meta.helpDeskEngineerUserId = '';
  else raw.meta.helpDeskEngineerUserId = String(raw.meta.helpDeskEngineerUserId);
  if (!raw.users) raw.users = {};
  Object.keys(raw.users).forEach(function (id) {
    raw.users[id] = migrateRegistryUserEntry(raw.users[id]);
  });
  return raw;
}

/**
 * Active program engineers with an email (candidates for help-desk mailto).
 * Returns [{ userId, entry, label }, ...] sorted by display name.
 */
function listProgramEngineers(registry) {
  var reg = migrateRegistry(registry);
  return Object.keys(reg.users)
    .filter(function (userId) {
      var entry = reg.users[userId];
      return entry &&
        entry.role === 'program_engineer' &&
        entry.status === 'active' &&
        normalizeEmail(entry.email);
    })
    .map(function (userId) {
      var entry = reg.users[userId];
      var name = formatFullName(entry.firstName, entry.lastName) || userId;
      return {
        userId: userId,
        entry: entry,
        label: name + ' (' + String(entry.email).trim() + ')'
      };
    })
    .sort(function (a, b) {
      return a.label.toLowerCase() < b.label.toLowerCase() ? -1 : 1;
    });
}

/**
 * Resolve meta.helpDeskEngineerUserId to an active program engineer with email.
 */
function getHelpDeskEngineer(registry) {
  var reg = migrateRegistry(registry);
  var userId = String(reg.meta.helpDeskEngineerUserId || '').trim();
  if (!userId) {
    return {
      error: 'No help desk engineer is assigned. Ask an admin to set one in User Management.'
    };
  }
  var entry = reg.users[userId];
  if (!entry || entry.status !== 'active' || entry.role !== 'program_engineer') {
    return {
      error: 'No help desk engineer is assigned. Ask an admin to set one in User Management.'
    };
  }
  var email = String(entry.email || '').trim();
  if (!email) {
    return {
      error: 'No help desk engineer is assigned. Ask an admin to set one in User Management.'
    };
  }
  return { userId: userId, entry: entry, email: email };
}

/**
 * Assign or clear the help-desk engineer. Empty userId clears the assignment.
 * Returns { ok, registry } or { error }.
 */
function setHelpDeskEngineerUserId(registry, userId) {
  var reg = migrateRegistry(registry);
  var id = String(userId || '').trim();
  if (!id) {
    reg.meta.helpDeskEngineerUserId = '';
    return { ok: true, registry: reg };
  }
  var engineers = listProgramEngineers(reg);
  var match = engineers.some(function (e) { return e.userId === id; });
  if (!match) {
    return { error: 'Select an active program engineer with an email address.' };
  }
  reg.meta.helpDeskEngineerUserId = id;
  return { ok: true, registry: reg };
}

function formatFullName(firstName, lastName) {
  return [String(firstName || '').trim(), String(lastName || '').trim()].filter(Boolean).join(' ');
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function findRegistryUserByEmail(registry, email) {
  var normalized = normalizeEmail(email);
  if (!normalized) return { error: 'Enter your email address' };
  var reg = migrateRegistry(registry);
  var matches = Object.keys(reg.users).filter(function (userId) {
    return normalizeEmail(reg.users[userId] && reg.users[userId].email) === normalized;
  });
  if (!matches.length) return { error: 'Invalid email or password' };
  if (matches.length > 1) {
    return { error: 'Multiple accounts use this email address. Ask an admin to correct the registry.' };
  }
  return { userId: matches[0], entry: reg.users[matches[0]] };
}

function isRegistryEmailAvailable(registry, email, excludeUserId) {
  var normalized = normalizeEmail(email);
  if (!normalized) return false;
  var reg = migrateRegistry(registry);
  return !Object.keys(reg.users).some(function (userId) {
    if (excludeUserId && userId === excludeUserId) return false;
    return normalizeEmail(reg.users[userId] && reg.users[userId].email) === normalized;
  });
}

function splitLegacyName(name) {
  var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

/**
 * Identity-only credential file. Plaintext secrets (legacy `key`) are stripped.
 */
function migrateUserFile(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!raw.userId) return null;
  var firstName = String(raw.firstName || '');
  var lastName = String(raw.lastName || '');
  if (!firstName && !lastName && raw.name) {
    var legacy = splitLegacyName(raw.name);
    firstName = legacy.firstName;
    lastName = legacy.lastName;
  }
  var fullName = formatFullName(firstName, lastName) || String(raw.name || '');
  return {
    userId: String(raw.userId),
    firstName: firstName,
    lastName: lastName,
    name: fullName,
    email: String(raw.email || ''),
    fileKind: 'user_credential'
  };
}

function createUserFile(userId, firstName, lastName, email) {
  return {
    userId: userId,
    firstName: String(firstName || ''),
    lastName: String(lastName || ''),
    name: formatFullName(firstName, lastName),
    email: String(email || ''),
    fileKind: 'user_credential'
  };
}

function createRegistryEntry(role, passwordHash, issuedBy, profile) {
  profile = profile || {};
  return {
    role: role,
    passwordHash: passwordHash,
    status: 'active',
    issuedAt: new Date().toISOString(),
    issuedBy: issuedBy || '',
    firstName: String(profile.firstName || ''),
    lastName: String(profile.lastName || ''),
    email: String(profile.email || ''),
    mustChangePassword: false,
    temporaryPasswordExpiresAt: ''
  };
}

function migrateRegistryUserEntry(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  if (entry.firstName == null) entry.firstName = '';
  if (entry.lastName == null) entry.lastName = '';
  if (entry.email == null) entry.email = '';
  if (entry.mustChangePassword == null) entry.mustChangePassword = false;
  if (entry.temporaryPasswordExpiresAt == null) entry.temporaryPasswordExpiresAt = '';
  // Prefer passwordHash; leave legacy keyHash in place so validateSession can reject it.
  if (!entry.passwordHash && entry.keyHash) {
    entry.passwordHash = entry.keyHash;
  }
  return entry;
}

function markTemporaryPassword(entry, now) {
  if (!entry || typeof entry !== 'object') return entry;
  var issued = now instanceof Date ? now : new Date();
  entry.mustChangePassword = true;
  entry.temporaryPasswordExpiresAt = new Date(issued.getTime() + TEMP_PASSWORD_TTL_MS).toISOString();
  entry.issuedAt = issued.toISOString();
  return entry;
}

function clearTemporaryPassword(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  entry.mustChangePassword = false;
  entry.temporaryPasswordExpiresAt = '';
  return entry;
}

function isTemporaryPasswordExpired(entry, now) {
  if (!entry || !entry.mustChangePassword) return false;
  var expiresAt = String(entry.temporaryPasswordExpiresAt || '').trim();
  if (!expiresAt) return true;
  var when = now instanceof Date ? now : new Date();
  var expMs = Date.parse(expiresAt);
  if (!Number.isFinite(expMs)) return true;
  return when.getTime() > expMs;
}

function sessionSuccessPayload(userId, entry, extras) {
  extras = extras || {};
  return Object.assign({
    ok: true,
    role: entry.role,
    userId: userId,
    name: formatFullName(entry.firstName, entry.lastName),
    firstName: String(entry.firstName || ''),
    lastName: String(entry.lastName || ''),
    email: String(entry.email || '')
  }, extras);
}

function afterPasswordVerified(userId, entry, identityOverrides) {
  identityOverrides = identityOverrides || {};
  if (entry.mustChangePassword) {
    if (isTemporaryPasswordExpired(entry)) {
      return {
        ok: false,
        error: 'Temporary password expired. Ask an admin to reset your password.'
      };
    }
    return sessionSuccessPayload(userId, entry, Object.assign({
      mustChangePassword: true,
      temporaryPasswordExpiresAt: String(entry.temporaryPasswordExpiresAt || '')
    }, identityOverrides));
  }
  return sessionSuccessPayload(userId, entry, identityOverrides);
}

/**
 * Apply a durable password change: new Argon2id hash + clear temporary flags.
 */
function finalizePasswordChange(entry, passwordHash) {
  if (!entry || typeof entry !== 'object') return entry;
  entry.passwordHash = passwordHash;
  if (entry.keyHash) delete entry.keyHash;
  clearTemporaryPassword(entry);
  entry.issuedAt = new Date().toISOString();
  return entry;
}

function storedPasswordHash(entry) {
  if (!entry) return '';
  return String(entry.passwordHash || entry.keyHash || '');
}

/**
 * Validate user identity + password against registry.
 * Returns { ok, role, error, ... }.
 * Password is never written to the user file or session storage by this module.
 */
function validateSession(userFile, registry, password) {
  if (!userFile || !userFile.userId) {
    return Promise.resolve({ ok: false, error: 'Invalid user file' });
  }
  if (password == null || String(password) === '') {
    return Promise.resolve({ ok: false, error: 'Enter your password' });
  }
  var reg = migrateRegistry(registry);
  var entry = reg.users[userFile.userId];
  if (!entry) {
    return Promise.resolve({ ok: false, error: 'Unknown user ID' });
  }
  if (entry.status !== 'active') {
    return Promise.resolve({ ok: false, error: 'User account is revoked' });
  }
  var hash = storedPasswordHash(entry);
  if (!hash || isLegacySha256Hash(hash) || !isArgon2idHash(hash)) {
    return Promise.resolve({
      ok: false,
      error: 'Password reset required. Ask an admin to reset your password.'
    });
  }
  return verifyPassword(password, hash).then(function (match) {
    if (!match) return { ok: false, error: 'Invalid password' };
    return afterPasswordVerified(userFile.userId, entry, {
      name: userFile.name,
      firstName: userFile.firstName,
      lastName: userFile.lastName,
      email: userFile.email
    });
  });
}

/**
 * Validate an email/password directly against the authoritative registry.
 * Identity files are not required for sign-in.
 */
function validateSessionByEmail(email, registry, password) {
  if (password == null || String(password) === '') {
    return Promise.resolve({ ok: false, error: 'Enter your password' });
  }
  var found = findRegistryUserByEmail(registry, email);
  if (found.error) return Promise.resolve({ ok: false, error: found.error });
  var entry = found.entry;
  if (entry.status !== 'active') {
    return Promise.resolve({ ok: false, error: 'User account is revoked' });
  }
  var hash = storedPasswordHash(entry);
  if (!hash || isLegacySha256Hash(hash) || !isArgon2idHash(hash)) {
    return Promise.resolve({
      ok: false,
      error: 'Password reset required. Ask an admin to reset your password.'
    });
  }
  return verifyPassword(password, hash).then(function (match) {
    if (!match) return { ok: false, error: 'Invalid email or password' };
    return afterPasswordVerified(found.userId, entry);
  });
}

function serializeRegistry(registry) {
  registry.meta.lastModified = new Date().toISOString();
  if (!registry.meta.fileKind) registry.meta.fileKind = 'users_registry';
  return JSON.stringify(registry, null, 2);
}

function serializeUserFile(userFile) {
  var out = migrateUserFile(userFile) || userFile;
  if (out && typeof out === 'object') {
    out.fileKind = 'user_credential';
    if ('key' in out) delete out.key;
  }
  return JSON.stringify(out, null, 2);
}

export {
  REGISTRY_VERSION,
  USER_FILE_VERSION,
  TEMP_PASSWORD_TTL_MS,
  TEMP_PASSWORD_LENGTH,
  uid,
  hashPassword,
  verifyPassword,
  passwordPolicyError,
  generateTemporaryPassword,
  MIN_PASSWORD_LENGTH,
  isArgon2idHash,
  isLegacySha256Hash,
  createEmptyRegistry,
  migrateRegistry,
  migrateUserFile,
  formatFullName,
  normalizeEmail,
  findRegistryUserByEmail,
  isRegistryEmailAvailable,
  listProgramEngineers,
  getHelpDeskEngineer,
  setHelpDeskEngineerUserId,
  splitLegacyName,
  createUserFile,
  createRegistryEntry,
  migrateRegistryUserEntry,
  markTemporaryPassword,
  clearTemporaryPassword,
  isTemporaryPasswordExpired,
  finalizePasswordChange,
  validateSession,
  validateSessionByEmail,
  serializeRegistry,
  serializeUserFile
};
