/**
 * Faculty slot inventory across every semester in a program file.
 */

import { listAllSlots, findSlotById } from './slot-inventory.js';

function prefixSlot(slot, semester) {
  var copy = Object.assign({}, slot);
  copy.semesterId = semester.id;
  copy.slotId = semester.id + '::' + slot.slotId;
  if (Array.isArray(slot.theoryRefs)) {
    copy.theoryRefs = slot.theoryRefs.map(function (ref) {
      return Object.assign({}, ref, { semesterId: semester.id });
    });
  }
  return copy;
}

function listProgramSlots(fileRoot) {
  var out = [];
  ((fileRoot && fileRoot.semesters) || []).forEach(function (sem) {
    if (!sem) return;
    listAllSlots(sem).forEach(function (slot) {
      out.push(prefixSlot(slot, sem));
    });
  });
  return out;
}

function listProgramOpenSlots(fileRoot) {
  return listProgramSlots(fileRoot).filter(function (s) {
    return s.open && s.openCount > 0;
  });
}

function findProgramSlotById(fileRoot, slotId) {
  var id = String(slotId || '');
  return listProgramSlots(fileRoot).find(function (s) { return s.slotId === id; }) || null;
}

function semesterForSlotId(fileRoot, slotId) {
  var slot = findProgramSlotById(fileRoot, slotId);
  if (slot && slot.semesterId) {
    return ((fileRoot && fileRoot.semesters) || []).find(function (s) {
      return s.id === slot.semesterId;
    }) || null;
  }
  var id = String(slotId || '');
  var cut = id.indexOf('::');
  if (cut > 0) {
    var semId = id.slice(0, cut);
    return ((fileRoot && fileRoot.semesters) || []).find(function (s) {
      return s.id === semId;
    }) || null;
  }
  return null;
}

function listProgramMyAssignedSlots(fileRoot, session) {
  if (!session) return [];
  return listProgramSlots(fileRoot).filter(function (s) {
    if (s.open) return false;
    if (s.assignedUserId && session.userId && s.assignedUserId === session.userId) return true;
    return String(s.assignedName || '').toLowerCase() === String(session.name || '').toLowerCase();
  });
}

function listAllSubstitutes(fileRoot) {
  var out = [];
  ((fileRoot && fileRoot.semesters) || []).forEach(function (sem) {
    var rows = (sem.facultySchedule && sem.facultySchedule.substitutes) || [];
    rows.forEach(function (row) { out.push(row); });
  });
  return out;
}

function programSelfSchedulingOpen(fileRoot) {
  var list = (fileRoot && fileRoot.semesters) || [];
  if (!list.length) return false;
  return list.every(function (sem) {
    return !!(sem.meta && sem.meta.selfSchedulingOpen);
  });
}

export {
  listProgramSlots,
  listProgramOpenSlots,
  findProgramSlotById,
  findSlotById,
  semesterForSlotId,
  listProgramMyAssignedSlots,
  listAllSubstitutes,
  programSelfSchedulingOpen
};
