/**
 * Shared pre-write / open file-kind helpers for storage modules.
 */

import * as FileKind from '../core/file-kind.js';

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
