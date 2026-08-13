/**
 * Faculty self-schedule shopping cart.
 */

import { escapeHtml, showAlert } from '../dialogs.js';
import * as Permissions from '../../auth/permissions.js';
import * as UserSession from '../../auth/user-session.js';
import * as UsersRegistryStorage from '../../storage/users-registry-storage.js';
import { findSlotById } from '../../core/faculty-schedule/slot-inventory.js';
import {
  findProgramSlotById,
  programSelfSchedulingOpen
} from '../../core/faculty-schedule/program-inventory.js';
import { validateCart } from '../../core/faculty-schedule/slot-rules.js';
import * as ScheduleProposals from '../../proposals/schedule-proposals.js';
import { summarizeSlot } from '../../proposals/schedule-proposals.js';

var cartIds = {};

function esc(s) {
  return escapeHtml(s == null ? '' : String(s));
}

function getCartIds() {
  return cartIds;
}

function clearCart() {
  cartIds = {};
}

function toggleCart(slotId) {
  if (cartIds[slotId]) delete cartIds[slotId];
  else cartIds[slotId] = true;
  return !!cartIds[slotId];
}

function cartSlotList(semester, fileRoot) {
  return Object.keys(cartIds).map(function (id) {
    if (fileRoot) {
      return findProgramSlotById(fileRoot, id) || findSlotById(semester, id);
    }
    return findSlotById(semester, id);
  }).filter(Boolean);
}

function cartPanelHtml(semester, fileRoot) {
  var slots = cartSlotList(semester, fileRoot);
  if (!slots.length) {
    return '<div id="facultyCartPanel" class="faculty-cart-panel">' +
      '<h3 class="section-title">Cart</h3>' +
      '<p class="section-sub">Select open slots to build a signup request.</p></div>';
  }
  var hours = slots.reduce(function (sum, s) { return sum + (s.totalHours || 0); }, 0);
  var rows = slots.map(function (s) {
    return '<li>' + esc(summarizeSlot(s)) +
      ' <span class="text-muted">(' + esc(String(s.totalHours || 0)) + ' h)</span> ' +
      '<button type="button" class="btn btn-sm" data-cart-remove="' + esc(s.slotId) +
      '">Remove</button></li>';
  }).join('');
  var open = fileRoot
    ? programSelfSchedulingOpen(fileRoot)
    : !!(semester.meta && semester.meta.selfSchedulingOpen);
  var canSubmit = Permissions.canAction('faculty.selfSchedule');
  return '<div id="facultyCartPanel" class="faculty-cart-panel">' +
    '<h3 class="section-title">Cart</h3>' +
    '<p class="section-sub">Total applied hours: <strong>' + esc(String(hours)) + '</strong>' +
    (open ? '' : ' — self scheduling is closed') + '</p>' +
    '<ul class="faculty-cart-list">' + rows + '</ul>' +
    '<label class="section-sub" for="facultyCartNote">Notes</label>' +
    '<textarea id="facultyCartNote" rows="2" style="width:100%"></textarea>' +
    (canSubmit
      ? '<button type="button" class="btn btn-primary btn-sm" id="facultyCartSubmitBtn"' +
        (open || Permissions.canAction('faculty.reviewSchedule') ? '' : ' disabled') +
        '>Submit request</button>'
      : '') +
    '</div>';
}

function submitCart(semester, onDone, fileRoot) {
  var session = UserSession.getSession();
  if (!session) {
    showAlert('Sign in required', 'Sign in to submit a self-schedule request.');
    return;
  }
  if (!Permissions.canAction('faculty.selfSchedule') &&
      !Permissions.canAction('faculty.reviewSchedule')) {
    showAlert('Not permitted', 'Your role cannot self-schedule.');
    return;
  }
  var ids = Object.keys(cartIds);
  var noteEl = document.getElementById('facultyCartNote');
  var opts = {
    note: noteEl ? noteEl.value : '',
    adminOverride: Permissions.canAction('faculty.reviewSchedule')
  };
  var result = fileRoot
    ? ScheduleProposals.submitSelfScheduleProgram(fileRoot, ids, session, opts)
    : ScheduleProposals.submitSelfSchedule(semester, ids, session, opts);
  if (result.error) {
    showAlert('Self schedule', result.error);
    return;
  }
  var registry = UsersRegistryStorage.getRegistry();
  if (fileRoot && fileRoot.semesters) {
    fileRoot.semesters.forEach(function (sem) {
      ScheduleProposals.notifyAdminsOfPendingSelfSchedule(sem, registry);
    });
  } else {
    ScheduleProposals.notifyAdminsOfPendingSelfSchedule(semester, registry);
  }
  if (registry) {
    UsersRegistryStorage.mergeSave(registry).catch(function () { /* non-blocking */ });
  }
  clearCart();
  showAlert('Request submitted', 'Your self-schedule request was submitted for review.');
  if (onDone) onDone();
}

function validateCurrentCart(semester, fileRoot) {
  var session = UserSession.getSession() || {};
  return validateCart(cartSlotList(semester, fileRoot), session.specialties || [], {
    allowSpecialtyOverride: Permissions.canAction('faculty.reviewSchedule'),
    allowHoursOverride: Permissions.canAction('faculty.reviewSchedule')
  });
}

export {
  getCartIds,
  clearCart,
  toggleCart,
  cartPanelHtml,
  submitCart,
  cartSlotList,
  validateCurrentCart
};
