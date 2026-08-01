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
    if (onClick) onClick();
  });
  return next;
}

/**
 * Prompt from evaluateGuard / guardBeforeWrite result.
 * Soft confirms for non-engineers require typing the target filename.
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
  var softConfirm = !!(result.needsConfirm && !result.hardBlock);
  var requireTypedName = softConfirm && !canOverrideKind() && !!(result.fileName);

  return new Promise(function (resolve) {
    document.getElementById('dialogTitle').textContent = title;
    var body = dialogMessageHtml(message);
    if (requireTypedName) {
      body += '<p class="section-sub" style="margin:0.75rem 0 0.35rem">Type the filename to confirm overwrite:</p>' +
        '<p class="section-sub"><code>' + escapeHtml(result.fileName) + '</code></p>' +
        '<input id="fileKindConfirmName" type="text" class="select-control" ' +
        'aria-label="Type filename to confirm" autocomplete="off" ' +
        'style="width:100%;margin:0.35rem 0 0">';
    }
    document.getElementById('dialogBody').innerHTML = body;

    var cancelBtn = document.getElementById('dialogCancel');
    var saveBtn = document.getElementById('dialogSave');
    var extraBtn = document.getElementById('dialogExtra');

    function finish(choice) {
      closeDialog();
      resolve(choice);
    }

    cancelBtn.style.display = '';
    cancelBtn.textContent = options.cancelLabel || 'Cancel';
    bindButton(cancelBtn, function () { finish('cancel'); });

    saveBtn.style.display = '';
    saveBtn.className = 'btn btn-primary';
    saveBtn.textContent = options.repickLabel || 'Choose a different file…';
    bindButton(saveBtn, function () { finish('repick'); });

    if (extraBtn) {
      if (allowOverride || (softConfirm && !requireTypedName)) {
        extraBtn.style.display = '';
        extraBtn.className = allowOverride ? 'btn btn-danger' : 'btn';
        extraBtn.textContent = allowOverride
          ? 'Overwrite anyway'
          : (options.confirmLabel || 'Overwrite anyway');
        bindButton(extraBtn, function () { finish('proceed'); });
      } else {
        extraBtn.style.display = 'none';
      }
    }

    // Soft confirm (non-hard): primary is overwrite; secondary repick.
    if (softConfirm) {
      saveBtn.className = 'btn btn-danger';
      saveBtn.textContent = options.confirmLabel || 'Overwrite anyway';
      bindButton(saveBtn, function () {
        if (requireTypedName) {
          var input = document.getElementById('fileKindConfirmName');
          var typed = input ? String(input.value || '').trim() : '';
          if (typed !== String(result.fileName)) {
            if (input) {
              input.setAttribute('aria-invalid', 'true');
              input.focus();
            }
            return;
          }
        }
        finish('proceed');
      });
      if (extraBtn) {
        extraBtn.style.display = '';
        extraBtn.className = 'btn';
        extraBtn.textContent = options.repickLabel || 'Choose a different file…';
        bindButton(extraBtn, function () { finish('repick'); });
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
