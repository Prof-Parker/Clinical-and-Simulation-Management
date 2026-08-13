/**
 * Faculty substitute request / claim UI helpers.
 */

import { escapeHtml, showAlert, showDialog } from '../dialogs.js';
import * as Permissions from '../../auth/permissions.js';
import * as UserSession from '../../auth/user-session.js';
import * as UsersRegistryStorage from '../../storage/users-registry-storage.js';
import * as ScheduleProposals from '../../proposals/schedule-proposals.js';
import { listProgramMyAssignedSlots, semesterForSlotId } from '../../core/faculty-schedule/program-inventory.js';

function esc(s) {
  return escapeHtml(s == null ? '' : String(s));
}

function collectProposals(fileRoot, semester) {
  if (fileRoot && fileRoot.semesters && fileRoot.semesters.length) {
    var out = [];
    fileRoot.semesters.forEach(function (sem) {
      (sem.proposals || []).forEach(function (p) { out.push(p); });
    });
    return out;
  }
  return semester.proposals || [];
}

function myRequestsHtml(semester, fileRoot) {
  var session = UserSession.getSession();
  if (!session) return '<p class="section-sub">Sign in to view your requests.</p>';
  var allProps = collectProposals(fileRoot, semester);
  var mine = allProps.filter(function (p) {
    return p.proposedBy && p.proposedBy.userId === session.userId &&
      (p.kind === 'self_schedule' || p.kind === 'substitute');
  });
  var assigned = fileRoot
    ? listProgramMyAssignedSlots(fileRoot, session)
    : ScheduleProposals.listMyAssignedSlots(semester, session);
  var openPosts = allProps.filter(function (p) {
    return p.kind === 'substitute' && p.openPosting;
  });

  var html = '<div id="facultyMyRequests">';
  html += '<h3 class="section-title">My assigned slots</h3>';
  if (!assigned.length) {
    html += '<p class="section-sub">No approved assignments for your account yet.</p>';
  } else {
    html += '<ul>' + assigned.map(function (s) {
      return '<li>' + esc(ScheduleProposals.summarizeSlot(s)) +
        (Permissions.canAction('faculty.requestSub')
          ? ' <button type="button" class="btn btn-sm" data-req-sub="' + esc(s.slotId) +
            '">Request substitute</button>'
          : '') +
        '</li>';
    }).join('') + '</ul>';
  }

  html += '<h3 class="section-title">My proposals</h3>';
  if (!mine.length) {
    html += '<p class="section-sub">No proposals submitted.</p>';
  } else {
    html += '<ul>' + mine.map(function (p) {
      return '<li>' + esc(p.kind) + ' — ' + esc(p.status) +
        ' <span class="text-muted">' + esc(p.proposedAt || '') + '</span></li>';
    }).join('') + '</ul>';
  }

  if (Permissions.canAction('faculty.claimSub') && openPosts.length) {
    html += '<h3 class="section-title">Open substitute posts</h3>';
    html += openPosts.map(function (p) {
      var covers = (p.proposedValue && p.proposedValue.covers) || [];
      return '<div class="faculty-review-card">' +
        '<div>' + esc(p.proposedValue.slotId) + ' — ' +
        esc(covers.map(function (c) { return c.date; }).join(', ')) + '</div>' +
        '<button type="button" class="btn btn-sm" data-claim-sub="' + esc(p.id) +
        '">Apply to cover</button></div>';
    }).join('');
  }
  html += '</div>';
  return html;
}

function wire(root, semester, onDone, fileRoot) {
  if (!root) return;
  root.querySelectorAll('[data-req-sub]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var slotId = btn.getAttribute('data-req-sub');
      var slot = (fileRoot
        ? listProgramMyAssignedSlots(fileRoot, UserSession.getSession())
        : ScheduleProposals.listMyAssignedSlots(semester, UserSession.getSession()))
        .find(function (s) { return s.slotId === slotId; });
      if (!slot) return;
      var dateOpts = (slot.instances || []).slice(0, 14).map(function (inst) {
        return '<label class="filter-check"><input type="checkbox" data-sub-date="' +
          esc(inst.date) + '" data-start="' + esc(inst.timeStart || slot.timeStart) +
          '" data-end="' + esc(inst.timeEnd || slot.timeEnd) + '"> ' +
          esc(inst.date) + ' ' + esc(inst.timeStart || slot.timeStart) + '-' +
          esc(inst.timeEnd || slot.timeEnd) + '</label>';
      }).join('');
      showDialog(
        'Request substitute',
        '<p class="section-sub">Select dates within one calendar week. Skills/sim require full day.</p>' +
        '<div id="facultySubDatePick">' + dateOpts + '</div>' +
        (slot.kind === 'clinical'
          ? '<label class="section-sub">Optional clinical time override (HHMM-HHMM)</label>' +
            '<input id="facultySubTimeOverride" type="text" placeholder="e.g. 0600-1200" style="width:100%">'
          : ''),
        function () {
          var covers = [];
          var pick = document.getElementById('facultySubDatePick');
          var override = document.getElementById('facultySubTimeOverride');
          var ov = override && override.value.trim();
          var ovStart = '';
          var ovEnd = '';
          if (ov && ov.indexOf('-') > 0) {
            var parts = ov.split('-');
            ovStart = parts[0].replace(/\D/g, '');
            ovEnd = parts[1].replace(/\D/g, '');
          }
          if (pick) {
            pick.querySelectorAll('input[data-sub-date]:checked').forEach(function (el) {
              covers.push({
                date: el.getAttribute('data-sub-date'),
                timeStart: ovStart || el.getAttribute('data-start'),
                timeEnd: ovEnd || el.getAttribute('data-end')
              });
            });
          }
          var target = (fileRoot && slot && slot.semesterId)
            ? (semesterForSlotId(fileRoot, slot.slotId) || semester)
            : semester;
          var result = ScheduleProposals.submitSubstituteRequest(
            target,
            slotId,
            covers,
            UserSession.getSession(),
            {}
          );
          if (result.error) {
            showAlert('Substitute request', result.error);
            return;
          }
          var registry = UsersRegistryStorage.getRegistry();
          if (registry) {
            var MessageEmit = null;
            import('../../messages/message-emit.js').then(function (m) {
              MessageEmit = m;
              var slotLabel = ScheduleProposals.summarizeSlot(slot);
              MessageEmit.emitSubstituteRequestToAdmins(registry,
                'A sub has been requested for ' + slotLabel + '.',
                { proposalId: result.proposal.id });
              return UsersRegistryStorage.mergeSave(registry);
            }).then(function () {
              showAlert('Submitted', 'Substitute request submitted.');
              if (onDone) onDone();
            }).catch(function () {
              showAlert('Submitted', 'Substitute request submitted.');
              if (onDone) onDone();
            });
          } else {
            showAlert('Submitted', 'Substitute request submitted.');
            if (onDone) onDone();
          }
        }
      );
    });
  });
  root.querySelectorAll('[data-claim-sub]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var registry = UsersRegistryStorage.getRegistry();
      var result = ScheduleProposals.claimSubstitute(
        semester,
        btn.getAttribute('data-claim-sub'),
        UserSession.getSession(),
        registry
      );
      if (result.error) {
        showAlert('Claim substitute', result.error);
        return;
      }
      var p = registry ? UsersRegistryStorage.mergeSave(registry) : Promise.resolve();
      p.then(function () {
        showAlert('Claimed', 'Your claim was submitted for admin review.');
        if (onDone) onDone();
      });
    });
  });
}

export {
  myRequestsHtml,
  wire
};
