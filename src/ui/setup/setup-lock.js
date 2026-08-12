/**
 * Lock / unlock practicum setup inputs when semester is finalized.
 */

import * as Audit from '../../audit/audit.js';
import { setupEl } from './scope.js';

export function isSetupFinalizedLocked(data) {
  return !!(data && data.meta && data.meta.finalized);
}

function allowWhileLocked(el) {
  if (!el) return false;
  if (el.id && /finalizeSemesterBtn$/.test(el.id)) return true;
  if (el.id && /setupAdvancedConfigBtn$/.test(el.id)) return true;
  return false;
}

/**
 * After setup render: when finalized, disable editable controls in #view-setup
 * (except Finalize/Unlock and Advanced Configuration toggle).
 * On unlock, re-enable only controls this lock disabled so widget-owned
 * disabled states (full time faculty name/select, faculty "needed" slots) survive.
 */
export function applySetupFinalizedLock(data) {
  var root = document.getElementById('view-setup');
  if (!root) return;
  var locked = isSetupFinalizedLocked(data);
  root.classList.toggle('setup-finalized-locked', locked);
  var auditRo = !!(Audit && Audit.isReadOnly(data));

  root.querySelectorAll('input, select, textarea, button').forEach(function (el) {
    if (allowWhileLocked(el)) {
      el.disabled = auditRo;
      delete el.dataset.finalizedDisabled;
      return;
    }
    if (locked) {
      if (!el.disabled) {
        el.disabled = true;
        el.dataset.finalizedDisabled = '1';
      }
    } else if (el.dataset.finalizedDisabled === '1') {
      el.disabled = false;
      delete el.dataset.finalizedDisabled;
    }
  });
}

export function updateFinalizeButtonState(data) {
  var finalizeBtn = setupEl('finalizeSemesterBtn');
  if (!finalizeBtn) return;
  var auditRo = !!(Audit && Audit.isReadOnly(data));
  var finalized = isSetupFinalizedLocked(data);
  finalizeBtn.disabled = !!auditRo;
  if (auditRo) {
    finalizeBtn.textContent = 'Finalize Semester';
    finalizeBtn.title = 'Semester in closeout — editing disabled';
    finalizeBtn.classList.remove('btn-unlock-setup');
    return;
  }
  if (finalized) {
    finalizeBtn.textContent = 'Unlock Setup';
    finalizeBtn.title = 'Unlock setup to allow changes to the active semester';
    finalizeBtn.classList.add('btn-unlock-setup');
  } else {
    finalizeBtn.textContent = 'Finalize Semester';
    finalizeBtn.title = '';
    finalizeBtn.classList.remove('btn-unlock-setup');
  }
}
