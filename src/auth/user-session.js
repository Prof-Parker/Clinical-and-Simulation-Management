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



  function getSession() {

    return session;

  }



  function isValidated() {

    return !!(session && session.validated);

  }



  function clearSession() {

    session = null;

    state.userSession = null;

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



  function validateAndSetSession() {

    var userFile = UserStorage.getUserFile();

    var registry = UsersRegistryStorage.getRegistry();

    if (!registry) {

      return Promise.resolve({ ok: false, error: 'Connect users-registry.json first' });

    }

    if (!userFile) {

      return Promise.resolve({ ok: false, error: 'Load a user file to continue' });

    }

    return UserData.validateSession(userFile, registry).then(function (result) {

      if (!result.ok) {

        clearSession();

        return result;

      }

      setSession(result);

      if (Permissions) Permissions.apply();

      return { ok: true, session: session };

    });

  }



  function init() {

    return UserStorage.init().then(function () {

      return UsersRegistryStorage.init();

    }).then(function () {

      if (!UsersRegistryStorage.isReady() || !UserStorage.isReady()) {

        clearSession();

        return { ok: false, needsGate: true };

      }

      return validateAndSetSession().then(function (r) {

        return Object.assign({ needsGate: !r.ok }, r);

      });

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

    if (!isValidated()) return 2;

    if (!Storage.isSemesterFileConnected()) return 3;

    return 0;

  }



  function gateTitleForStep(step) {

    if (step === 1) return 'Connect users registry';

    if (step === 2) return 'Load user file';

    if (step === 3) return 'Load a semester file';

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

    var step3 = document.getElementById('userGateStep3');

    var title = document.getElementById('userGateTitle');

    var errEl = document.getElementById('userGateError');

    var registryLine = document.getElementById('userGateRegistryName');

    var userLine = document.getElementById('userGateUserName');

    var retryBtn = document.getElementById('userGateRetryBtn');



    if (step1) step1.classList.toggle('hidden', step !== 1);

    if (step2) step2.classList.toggle('hidden', step !== 2);

    if (step3) step3.classList.toggle('hidden', step !== 3);



    document.querySelectorAll('.user-gate-step-indicator').forEach(function (el) {

      var n = parseInt(el.getAttribute('data-step'), 10);

      el.classList.toggle('active', n === step);

      el.classList.toggle('done', n < step);

    });



    if (title) title.textContent = gateTitleForStep(step);

    if (registryLine && step >= 2) {

      registryLine.textContent = state.usersRegistryFileName || 'Users registry connected';

    }

    if (userLine && step === 3 && session) {

      userLine.textContent = session.name + ' signed in';

    }

    if (retryBtn) {

      var showRetry = step === 2 &&

        UserStorage.isReady() &&

        UsersRegistryStorage.isReady();

      retryBtn.classList.toggle('hidden', !showRetry);

    }

    if (errEl) {

      errEl.textContent = errorMsg || '';

      errEl.classList.toggle('hidden', !errorMsg);

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



  function initGateUI() {

    wireGateUI({

      validateAndSetSession: validateAndSetSession,

      updateGateStep: updateGateStep,

      showGateModal: showGateModal,

      finishSemesterLoad: finishSemesterLoad,

      refresh: refresh,

      Storage: Storage,

      UserStorage: UserStorage,

      UsersRegistryStorage: UsersRegistryStorage,

      state: state

    });

  }

export {
  init,
  getSession,
  isValidated,
  validateAndSetSession,
  requireSession,
  attribution,
  clearSession,
  logout,
  showGateModal,
  hideGateModal,
  initGateUI,
  getGateStep,
  updateGateStep,
  enterAppFromGate,
  finishSemesterLoad
};
