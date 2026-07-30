/**
 * Argon2id password hashing (PHC encoded strings).
 * Used for registry passwordHash verifiers — not encryption.
 */

import { argon2id, argon2Verify } from 'hash-wasm';

var MIN_PASSWORD_LENGTH = 8;
var TEMP_PASSWORD_LENGTH = 20;
/** Ambiguous characters (0/O, 1/I/l) omitted for handoff readability. */
var TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
var ARGON2_PARAMS = {
  parallelism: 1,
  iterations: 3,
  memorySize: 65536,
  hashLength: 32,
  outputType: 'encoded'
};

function randomSalt(byteLength) {
  var salt = new Uint8Array(byteLength || 16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(salt);
  } else {
    for (var i = 0; i < salt.length; i++) salt[i] = Math.floor(Math.random() * 256);
  }
  return salt;
}

/**
 * Cryptographically secure temporary password for admin issuance.
 * Fails closed if crypto.getRandomValues is unavailable (no Math.random fallback).
 */
export function generateTemporaryPassword(length) {
  var len = length == null ? TEMP_PASSWORD_LENGTH : Number(length);
  if (!Number.isFinite(len) || len < MIN_PASSWORD_LENGTH) {
    throw new Error('Temporary password length must be at least ' + MIN_PASSWORD_LENGTH);
  }
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    throw new Error('Secure random generator is unavailable');
  }
  var alphabet = TEMP_PASSWORD_ALPHABET;
  var maxUnbiased = Math.floor(256 / alphabet.length) * alphabet.length;
  var out = '';
  while (out.length < len) {
    var buf = new Uint8Array((len - out.length) + 16);
    crypto.getRandomValues(buf);
    for (var i = 0; i < buf.length && out.length < len; i++) {
      if (buf[i] < maxUnbiased) {
        out += alphabet.charAt(buf[i] % alphabet.length);
      }
    }
  }
  return out;
}

/**
 * @returns {string|null} Error message, or null if acceptable.
 */
export function passwordPolicyError(password) {
  var pw = String(password == null ? '' : password);
  if (!pw) return 'Password is required';
  if (pw.length < MIN_PASSWORD_LENGTH) {
    return 'Password must be at least ' + MIN_PASSWORD_LENGTH + ' characters';
  }
  return null;
}

export function isArgon2idHash(passwordHash) {
  return typeof passwordHash === 'string' && passwordHash.indexOf('$argon2id$') === 0;
}

export function isLegacySha256Hash(passwordHash) {
  return typeof passwordHash === 'string' && passwordHash.indexOf('sha256:') === 0;
}

/**
 * Hash a password to a PHC argon2id string for registry storage.
 */
export function hashPassword(password) {
  var err = passwordPolicyError(password);
  if (err) return Promise.reject(new Error(err));
  return argon2id(Object.assign({}, ARGON2_PARAMS, {
    password: String(password),
    salt: randomSalt(16)
  }));
}

/**
 * Verify a password against a stored PHC hash.
 * Returns false for legacy/non-argon2 hashes (caller should surface reset-required).
 */
export function verifyPassword(password, passwordHash) {
  if (!isArgon2idHash(passwordHash)) {
    return Promise.resolve(false);
  }
  if (password == null || password === '') {
    return Promise.resolve(false);
  }
  return argon2Verify({
    password: String(password),
    hash: String(passwordHash)
  }).catch(function () {
    return false;
  });
}

export { MIN_PASSWORD_LENGTH, TEMP_PASSWORD_LENGTH, TEMP_PASSWORD_ALPHABET, ARGON2_PARAMS };
