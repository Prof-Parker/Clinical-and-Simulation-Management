/**
 * Role-based tab and action permissions.
 */

import * as SetupConfig from '../ui/setup-config/index.js';
import * as UserSession from './user-session.js';
import * as UserTemplate from './user-template.js';
import { showAlert } from '../ui/dialogs.js';
import { getData } from '../core/state.js';
import * as Audit from '../audit/audit.js';
import { getNavShell } from '../ui/course-selector.js';
import { applyFileMenuGating } from '../ui/file-menu-gating.js';

function currentRole() {
    var s = UserSession && UserSession.getSession();
    return s ? s.role : null;
  }

  function canTab(tabId) {
    var role = currentRole();
    if (!role || !UserTemplate) return false;
    return UserTemplate.canTab(role, tabId);
  }

  function canAction(action) {
    var role = currentRole();
    if (!role || !UserTemplate) return false;
    return UserTemplate.canAction(role, action);
  }

  function isDashboardReadOnly() {
    var role = currentRole();
    if (!role || !UserTemplate) return true;
    return UserTemplate.isDashboardReadOnly(role);
  }

  function guard(action, silent) {
    if (!UserSession || !UserSession.isValidated()) {
      if (!silent) {
        showAlert('Sign in required', 'Load your user file and registry to continue.');
      }
      return false;
    }
    if (!canAction(action)) {
      if (!silent) {
        showAlert('Not permitted', 'Your role does not allow this action.');
      }
      return false;
    }
    return true;
  }

  function applyNavGating() {
    var shell = getNavShell();
    document.querySelectorAll('.nav-tab[data-shell]').forEach(function (btn) {
      var tab = btn.dataset.tab;
      var allowed = canTab(tab);
      var shellMatch = btn.dataset.shell === shell;
      btn.classList.toggle('hidden', !allowed || !shellMatch);
      btn.disabled = !allowed;
    });
  }

  function applyMenuGating() {
    var role = currentRole();
    var map = {
      newSemesterBatchBtn: 'semester.batchCreate',
      menuSwitchSemesterBtn: 'semester.switch',
      switchUserMenuBtn: true,
      loadRegistryMenuBtn: true
    };
    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var perm = map[id];
      var show = perm === true || (role && canAction(perm));
      el.classList.toggle('hidden', !show);
    });
    ['menuUsersLibraryBtn', 'menuClinicalSitesBtn'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var tab = id === 'menuUsersLibraryBtn' ? 'users' : 'clinical-sites';
      el.classList.toggle('hidden', !canTab(tab));
    });
    var pgBtn = document.getElementById('menuPlaygroundBtn');
    if (pgBtn) {
      pgBtn.classList.toggle('hidden', !canTab('playground-dashboard'));
    }
    var logoutBtn = document.getElementById('logoutUserMenuBtn');
    if (logoutBtn) {
      logoutBtn.classList.toggle('hidden', !(UserSession && UserSession.isValidated()));
    }
    applyFileMenuGating();
  }

  function apply() {
    applyNavGating();
    applyMenuGating();
    if (SetupConfig && SetupConfig.applyRoleMode) {
      SetupConfig.applyRoleMode();
    }
  }

  function auditGuardEditable(action) {
    var data = getData();
    if (!data || Audit.canEdit(data, action)) return true;
    showAlert('Semester in closeout',
      'Semester in closeout — editing disabled. Reopen from the Audit tab if corrections are needed.');
    return false;
  }

  function guardEditable(action) {
    if (!guard(action, true)) return false;
    return auditGuardEditable(action);
  }

export {
  currentRole,
  canTab,
  canAction,
  isDashboardReadOnly,
  guard,
  guardEditable,
  applyNavGating,
  applyMenuGating,
  apply
};
