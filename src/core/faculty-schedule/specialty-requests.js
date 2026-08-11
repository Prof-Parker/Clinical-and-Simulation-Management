/**
 * Registry specialty-change request workflow.
 */

import {
  ensureLeadLectureTag,
  normalizeSpecialties
} from './specialties.js';
import * as MessageEmit from '../../messages/message-emit.js';
import { formatFullName } from '../../auth/user-data.js';

function uid() {
  return 'sreq_' + Math.random().toString(36).slice(2, 10);
}

function ensureRequests(registry) {
  if (!registry.meta) registry.meta = {};
  if (!Array.isArray(registry.meta.specialtyRequests)) registry.meta.specialtyRequests = [];
  return registry.meta.specialtyRequests;
}

function submitSpecialtyRequest(registry, userId, specialties, note) {
  var entry = registry && registry.users && registry.users[userId];
  if (!entry) return { error: 'Unknown user' };
  var requested = normalizeSpecialties(specialties);
  if (!requested.length) return { error: 'Select at least one specialty' };
  var list = ensureRequests(registry);
  var pending = list.find(function (r) {
    return r.status === 'pending' && r.userId === userId;
  });
  if (pending) {
    pending.requestedSpecialties = requested;
    pending.note = String(note || '');
    pending.requestedAt = new Date().toISOString();
  } else {
    list.push({
      id: uid(),
      userId: userId,
      requestedSpecialties: requested,
      note: String(note || ''),
      status: 'pending',
      requestedAt: new Date().toISOString(),
      reviewedAt: null,
      reviewedBy: null
    });
  }
  var name = formatFullName(entry.firstName, entry.lastName) || userId;
  MessageEmit.emitSpecialtyRequestToAdmins(registry, name, requested, {
    userId: userId
  });
  return { ok: true, registry: registry };
}

function setUserSpecialties(registry, userId, specialties) {
  var entry = registry && registry.users && registry.users[userId];
  if (!entry) return { error: 'Unknown user' };
  entry.specialties = ensureLeadLectureTag(entry.role, specialties);
  return { ok: true, entry: entry };
}

function reviewSpecialtyRequest(registry, requestId, decision, reviewer) {
  var list = ensureRequests(registry);
  var req = list.find(function (r) { return r.id === requestId; });
  if (!req) return { error: 'Request not found' };
  if (req.status !== 'pending') return { error: 'Request already reviewed' };
  var approved = decision === 'approved';
  req.status = approved ? 'approved' : 'denied';
  req.reviewedAt = new Date().toISOString();
  req.reviewedBy = {
    userId: reviewer && reviewer.userId ? String(reviewer.userId) : '',
    name: reviewer && reviewer.name ? String(reviewer.name) : ''
  };
  if (approved) {
    setUserSpecialties(registry, req.userId, req.requestedSpecialties);
  }
  var body = 'Your role change request has been reviewed (' +
    (approved ? 'approved' : 'denied') + ').';
  MessageEmit.emitRoleUpdate(registry, req.userId, body, {
    requestId: req.id,
    decision: req.status
  });
  return { ok: true, request: req };
}

function listPendingSpecialtyRequests(registry) {
  return ensureRequests(registry).filter(function (r) { return r.status === 'pending'; });
}

export {
  submitSpecialtyRequest,
  setUserSpecialties,
  reviewSpecialtyRequest,
  listPendingSpecialtyRequests
};
