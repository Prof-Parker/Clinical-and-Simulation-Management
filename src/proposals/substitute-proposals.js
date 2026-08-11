/**
 * Mid-semester substitute request / claim proposals.
 */

import { findSlotById, listAllSlots } from '../core/faculty-schedule/slot-inventory.js';
import { FACULTY_NEEDED_NAME } from '../core/theory-events.js';
import * as MessageEmit from '../messages/message-emit.js';
import { notifyChange } from '../core/state.js';

function uid(prefix) {
  return (prefix || 'sub_') + Math.random().toString(36).slice(2, 10);
}

function ensureProposals(semester) {
  if (!Array.isArray(semester.proposals)) semester.proposals = [];
  return semester.proposals;
}

function ensureFacultySchedule(semester) {
  if (!semester.facultySchedule || typeof semester.facultySchedule !== 'object') {
    semester.facultySchedule = { substitutes: [] };
  }
  if (!Array.isArray(semester.facultySchedule.substitutes)) {
    semester.facultySchedule.substitutes = [];
  }
  return semester.facultySchedule;
}

function proposerFromSession(session) {
  return {
    userId: session && session.userId ? String(session.userId) : '',
    name: session && session.name ? String(session.name) : '',
    email: session && session.email ? String(session.email) : ''
  };
}

function mondayOf(isoDate) {
  var d = new Date(isoDate + 'T12:00:00');
  if (isNaN(d.getTime())) return null;
  var day = d.getDay();
  var diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function sameWeek(dates) {
  if (!dates || !dates.length) return true;
  var week = mondayOf(dates[0]);
  if (!week) return false;
  return dates.every(function (d) { return mondayOf(d) === week; });
}

function summarizeCovers(covers) {
  return (covers || []).map(function (c) {
    return c.date + ' ' + c.timeStart + '-' + c.timeEnd;
  }).join(', ');
}

function submitSubstituteRequest(semester, slotId, covers, session, opts) {
  opts = opts || {};
  var slot = findSlotById(semester, slotId);
  if (!slot) return { error: 'Slot not found' };
  if (slot.open) return { error: 'Slot is not assigned' };
  var ownerOk = slot.assignedUserId === session.userId ||
    String(slot.assignedName || '').toLowerCase() === String(session.name || '').toLowerCase();
  if (!ownerOk && !opts.adminOverride) {
    return { error: 'You can only request substitutes for your assigned slots' };
  }
  var list = (covers || []).map(function (c) {
    return {
      date: String(c.date || ''),
      timeStart: String(c.timeStart || slot.timeStart),
      timeEnd: String(c.timeEnd || slot.timeEnd)
    };
  }).filter(function (c) { return c.date; });
  if (!list.length) return { error: 'Select at least one date/time to cover' };
  if (!sameWeek(list.map(function (c) { return c.date; }))) {
    return { error: 'Substitute requests are limited to one calendar week. Email admin staff for longer coverage.' };
  }
  if (slot.kind === 'skills' || slot.kind === 'sim' || slot.kind === 'lecture') {
    for (var i = 0; i < list.length; i++) {
      if (list[i].timeStart !== slot.timeStart || list[i].timeEnd !== slot.timeEnd) {
        return { error: 'Skills lab and simulation require full-day substitute coverage' };
      }
    }
  }
  var proposal = {
    id: uid('prop_'),
    kind: 'substitute',
    status: 'pending',
    path: 'facultySchedule.substitutes',
    currentValue: null,
    proposedValue: { slotId: slotId, covers: list },
    proposedBy: proposerFromSession(session),
    proposedAt: new Date().toISOString(),
    reviewedBy: null,
    reviewedAt: null,
    notes: { proposer: String(opts.note || ''), reviewer: '' },
    items: [{
      slotId: slotId,
      covers: list,
      decision: null,
      note: '',
      claimants: []
    }],
    openPosting: false
  };
  ensureProposals(semester).push(proposal);
  notifyChange();
  return { ok: true, proposal: proposal };
}

function approveSubstituteRequest(semester, proposalId, reviewer, registry) {
  var proposal = ensureProposals(semester).find(function (p) {
    return p.id === proposalId && p.kind === 'substitute';
  });
  if (!proposal) return { error: 'Proposal not found' };
  if (proposal.status !== 'pending') return { error: 'Proposal is not pending' };
  proposal.status = 'open';
  proposal.openPosting = true;
  proposal.reviewedBy = proposerFromSession(reviewer);
  proposal.reviewedAt = new Date().toISOString();
  if (proposal.items && proposal.items[0]) proposal.items[0].decision = 'approved';

  var slot = findSlotById(semester, proposal.proposedValue.slotId);
  var body = 'A substitute is needed for ' +
    ((slot && slot.courseLabel) || 'course') + ' for (' +
    ((slot && slot.kind) || 'assignment') + ') on ' +
    summarizeCovers(proposal.proposedValue.covers) + '.';
  if (registry) {
    MessageEmit.emitSubNeeded(registry, body, { proposalId: proposal.id });
    if (proposal.proposedBy && proposal.proposedBy.userId) {
      MessageEmit.emitSubRequestUpdate(
        registry,
        proposal.proposedBy.userId,
        'Your substitute request has been reviewed (approved).',
        { proposalId: proposal.id }
      );
    }
  }
  notifyChange();
  return { ok: true, proposal: proposal };
}

function denySubstituteRequest(semester, proposalId, reviewer, registry) {
  var proposal = ensureProposals(semester).find(function (p) {
    return p.id === proposalId && p.kind === 'substitute';
  });
  if (!proposal) return { error: 'Proposal not found' };
  proposal.status = 'denied';
  proposal.openPosting = false;
  proposal.reviewedBy = proposerFromSession(reviewer);
  proposal.reviewedAt = new Date().toISOString();
  if (proposal.items && proposal.items[0]) proposal.items[0].decision = 'denied';
  if (registry && proposal.proposedBy && proposal.proposedBy.userId) {
    MessageEmit.emitSubRequestUpdate(
      registry,
      proposal.proposedBy.userId,
      'Your substitute request has been reviewed (denied).',
      { proposalId: proposal.id }
    );
  }
  notifyChange();
  return { ok: true, proposal: proposal };
}

function claimSubstitute(semester, proposalId, session, registry) {
  var proposal = ensureProposals(semester).find(function (p) {
    return p.id === proposalId && p.kind === 'substitute';
  });
  if (!proposal || !proposal.openPosting) return { error: 'No open substitute posting' };
  var item = proposal.items && proposal.items[0];
  if (!item) return { error: 'Invalid substitute proposal' };
  if (!Array.isArray(item.claimants)) item.claimants = [];
  if (item.claimants.some(function (c) { return c.userId === session.userId; })) {
    return { error: 'You already claimed this posting' };
  }
  item.claimants.push(proposerFromSession(session));
  if (registry) {
    var slot = findSlotById(semester, proposal.proposedValue.slotId);
    MessageEmit.emitSubstituteClaimToAdmins(registry,
      (session.name || 'A user') + ' has applied for the open substitute spot for ' +
      ((slot && slot.courseLabel) || 'course') + ' for (' +
      ((slot && slot.kind) || 'assignment') + ') on ' +
      summarizeCovers(proposal.proposedValue.covers) + '.',
      { proposalId: proposal.id, claimantUserId: session.userId });
  }
  notifyChange();
  return { ok: true, proposal: proposal };
}

function approveSubstituteClaim(semester, proposalId, claimantUserId, reviewer, registry) {
  var proposal = ensureProposals(semester).find(function (p) {
    return p.id === proposalId && p.kind === 'substitute';
  });
  if (!proposal) return { error: 'Proposal not found' };
  var item = proposal.items && proposal.items[0];
  if (!item) return { error: 'Invalid proposal' };
  var claimant = (item.claimants || []).find(function (c) { return c.userId === claimantUserId; });
  if (!claimant) return { error: 'Claimant not found' };
  var fs = ensureFacultySchedule(semester);
  var covers = (proposal.proposedValue && proposal.proposedValue.covers) || [];
  covers.forEach(function (c) {
    fs.substitutes.push({
      id: uid('sub_'),
      slotId: proposal.proposedValue.slotId,
      date: c.date,
      timeStart: c.timeStart,
      timeEnd: c.timeEnd,
      coveringUserId: claimant.userId,
      coveringName: claimant.name,
      originalUserId: proposal.proposedBy.userId,
      originalName: proposal.proposedBy.name,
      approvedAt: new Date().toISOString(),
      approvedBy: proposerFromSession(reviewer)
    });
  });
  proposal.status = 'filled';
  proposal.openPosting = false;
  proposal.reviewedBy = proposerFromSession(reviewer);
  proposal.reviewedAt = new Date().toISOString();
  if (registry) {
    MessageEmit.emitSubRequestUpdate(registry, claimant.userId,
      'Your substitute request has been reviewed (approved).',
      { proposalId: proposal.id });
    if (proposal.proposedBy && proposal.proposedBy.userId) {
      MessageEmit.emitSubRequestUpdate(registry, proposal.proposedBy.userId,
        'Your substitute request has been reviewed (approved — covered by ' +
        claimant.name + ').',
        { proposalId: proposal.id });
    }
  }
  notifyChange();
  return { ok: true, proposal: proposal };
}

function adminReopenSlot(semester, slotId) {
  var slot = findSlotById(semester, slotId);
  if (!slot) return { error: 'Slot not found' };
  if (slot.kind === 'clinical') {
    var f = (semester.faculty || []).find(function (x) { return x.id === slot.sourceId; });
    if (!f) return { error: 'Faculty row not found' };
    f.needed = true;
    f.name = FACULTY_NEEDED_NAME;
    delete f.userId;
  } else if (slot.kind === 'sim') {
    var si = (semester.simInstructors || []).find(function (x, idx) {
      return (x.id && x.id === slot.sourceId) || String(idx) === String(slot.sourceId);
    });
    if (!si) return { error: 'Sim instructor not found' };
    si.needed = true;
    si.name = FACULTY_NEEDED_NAME;
    delete si.userId;
  } else {
    return { error: 'Use theory editor to reopen skills/lecture slots' };
  }
  notifyChange();
  return { ok: true };
}

function adminAddSubstituteCover(semester, cover) {
  var fs = ensureFacultySchedule(semester);
  var row = {
    id: uid('sub_'),
    slotId: String(cover.slotId || ''),
    date: String(cover.date || ''),
    timeStart: String(cover.timeStart || ''),
    timeEnd: String(cover.timeEnd || ''),
    coveringUserId: String(cover.coveringUserId || ''),
    coveringName: String(cover.coveringName || ''),
    originalUserId: String(cover.originalUserId || ''),
    originalName: String(cover.originalName || ''),
    approvedAt: new Date().toISOString(),
    approvedBy: cover.approvedBy || null
  };
  fs.substitutes.push(row);
  notifyChange();
  return { ok: true, cover: row };
}

function listMyAssignedSlots(semester, session) {
  return listAllSlots(semester).filter(function (s) {
    if (s.open) return false;
    if (s.assignedUserId && session.userId && s.assignedUserId === session.userId) return true;
    return String(s.assignedName || '').toLowerCase() === String(session.name || '').toLowerCase();
  });
}

function listSubstitutesForUser(semester, userIdOrName) {
  var fs = ensureFacultySchedule(semester);
  var key = String(userIdOrName || '').toLowerCase();
  return fs.substitutes.filter(function (s) {
    return String(s.coveringUserId || '').toLowerCase() === key ||
      String(s.coveringName || '').toLowerCase() === key ||
      String(s.originalUserId || '').toLowerCase() === key ||
      String(s.originalName || '').toLowerCase() === key;
  });
}

export {
  submitSubstituteRequest,
  approveSubstituteRequest,
  denySubstituteRequest,
  claimSubstitute,
  approveSubstituteClaim,
  adminReopenSlot,
  adminAddSubstituteCover,
  listMyAssignedSlots,
  listSubstitutesForUser,
  summarizeCovers
};
