/**
 * Chooser dialog for hybrid save destinations.
 * Picker APIs run in the same user-gesture turn as the choice click
 * so Chromium does not abort with a misleading AbortError.
 */

import { closeDialog, dialogMessageHtml, escapeHtml } from './dialogs.js';

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
 * @param {{ title?: string, message?: string, allowDownload?: boolean,
 *   supportsFS?: boolean, supportsDirectory?: boolean,
 *   suggestedName?: string, stickyDirHandle?: FileSystemDirectoryHandle|null,
 *   preferredDest?: string }} options
 * @returns {Promise<{ dest: string, fileHandle?: FileSystemFileHandle,
 *   dirHandle?: FileSystemDirectoryHandle }>}
 */
export function promptSaveDestination(options) {
  options = options || {};
  var supportsFS = options.supportsFS !== false;
  var allowDownload = options.allowDownload !== false;
  var supportsDirectory = !!options.supportsDirectory;
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

  var folderHint = stickyDir
    ? ('Reuses your linked folder; writes ' + (suggestedName || 'the suggested filename'))
    : ('Pick a folder; writes ' + (suggestedName || 'the suggested filename'));

  var choices = [
    {
      dest: DEST.NEW,
      label: 'Create new OneDrive file…',
      hint: 'Use a NEW filename only — confirming Replace can wipe the target before the app can check it'
    },
    {
      dest: DEST.OVERWRITE,
      label: 'Overwrite existing OneDrive file…',
      hint: 'Open picker — validates file type before write (safe)'
    }
  ];
  if (supportsDirectory) {
    choices.push({
      dest: DEST.FOLDER,
      label: 'Save to OneDrive folder…',
      hint: folderHint
    });
  }
  if (allowDownload) {
    choices.push({
      dest: DEST.DOWNLOAD,
      label: 'Download backup…',
      hint: 'Browser download only (not linked for Sync)'
    });
  }

  if (options.preferredDest === DEST.DOWNLOAD && allowDownload) {
    choices = choices.filter(function (c) { return c.dest === DEST.DOWNLOAD; })
      .concat(choices.filter(function (c) { return c.dest !== DEST.DOWNLOAD; }));
  } else if (options.preferredDest === DEST.NEW) {
    choices = choices.filter(function (c) { return c.dest === DEST.NEW; })
      .concat(choices.filter(function (c) { return c.dest !== DEST.NEW; }));
  } else if (options.preferredDest === DEST.FOLDER && supportsDirectory) {
    choices = choices.filter(function (c) { return c.dest === DEST.FOLDER; })
      .concat(choices.filter(function (c) { return c.dest !== DEST.FOLDER; }));
  }

  return new Promise(function (resolve) {
    document.getElementById('dialogTitle').textContent = title;
    var body = dialogMessageHtml(message);
    if (suggestedName) {
      body += '<p class="section-sub" style="margin:0.5rem 0 0">Suggested filename: <strong>' +
        escapeHtml(suggestedName) + '</strong></p>';
    }
    body += '<div class="hybrid-save-choices" role="group" aria-label="Save destinations">';
    choices.forEach(function (c) {
      body += '<button type="button" class="btn hybrid-save-choice" data-hybrid-dest="' +
        escapeHtml(c.dest) + '" style="display:block;width:100%;margin:0.5rem 0;text-align:left">' +
        '<strong>' + escapeHtml(c.label) + '</strong>' +
        (c.hint ? '<br><span class="section-sub" style="font-weight:normal">' +
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
        // Must call picker in this click turn (before closeDialog / await IDB).
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
