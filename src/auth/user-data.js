/**
 * User file and registry data shapes.
 */

var REGISTRY_VERSION = 1;
  var USER_FILE_VERSION = 1;

  function uid(prefix) {
    var p = prefix || 'usr';
    return p + '_' + Math.random().toString(36).slice(2, 10);
  }

  function generateKey() {
    var arr = new Uint8Array(24);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(arr);
    } else {
      for (var i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
    }
    return 'k_' + Array.from(arr, function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  }

  function hashKeySync(key) {
    try {
      var nodeCrypto = require('crypto');
      return 'sha256:' + nodeCrypto.createHash('sha256').update(String(key)).digest('hex');
    } catch (e) {
      return null;
    }
  }

  function hashKey(key) {
    var sync = hashKeySync(key);
    if (sync) return Promise.resolve(sync);
    var enc = new TextEncoder().encode(String(key));
    return crypto.subtle.digest('SHA-256', enc).then(function (buf) {
      var hex = Array.from(new Uint8Array(buf), function (b) {
        return b.toString(16).padStart(2, '0');
      }).join('');
      return 'sha256:' + hex;
    });
  }

  function verifyKey(key, keyHash) {
    return hashKey(key).then(function (computed) {
      return computed === keyHash;
    });
  }

  function createEmptyRegistry() {
    return {
      meta: {
        version: REGISTRY_VERSION,
        fileKind: 'users_registry',
        lastModified: new Date().toISOString(),
        revision: 1
      },
      users: {}
    };
  }

  function migrateRegistry(raw) {
    if (!raw || typeof raw !== 'object') return createEmptyRegistry();
    if (!raw.meta) raw.meta = {};
    raw.meta.version = REGISTRY_VERSION;
    if (!raw.meta.revision) raw.meta.revision = 1;
    if (!raw.users) raw.users = {};
    Object.keys(raw.users).forEach(function (uid) {
      raw.users[uid] = migrateRegistryUserEntry(raw.users[uid]);
    });
    return raw;
  }

  function formatFullName(firstName, lastName) {
    return [String(firstName || '').trim(), String(lastName || '').trim()].filter(Boolean).join(' ');
  }

  function splitLegacyName(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return { firstName: '', lastName: '' };
    if (parts.length === 1) return { firstName: parts[0], lastName: '' };
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
  }

  function migrateUserFile(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (!raw.userId || !raw.key) return null;
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
      key: String(raw.key)
    };
  }

  function createUserFile(userId, firstName, lastName, email, key) {
    return {
      userId: userId,
      firstName: String(firstName || ''),
      lastName: String(lastName || ''),
      name: formatFullName(firstName, lastName),
      email: String(email || ''),
      key: key,
      fileKind: 'user_credential'
    };
  }

  function createRegistryEntry(role, keyHash, issuedBy, profile) {
    profile = profile || {};
    return {
      role: role,
      keyHash: keyHash,
      status: 'active',
      issuedAt: new Date().toISOString(),
      issuedBy: issuedBy || '',
      firstName: String(profile.firstName || ''),
      lastName: String(profile.lastName || ''),
      email: String(profile.email || '')
    };
  }

  function migrateRegistryUserEntry(entry) {
    if (!entry || typeof entry !== 'object') return entry;
    if (entry.firstName == null) entry.firstName = '';
    if (entry.lastName == null) entry.lastName = '';
    if (entry.email == null) entry.email = '';
    return entry;
  }

  /**
   * Validate user file against registry. Returns { ok, role, error }.
   */
  function validateSession(userFile, registry) {
    if (!userFile || !userFile.userId || !userFile.key) {
      return Promise.resolve({ ok: false, error: 'Invalid user file' });
    }
    var reg = migrateRegistry(registry);
    var entry = reg.users[userFile.userId];
    if (!entry) {
      return Promise.resolve({ ok: false, error: 'Unknown user ID' });
    }
    if (entry.status !== 'active') {
      return Promise.resolve({ ok: false, error: 'User account is revoked' });
    }
    return verifyKey(userFile.key, entry.keyHash).then(function (match) {
      if (!match) return { ok: false, error: 'Invalid user key' };
      return {
        ok: true,
        role: entry.role,
        userId: userFile.userId,
        name: userFile.name,
        firstName: userFile.firstName,
        lastName: userFile.lastName,
        email: userFile.email
      };
    });
  }

  function serializeRegistry(registry) {
    registry.meta.lastModified = new Date().toISOString();
    if (!registry.meta.fileKind) registry.meta.fileKind = 'users_registry';
    return JSON.stringify(registry, null, 2);
  }

  function serializeUserFile(userFile) {
    if (userFile && typeof userFile === 'object') {
      userFile.fileKind = 'user_credential';
    }
    return JSON.stringify(userFile, null, 2);
  }

export {
  REGISTRY_VERSION,
  USER_FILE_VERSION,
  uid,
  generateKey,
  hashKey,
  hashKeySync,
  verifyKey,
  createEmptyRegistry,
  migrateRegistry,
  migrateUserFile,
  formatFullName,
  splitLegacyName,
  createUserFile,
  createRegistryEntry,
  migrateRegistryUserEntry,
  validateSession,
  serializeRegistry,
  serializeUserFile
};
