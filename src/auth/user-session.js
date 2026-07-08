/**
 * User sign-in session and gate UI.
 */

import * as Permissions from './permissions.js';
import * as UserData from './user-data.js';
import * as UserStorage from '../storage/user-storage.js';
import * as UsersRegistryStorage from '../storage/users-registry-storage.js';
import { state } from '../core/state.js';
import { refresh } from '../ui/chrome.js';

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

    return 2;

  }



  function updateGateStep(errorMsg) {

    var step = getGateStep();

    var step1 = document.getElementById('userGateStep1');

    var step2 = document.getElementById('userGateStep2');

    var title = document.getElementById('userGateTitle');

    var errEl = document.getElementById('userGateError');

    var registryLine = document.getElementById('userGateRegistryName');

    var retryBtn = document.getElementById('userGateRetryBtn');



    if (step1) step1.classList.toggle('hidden', step !== 1);

    if (step2) step2.classList.toggle('hidden', step !== 2);



    document.querySelectorAll('.user-gate-step-indicator').forEach(function (el) {

      var n = parseInt(el.getAttribute('data-step'), 10);

      el.classList.toggle('active', n === step);

      el.classList.toggle('done', n < step);

    });



    if (title) {

      title.textContent = step === 1 ? 'Connect users registry' : 'Load user file';

    }

    if (registryLine && step === 2) {

      registryLine.textContent = state.usersRegistryFileName || 'Users registry connected';

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

    var loadUserBtn = document.getElementById('userGateLoadUserBtn');

    var loadRegBtn = document.getElementById('userGateLoadRegistryBtn');

    var changeRegBtn = document.getElementById('userGateChangeRegistryBtn');

    var retryBtn = document.getElementById('userGateRetryBtn');



    if (loadRegBtn) {

      loadRegBtn.addEventListener('click', function () {

        UsersRegistryStorage.openFilePicker().then(function () {

          updateGateStep('');

          if (refresh) refresh();

        }).catch(function () {

          showGateModal('Could not load registry file');

        });

      });

    }

    if (changeRegBtn) {

      changeRegBtn.addEventListener('click', function () {

        UsersRegistryStorage.openFilePicker().then(function () {

          updateGateStep('');

          if (refresh) refresh();

        }).catch(function () {

          showGateModal('Could not load registry file');

        });

      });

    }

    if (loadUserBtn) {

      loadUserBtn.addEventListener('click', function () {

        UserStorage.openFilePicker().then(function () {

          return validateAndSetSession();

        }).then(function (r) {

          if (r.ok) hideGateModal();

          else updateGateStep(r.error);

        }).catch(function () {

          updateGateStep('Could not load user file');

        });

      });

    }

    if (retryBtn) {

      retryBtn.addEventListener('click', function () {

        validateAndSetSession().then(function (r) {

          if (r.ok) hideGateModal();

          else updateGateStep(r.error);

        });

      });

    }

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
  updateGateStep
};
