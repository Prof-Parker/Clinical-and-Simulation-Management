/* global App */

var App = App || {};



App.UserSession = (function () {

  var session = null;



  function getSession() {

    return session;

  }



  function isValidated() {

    return !!(session && session.validated);

  }



  function clearSession() {

    session = null;

    App.state.userSession = null;

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

    App.state.userSession = session;

    return session;

  }



  function validateAndSetSession() {

    var userFile = App.UserStorage.getUserFile();

    var registry = App.UsersRegistryStorage.getRegistry();

    if (!registry) {

      return Promise.resolve({ ok: false, error: 'Connect users-registry.json first' });

    }

    if (!userFile) {

      return Promise.resolve({ ok: false, error: 'Load a user file to continue' });

    }

    return App.UserData.validateSession(userFile, registry).then(function (result) {

      if (!result.ok) {

        clearSession();

        return result;

      }

      setSession(result);

      if (App.Permissions) App.Permissions.apply();

      return { ok: true, session: session };

    });

  }



  function init() {

    return App.UserStorage.init().then(function () {

      return App.UsersRegistryStorage.init();

    }).then(function () {

      if (!App.UsersRegistryStorage.isReady() || !App.UserStorage.isReady()) {

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

    if (!App.UsersRegistryStorage || !App.UsersRegistryStorage.isReady()) return 1;

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

      registryLine.textContent = App.state.usersRegistryFileName || 'Users registry connected';

    }

    if (retryBtn) {

      var showRetry = step === 2 &&

        App.UserStorage.isReady() &&

        App.UsersRegistryStorage.isReady();

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

    return App.UserStorage.clearProfile().then(function () {

      clearSession();

      if (App.Permissions) App.Permissions.apply();

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

        App.UsersRegistryStorage.openFilePicker().then(function () {

          updateGateStep('');

          if (App.UI && App.UI.refresh) App.UI.refresh();

        }).catch(function () {

          showGateModal('Could not load registry file');

        });

      });

    }

    if (changeRegBtn) {

      changeRegBtn.addEventListener('click', function () {

        App.UsersRegistryStorage.openFilePicker().then(function () {

          updateGateStep('');

          if (App.UI && App.UI.refresh) App.UI.refresh();

        }).catch(function () {

          showGateModal('Could not load registry file');

        });

      });

    }

    if (loadUserBtn) {

      loadUserBtn.addEventListener('click', function () {

        App.UserStorage.openFilePicker().then(function () {

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



  return {

    init: init,

    getSession: getSession,

    isValidated: isValidated,

    validateAndSetSession: validateAndSetSession,

    requireSession: requireSession,

    attribution: attribution,

    clearSession: clearSession,

    logout: logout,

    showGateModal: showGateModal,

    hideGateModal: hideGateModal,

    initGateUI: initGateUI,

    getGateStep: getGateStep,

    updateGateStep: updateGateStep

  };

})();


