/**
 * Fan-out helpers that append messages onto users-registry entries.
 * Callers are responsible for persisting the registry after emit.
 */

import * as Messages from './messages.js';
import { MESSAGE_TYPES } from './message-types.js';

function eachUser(registry, fn) {
  if (!registry || !registry.users) return;
  Object.keys(registry.users).forEach(function (userId) {
    var entry = registry.users[userId];
    if (!entry || entry.status !== 'active') return;
    fn(userId, entry);
  });
}

/**
 * Deliver one message to a single user.
 */
function emitToUser(registry, userId, opts) {
  if (!registry || !registry.users || !registry.users[userId]) return null;
  var entry = registry.users[userId];
  if (entry.status !== 'active') return null;
  var msg = Messages.createMessage(opts);
  Messages.appendMessage(entry, msg);
  return msg;
}

/**
 * Deliver the same message content to all active users with a given role.
 */
function emitToRole(registry, roleId, opts) {
  var created = [];
  eachUser(registry, function (userId, entry) {
    if (entry.role !== roleId) return;
    var msg = Messages.createMessage(Object.assign({}, opts, { audienceRole: roleId }));
    Messages.appendMessage(entry, msg);
    created.push({ userId: userId, message: msg });
  });
  return created;
}

/**
 * Deliver to multiple roles (admin_staff + program_engineer for staff alerts).
 */
function emitToRoles(registry, roleIds, opts) {
  var created = [];
  (roleIds || []).forEach(function (roleId) {
    created = created.concat(emitToRole(registry, roleId, opts));
  });
  return created;
}

function emitToAdmins(registry, opts) {
  return emitToRoles(registry, ['admin_staff', 'program_engineer'], opts);
}

function emitSelfScheduleUpdate(registry, userId, body, meta) {
  return emitToUser(registry, userId, {
    type: MESSAGE_TYPES.SELF_SCHEDULE_UPDATE,
    body: body,
    meta: meta || {}
  });
}

function emitSelfSchedulingOpen(registry, semesterLabel, meta) {
  var body = 'Self scheduling for ' + String(semesterLabel || 'this semester') + ' is now open.';
  var adjunct = emitToRole(registry, 'adjunct_faculty', {
    type: MESSAGE_TYPES.SELF_SCHEDULING_OPEN,
    body: body,
    meta: meta || {}
  });
  var lead = emitToRole(registry, 'lead_course_faculty', {
    type: MESSAGE_TYPES.SELF_SCHEDULING_OPEN,
    body: body,
    meta: meta || {}
  });
  return adjunct.concat(lead);
}

function emitNewSelfScheduleRequests(registry, pendingUserCount, meta) {
  var n = pendingUserCount || 0;
  return emitToAdmins(registry, {
    type: MESSAGE_TYPES.NEW_SELF_SCHEDULE_REQUESTS,
    body: n + ' user' + (n === 1 ? ' has' : 's have') + ' pending self schedule requests.',
    meta: meta || {}
  });
}

function emitRoleUpdate(registry, userId, body, meta) {
  return emitToUser(registry, userId, {
    type: MESSAGE_TYPES.ROLE_UPDATE,
    body: body,
    meta: meta || {}
  });
}

function emitSpecialtyRequestToAdmins(registry, requesterName, specialties, meta) {
  return emitToAdmins(registry, {
    type: MESSAGE_TYPES.USER_ROLE_UPDATE_REQUEST,
    body: String(requesterName || 'A user') +
      ' has requested the following specialty tags be applied to their account: ' +
      (specialties || []).join(', ') + '.',
    meta: meta || {}
  });
}

function emitSubNeeded(registry, body, meta) {
  var adjunct = emitToRole(registry, 'adjunct_faculty', {
    type: MESSAGE_TYPES.SUB_NEEDED,
    body: body,
    meta: meta || {}
  });
  var lead = emitToRole(registry, 'lead_course_faculty', {
    type: MESSAGE_TYPES.SUB_NEEDED,
    body: body,
    meta: meta || {}
  });
  return adjunct.concat(lead);
}

function emitSubstituteRequestToAdmins(registry, body, meta) {
  return emitToAdmins(registry, {
    type: MESSAGE_TYPES.SUBSTITUTE_REQUEST,
    body: body,
    meta: meta || {}
  });
}

function emitSubstituteClaimToAdmins(registry, body, meta) {
  return emitToAdmins(registry, {
    type: MESSAGE_TYPES.SUBSTITUTE_CLAIM,
    body: body,
    meta: meta || {}
  });
}

function emitSubRequestUpdate(registry, userId, body, meta) {
  return emitToUser(registry, userId, {
    type: MESSAGE_TYPES.SUB_REQUEST_UPDATE,
    body: body,
    meta: meta || {}
  });
}

export {
  emitToUser,
  emitToRole,
  emitToRoles,
  emitToAdmins,
  emitSelfScheduleUpdate,
  emitSelfSchedulingOpen,
  emitNewSelfScheduleRequests,
  emitRoleUpdate,
  emitSpecialtyRequestToAdmins,
  emitSubNeeded,
  emitSubstituteRequestToAdmins,
  emitSubstituteClaimToAdmins,
  emitSubRequestUpdate,
  MESSAGE_TYPES
};
