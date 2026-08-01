/**
 * Hybrid save destinations — new / overwrite / folder / download.
 * Overwrite and folder paths read+guard before createWritable (no OS Replace wipe).
 * Pickers are started from the chooser click (see hybrid-save-ui) to preserve user activation.
 */

import { DEST, promptSaveDestination, isCancelError } from '../ui/hybrid-save-ui.js';

function suggestedNameOf(config) {
  var n = config.suggestedName;
  return typeof n === 'function' ? n() : (n || 'data.json');
}

function supportsFS() {
  return typeof window.showOpenFilePicker === 'function';
}

function supportsDirectoryPicker() {
  return typeof window.showDirectoryPicker === 'function';
}

function idbGet(config, key) {
  if (typeof config.idbGet === 'function') return config.idbGet(key);
  return Promise.resolve(null);
}

function idbSet(config, key, val) {
  if (typeof config.idbSet === 'function') return config.idbSet(key, val);
  return Promise.resolve();
}

/**
 * Ensure readwrite permission on a FileSystemHandle.
 * @returns {Promise<boolean>}
 */
export function ensureReadwritePermission(handle) {
  if (!handle || typeof handle.queryPermission !== 'function') {
    return Promise.resolve(false);
  }
  return handle.queryPermission({ mode: 'readwrite' }).then(function (perm) {
    if (perm === 'granted') return true;
    if (typeof handle.requestPermission !== 'function') return false;
    return handle.requestPermission({ mode: 'readwrite' }).then(function (p) {
      return p === 'granted';
    });
  }).catch(function () { return false; });
}

function requireReadwrite(handle, label) {
  return ensureReadwritePermission(handle).then(function (ok) {
    if (!ok) {
      return Promise.reject(new Error(
        'Write permission was not granted for ' + (label || 'the selected file or folder') + '.'
      ));
    }
    return handle;
  });
}

function persistAfterWrite(config, fileHandle, dirHandle) {
  var chain = Promise.resolve();
  if (fileHandle && config.fileHandleKey) {
    chain = chain.then(function () {
      return idbSet(config, config.fileHandleKey, fileHandle);
    });
  }
  if (dirHandle && config.dirHandleKey) {
    chain = chain.then(function () {
      return idbSet(config, config.dirHandleKey, dirHandle);
    });
  }
  if (typeof config.onPersisted === 'function') {
    chain = chain.then(function () {
      return config.onPersisted(fileHandle, dirHandle);
    });
  }
  return chain.then(function () {
    return {
      handle: fileHandle,
      dirHandle: dirHandle || null,
      name: fileHandle ? fileHandle.name : null,
      dest: config._lastDest || null
    };
  });
}

function runWrite(config, handle, dirHandle) {
  return requireReadwrite(handle, handle && handle.name).then(function () {
    return Promise.resolve(config.write(handle));
  }).then(function () {
    return persistAfterWrite(config, handle, dirHandle);
  });
}

/**
 * Resolve sticky directory from state/IDB only (never opens a picker).
 * Call this before the chooser so folder choice can reuse the handle in-gesture.
 */
export function tryStickyDirectoryHandle(config) {
  var fromState = typeof config.getDirHandle === 'function' ? config.getDirHandle() : null;
  var trySticky = fromState
    ? ensureReadwritePermission(fromState).then(function (ok) {
      return ok ? fromState : null;
    })
    : Promise.resolve(null);

  return trySticky.then(function (sticky) {
    if (sticky) return sticky;
    if (!config.dirHandleKey) return null;
    return idbGet(config, config.dirHandleKey).then(function (stored) {
      if (!stored) return null;
      return ensureReadwritePermission(stored).then(function (ok) {
        return ok ? stored : null;
      });
    });
  });
}

/**
 * Resolve sticky directory or pick a new one (always readwrite).
 * Prefer tryStickyDirectoryHandle + in-gesture picker from the chooser instead.
 */
export function resolveDirectoryHandle(config) {
  return tryStickyDirectoryHandle(config).then(function (dir) {
    if (dir) return dir;
    if (!supportsDirectoryPicker()) {
      return Promise.reject(new Error('Directory picker unavailable'));
    }
    return window.showDirectoryPicker({ mode: 'readwrite' });
  });
}

/**
 * getFileHandle in directory, then guarded write via config.write.
 */
export function writeSuggestedNameInDirectory(dirHandle, config) {
  var name = suggestedNameOf(config);
  if (!name) {
    return Promise.reject(new Error('No suggested filename for this save.'));
  }
  return requireReadwrite(dirHandle, 'the selected folder').then(function () {
    return dirHandle.getFileHandle(name, { create: true });
  }).then(function (fh) {
    return runWrite(config, fh, dirHandle);
  });
}

function saveDownload(config) {
  config._lastDest = DEST.DOWNLOAD;
  if (typeof config.download !== 'function') {
    return Promise.reject(new Error('Download not supported for this file type'));
  }
  return Promise.resolve(config.download()).then(function () {
    return { handle: null, dirHandle: null, name: null, dest: DEST.DOWNLOAD };
  });
}

function tryStickyFileWrite(config) {
  var handle = typeof config.getFileHandle === 'function' ? config.getFileHandle() : null;
  if (!handle) {
    return idbGet(config, config.fileHandleKey).then(function (stored) {
      if (!stored) return null;
      return ensureReadwritePermission(stored).then(function (ok) {
        return ok ? stored : null;
      });
    }).then(function (h) {
      if (!h) return null;
      config._lastDest = 'sticky';
      return runWrite(config, h, null);
    });
  }
  return ensureReadwritePermission(handle).then(function (ok) {
    if (!ok) return null;
    config._lastDest = 'sticky';
    return runWrite(config, handle, null);
  });
}

function applyChooserResult(config, choice) {
  if (!choice || choice.dest === DEST.CANCEL) {
    return Promise.reject(new Error('cancelled'));
  }
  if (choice.error) {
    return Promise.reject(choice.error);
  }
  if (choice.dest === DEST.DOWNLOAD) return saveDownload(config);
  if (choice.dest === DEST.NEW) {
    config._lastDest = DEST.NEW;
    if (!choice.fileHandle) return Promise.reject(new Error('cancelled'));
    return runWrite(config, choice.fileHandle, null);
  }
  if (choice.dest === DEST.OVERWRITE) {
    config._lastDest = DEST.OVERWRITE;
    if (!choice.fileHandle) return Promise.reject(new Error('cancelled'));
    return runWrite(config, choice.fileHandle, null);
  }
  if (choice.dest === DEST.FOLDER) {
    config._lastDest = DEST.FOLDER;
    if (!choice.dirHandle) return Promise.reject(new Error('cancelled'));
    var name = suggestedNameOf(config);
    return writeSuggestedNameInDirectory(choice.dirHandle, config).then(function (result) {
      result.suggestedName = name;
      return result;
    });
  }
  return Promise.reject(new Error('Unknown destination'));
}

/**
 * @param {object} config
 * @param {{ forceChooser?: boolean, title?: string, message?: string,
 *   preferredDest?: string }} [options]
 * @returns {Promise<{ handle, dirHandle, name, dest }>}
 */
export function hybridSave(config, options) {
  options = options || {};
  config = config || {};

  if (!supportsFS()) {
    if (config.allowDownload !== false && typeof config.download === 'function') {
      return saveDownload(config);
    }
    return Promise.reject(new Error('File System Access API unavailable'));
  }

  var start = options.forceChooser
    ? Promise.resolve(null)
    : tryStickyFileWrite(config);

  return start.then(function (stickyResult) {
    if (stickyResult) return stickyResult;

    // Resolve sticky / preferred dir before the dialog so folder choice can reuse it
    // without awaiting IDB after the click (preserves user activation for picker).
    return tryStickyDirectoryHandle(config).then(function (stickyDir) {
      if (stickyDir) return stickyDir;
      if (typeof config.resolvePreferredDir === 'function') {
        return config.resolvePreferredDir();
      }
      return null;
    }).then(function (stickyDir) {
      var supportsDir = supportsDirectoryPicker() &&
        (!!config.dirHandleKey || !!stickyDir || typeof config.resolvePreferredDir === 'function');
      return promptSaveDestination({
        title: options.title || 'Save as…',
        message: options.message,
        allowDownload: config.allowDownload !== false && typeof config.download === 'function',
        supportsFS: true,
        supportsDirectory: supportsDir,
        suggestedName: suggestedNameOf(config),
        stickyDirHandle: stickyDir,
        preferredDest: options.preferredDest || DEST.FOLDER,
        allowCreateNew: options.allowCreateNew,
        folderLabel: options.folderLabel || (stickyDir
          ? 'Save to linked ProgramData folder…'
          : 'Save to OneDrive folder…')
      });
    }).then(function (choice) {
      return applyChooserResult(config, choice);
    });
  });
}

export { DEST, supportsFS, supportsDirectoryPicker, suggestedNameOf, isCancelError };
