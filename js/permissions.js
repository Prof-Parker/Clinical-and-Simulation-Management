/* global App */
var App = App || {};

App.Permissions = (function () {
  function currentRole() {
    var s = App.UserSession && App.UserSession.getSession();
    return s ? s.role : null;
  }

  function canTab(tabId) {
    var role = currentRole();
    if (!role || !App.UserTemplate) return false;
    return App.UserTemplate.canTab(role, tabId);
  }

  function canAction(action) {
    var role = currentRole();
    if (!role || !App.UserTemplate) return false;
    return App.UserTemplate.canAction(role, action);
  }

  function isDashboardReadOnly() {
    var role = currentRole();
    if (!role || !App.UserTemplate) return true;
    return App.UserTemplate.isDashboardReadOnly(role);
  }

  function guard(action, silent) {
    if (!App.UserSession || !App.UserSession.isValidated()) {
      if (!silent && App.UI) {
        App.UI.showAlert('Sign in required', 'Load your user file and registry to continue.');
      }
      return false;
    }
    if (!canAction(action)) {
      if (!silent && App.UI) {
        App.UI.showAlert('Not permitted', 'Your role does not allow this action.');
      }
      return false;
    }
    return true;
  }

  function applyNavGating() {
    document.querySelectorAll('.nav-tab').forEach(function (btn) {
      var tab = btn.dataset.tab;
      var allowed = canTab(tab);
      btn.classList.toggle('hidden', !allowed);
      btn.disabled = !allowed;
    });
  }

  function applyMenuGating() {
    var role = currentRole();
    var map = {
      newSemesterBatchBtn: 'semester.batchCreate',
      openSimFacultyBtn: 'roles.edit',
      newSimFacultyBtn: 'roles.edit',
      importSimFacultyBtn: 'roles.edit',
      exportSimFacultyBtn: 'roles.edit',
      menuSwitchSemesterBtn: 'semester.switch',
      loadUserFileMenuBtn: true,
      loadRegistryMenuBtn: true
    };
    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var perm = map[id];
      var show = perm === true || (role && canAction(perm));
      el.classList.toggle('hidden', !show);
    });
    if (role === 'admin_staff') {
      ['openSimFacultyBtn', 'newSimFacultyBtn', 'importSimFacultyBtn', 'exportSimFacultyBtn'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.classList.add('hidden');
      });
    }
    var logoutBtn = document.getElementById('logoutUserMenuBtn');
    if (logoutBtn) {
      logoutBtn.classList.toggle('hidden', !(App.UserSession && App.UserSession.isValidated()));
    }
  }

  function apply() {
    applyNavGating();
    applyMenuGating();
    if (App.UI && App.UI.updateCourseStatusLine) App.UI.updateCourseStatusLine();
    if (App.UI && App.UI.updateUserStatusLine) App.UI.updateUserStatusLine();
    if (App.UI && App.UI.SetupConfig && App.UI.SetupConfig.applyRoleMode) {
      App.UI.SetupConfig.applyRoleMode();
    }
    if (App.UI && App.UI.Dashboard && App.UI.Dashboard.applyReadOnlyMode) {
      App.UI.Dashboard.applyReadOnlyMode(isDashboardReadOnly());
    }
  }

  function guardEditable(action) {
    if (!guard(action, true)) return false;
    return App.UI.guardEditable(action);
  }

  return {
    currentRole: currentRole,
    canTab: canTab,
    canAction: canAction,
    isDashboardReadOnly: isDashboardReadOnly,
    guard: guard,
    guardEditable: guardEditable,
    applyNavGating: applyNavGating,
    applyMenuGating: applyMenuGating,
    apply: apply
  };
})();
