/**
 * Faculty self-schedule proposals (semester.proposals kind: self_schedule).
 */

import { findSlotById } from '../core/faculty-schedule/slot-inventory.js';
import {
  findProgramSlotById,
  semesterForSlotId
} from '../core/faculty-schedule/program-inventory.js';
import { validateCart } from '../core/faculty-schedule/slot-rules.js';
import { FACULTY_NEEDED_NAME } from '../core/theory-events.js';
import * as MessageEmit from '../messages/message-emit.js';
import { notifyChange } from '../core/state.js';
import * as SubstituteProposals from './substitute-proposals.js';

function uid(prefix) {
  return (prefix || 'prop_') + Math.random().toString(36).slice(2, 10);
}

function ensureProposals(semester) {
  if (!Array.isArray(semester.proposals)) semester.proposals = [];
  return semester.proposals;
}

function proposerFromSession(session) {
  return {
    userId: session && session.userId ? String(session.userId) : '',
    name: session && session.name ? String(session.name) : '',
    email: session && session.email ? String(session.email) : ''
  };
}

function listByKind(semester, kind, status) {
  return ensureProposals(semester).filter(function (p) {
    if (p.kind !== kind) return false;
    if (status && p.status !== status) return false;
    return true;
  });
}

function hasPendingSlot(semester, userId, slotId) {
  return listByKind(semester, 'self_schedule', 'pending').some(function (p) {
    if (!p.proposedBy || p.proposedBy.userId !== userId) return false;
    return (p.items || []).some(function (it) {
      return it.slotId === slotId && (!it.decision || it.decision === null);
    });
  });
}

function summarizeSlot(slot) {
  var parts = [slot.courseLabel || slot.courseId, slot.kind];
  if (slot.clinicalGroup) parts.push(slot.clinicalGroup);
  if (slot.siteLabel) parts.push(slot.siteLabel);
  if (slot.timeStart && slot.timeEnd) parts.push(slot.timeStart + '-' + slot.timeEnd);
  return parts.join(' ');
}

function submitSelfSchedule(semester, slotIds, session, opts) {
  opts = opts || {};
  if (!semester.meta || !semester.meta.selfSchedulingOpen) {
    if (!opts.adminOverride) {
      return { error: 'Self scheduling is not open for this semester.' };
    }
  }
  var slots = [];
  for (var i = 0; i < (slotIds || []).length; i++) {
    var slot = findSlotById(semester, slotIds[i]);
    if (!slot || !slot.open || slot.openCount < 1) {
      return { error: 'Slot is not available: ' + slotIds[i] };
    }
    if (hasPendingSlot(semester, session.userId, slotIds[i]) ||
        hasPendingSlot(semester, session.userId, slot.slotId)) {
      return { error: 'You already have a pending request for ' + slotIds[i] };
    }
    slots.push(slot);
  }
  if (!slots.length) return { error: 'Select at least one slot' };

  if (!opts.skipValidate) {
    var check = validateCart(slots, session.specialties || [], {
      allowSpecialtyOverride: !!opts.allowSpecialtyOverride,
      allowHoursOverride: !!opts.allowHoursOverride
    });
    if (!check.ok) return { error: check.errors.join(' '), errors: check.errors };
  }

  var storedIds = (slotIds || []).slice();
  var proposal = {
    id: uid('prop_'),
    kind: 'self_schedule',
    status: 'pending',
    semesterId: semester.id,
    path: 'facultySchedule.self_schedule',
    currentValue: null,
    proposedValue: { slotIds: storedIds },
    proposedBy: proposerFromSession(session),
    proposedAt: new Date().toISOString(),
    reviewedBy: null,
    reviewedAt: null,
    notes: {
      proposer: String(opts.note || ''),
      reviewer: ''
    },
    items: slots.map(function (s, idx) {
      return {
        slotId: storedIds[idx] || s.slotId,
        kind: s.kind,
        courseId: s.courseId,
        label: summarizeSlot(s),
        hours: s.totalHours,
        decision: null,
        note: ''
      };
    })
  };
  ensureProposals(semester).push(proposal);
  notifyChange();
  return { ok: true, proposal: proposal };
}

function submitSelfScheduleProgram(fileRoot, slotIds, session, opts) {
  opts = opts || {};
  var slots = [];
  var i;
  for (i = 0; i < (slotIds || []).length; i++) {
    var slot = findProgramSlotById(fileRoot, slotIds[i]) ||
      (fileRoot.semesters || []).reduce(function (found, sem) {
        return found || findSlotById(sem, slotIds[i]);
      }, null);
    if (!slot || !slot.open || slot.openCount < 1) {
      return { error: 'Slot is not available: ' + slotIds[i] };
    }
    if (!slot.semesterId && fileRoot.semesters && fileRoot.semesters.length === 1) {
      slot = Object.assign({}, slot, { semesterId: fileRoot.semesters[0].id });
    }
    slots.push({ slot: slot, slotId: slotIds[i] });
  }
  if (!slots.length) return { error: 'Select at least one slot' };

  var check = validateCart(slots.map(function (row) { return row.slot; }), session.specialties || [], {
    allowSpecialtyOverride: !!opts.allowSpecialtyOverride,
    allowHoursOverride: !!opts.allowHoursOverride
  });
  if (!check.ok) return { error: check.errors.join(' '), errors: check.errors };

  var bySem = {};
  var order = [];
  slots.forEach(function (row) {
    var sem = semesterForSlotId(fileRoot, row.slotId) ||
      ((fileRoot.semesters || []).find(function (s) { return s.id === row.slot.semesterId; }));
    if (!sem) return;
    if (!bySem[sem.id]) {
      bySem[sem.id] = { semester: sem, ids: [] };
      order.push(sem.id);
    }
    bySem[sem.id].ids.push(row.slotId);
  });

  var proposals = [];
  for (i = 0; i < order.length; i++) {
    var group = bySem[order[i]];
    var result = submitSelfSchedule(group.semester, group.ids, session, Object.assign({}, opts, {
      skipValidate: true
    }));
    if (result.error) return result;
    proposals.push(result.proposal);
  }
  return { ok: true, proposals: proposals, proposal: proposals[0] };
}

function pendingSelfScheduleHours(proposal) {
  return (proposal.items || []).reduce(function (sum, it) {
    return sum + (Number(it.hours) || 0);
  }, 0);
}

function applySlotAssignment(semester, slotId, name, userId) {
  var slot = findSlotById(semester, slotId);
  if (!slot) return false;
  if (slot.sourcePath === 'theory' || (slot.theoryRefs && slot.theoryRefs.length)) {
    return applyTheoryAssignment(semester, slot, name, userId);
  }
  if (slot.kind === 'clinical') {
    var f = (semester.faculty || []).find(function (x) { return x.id === slot.sourceId; });
    if (!f) return false;
    f.needed = false;
    f.name = name;
    f.userId = userId || '';
    return true;
  }
  if (slot.kind === 'sim') {
    var si = (semester.simInstructors || []).find(function (x, idx) {
      return (x.id && x.id === slot.sourceId) || String(idx) === String(slot.sourceId);
    });
    if (!si) return false;
    si.needed = false;
    si.name = name;
    si.userId = userId || '';
    return true;
  }
  if (slot.kind === 'skills' || slot.kind === 'lecture') {
    return applyTheoryAssignment(semester, slot, name, userId);
  }
  return false;
}

function applyTheoryAssignment(semester, slot, name, userId) {
  var refs = slot.theoryRefs || [];
  if (!refs.length || !semester.theory || !Array.isArray(semester.theory.days)) return false;
  var assigned = 0;
  var need = slot.coversAllInstances ? refs.length : 1;
  for (var r = 0; r < refs.length && assigned < need; r++) {
    var ref = refs[r];
    var day = semester.theory.days.find(function (d) {
      return d.id === ref.dayId || d.date === ref.dayId;
    });
    if (!day || !Array.isArray(day.events)) continue;
    var ev = day.events.find(function (e) { return e.id === ref.eventId; });
    if (!ev || !Array.isArray(ev.faculty)) continue;
    var fac = ev.faculty[ref.facultyIndex];
    if (!fac || !(fac.needed || fac.name === FACULTY_NEEDED_NAME)) continue;
    fac.needed = false;
    fac.name = name;
    fac.userId = userId || '';
    assigned++;
  }
  return assigned > 0;
}

function reviewSelfSchedule(semester, proposalId, decisions, reviewer, notes, registry) {
  var proposal = ensureProposals(semester).find(function (p) {
    return p.id === proposalId && p.kind === 'self_schedule';
  });
  if (!proposal) return { error: 'Proposal not found' };
  if (proposal.status !== 'pending' && proposal.status !== 'partial') {
    return { error: 'Proposal is not pending' };
  }
  decisions = decisions || {};
  var approved = 0;
  var denied = 0;
  var pending = 0;
  if (!proposal.notes) proposal.notes = { proposer: '', reviewer: '' };
  (proposal.items || []).forEach(function (item) {
    var d = decisions[item.slotId];
    if (d === 'approved' || d === 'denied') {
      item.decision = d;
      if (decisions[item.slotId + ':note']) item.note = String(decisions[item.slotId + ':note']);
    }
    if (item.decision === 'approved') {
      approved++;
      applySlotAssignment(
        semester,
        item.slotId,
        proposal.proposedBy.name,
        proposal.proposedBy.userId
      );
    } else if (item.decision === 'denied') {
      denied++;
    } else {
      pending++;
    }
  });
  if (pending === 0 && denied === 0) proposal.status = 'approved';
  else if (pending === 0 && approved === 0) proposal.status = 'denied';
  else if (pending === 0) proposal.status = 'partial';
  else proposal.status = 'pending';

  proposal.reviewedBy = proposerFromSession(reviewer);
  proposal.reviewedAt = new Date().toISOString();
  if (notes != null) proposal.notes.reviewer = String(notes);

  if (registry && proposal.proposedBy && proposal.proposedBy.userId) {
    var body = 'Your self schedule request has been reviewed (' +
      proposal.status + ').';
    MessageEmit.emitSelfScheduleUpdate(registry, proposal.proposedBy.userId, body, {
      proposalId: proposal.id,
      status: proposal.status
    });
  }
  notifyChange();
  return { ok: true, proposal: proposal };
}

function setSelfSchedulingOpen(semester, open, registry, semesterLabel) {
  if (!semester.meta) semester.meta = {};
  semester.meta.selfSchedulingOpen = !!open;
  if (open && registry) {
    MessageEmit.emitSelfSchedulingOpen(registry, semesterLabel || semester.meta.semesterName, {
      semesterId: semester.id
    });
  }
  notifyChange();
  return { ok: true };
}

function countPendingSelfScheduleUsers(semester) {
  var seen = {};
  listByKind(semester, 'self_schedule', 'pending').forEach(function (p) {
    if (p.proposedBy && p.proposedBy.userId) seen[p.proposedBy.userId] = true;
  });
  return Object.keys(seen).length;
}

function notifyAdminsOfPendingSelfSchedule(semester, registry) {
  if (!registry) return;
  var n = countPendingSelfScheduleUsers(semester);
  if (!n) return;
  MessageEmit.emitNewSelfScheduleRequests(registry, n, { semesterId: semester.id });
}

export {
  listByKind,
  submitSelfSchedule,
  submitSelfScheduleProgram,
  reviewSelfSchedule,
  pendingSelfScheduleHours,
  setSelfSchedulingOpen,
  countPendingSelfScheduleUsers,
  notifyAdminsOfPendingSelfSchedule,
  summarizeSlot,
  applySlotAssignment
};

export var submitSubstituteRequest = SubstituteProposals.submitSubstituteRequest;
export var approveSubstituteRequest = SubstituteProposals.approveSubstituteRequest;
export var denySubstituteRequest = SubstituteProposals.denySubstituteRequest;
export var claimSubstitute = SubstituteProposals.claimSubstitute;
export var approveSubstituteClaim = SubstituteProposals.approveSubstituteClaim;
export var adminReopenSlot = SubstituteProposals.adminReopenSlot;
export var adminAddSubstituteCover = SubstituteProposals.adminAddSubstituteCover;
export var listMyAssignedSlots = SubstituteProposals.listMyAssignedSlots;
export var listSubstitutesForUser = SubstituteProposals.listSubstitutesForUser;
