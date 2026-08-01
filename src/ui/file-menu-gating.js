/**
 * Role × platform File Management menu visibility.
 * Keeps everyday faculty on Sync / Download backup; engineer keeps full tools.
 */

import * as UserSession from '../auth/user-session.js';
import * as UserTemplate from '../auth/user-template.js';
import * as ProgramData from '../storage/program-data.js';
import { supportsFS } from '../storage/storage-idb.js';
import { state } from '../core/state.js';

function currentRole() {
  var s = UserSession && UserSession.getSession && UserSession.getSession();
  return s ? s.role : null;
}

function canAction(action) {
  var role = currentRole();
  if (!role) return false;
  return UserTemplate.canAction(role, action);
}

function setHidden(id, hidden) {
  var el = document.getElementById(id);
  if (el) el.classList.toggle('hidden', !!hidden);
}

function isSyncLinked() {
  return !!(supportsFS() && state.fileHandle);
}

function canShowSaveAs() {
  if (canAction('files.saveAs')) return true;
  if (canAction('files.saveAsEscape') && !isSyncLinked()) return true;
  return false;
}

function canShowConnectProgramData() {
  if (!supportsFS()) return false;
  return canAction('files.programData');
}

function canShowReconnectProgramData() {
  if (!supportsFS()) return false;
  if (canAction('files.programData')) return true;
  return canAction('files.programDataReconnect') && ProgramData.isProgramDataConnected();
}

/**
 * Apply File Management + related danger/advanced affordances.
 * Call after session changes / ProgramData connect (via Permissions.applyMenuGating).
 */
export function applyFileMenuGating() {
  var signedIn = !!(UserSession && UserSession.isValidated && UserSession.isValidated());
  var fs = supportsFS();
  var classic = !fs;
  var programData = ProgramData.isProgramDataConnected();
  var syncLinked = isSyncLinked();
  var isEngineer = canAction('*');
  var collapsedEveryday = programData && syncLinked && !isEngineer && !canAction('files.saveAs');

  var showDownload = signedIn && canAction('files.downloadBackup');
  var showOpenCopy = signedIn && canAction('files.openCopy') && !collapsedEveryday;
  var showSaveAs = signedIn && fs && canShowSaveAs() && !collapsedEveryday;
  var showConnect = signedIn && canShowConnectProgramData() && !programData;
  var showReconnect = signedIn && canShowReconnectProgramData() && programData;
  var showConnectRaw = signedIn && fs && canAction('files.connectRaw');
  var showClear = signedIn && canAction('files.clearStorage');
  var showAdvanced = showConnectRaw || (signedIn && isEngineer && fs);

  setHidden('exportBtn', !showDownload);
  setHidden('importBtn', !showOpenCopy);
  setHidden('saveAsBtn', !showSaveAs);
  setHidden('connectProgramDataBtn', !showConnect);
  setHidden('reconnectProgramDataBtn', !showReconnect);
  setHidden('openFileBtn', !showConnectRaw);
  setHidden('newFileBtn', !showConnectRaw);
  setHidden('clearStorageBtn', !showClear);

  var loadReg = document.getElementById('loadRegistryMenuBtn');
  if (loadReg) {
    loadReg.classList.toggle(
      'hidden',
      !(signedIn && (canAction('files.programData') || canAction('files.connectRaw')))
    );
  }

  var dangerZone = document.getElementById('menuFileDangerZone');
  if (dangerZone) {
    var showZone = showDownload || showOpenCopy;
    dangerZone.classList.toggle('hidden', !showZone);
    dangerZone.classList.toggle('is-classic', classic);
  }

  var classicGuide = document.getElementById('menuFileClassicGuide');
  if (classicGuide) {
    classicGuide.classList.toggle('hidden', !(classic && signedIn && showDownload));
  }

  var advancedGroup = document.getElementById('menuFileAdvancedGroup');
  if (advancedGroup) {
    advancedGroup.classList.toggle('hidden', !showAdvanced);
  }

  var engineerNote = document.getElementById('menuFileEngineerNote');
  if (engineerNote) {
    engineerNote.classList.toggle('hidden', !(isEngineer && showAdvanced));
  }

  var fileGroup = document.getElementById('menuFileManagementGroup');
  if (fileGroup) {
    var anyFileItem = showDownload || showOpenCopy || showSaveAs || showConnect ||
      showReconnect || showAdvanced;
    fileGroup.classList.toggle('hidden', signedIn && !anyFileItem);
  }
}

export function isClassicFileMode() {
  return !supportsFS();
}

export function canCreateNewFile() {
  return canAction('files.connectRaw') || canAction('*');
}

export { isSyncLinked, canShowSaveAs };
