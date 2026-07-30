/**
 * User sign-in session and gate UI.
 */

import * as Permissions from './permissions.js';
import * as UserData from './user-data.js';
import * as UserStorage from '../storage/user-storage.js';
import * as UsersRegistryStorage from '../storage/users-registry-storage.js';
import * as Storage from '../storage/semester-storage.js';
import * as SimFacultyStorage from '../storage/sim-faculty-storage.js';
import * as Dashboard from '../ui/dashboard/index.js';
import { state } from '../core/state.js';
import { refresh, switchTab } from '../ui/chrome.js';
import { initGateUI as wireGateUI } from './user-gate-ui.js';
import { getNavShell } from '../ui/course-selector.js';

var session = null;
/** Verified identity waiting to set a new password (not a full session). */
var pendingPasswordChange = null;
var gateUiRefreshLists = null;

function getSession() {
  return session;
}

function isValidated() {
  return !!(session && session.validated);
}

function getPendingPasswordChange() {
  return pendingPasswordChange;
}

function clearPendingPasswordChange() {
  pendingPasswordChange = null;
}

function clearSession() {
  session = null;
  state.userSession = null;
  clearPendingPasswordChange();
}

function setSession(data) {
  session = {
    userId: data.userId,
    name: data.name,
    email: data.email,
    role: data.role,
    validatedAt: new Date().toISOString(),
    validated: true
  };
  state.userSession = session;
  return session;
}

function validateAndSetSession(email, password) {
  var registry = UsersRegistryStorage.getRegistry();
  if (!registry) {
    return Promise.resolve({ ok: false, error: 'Connect users-registry.json first' });
  }
  return UserData.validateSessionByEmail(email, registry, password).then(function (result) {
    if (!result.ok) {
      clearSession();
      return result;
    }
    if (result.mustChangePassword) {
      pendingPasswordChange = {
        userId: result.userId,
        name: result.name,
        email: result.email,
        role: result.role,
        temporaryPassword: String(password || ''),
        temporaryPasswordExpiresAt: result.temporaryPasswordExpiresAt || ''
      };
      session = null;
      state.userSession = null;
      if (Permissions) Permissions.apply();
      return { ok: true, needsPasswordChange: true, pending: pendingPasswordChange };
    }
    clearPendingPasswordChange();
    setSession(result);
    if (Permissions) Permissions.apply();
    return { ok: true, session: session };
  });
}

function completePasswordChange(newPassword, confirmPassword) {
  if (!pendingPasswordChange || !pendingPasswordChange.userId) {
    return Promise.resolve({ ok: false, error: 'No password change is pending. Sign in again.' });
  }
  var policyErr = UserData.passwordPolicyError(newPassword);
  if (policyErr) return Promise.resolve({ ok: false, error: policyErr });
  if (String(newPassword) !== String(confirmPassword)) {
    return Promise.resolve({ ok: false, error: 'Passwords do not match' });
  }
  if (pendingPasswordChange.temporaryPassword &&
      String(newPassword) === String(pendingPasswordChange.temporaryPassword)) {
    return Promise.resolve({
      ok: false,
      error: 'Choose a different password than the temporary password.'
    });
  }
  var registry = UsersRegistryStorage.getRegistry();
  if (!registry || !registry.users[pendingPasswordChange.userId]) {
    return Promise.resolve({
      ok: false,
      error: 'Users registry is not available. Reconnect ProgramData and try again.'
    });
  }
  var entry = registry.users[pendingPasswordChange.userId];
  if (UserData.isTemporaryPasswordExpired(entry)) {
    clearPendingPasswordChange();
    return Promise.resolve({
      ok: false,
      error: 'Temporary password expired. Ask an admin to reset your password.'
    });
  }
  var pending = pendingPasswordChange;
  return UserData.hashPassword(newPassword).then(function (passwordHash) {
    UserData.finalizePasswordChange(entry, passwordHash);
    return UsersRegistryStorage.mergeSave(registry);
  }).then(function (result) {
    if (result && result.conflict) {
      return {
        ok: false,
        error: 'Registry was updated elsewhere. Sign in again with your temporary password.'
      };
    }
    clearPendingPasswordChange();
    setSession({
      userId: pending.userId,
      name: pending.name,
      email: pending.email,
      role: pending.role
    });
    if (Permissions) Permissions.apply();
    return { ok: true, session: session };
  }).catch(function (err) {
    return {
      ok: false,
      error: (err && err.message) ||
        'Could not save the new password. Reconnect ProgramData with write access and try again.'
    };
  });
}

function init() {
  return UserStorage.init().then(function () {
    return UsersRegistryStorage.init();
  }).then(function () {
    // Passwords are never persisted. Every app launch starts at the sign-in gate.
    clearSession();
    return { ok: false, needsGate: true };
  });
}

function requireSession() {
  if (!isValidated()) throw new Error('No validated user session');
  return session;
}

function attribution() {
  if (!session) return { userId: '', name: '', email: '' };
  return { userId: session.userId, name: session.name, email: session.email };
}

function getGateStep() {
  if (!UsersRegistryStorage || !UsersRegistryStorage.isReady()) return 1;
  if (pendingPasswordChange) return 'change';
  if (!isValidated()) return 2;
  if (!Storage.isSemesterFileConnected()) return 3;
  return 0;
}

function gateTitleForStep(step) {
  if (step === 1) return 'Connect ProgramData';
  if (step === 'change') return 'Set a new password';
  if (step === 2) return 'Sign in';
  if (step === 3) return 'Open a semester file';
  return 'Sign in';
}

function enterAppFromGate() {
  hideGateModal();
  var bootTab = getNavShell() === 'theory' ? 'theory-master' : 'dashboard';
  switchTab(bootTab);
}

function finishSemesterLoad(fileRoot, fileName) {
  var sem = Storage.activateFileRoot(fileRoot, fileName);
  Storage.cacheData(fileRoot);
  SimFacultyStorage.hydrateFromFileRoot(fileRoot);
  Dashboard.populateFilters(sem);
  if (Permissions) Permissions.apply();
  refresh();
  enterAppFromGate();
}

function updateGateStep(errorMsg) {
  var step = getGateStep();
  if (step === 0) {
    enterAppFromGate();
    return;
  }
  var step1 = document.getElementById('userGateStep1');
  var step2 = document.getElementById('userGateStep2');
  var stepChange = document.getElementById('userGateStepChangePassword');
  var step3 = document.getElementById('userGateStep3');
  var title = document.getElementById('userGateTitle');
  var errEl = document.getElementById('userGateError');
  var registryLine = document.getElementById('userGateRegistryName');
  var userLine = document.getElementById('userGateUserName');
  var changeLead = document.getElementById('userGateChangePasswordLead');

  if (step1) step1.classList.toggle('hidden', step !== 1);
  if (step2) step2.classList.toggle('hidden', step !== 2);
  if (stepChange) stepChange.classList.toggle('hidden', step !== 'change');
  if (step3) step3.classList.toggle('hidden', step !== 3);

  document.querySelectorAll('.user-gate-step-indicator').forEach(function (el) {
    var n = parseInt(el.getAttribute('data-step'), 10);
    var active = step === 'change' ? n === 2 : n === step;
    var done = step === 'change' ? n < 2 : (typeof step === 'number' && n < step);
    el.classList.toggle('active', active);
    el.classList.toggle('done', done);
  });

  if (title) title.textContent = gateTitleForStep(step);
  if (registryLine && (step === 2 || step === 'change' || step === 3)) {
    registryLine.textContent = state.usersRegistryFileName || 'Users registry connected';
  }
  if (changeLead && step === 'change' && pendingPasswordChange) {
    var exp = pendingPasswordChange.temporaryPasswordExpiresAt
      ? ' Temporary password expires at ' + pendingPasswordChange.temporaryPasswordExpiresAt + '.'
      : '';
    changeLead.textContent =
      'Welcome, ' + pendingPasswordChange.name +
      '. Choose a new password before continuing.' + exp;
  }
  if (userLine && step === 3 && session) {
    userLine.textContent = session.name + ' signed in';
  }
  if (errEl) {
    errEl.textContent = errorMsg || '';
    errEl.classList.toggle('hidden', !errorMsg);
  }
  if (typeof gateUiRefreshLists === 'function') {
    gateUiRefreshLists();
  }
}

function showGateModal(errorMsg) {
  var modal = document.getElementById('userGateModal');
  if (modal) modal.classList.add('open');
  updateGateStep(errorMsg || '');
}

function hideGateModal() {
  var modal = document.getElementById('userGateModal');
  if (modal) modal.classList.remove('open');
}

function logout() {
  return UserStorage.clearProfile().then(function () {
    clearSession();
    if (Permissions) Permissions.apply();
    showGateModal('');
    return { ok: true };
  });
}

function beginUserSwitch() {
  clearSession();
  if (Permissions) Permissions.apply();
  updateGateStep('');
}

function initGateUI() {
  var ctx = {
    validateAndSetSession: validateAndSetSession,
    completePasswordChange: completePasswordChange,
    getPendingPasswordChange: getPendingPasswordChange,
    beginUserSwitch: beginUserSwitch,
    updateGateStep: updateGateStep,
    showGateModal: showGateModal,
    finishSemesterLoad: finishSemesterLoad,
    refresh: refresh,
    Storage: Storage,
    UsersRegistryStorage: UsersRegistryStorage,
    state: state
  };
  wireGateUI(ctx);
  gateUiRefreshLists = ctx.refreshProgramDataLists || null;
}

export {
  init,
  getSession,
  isValidated,
  validateAndSetSession,
  completePasswordChange,
  getPendingPasswordChange,
  requireSession,
  attribution,
  clearSession,
  logout,
  beginUserSwitch,
  showGateModal,
  hideGateModal,
  initGateUI,
  getGateStep,
  updateGateStep,
  enterAppFromGate,
  finishSemesterLoad
};
