/**
 * Specialty checkbox helpers and pending-request panel for Users admin.
 */

import { escapeHtml, showAlert } from './dialogs.js';
import * as UserData from '../auth/user-data.js';
import * as UserSession from '../auth/user-session.js';
import * as UsersRegistryStorage from '../storage/users-registry-storage.js';
import * as SpecialtyRequests from '../core/faculty-schedule/specialty-requests.js';
import {
  listSpecialties,
  normalizeSpecialties
} from '../core/faculty-schedule/specialties.js';

function esc(text) {
  return escapeHtml(text == null ? '' : String(text));
}

function specialtiesCheckboxesHtml(selected, idPrefix) {
  var selectedSet = {};
  normalizeSpecialties(selected).forEach(function (c) { selectedSet[c] = true; });
  return listSpecialties().map(function (s) {
    return '<label class="filter-check filter-check-compact">' +
      '<input type="checkbox" data-specialty="' + esc(s.code) + '" ' +
      'id="' + esc(idPrefix + '_' + s.code) + '"' +
      (selectedSet[s.code] ? ' checked' : '') + '> ' +
      esc(s.code) + ' — ' + esc(s.fullName) +
      '</label>';
  }).join(' ');
}

function readSpecialtyCheckboxes(root) {
  if (!root) return [];
  var tags = [];
  root.querySelectorAll('input[data-specialty]:checked').forEach(function (el) {
    tags.push(el.getAttribute('data-specialty'));
  });
  return normalizeSpecialties(tags);
}

function formatSpecialtiesCell(entry) {
  var tags = normalizeSpecialties(entry.specialties);
  if (!tags.length) return '<span class="text-muted">—</span>';
  return esc(tags.join(', '));
}

function renderSpecialtyRequests(container, registry, onReviewed) {
  var host = container.querySelector('#usersSpecialtyRequests');
  if (!host) return;
  var pending = SpecialtyRequests.listPendingSpecialtyRequests(registry);
  if (!pending.length) {
    host.innerHTML = '';
    return;
  }
  var rows = pending.map(function (req) {
    var entry = registry.users[req.userId];
    var name = entry
      ? (UserData.formatFullName(entry.firstName, entry.lastName) || req.userId)
      : req.userId;
    return '<div class="users-specialty-request-row" data-sreq="' + esc(req.id) + '">' +
      '<span><strong>' + esc(name) + '</strong> requested: ' +
      esc((req.requestedSpecialties || []).join(', ')) + '</span> ' +
      '<button type="button" class="btn btn-sm" data-sreq-approve="' + esc(req.id) + '">Approve</button> ' +
      '<button type="button" class="btn btn-sm btn-danger" data-sreq-deny="' + esc(req.id) + '">Deny</button>' +
      '</div>';
  }).join('');
  host.innerHTML = '<h4 class="section-title">Pending specialty requests</h4>' + rows;
  host.querySelectorAll('[data-sreq-approve]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      reviewSpecialtyRequestUi(btn.getAttribute('data-sreq-approve'), 'approved', onReviewed);
    });
  });
  host.querySelectorAll('[data-sreq-deny]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      reviewSpecialtyRequestUi(btn.getAttribute('data-sreq-deny'), 'denied', onReviewed);
    });
  });
}

function reviewSpecialtyRequestUi(requestId, decision, onReviewed) {
  var registry = UsersRegistryStorage.getRegistry();
  var session = UserSession.getSession();
  var result = SpecialtyRequests.reviewSpecialtyRequest(registry, requestId, decision, {
    userId: session ? session.userId : '',
    name: session ? session.name : ''
  });
  if (result.error) {
    showAlert('Specialty request', result.error);
    return;
  }
  UsersRegistryStorage.mergeSave(registry).then(function (saveResult) {
    if (saveResult && saveResult.conflict) {
      showAlert('Conflict', 'Registry was updated elsewhere. Reload and try again.');
      return;
    }
    showAlert('Specialty request', decision === 'approved' ? 'Request approved.' : 'Request denied.');
    if (onReviewed) onReviewed();
  }).catch(function (err) {
    showAlert('Specialty request', (err && err.message) || 'Could not save registry');
  });
}

export {
  specialtiesCheckboxesHtml,
  readSpecialtyCheckboxes,
  formatSpecialtiesCell,
  renderSpecialtyRequests
};
