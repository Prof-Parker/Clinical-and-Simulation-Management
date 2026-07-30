/**
 * User gate modal button and file-picker wiring.
 * Primary path: Connect ProgramData folder → auto registry → email/password → pick semester.
 * Classic registry/semester pickers appear only after ProgramData connect fails.
 */

import * as ProgramData from '../storage/program-data.js';
import * as FileKind from '../core/file-kind.js';
import * as UserData from './user-data.js';
import { escapeHtml, showDialog } from '../ui/dialogs.js';
import { isAbortError } from '../ui/hybrid-save-ui.js';

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function initGateUI(ctx) {
  var loadRegBtn = document.getElementById('userGateLoadRegistryBtn');
  var loadSemesterBtn = document.getElementById('userGateLoadSemesterBtn');
  var semesterInput = document.getElementById('userGateSemesterFileInput');
  var connectProgramDataBtn = document.getElementById('userGateConnectProgramDataBtn');
  var emailInput = document.getElementById('userGateEmail');
  var passwordInput = document.getElementById('userGatePassword');
  var confirmUserBtn = document.getElementById('userGateConfirmUserBtn');
  var forgotPasswordBtn = document.getElementById('userGateForgotPasswordBtn');
  var newPasswordInput = document.getElementById('userGateNewPassword');
  var newPasswordConfirmInput = document.getElementById('userGateNewPasswordConfirm');
  var changePasswordBtn = document.getElementById('userGateChangePasswordBtn');
  var semesterSelect = document.getElementById('userGateSemesterSelect');
  var confirmSemesterBtn = document.getElementById('userGateConfirmSemesterBtn');
  var programDataSemester = document.getElementById('userGateProgramDataSemester');
  var step1Lead = document.getElementById('userGateStep1Lead');
  var step3Lead = document.getElementById('userGateStep3Lead');
  var programDataHint = document.getElementById('userGateProgramDataHint');
  var step2Lead = document.getElementById('userGateStep2Lead');
  var registryNameLine = document.getElementById('userGateRegistryName');
  /** Set when Connect ProgramData fails; cleared on successful connect. */
  var programDataConnectError = '';
  /** Folder picker unavailable or failed; show classic registry/semester connect instead. */
  var programDataPickerBlocked = !ProgramData.supportsDirectoryPicker();

  var Storage = ctx.Storage;
  var UsersRegistryStorage = ctx.UsersRegistryStorage;
  var state = ctx.state;

  function gateErr(err, fallback) {
    if (isAbortError(err)) return 'Cancelled';
    return (err && err.message) || fallback;
  }

  /** Folder picker is unavailable in some embedded browsers (Electron webviews). */
  function connectErr(err) {
    if (isAbortError(err)) {
      return 'Folder access was cancelled or blocked. Use Connect users registry to continue.';
    }
    return (err && err.message) || 'Could not connect the ProgramData folder';
  }

  function usingProgramData() {
    return ProgramData.isProgramDataConnected();
  }

  /**
   * Default: ProgramData button only.
   * After connect failure (or unsupported picker): hide ProgramData, show registry + lead text.
   */
  function updateStep1Affordance() {
    var showProgramData = ProgramData.supportsDirectoryPicker() && !programDataPickerBlocked;
    var showClassic = !showProgramData;
    if (connectProgramDataBtn) {
      connectProgramDataBtn.classList.toggle('hidden', !showProgramData);
    }
    if (loadRegBtn) {
      loadRegBtn.classList.toggle('hidden', !showClassic);
    }
    if (step1Lead) {
      step1Lead.classList.toggle('hidden', !showClassic);
    }
  }

  /**
   * Step 3 mirrors step 1:
   * ProgramData connected → semester list + Open semester.
   * Classic path → Load semester file only.
   */
  function updateStep3Affordance() {
    var showProgramData = usingProgramData();
    var showClassic = !showProgramData;
    if (programDataSemester) {
      programDataSemester.classList.toggle('hidden', !showProgramData);
    }
    if (loadSemesterBtn) {
      loadSemesterBtn.classList.toggle('hidden', !showClassic);
    }
    if (step3Lead) {
      step3Lead.classList.toggle('hidden', !showClassic);
    }
  }

  /**
   * Step 2 is email/password only once the registry is connected.
   * ProgramData change/reconnect lives in the File Management menu.
   */
  function updateProgramDataAffordance() {
    var connected = usingProgramData();
    if (connected) {
      programDataConnectError = '';
      programDataPickerBlocked = false;
    }
    var showStatus = !!programDataConnectError;
    updateStep1Affordance();
    updateStep3Affordance();
    if (step2Lead) step2Lead.classList.toggle('hidden', !showStatus);
    if (registryNameLine) registryNameLine.classList.toggle('hidden', !showStatus);
    if (programDataHint) {
      var showHint = !connected && showStatus;
      programDataHint.textContent = showHint
        ? 'ProgramData is not connected. You can still sign in, then load a semester file.'
        : '';
      programDataHint.classList.toggle('hidden', !showHint);
    }
  }

  updateProgramDataAffordance();

  function populateSemesterList() {
    if (!semesterSelect) return Promise.resolve();
    semesterSelect.innerHTML = '<option value="">Select semester file…</option>';
    if (!usingProgramData()) return Promise.resolve();
    return ProgramData.listSemesterFiles().then(function (names) {
      names.forEach(function (name) {
        var opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        semesterSelect.appendChild(opt);
      });
      if (names.length === 1) semesterSelect.value = names[0];
    }).catch(function () { /* list optional */ });
  }

  function loadRegistryFromProgramData() {
    return ProgramData.readRelative(
      ProgramData.PATHS.REGISTRY,
      FileKind.FILE_KINDS.USERS_REGISTRY
    ).then(function (result) {
      return UsersRegistryStorage.importFromRaw(result.raw, result.name, result.handle);
    });
  }

  function afterProgramDataConnected() {
    programDataConnectError = '';
    programDataPickerBlocked = false;
    return loadRegistryFromProgramData().then(function () {
      updateProgramDataAffordance();
      ctx.updateGateStep('');
      if (ctx.refresh) ctx.refresh();
    });
  }

  if (connectProgramDataBtn) {
    connectProgramDataBtn.addEventListener('click', function () {
      ProgramData.connectProgramData().then(function () {
        return afterProgramDataConnected();
      }).catch(function (err) {
        programDataConnectError = connectErr(err);
        programDataPickerBlocked = true;
        updateProgramDataAffordance();
        ctx.showGateModal(programDataConnectError);
      });
    });
  }

  function readPassword() {
    return passwordInput ? String(passwordInput.value || '') : '';
  }

  function clearPassword() {
    if (passwordInput) passwordInput.value = '';
  }

  function clearChangePasswordFields() {
    if (newPasswordInput) newPasswordInput.value = '';
    if (newPasswordConfirmInput) newPasswordConfirmInput.value = '';
  }

  function afterPasswordSignIn(r) {
    if (r.ok && r.needsPasswordChange) {
      clearPassword();
      clearChangePasswordFields();
      ctx.updateGateStep('');
      return;
    }
    if (r.ok) {
      clearPassword();
      clearChangePasswordFields();
      updateStep3Affordance();
      populateSemesterList();
      ctx.updateGateStep('');
    } else {
      ctx.updateGateStep(r.error);
    }
  }

  if (confirmUserBtn) {
    var submitSignIn = function () {
      var email = emailInput ? String(emailInput.value || '').trim() : '';
      var password = readPassword();
      if (!email) {
        ctx.updateGateStep('Enter your email address');
        return;
      }
      if (!password) {
        ctx.updateGateStep('Enter your password');
        return;
      }
      ctx.validateAndSetSession(email, password).then(afterPasswordSignIn).catch(function (err) {
        ctx.updateGateStep(gateErr(err, 'Could not sign in'));
      });
    };
    confirmUserBtn.addEventListener('click', submitSignIn);
    [emailInput, passwordInput].forEach(function (input) {
      if (!input) return;
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') submitSignIn();
      });
    });
  }

  if (changePasswordBtn) {
    var submitPasswordChange = function () {
      var next = newPasswordInput ? String(newPasswordInput.value || '') : '';
      var confirm = newPasswordConfirmInput ? String(newPasswordConfirmInput.value || '') : '';
      if (!ctx.completePasswordChange) {
        ctx.updateGateStep('Password change is unavailable');
        return;
      }
      ctx.completePasswordChange(next, confirm).then(function (r) {
        if (r.ok) {
          clearChangePasswordFields();
          updateStep3Affordance();
          populateSemesterList();
          ctx.updateGateStep('');
        } else {
          ctx.updateGateStep(r.error || 'Could not save the new password');
        }
      }).catch(function (err) {
        ctx.updateGateStep(gateErr(err, 'Could not save the new password'));
      });
    };
    changePasswordBtn.addEventListener('click', submitPasswordChange);
    [newPasswordInput, newPasswordConfirmInput].forEach(function (input) {
      if (!input) return;
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') submitPasswordChange();
      });
    });
  }

  if (forgotPasswordBtn) {
    forgotPasswordBtn.addEventListener('click', function () {
      var prefill = emailInput ? String(emailInput.value || '').trim() : '';
      showDialog(
        'Forgot password',
        '<p class="dialog-message">Enter your college email address. Your mail app will open a message to the program help desk engineer.</p>' +
        '<label class="section-sub" for="userGateForgotEmail">College email address</label>' +
        '<input id="userGateForgotEmail" type="email" autocomplete="email" required ' +
          'value="' + escapeHtml(prefill) + '" style="width:100%;margin:0.25rem 0">',
        function () {
          var emailEl = document.getElementById('userGateForgotEmail');
          var email = emailEl ? String(emailEl.value || '').trim() : '';
          if (!email) {
            ctx.updateGateStep('Enter your college email address');
            return;
          }
          if (!isValidEmail(email)) {
            ctx.updateGateStep('Enter a valid college email address');
            return;
          }
          var registry = UsersRegistryStorage.getRegistry();
          if (!registry) {
            ctx.updateGateStep('Connect the users registry before requesting a password reset.');
            return;
          }
          var helpDesk = UserData.getHelpDeskEngineer(registry);
          if (helpDesk.error) {
            ctx.updateGateStep(helpDesk.error);
            return;
          }
          var subject = 'ADN Scheduling app forgot-password';
          var body = 'Please reset my ADN Scheduling app password.\n\nCollege email: ' + email + '\n';
          window.location.href = 'mailto:' + encodeURIComponent(helpDesk.email) +
            '?subject=' + encodeURIComponent(subject) +
            '&body=' + encodeURIComponent(body);
          ctx.updateGateStep('');
        }
      );
      var dialogSave = document.getElementById('dialogSave');
      if (dialogSave) dialogSave.textContent = 'Open email';
    });
  }

  if (confirmSemesterBtn) {
    confirmSemesterBtn.addEventListener('click', function () {
      var name = semesterSelect && semesterSelect.value;
      if (!name) {
        ctx.updateGateStep('Select a semester file');
        return;
      }
      Storage.loadFromProgramData(name).then(function (fileRoot) {
        state.fileName = name;
        ctx.finishSemesterLoad(fileRoot, name);
      }).catch(function (err) {
        if (err && err.guard && err.guard.detected === 'playground') {
          ctx.updateGateStep('This is a playground file. Open it from the Playground tab instead.');
        } else {
          ctx.updateGateStep(gateErr(err, 'Invalid semester file'));
        }
      });
    });
  }

  if (loadRegBtn) {
    loadRegBtn.addEventListener('click', function () {
      UsersRegistryStorage.openFilePicker().then(function () {
        updateProgramDataAffordance();
        ctx.updateGateStep('');
        if (ctx.refresh) ctx.refresh();
      }).catch(function (err) {
        ctx.showGateModal(gateErr(err, 'Could not load registry file'));
      });
    });
  }

  if (loadSemesterBtn) {
    loadSemesterBtn.addEventListener('click', function () {
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
      }).catch(function (err) {
        if (err && err.guard && err.guard.detected === 'playground') {
          ctx.updateGateStep('This is a playground file. Open it from the Playground tab instead.');
        } else {
          ctx.updateGateStep((err && err.message) || 'Invalid semester file');
        }
      });
    });
  }

  // Expose refresh helpers for updateGateStep
  ctx.refreshProgramDataLists = function () {
    updateProgramDataAffordance();
    return populateSemesterList();
  };
}

export { initGateUI };
