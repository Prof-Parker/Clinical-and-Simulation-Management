/**
 * File System Access handle helpers (permission + text read).
 */

export function isNotAllowedError(err) {
  if (!err) return false;
  if (err.name === 'NotAllowedError') return true;
  return /not allowed by the user agent/i.test(String(err.message || ''));
}

function getFileText(handle) {
  return handle.getFile().then(function (file) {
    return file.text();
  });
}

/**
 * Read text from a FileSystemFileHandle.
 * Tries getFile immediately (preserves picker user-activation), then
 * requestPermission + retry on NotAllowedError.
 */
export function readHandleText(handle, mode) {
  mode = mode || 'read';
  return getFileText(handle).catch(function (err) {
    if (!isNotAllowedError(err) || !handle || typeof handle.requestPermission !== 'function') {
      throw err;
    }
    return handle.requestPermission({ mode: mode }).then(function (perm) {
      if (perm !== 'granted') {
        var denied = new Error(
          'Permission denied to read "' + (handle.name || 'file') +
          '". If this file is on OneDrive, right-click → Always keep on this device, then try again.'
        );
        denied.name = 'NotAllowedError';
        throw denied;
      }
      return getFileText(handle);
    });
  });
}
