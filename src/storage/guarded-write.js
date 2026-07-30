/**
 * Shared pre-write / open file-kind helpers for storage modules.
 */

import * as FileKind from '../core/file-kind.js';

/**
 * Write full text to a file handle without truncating on open.
 * Uses keepExistingData so a failed write cannot leave an empty file,
 * then truncates to the written size after a successful write.
 */
export function writeTextToHandle(handle, text) {
  var blob = text instanceof Blob ? text : new Blob([String(text)], { type: 'application/json' });
  return handle.createWritable({ keepExistingData: true }).then(function (writable) {
    return writable.write(blob).then(function () {
      return writable.truncate(blob.size);
    }).then(function () {
      return writable.close();
    }).catch(function (err) {
      return writable.abort().catch(function () {}).then(function () {
        throw err;
      });
    });
  });
}

export function guardedWrite(handle, expectedKind, writeFn, options) {
  return FileKind.guardBeforeWrite(handle, expectedKind, options || {}).then(function (g) {
    if (g.proceed) return writeFn();
    return import('../ui/file-kind-guard.js').then(function (Guard) {
      return Guard.promptGuardDecision(g, options || {}).then(function (choice) {
        if (choice !== 'proceed') return Promise.reject(new Error(g.message || 'cancelled'));
        return writeFn();
      });
    });
  });
}

export function assertKindOrThrow(raw, expectedKind, options) {
  var check = FileKind.assertFileKind(raw, expectedKind, options || {});
  if (check.ok) return raw;
  var err = new Error(check.message || 'KIND_MISMATCH');
  err.guard = check;
  throw err;
}
