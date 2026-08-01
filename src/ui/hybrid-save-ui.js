/**
 * Chooser dialog for hybrid save destinations.
 * Picker APIs run in the same user-gesture turn as the choice click
 * so Chromium does not abort with a misleading AbortError.
 * Safe destinations (folder / overwrite) are listed first; Create new is demoted.
 */

import { closeDialog, dialogMessageHtml, escapeHtml } from './dialogs.js';
import { canCreateNewFile } from './file-menu-gating.js';

export var DEST = {
  NEW: 'new',
  OVERWRITE: 'overwrite',
  FOLDER: 'folder',
  DOWNLOAD: 'download',
  CANCEL: 'cancel'
};

var JSON_TYPES = [{ description: 'JSON', accept: { 'application/json': ['.json'] } }];

export function isAbortError(err) {
  if (!err) return false;
  if (err.name === 'AbortError') return true;
  return /aborted a request|user aborted/i.test(String(err.message || ''));
}

export function isCancelError(err) {
  if (!err) return false;
  if (isAbortError(err)) return true;
  return String(err.message || err) === 'cancelled';
}

/**
 * Build ordered destination choices (safe first).
 * @returns {Array<{ dest: string, label: string, hint: string, primary?: boolean, danger?: boolean }>}
 */
export function buildSaveChoices(options) {
  options = options || {};
  var supportsFS = options.supportsFS !== false;
  var allowDownload = options.allowDownload !== false;
  var supportsDirectory = !!options.supportsDirectory;
  var suggestedName = options.suggestedName || '';
  var stickyDir = options.stickyDirHandle || null;
  var allowCreateNew = options.allowCreateNew != null
    ? !!options.allowCreateNew
    : canCreateNewFile();
  var folderLabel = options.folderLabel || 'Save to OneDrive folder…';

  if (!supportsFS) return [];

  var folderHint = stickyDir
    ? ('Writes ' + (suggestedName || 'the suggested filename') + ' into the linked folder (validates type before write)')
    : ('Pick a folder; writes ' + (suggestedName || 'the suggested filename') + ' (validates type before write)');

  var choices = [];
  if (supportsDirectory) {
    choices.push({
      dest: DEST.FOLDER,
      label: folderLabel,
      hint: folderHint,
      primary: true
    });
  }
  choices.push({
    dest: DEST.OVERWRITE,
    label: 'Overwrite existing OneDrive file…',
    hint: 'Open picker — validates file type before write (safe)',
    primary: !supportsDirectory
  });
  if (allowDownload) {
    choices.push({
      dest: DEST.DOWNLOAD,
      label: 'Download backup…',
      hint: 'Browser download only (not linked for Sync)'
    });
  }
  if (allowCreateNew) {
    choices.push({
      dest: DEST.NEW,
      label: 'Create new OneDrive file…',
      hint: 'Use a NEW filename only — confirming Replace can wipe the target before the app can check it',
      danger: true
    });
  }

  if (options.preferredDest === DEST.DOWNLOAD && allowDownload) {
    choices = choices.filter(function (c) { return c.dest === DEST.DOWNLOAD; })
      .concat(choices.filter(function (c) { return c.dest !== DEST.DOWNLOAD; }));
  } else if (options.preferredDest === DEST.NEW && allowCreateNew) {
    choices = choices.filter(function (c) { return c.dest === DEST.NEW; })
      .concat(choices.filter(function (c) { return c.dest !== DEST.NEW; }));
  } else if (options.preferredDest === DEST.FOLDER && supportsDirectory) {
    choices = choices.filter(function (c) { return c.dest === DEST.FOLDER; })
      .concat(choices.filter(function (c) { return c.dest !== DEST.FOLDER; }));
  } else if (options.preferredDest === DEST.OVERWRITE) {
    choices = choices.filter(function (c) { return c.dest === DEST.OVERWRITE; })
      .concat(choices.filter(function (c) { return c.dest !== DEST.OVERWRITE; }));
  }

  return choices;
}

/**
 * @param {{ title?: string, message?: string, allowDownload?: boolean,
 *   supportsFS?: boolean, supportsDirectory?: boolean,
 *   suggestedName?: string, stickyDirHandle?: FileSystemDirectoryHandle|null,
 *   preferredDest?: string, allowCreateNew?: boolean, folderLabel?: string }} options
 * @returns {Promise<{ dest: string, fileHandle?: FileSystemFileHandle,
 *   dirHandle?: FileSystemDirectoryHandle }>}
 */
export function promptSaveDestination(options) {
  options = options || {};
  var supportsFS = options.supportsFS !== false;
  var allowDownload = options.allowDownload !== false;
  var suggestedName = options.suggestedName || '';
  var stickyDir = options.stickyDirHandle || null;

  if (!supportsFS && allowDownload) {
    return Promise.resolve({ dest: DEST.DOWNLOAD });
  }
  if (!supportsFS) {
    return Promise.resolve({ dest: DEST.CANCEL });
  }

  var title = options.title || 'Save as…';
  var message = options.message ||
    'Choose how to save. Prefer Save to folder or Overwrite existing — those validate the ' +
    'file type before writing. Create new can wipe a file if you confirm Replace in the system dialog.';

  var choices = buildSaveChoices(options);

  return new Promise(function (resolve) {
    document.getElementById('dialogTitle').textContent = title;
    var body = dialogMessageHtml(message);
    if (suggestedName) {
      body += '<p class="section-sub" style="margin:0.5rem 0 0">Suggested filename: <strong>' +
        escapeHtml(suggestedName) + '</strong></p>';
    }
    body += '<div class="hybrid-save-choices" role="group" aria-label="Save destinations">';
    choices.forEach(function (c) {
      var cls = 'btn hybrid-save-choice';
      if (c.primary) cls += ' btn-primary';
      if (c.danger) cls += ' btn-danger hybrid-save-choice-danger';
      body += '<button type="button" class="' + cls + '" data-hybrid-dest="' +
        escapeHtml(c.dest) + '">' +
        '<strong>' + escapeHtml(c.label) + '</strong>' +
        (c.hint ? '<br><span class="section-sub hybrid-save-hint">' +
          escapeHtml(c.hint) + '</span>' : '') +
        '</button>';
    });
    body += '</div>';
    document.getElementById('dialogBody').innerHTML = body;

    var cancelBtn = document.getElementById('dialogCancel');
    var saveBtn = document.getElementById('dialogSave');
    var extraBtn = document.getElementById('dialogExtra');
    if (extraBtn) extraBtn.style.display = 'none';
    if (saveBtn) saveBtn.style.display = 'none';
    cancelBtn.style.display = '';
    cancelBtn.textContent = 'Cancel';

    var settled = false;
    function finish(result) {
      if (settled) return;
      settled = true;
      closeDialog();
      resolve(result);
    }

    var nextCancel = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(nextCancel, cancelBtn);
    nextCancel.addEventListener('click', function () {
      finish({ dest: DEST.CANCEL });
    });

    document.getElementById('dialogBody').onclick = function (e) {
      var btn = e.target.closest && e.target.closest('[data-hybrid-dest]');
      if (!btn || settled) return;
      var dest = btn.getAttribute('data-hybrid-dest');

      if (dest === DEST.DOWNLOAD) {
        finish({ dest: DEST.DOWNLOAD });
        return;
      }

      if (dest === DEST.FOLDER) {
        if (stickyDir) {
          finish({ dest: DEST.FOLDER, dirHandle: stickyDir });
          return;
        }
        if (typeof window.showDirectoryPicker !== 'function') {
          finish({ dest: DEST.CANCEL });
          return;
        }
        window.showDirectoryPicker({ mode: 'readwrite' }).then(function (dir) {
          finish({ dest: DEST.FOLDER, dirHandle: dir });
        }).catch(function (err) {
          if (isAbortError(err)) finish({ dest: DEST.CANCEL });
          else finish({ dest: DEST.CANCEL, error: err });
        });
        return;
      }

      if (dest === DEST.NEW) {
        if (typeof window.showSaveFilePicker !== 'function') {
          finish({ dest: DEST.CANCEL });
          return;
        }
        window.showSaveFilePicker({
          suggestedName: suggestedName || 'data.json',
          types: JSON_TYPES
        }).then(function (handle) {
          finish({ dest: DEST.NEW, fileHandle: handle });
        }).catch(function (err) {
          if (isAbortError(err)) finish({ dest: DEST.CANCEL });
          else finish({ dest: DEST.CANCEL, error: err });
        });
        return;
      }

      if (dest === DEST.OVERWRITE) {
        if (typeof window.showOpenFilePicker !== 'function') {
          finish({ dest: DEST.CANCEL });
          return;
        }
        window.showOpenFilePicker({
          mode: 'readwrite',
          types: JSON_TYPES,
          multiple: false
        }).then(function (handles) {
          finish({ dest: DEST.OVERWRITE, fileHandle: handles[0] });
        }).catch(function (err) {
          if (isAbortError(err)) finish({ dest: DEST.CANCEL });
          else finish({ dest: DEST.CANCEL, error: err });
        });
        return;
      }

      finish({ dest: DEST.CANCEL });
    };

    var content = document.querySelector('#dialogModal .modal-content');
    if (content) content.style.maxWidth = '28rem';
    document.getElementById('dialogModal').classList.add('open');
  });
}
