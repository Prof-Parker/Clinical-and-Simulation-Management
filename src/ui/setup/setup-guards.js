/**
 * Setup tab — draft mode, edit guards, and scoped data resolution.
 */

import { getData } from '../../core/state.js';
import { showAlert } from '../dialogs.js';
import { guardEditable, canAction } from '../../auth/permissions.js';
import { isValidated } from '../../auth/user-session.js';
import * as SetupDraft from '../../proposals/setup-draft.js';
import * as Audit from '../../audit/audit.js';
import { updateSemesterDisplay } from '../chrome.js';
import { updateFinalizeButtonState } from './semester-fields.js';
import {
  getSetupScope, resolveScopeData, setupEl
} from './scope.js';

export function guardSetupEdit() {
  if (getSetupScope().isPlayground) {
    if (isValidated()) {
      if (!canAction('playground.edit') && !canAction('setup.edit') && !canAction('*')) {
        showAlert('Not permitted', 'Your role cannot edit the playground.');
        return false;
      }
    }
    return true;
  }
  if (isValidated()) {
    if (!canAction('setup.edit') &&
        !canAction('setup.saveDraft') &&
        !canAction('proposals.submit')) {
      showAlert('Not permitted', 'Your role cannot edit setup.');
      return false;
    }
  }
  return guardEditable('setup');
}

export function isProposeOnlyMode() {
  return SetupDraft && SetupDraft.usesDraftMode();
}

export function resolveSetupData() {
  if (getSetupScope().isPlayground) return resolveScopeData();
  if (isProposeOnlyMode()) return SetupDraft.getWorkingForEdit();
  return getData();
}

export function resolveRenderData(passed) {
  if (passed && !isProposeOnlyMode()) return passed;
  if (isProposeOnlyMode()) return SetupDraft.getWorking();
  return passed || getData();
}

export function updateReadOnlyButtons(data) {
  if (getSetupScope().isPlayground) return;
  var readOnly = !!(Audit && Audit.isReadOnly(data));
  ['saveSetupBtn', 'regenerateSchedulesBtn', 'rebalanceStudentsBtn', 'rebalanceSimGroupsBtn'].forEach(function (id) {
    var btn = setupEl(id);
    if (!btn) return;
    btn.disabled = readOnly;
    if (readOnly) btn.title = 'Semester in closeout — editing disabled';
    else if (btn.title === 'Semester in closeout — editing disabled') btn.title = '';
  });
  document.querySelectorAll('#view-setup .config-list-add-row .btn').forEach(function (btn) {
    btn.disabled = readOnly;
    if (readOnly) btn.title = 'Semester in closeout — editing disabled';
    else if (btn.title === 'Semester in closeout — editing disabled') btn.title = '';
  });
  if (readOnly) {
    var finalizeBtn = setupEl('finalizeSemesterBtn');
    if (finalizeBtn) {
      finalizeBtn.disabled = true;
      finalizeBtn.title = 'Semester in closeout — editing disabled';
    }
  }
}

export function markSetupDraft(data) {
  if (getSetupScope().isPlayground) return;
  if (!data || !data.meta || !data.meta.finalized) return;
  data.meta.finalized = false;
  updateFinalizeButtonState(data);
  updateSemesterDisplay();
}

export function isSetupDraftArea(el) {
  if (!el) return false;
  var inView = el.closest('#view-setup') || el.closest('#playgroundSetupRoot');
  if (!inView) return false;
  if (el.closest('.setup-actions-sticky')) return false;
  if (el.closest('#setupRoster') || el.closest('#pg-setupRoster')) return false;
  return !!(
    el.closest('#view-setup > section.card') ||
    el.closest('#playgroundSetupRoot > section.card') ||
    el.closest('.setup-program-card') ||
    el.closest('.setup-holidays-card') ||
    el.closest('.setup-orientations-card') ||
    el.closest('#setupAdvancedPanel')
  );
}

export function handleSetupDraftInput(e) {
  if (!isSetupDraftArea(e.target)) return;
  if (isProposeOnlyMode()) {
    SetupDraft.syncFromDom();
    return;
  }
  markSetupDraft(resolveSetupData());
}
