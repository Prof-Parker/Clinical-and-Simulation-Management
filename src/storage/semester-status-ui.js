/**
 * Semester persistence metadata, connection status, and import-device UI.
 */

import * as ProgramData from './program-data.js';
import { state } from '../core/state.js';
import { idbGet, idbSet, supportsFS } from './storage-idb.js';
import { applyFileMenuGating } from '../ui/file-menu-gating.js';

var META_KEY = 'storageMeta';
var flashTimer = null;

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

function updateStorageModeBadge() {
  var badge = document.getElementById('storageModeBadge');
  if (!badge) return;
  var mode = '';
  if (state.appShell === 'playground') {
    mode = 'Playground';
  } else if (ProgramData.isProgramDataConnected()) {
    mode = 'ProgramData';
  } else if (state.semesterFileConnected || state.fileName) {
    mode = supportsFS() ? 'Linked file' : 'Classic';
  }
  if (!mode) {
    badge.textContent = '';
    badge.classList.add('hidden');
    return;
  }
  badge.textContent = mode;
  badge.classList.remove('hidden');
  badge.classList.toggle('is-classic', mode === 'Classic');
  badge.classList.toggle('is-playground', mode === 'Playground');
}

/**
 * Brief non-blocking status flash (replaces success modals for routine Sync).
 */
function flashStatus(message, kind) {
  var el = document.getElementById('fileStatus');
  if (!el) return;
  if (flashTimer) {
    clearTimeout(flashTimer);
    flashTimer = null;
  }
  el.textContent = message;
  el.className = 'file-status' + (kind === 'ok' ? ' connected' : kind === 'warn' ? ' dirty' : '');
  el.classList.add('file-status-flash');
  flashTimer = setTimeout(function () {
    flashTimer = null;
    el.classList.remove('file-status-flash');
    updateStatusUI();
  }, 2200);
}

function updateStatusUI() {
  var el = document.getElementById('fileStatus');
  if (!el) return;
  getMeta().then(function (meta) {
    var dirty = state.dirty;
    var name = state.fileName || meta.lastImportedFileName;
    var savedLabel = formatSavedTime(meta.lastSavedAt);
    var syncLinked = !!(supportsFS() && state.fileHandle);
    var programData = ProgramData.isProgramDataConnected();
    var hasSemester = !!(meta.hasLoadedData || state.semesterFileConnected || name);

    if (syncLinked) {
      el.textContent = dirty
        ? 'Unsaved — ' + (name || 'semester')
        : 'Synced link' + (name ? ': ' + name : '') + (savedLabel ? ' · ' + savedLabel : '');
      el.className = dirty ? 'file-status dirty' : 'file-status connected';
    } else if (hasSemester) {
      el.textContent = dirty
        ? 'On this device (not linked)' + (name ? ' — ' + name : '')
        : 'On this device (not linked)' + (name ? ': ' + name : '') +
          (savedLabel ? ' · ' + savedLabel : '');
      el.className = dirty ? 'file-status dirty' : 'file-status';
    } else {
      el.textContent = programData
        ? 'ProgramData connected — open a semester'
        : 'No semester';
      el.className = 'file-status';
    }

    updateStorageModeBadge();
    try {
      applyFileMenuGating();
    } catch (e) { /* menu optional during early boot */ }

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
  updateStorageModeBadge,
  flashStatus,
  shouldShowOnedriveBanner,
  initUnloadWarning
};
