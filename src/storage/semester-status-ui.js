/**
 * Semester persistence metadata, connection status, and import-device UI.
 */

import * as ProgramData from './program-data.js';
import { state } from '../core/state.js';
import { idbGet, idbSet, supportsFS } from './storage-idb.js';

var META_KEY = 'storageMeta';

function getMeta() {
  return idbGet(META_KEY).then(function (m) {
    return m || { lastImportedFileName: '', lastSavedAt: '', hasLoadedData: false };
  });
}

function setMeta(partial) {
  return getMeta().then(function (meta) {
    var next = Object.assign({}, meta, partial);
    return idbSet(META_KEY, next).then(function () { return next; });
  });
}

function formatSavedTime(iso) {
  if (!iso) return '';
  try {
    var d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch (e) {
    return '';
  }
}

function isIOSDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function configureImportInput() {
  var input = document.getElementById('importFileInput');
  if (!input) return;
  // iOS Files / OneDrive often mislabels .json MIME types; a strict filter hides them.
  if (isIOSDevice()) {
    input.removeAttribute('accept');
  } else {
    input.setAttribute('accept', '.json,application/json');
  }
}

function updateStatusUI() {
  var el = document.getElementById('fileStatus');
  if (!el) return;
  getMeta().then(function (meta) {
    var dirty = state.dirty;
    var name = state.fileName || meta.lastImportedFileName;
    var savedLabel = formatSavedTime(meta.lastSavedAt);
    var label = name ? 'program semester · ' + name : 'program semester';
    var syncLinked = !!(supportsFS() && state.fileHandle);
    var programData = ProgramData.isProgramDataConnected();
    if (syncLinked) {
      el.textContent = dirty
        ? 'Unsaved — ' + label
        : 'Connected: ' + label + (savedLabel ? ' · saved ' + savedLabel : '');
      el.className = dirty ? 'file-status dirty' : 'file-status connected';
    } else if (meta.hasLoadedData || state.semesterFileConnected) {
      el.textContent = dirty
        ? 'Unsaved on this device — ' + label +
          ' (connect ProgramData or Save as… to link Sync)'
        : 'Loaded on this device: ' + label +
          ' — connect ProgramData or Save as… to link Sync' +
          (savedLabel ? ' · ' + savedLabel : '');
      el.className = dirty ? 'file-status dirty' : 'file-status';
    } else {
      el.textContent = programData
        ? 'ProgramData connected — load a semester file to begin'
        : 'Connect ProgramData or open a semester file to begin';
      el.className = 'file-status';
    }
    var syncBtn = document.getElementById('syncOneDriveBtn');
    if (!syncBtn) return;
    if (!dirty) {
      syncBtn.classList.add('hidden');
      return;
    }
    syncBtn.classList.remove('hidden');
    syncBtn.textContent = syncLinked ? 'Sync to OneDrive'
      : supportsFS() ? 'Save as…' : 'Download backup';
  });
}

function shouldShowOnedriveBanner() {
  if (supportsFS()) return false;
  return getMeta().then(function (meta) {
    return !meta.hasLoadedData;
  });
}

function initUnloadWarning() {
  window.addEventListener('beforeunload', function (e) {
    if (supportsFS() || !state.dirty) return;
    e.preventDefault();
    e.returnValue = '';
  });
}

export {
  getMeta,
  setMeta,
  isIOSDevice,
  configureImportInput,
  updateStatusUI,
  shouldShowOnedriveBanner,
  initUnloadWarning
};
