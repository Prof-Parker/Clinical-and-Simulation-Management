/**
 * UI prompts for file-kind guard results (dialogs).
 */

import * as FileKind from '../core/file-kind.js';
import * as UserSession from '../auth/user-session.js';
import { closeDialog, dialogMessageHtml, escapeHtml } from '../ui/dialogs.js';

function canOverrideKind() {
  var session = UserSession && UserSession.getSession && UserSession.getSession();
  return !!(session && session.role === 'program_engineer');
}

function bindButton(btn, onClick) {
  var next = btn.cloneNode(true);
  btn.parentNode.replaceChild(next, btn);
  next.addEventListener('click', function () {
    closeDialog();
    if (onClick) onClick();
  });
  return next;
}

/**
 * Prompt from evaluateGuard / guardBeforeWrite result.
 * @returns {Promise<'proceed'|'repick'|'cancel'>}
 */
export function promptGuardDecision(result, options) {
  options = options || {};
  if (!result || result.proceed) return Promise.resolve('proceed');

  var allowOverride = options.allowOverride !== false && canOverrideKind() && result.hardBlock;
  var title = result.title || 'Wrong file type';
  var message = result.message || FileKind.formatKindError(result.code, {
    name: result.fileName,
    expected: result.expected,
    detected: result.detected
  });

  return new Promise(function (resolve) {
    document.getElementById('dialogTitle').textContent = title;
    document.getElementById('dialogBody').innerHTML = dialogMessageHtml(message);

    var cancelBtn = document.getElementById('dialogCancel');
    var saveBtn = document.getElementById('dialogSave');
    var extraBtn = document.getElementById('dialogExtra');

    cancelBtn.style.display = '';
    cancelBtn.textContent = options.cancelLabel || 'Cancel';
    bindButton(cancelBtn, function () { resolve('cancel'); });

    saveBtn.style.display = '';
    saveBtn.className = 'btn btn-primary';
    saveBtn.textContent = options.repickLabel || 'Choose a different file…';
    bindButton(saveBtn, function () { resolve('repick'); });

    if (extraBtn) {
      if (allowOverride || result.needsConfirm) {
        extraBtn.style.display = '';
        extraBtn.className = allowOverride ? 'btn btn-danger' : 'btn';
        extraBtn.textContent = allowOverride
          ? 'Overwrite anyway'
          : (options.confirmLabel || 'Overwrite anyway');
        bindButton(extraBtn, function () { resolve('proceed'); });
      } else {
        extraBtn.style.display = 'none';
      }
    }

    // Soft confirm (non-hard): primary is overwrite; secondary repick already on save.
    if (result.needsConfirm && !result.hardBlock) {
      saveBtn.textContent = options.confirmLabel || 'Overwrite anyway';
      bindButton(saveBtn, function () { resolve('proceed'); });
      if (extraBtn) {
        extraBtn.style.display = '';
        extraBtn.className = 'btn';
        extraBtn.textContent = options.repickLabel || 'Choose a different file…';
        bindButton(extraBtn, function () { resolve('repick'); });
      }
    }

    document.getElementById('dialogModal').classList.add('open');
  });
}

/**
 * Run guardBeforeWrite then prompt. Returns { proceed, handle } or rejects cancel.
 * onRepick should return a Promise resolving to a new handle (or null to cancel).
 */
export function runWriteGuard(handle, expectedKind, options) {
  options = options || {};
  return FileKind.guardBeforeWrite(handle, expectedKind, options).then(function (result) {
    if (result.proceed) return { proceed: true, handle: handle };
    return promptGuardDecision(result, options).then(function (choice) {
      if (choice === 'proceed') return { proceed: true, handle: handle, overridden: !!result.hardBlock };
      if (choice === 'repick' && typeof options.onRepick === 'function') {
        return options.onRepick().then(function (nextHandle) {
          if (!nextHandle) return { proceed: false, cancelled: true };
          return runWriteGuard(nextHandle, expectedKind, options);
        });
      }
      return { proceed: false, cancelled: true };
    });
  });
}

export function alertKindError(result) {
  var msg = (result && result.message) || FileKind.formatKindError(
    (result && result.code) || FileKind.ERROR_CODES.KIND_MISMATCH,
    result || {}
  );
  document.getElementById('dialogTitle').textContent = (result && result.title) || 'Wrong file type';
  document.getElementById('dialogBody').innerHTML = dialogMessageHtml(msg);
  document.getElementById('dialogCancel').style.display = 'none';
  var extra = document.getElementById('dialogExtra');
  if (extra) extra.style.display = 'none';
  var saveBtn = document.getElementById('dialogSave');
  var next = saveBtn.cloneNode(true);
  saveBtn.parentNode.replaceChild(next, saveBtn);
  next.textContent = 'OK';
  next.className = 'btn btn-primary';
  next.style.display = '';
  next.addEventListener('click', function () { closeDialog(); });
  document.getElementById('dialogModal').classList.add('open');
}

/** Escape helper re-export for callers building custom copy. */
export { escapeHtml };
