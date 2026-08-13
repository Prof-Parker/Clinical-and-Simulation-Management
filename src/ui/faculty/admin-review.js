/**
 * Admin review panel for self-schedule and substitute proposals.
 */

import { escapeHtml, showAlert } from '../dialogs.js';
import * as Permissions from '../../auth/permissions.js';
import * as UserSession from '../../auth/user-session.js';
import * as UsersRegistryStorage from '../../storage/users-registry-storage.js';
import * as ScheduleProposals from '../../proposals/schedule-proposals.js';
import { programSelfSchedulingOpen } from '../../core/faculty-schedule/program-inventory.js';

function esc(s) {
  return escapeHtml(s == null ? '' : String(s));
}

function pendingSelfHtml(semester, fileRoot) {
  var semesters = (fileRoot && fileRoot.semesters && fileRoot.semesters.length)
    ? fileRoot.semesters
    : [semester];
  var cards = [];
  semesters.forEach(function (sem) {
    ScheduleProposals.listByKind(sem, 'self_schedule', 'pending').forEach(function (p) {
      cards.push({ sem: sem, p: p });
    });
  });
  if (!cards.length) {
    return '<p class="section-sub">No pending self-schedule requests.</p>';
  }
  return cards.map(function (row) {
    var p = row.p;
    var hours = ScheduleProposals.pendingSelfScheduleHours(p);
    var items = (p.items || []).map(function (it) {
      return '<div class="faculty-review-item" data-prop="' + esc(p.id) + '" data-slot="' + esc(it.slotId) + '">' +
        '<span>' + esc(it.label || it.slotId) +
        ' <span class="text-muted">(' + esc(String(it.hours || 0)) + ' h)</span></span> ' +
        '<label class="filter-check filter-check-compact"><input type="radio" name="dec_' +
        esc(p.id + '_' + it.slotId) + '" value="approved"> Approve</label> ' +
        '<label class="filter-check filter-check-compact"><input type="radio" name="dec_' +
        esc(p.id + '_' + it.slotId) + '" value="denied"> Deny</label>' +
        '</div>';
    }).join('');
    return '<div class="faculty-review-card" data-review-prop="' + esc(p.id) +
      '" data-semester-id="' + esc(row.sem.id || '') + '">' +
      '<h4>' + esc((p.proposedBy && p.proposedBy.name) || 'Faculty') +
      ' — ' + esc(String(hours)) + ' hours</h4>' +
      (p.notes && p.notes.proposer
        ? '<p class="section-sub">Note: ' + esc(p.notes.proposer) + '</p>'
        : '') +
      items +
      '<label class="section-sub" for="revNote_' + esc(p.id) + '">Reviewer notes</label>' +
      '<textarea id="revNote_' + esc(p.id) + '" rows="2" style="width:100%"></textarea> ' +
      '<button type="button" class="btn btn-primary btn-sm" data-review-save="' + esc(p.id) +
      '">Save decisions</button>' +
      '</div>';
  }).join('');
}

function pendingSubsHtml(semester, fileRoot) {
  var semesters = (fileRoot && fileRoot.semesters && fileRoot.semesters.length)
    ? fileRoot.semesters
    : [semester];
  var pending = [];
  var open = [];
  semesters.forEach(function (sem) {
    ScheduleProposals.listByKind(sem, 'substitute', 'pending').forEach(function (p) {
      pending.push({ sem: sem, p: p });
    });
    (sem.proposals || []).forEach(function (p) {
      if (p.kind === 'substitute' && p.openPosting) open.push({ sem: sem, p: p });
    });
  });
  var html = '';
  if (pending.length) {
    html += '<h4>Pending substitute requests</h4>';
    html += pending.map(function (row) {
      var p = row.p;
      var covers = (p.proposedValue && p.proposedValue.covers) || [];
      return '<div class="faculty-review-card" data-semester-id="' + esc(row.sem.id || '') + '">' +
        '<div>' + esc((p.proposedBy && p.proposedBy.name) || 'Faculty') +
        ' — ' + esc(p.proposedValue.slotId) + '</div>' +
        '<div class="section-sub">' + esc(covers.map(function (c) {
          return c.date + ' ' + c.timeStart + '-' + c.timeEnd;
        }).join(', ')) + '</div>' +
        '<button type="button" class="btn btn-sm" data-sub-approve="' + esc(p.id) +
        '" data-semester-id="' + esc(row.sem.id || '') +
        '">Approve &amp; post</button> ' +
        '<button type="button" class="btn btn-sm btn-danger" data-sub-deny="' + esc(p.id) +
        '" data-semester-id="' + esc(row.sem.id || '') +
        '">Deny</button></div>';
    }).join('');
  }
  if (open.length) {
    html += '<h4>Open substitute postings</h4>';
    html += open.map(function (row) {
      var p = row.p;
      var claimants = (p.items && p.items[0] && p.items[0].claimants) || [];
      var claimHtml = claimants.map(function (c) {
        return '<div>' + esc(c.name) +
          ' <button type="button" class="btn btn-sm" data-sub-claim-approve="' + esc(p.id) +
          '" data-user="' + esc(c.userId) +
          '" data-semester-id="' + esc(row.sem.id || '') +
          '">Assign</button></div>';
      }).join('') || '<p class="section-sub">No claimants yet.</p>';
      return '<div class="faculty-review-card">' +
        '<div>' + esc(p.proposedValue.slotId) + '</div>' + claimHtml + '</div>';
    }).join('');
  }
  if (!html) html = '<p class="section-sub">No substitute activity.</p>';
  return html;
}

function resolveSemester(fileRoot, semester, semId) {
  if (fileRoot && fileRoot.semesters && semId) {
    var found = fileRoot.semesters.find(function (s) { return s.id === semId; });
    if (found) return found;
  }
  return semester;
}

function panelHtml(semester, fileRoot) {
  if (!Permissions.canAction('faculty.reviewSchedule')) {
    return '<p class="section-sub">Admin review is not available for your role.</p>';
  }
  var open = fileRoot
    ? programSelfSchedulingOpen(fileRoot)
    : !!(semester.meta && semester.meta.selfSchedulingOpen);
  return '<div id="facultyAdminPanel">' +
    '<div class="faculty-admin-toolbar">' +
    '<label class="filter-check filter-check-compact">' +
    '<input type="checkbox" id="facultySelfSchedulingOpen"' + (open ? ' checked' : '') +
    '> Self scheduling open</label>' +
    '</div>' +
    '<h3 class="section-title">Self-schedule requests</h3>' +
    pendingSelfHtml(semester, fileRoot) +
    '<h3 class="section-title">Substitutes</h3>' +
    pendingSubsHtml(semester, fileRoot) +
    '</div>';
}

function wire(root, semester, onDone, fileRoot) {
  if (!root) return;
  var openEl = root.querySelector('#facultySelfSchedulingOpen');
  if (openEl) {
    openEl.addEventListener('change', function () {
      var registry = UsersRegistryStorage.getRegistry();
      var targets = (fileRoot && fileRoot.semesters && fileRoot.semesters.length)
        ? fileRoot.semesters
        : [semester];
      targets.forEach(function (sem, idx) {
        ScheduleProposals.setSelfSchedulingOpen(
          sem,
          openEl.checked,
          idx === 0 ? registry : null,
          sem.meta && sem.meta.semesterName
        );
      });
      if (registry) {
        UsersRegistryStorage.mergeSave(registry).then(function () {
          if (onDone) onDone();
        }).catch(function (err) {
          showAlert('Self scheduling', (err && err.message) || 'Could not save registry messages');
        });
      } else if (onDone) onDone();
    });
  }
  root.querySelectorAll('[data-review-save]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var propId = btn.getAttribute('data-review-save');
      var card = root.querySelector('[data-review-prop="' + propId + '"]');
      var decisions = {};
      if (card) {
        card.querySelectorAll('.faculty-review-item').forEach(function (row) {
          var slotId = row.getAttribute('data-slot');
          var checked = row.querySelector('input[type="radio"]:checked');
          if (checked) decisions[slotId] = checked.value;
        });
      }
      var noteEl = document.getElementById('revNote_' + propId);
      var session = UserSession.getSession();
      var registry = UsersRegistryStorage.getRegistry();
      var target = resolveSemester(
        fileRoot,
        semester,
        card && card.getAttribute('data-semester-id')
      );
      var result = ScheduleProposals.reviewSelfSchedule(
        target,
        propId,
        decisions,
        session,
        noteEl ? noteEl.value : '',
        registry
      );
      if (result.error) {
        showAlert('Review', result.error);
        return;
      }
      var saveReg = registry
        ? UsersRegistryStorage.mergeSave(registry)
        : Promise.resolve();
      saveReg.then(function () {
        showAlert('Review saved', 'Self-schedule decisions saved.');
        if (onDone) onDone();
      }).catch(function (err) {
        showAlert('Review', (err && err.message) || 'Could not save');
      });
    });
  });
  root.querySelectorAll('[data-sub-approve]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var registry = UsersRegistryStorage.getRegistry();
      var result = ScheduleProposals.approveSubstituteRequest(
        resolveSemester(fileRoot, semester, btn.getAttribute('data-semester-id')),
        btn.getAttribute('data-sub-approve'),
        UserSession.getSession(),
        registry
      );
      if (result.error) {
        showAlert('Substitute', result.error);
        return;
      }
      var p = registry ? UsersRegistryStorage.mergeSave(registry) : Promise.resolve();
      p.then(function () { if (onDone) onDone(); });
    });
  });
  root.querySelectorAll('[data-sub-deny]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var registry = UsersRegistryStorage.getRegistry();
      var result = ScheduleProposals.denySubstituteRequest(
        resolveSemester(fileRoot, semester, btn.getAttribute('data-semester-id')),
        btn.getAttribute('data-sub-deny'),
        UserSession.getSession(),
        registry
      );
      if (result.error) {
        showAlert('Substitute', result.error);
        return;
      }
      var p = registry ? UsersRegistryStorage.mergeSave(registry) : Promise.resolve();
      p.then(function () { if (onDone) onDone(); });
    });
  });
  root.querySelectorAll('[data-sub-claim-approve]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var registry = UsersRegistryStorage.getRegistry();
      var result = ScheduleProposals.approveSubstituteClaim(
        resolveSemester(fileRoot, semester, btn.getAttribute('data-semester-id')),
        btn.getAttribute('data-sub-claim-approve'),
        btn.getAttribute('data-user'),
        UserSession.getSession(),
        registry
      );
      if (result.error) {
        showAlert('Substitute', result.error);
        return;
      }
      var p = registry ? UsersRegistryStorage.mergeSave(registry) : Promise.resolve();
      p.then(function () { if (onDone) onDone(); });
    });
  });
}

export {
  panelHtml,
  wire
};
