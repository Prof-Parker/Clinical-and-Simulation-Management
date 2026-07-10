/**
 * User gate modal button and file-picker wiring.
 */

function initGateUI(ctx) {

  var loadUserBtn = document.getElementById('userGateLoadUserBtn');

  var loadRegBtn = document.getElementById('userGateLoadRegistryBtn');

  var changeRegBtn = document.getElementById('userGateChangeRegistryBtn');

  var retryBtn = document.getElementById('userGateRetryBtn');

  var loadSemesterBtn = document.getElementById('userGateLoadSemesterBtn');

  var semesterInput = document.getElementById('userGateSemesterFileInput');

  var changeUserBtn = document.getElementById('userGateChangeUserBtn');

  var Storage = ctx.Storage;

  var UserStorage = ctx.UserStorage;

  var UsersRegistryStorage = ctx.UsersRegistryStorage;

  var state = ctx.state;



  if (loadRegBtn) {

    loadRegBtn.addEventListener('click', function () {

      UsersRegistryStorage.openFilePicker().then(function () {

        ctx.updateGateStep('');

        if (ctx.refresh) ctx.refresh();

      }).catch(function () {

        ctx.showGateModal('Could not load registry file');

      });

    });

  }



  if (changeRegBtn) {

    changeRegBtn.addEventListener('click', function () {

      UsersRegistryStorage.openFilePicker().then(function () {

        ctx.updateGateStep('');

        if (ctx.refresh) ctx.refresh();

      }).catch(function () {

        ctx.showGateModal('Could not load registry file');

      });

    });

  }



  if (loadUserBtn) {

    loadUserBtn.addEventListener('click', function () {

      UserStorage.openFilePicker().then(function () {

        return ctx.validateAndSetSession();

      }).then(function (r) {

        if (r.ok) ctx.updateGateStep('');

        else ctx.updateGateStep(r.error);

      }).catch(function () {

        ctx.updateGateStep('Could not load user file');

      });

    });

  }



  if (loadSemesterBtn) {

    loadSemesterBtn.addEventListener('click', function () {

      if (Storage.supportsFS && Storage.supportsFS()) {

        Storage.openFilePicker().then(function (fileRoot) {

          ctx.finishSemesterLoad(fileRoot, state.fileName);

        }).catch(function () {

          ctx.updateGateStep('Could not load semester file');

        });

        return;

      }

      if (semesterInput) semesterInput.click();

    });

  }



  if (semesterInput) {

    if (Storage.isIOSDevice && Storage.isIOSDevice()) {

      semesterInput.removeAttribute('accept');

    }

    semesterInput.addEventListener('change', function (e) {

      var file = e.target.files && e.target.files[0];

      e.target.value = '';

      if (!file) return;

      Storage.importFromFile(file).then(function (fileRoot) {

        state.fileName = file.name;

        ctx.finishSemesterLoad(fileRoot, file.name);

      }).catch(function () {

        ctx.updateGateStep('Invalid semester file');

      });

    });

  }



  if (changeUserBtn) {

    changeUserBtn.addEventListener('click', function () {

      UserStorage.openFilePicker().then(function () {

        return ctx.validateAndSetSession();

      }).then(function (r) {

        if (r.ok) ctx.updateGateStep('');

        else ctx.updateGateStep(r.error);

      }).catch(function () {

        ctx.updateGateStep('Could not load user file');

      });

    });

  }



  if (retryBtn) {

    retryBtn.addEventListener('click', function () {

      ctx.validateAndSetSession().then(function (r) {

        if (r.ok) ctx.updateGateStep('');

        else ctx.updateGateStep(r.error);

      });

    });

  }

}



export { initGateUI };
