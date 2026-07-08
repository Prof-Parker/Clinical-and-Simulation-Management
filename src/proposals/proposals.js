/**
 * Setup change proposals workflow.
 */

import * as CalendarEngine from '../core/calendar-engine.js';
import * as ClinicalSites from '../core/clinical-sites.js';
import * as DataModel from '../core/data-model/index.js';
import * as ProposalFormat from './proposal-format.js';
import { getData } from '../core/state.js';

var SETUP_STUDENT_FIELDS = ['name', 'clinicalGroup', 'simGroup', 'section', 'facilityId'];
  function uid() {
    return 'prop_' + Math.random().toString(36).slice(2, 10);
  }
  function ensureArray(semester) {
    if (!semester.proposals) semester.proposals = [];
    return semester.proposals;
  }
  function getByPath(semester, path, status) {
    return ensureArray(semester).filter(function (p) {
      if (p.path !== path) return false;
      if (status && p.status !== status) return false;
      return true;
    });
  }
  function getPendingForUser(semester, userId) {
    return ensureArray(semester).filter(function (p) {
      return p.status === 'pending' && p.proposedBy && p.proposedBy.userId === userId;
    });
  }
  function getPendingAll(semester) {
    return ensureArray(semester).filter(function (p) { return p.status === 'pending'; });
  }
  function isStale(proposal, semester) {
    if (!proposal || proposal.status !== 'pending') return false;
    semester = semester || (typeof getData === 'function' ? getData() : null);
    if (!semester) return false;
    var current = getValueAtPath(semester, proposal.path);
    return JSON.stringify(current) !== JSON.stringify(proposal.currentValue);
  }
  function getStudentField(semester, studentId, field) {
    var st = (semester.students || []).find(function (s) { return s.id === studentId; });
    return st ? st[field] : undefined;
  }
  function setStudentField(semester, studentId, field, value) {
    var st = (semester.students || []).find(function (s) { return s.id === studentId; });
    if (st) st[field] = JSON.parse(JSON.stringify(value));
  }
  function getArrayItemById(arr, id, idKey) {
    idKey = idKey || 'id';
    return (arr || []).find(function (item) { return item && item[idKey] === id; });
  }
  function setArrayItemById(arr, id, value, idKey) {
    idKey = idKey || 'id';
    if (!arr) return;
    var idx = arr.findIndex(function (item) { return item && item[idKey] === id; });
    if (value === undefined) {
      if (idx >= 0) arr.splice(idx, 1);
      return;
    }
    var copy = JSON.parse(JSON.stringify(value));
    if (idx >= 0) arr[idx] = copy;
    else arr.push(copy);
  }
  function getFacultyField(semester, facultyId, field) {
    var f = (semester.faculty || []).find(function (x) { return x.id === facultyId; });
    return f ? f[field] : undefined;
  }
  function setFacultyField(semester, facultyId, field, value) {
    var f = (semester.faculty || []).find(function (x) { return x.id === facultyId; });
    if (!f) return;
    if (value === undefined) {
      delete f[field];
    } else {
      f[field] = value;
    }
  }
  function getValueAtPath(obj, path) {
    if (path === 'students') return obj.students;
    if (path === 'sections') return obj.sections;
    if (path === 'facilities') return obj.facilities;
    if (path === 'faculty') return obj.faculty;
    if (path === 'holidays') return obj.holidays;
    if (path === 'orientations') return obj.orientations;
    var sm = path.match(/^students\.([^.]+)\.(\w+)$/);
    if (sm) return getStudentField(obj, sm[1], sm[2]);
    var sec = path.match(/^sections\.([^.]+)$/);
    if (sec) return getArrayItemById(obj.sections, sec[1]);
    var fac = path.match(/^facilities\.([^.]+)$/);
    if (fac) return getArrayItemById(obj.facilities, fac[1]);
    var facItem = path.match(/^faculty\.([^.]+)$/);
    if (facItem) return getArrayItemById(obj.faculty, facItem[1]);
    var facField = path.match(/^faculty\.([^.]+)\.(\w+)$/);
    if (facField) return getFacultyField(obj, facField[1], facField[2]);
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }
  function setValueAtPath(obj, path, value) {
    if (path === 'students') {
      obj.students = JSON.parse(JSON.stringify(value));
      return;
    }
    if (path === 'sections') {
      obj.sections = JSON.parse(JSON.stringify(value));
      return;
    }
    if (path === 'facilities') {
      obj.facilities = JSON.parse(JSON.stringify(value));
      return;
    }
    if (path === 'faculty') {
      obj.faculty = JSON.parse(JSON.stringify(value));
      return;
    }
    if (path === 'holidays') {
      obj.holidays = JSON.parse(JSON.stringify(value));
      return;
    }
    if (path === 'orientations') {
      obj.orientations = JSON.parse(JSON.stringify(value));
      return;
    }
    var sm = path.match(/^students\.([^.]+)\.(\w+)$/);
    if (sm) {
      setStudentField(obj, sm[1], sm[2], value);
      return;
    }
    var sec = path.match(/^sections\.([^.]+)$/);
    if (sec) {
      setArrayItemById(obj.sections, sec[1], value);
      return;
    }
    var fac = path.match(/^facilities\.([^.]+)$/);
    if (fac) {
      setArrayItemById(obj.facilities, fac[1], value);
      return;
    }
    var facItem = path.match(/^faculty\.([^.]+)$/);
    if (facItem) {
      setArrayItemById(obj.faculty, facItem[1], value);
      return;
    }
    var facField = path.match(/^faculty\.([^.]+)\.(\w+)$/);
    if (facField) {
      setFacultyField(obj, facField[1], facField[2], value);
      return;
    }
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (cur[parts[i]] == null) cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = JSON.parse(JSON.stringify(value));
  }
  function diffValue(path, a, d) {
    if (JSON.stringify(a) === JSON.stringify(d)) return [];
    return [{ path: path, currentValue: a, proposedValue: d }];
  }
  function diffObjectTree(activeObj, draftObj, prefix, opts) {
    opts = opts || {};
    var changes = [];
    var keys = new Set(Object.keys(activeObj || {}).concat(Object.keys(draftObj || {})));
    keys.forEach(function (key) {
      var path = prefix + '.' + key;
      var a = activeObj ? activeObj[key] : undefined;
      var d = draftObj ? draftObj[key] : undefined;
      if (Array.isArray(a) || Array.isArray(d)) return;
      if (typeof a === 'object' && a !== null && typeof d === 'object' && d !== null) {
        changes = changes.concat(diffObjectTree(a, d, path, opts));
      } else if (JSON.stringify(a) !== JSON.stringify(d)) {
        changes.push({ path: path, currentValue: a, proposedValue: d });
      }
    });
    return changes;
  }
  function diffConfig(activeConfig, draftConfig, prefix) {
    prefix = prefix || 'config';
    return diffObjectTree(activeConfig, draftConfig, prefix);
  }
  function cloneJson(val) {
    return JSON.parse(JSON.stringify(val));
  }
  function diffArrayById(activeArr, draftArr, prefix, idKey) {
    activeArr = activeArr || [];
    draftArr = draftArr || [];
    idKey = idKey || 'id';
    var changes = [];
    var aById = {};
    var dById = {};
    activeArr.forEach(function (item) { if (item && item[idKey]) aById[item[idKey]] = item; });
    draftArr.forEach(function (item) { if (item && item[idKey]) dById[item[idKey]] = item; });
    var ids = new Set(Object.keys(aById).concat(Object.keys(dById)));
    ids.forEach(function (id) {
      var a = aById[id];
      var d = dById[id];
      if (!a && d) {
        changes.push({ path: prefix + '.' + id, currentValue: undefined, proposedValue: cloneJson(d) });
      } else if (a && !d) {
        changes.push({ path: prefix + '.' + id, currentValue: cloneJson(a), proposedValue: undefined });
      } else if (a && d && JSON.stringify(a) !== JSON.stringify(d)) {
        changes.push({ path: prefix + '.' + id, currentValue: cloneJson(a), proposedValue: cloneJson(d) });
      }
    });
    return changes;
  }
  function studentSetupFields(student) {
    if (!student) return null;
    var out = { id: student.id };
    SETUP_STUDENT_FIELDS.forEach(function (f) {
      out[f] = student[f];
    });
    return out;
  }
  function diffStudents(active, draft) {
    var changes = [];
    var aStudents = active.students || [];
    var dStudents = draft.students || [];
    var aIds = {};
    var dIds = {};
    aStudents.forEach(function (s) { aIds[s.id] = s; });
    dStudents.forEach(function (s) { dIds[s.id] = s; });
    var membershipChanged = aStudents.length !== dStudents.length;
    if (!membershipChanged) {
      aStudents.forEach(function (s) { if (!dIds[s.id]) membershipChanged = true; });
      dStudents.forEach(function (s) { if (!aIds[s.id]) membershipChanged = true; });
    }
    if (membershipChanged) {
      changes.push({
        path: 'students',
        currentValue: cloneJson(aStudents),
        proposedValue: cloneJson(dStudents)
      });
      return changes;
    }
    dStudents.forEach(function (ds) {
      var as = aIds[ds.id];
      SETUP_STUDENT_FIELDS.forEach(function (field) {
        if (JSON.stringify(as[field]) !== JSON.stringify(ds[field])) {
          changes.push({
            path: 'students.' + ds.id + '.' + field,
            currentValue: as[field],
            proposedValue: ds[field]
          });
        }
      });
    });
    return changes;
  }
  function diffFaculty(active, draft) {
    var changes = [];
    var aFaculty = active.faculty || [];
    var dFaculty = draft.faculty || [];
    var hasIds = aFaculty.every(function (f) { return f && f.id; }) &&
      dFaculty.every(function (f) { return f && f.id; });
    if (!hasIds) {
      return diffValue('faculty', aFaculty, dFaculty);
    }
    var aById = {};
    var dById = {};
    aFaculty.forEach(function (f) { if (f.id) aById[f.id] = f; });
    dFaculty.forEach(function (f) { if (f.id) dById[f.id] = f; });
    var ids = new Set(Object.keys(aById).concat(Object.keys(dById)));
    ids.forEach(function (id) {
      var a = aById[id];
      var d = dById[id];
      if (!a && d) {
        changes.push({
          path: 'faculty.' + id,
          currentValue: undefined,
          proposedValue: cloneJson(d)
        });
      } else if (a && !d) {
        changes.push({
          path: 'faculty.' + id,
          currentValue: cloneJson(a),
          proposedValue: undefined
        });
      } else if (a && d) {
        if (a.name !== d.name) {
          changes.push({
            path: 'faculty.' + id + '.name',
            currentValue: a.name,
            proposedValue: d.name
          });
        }
        if (a.clinicalGroup !== d.clinicalGroup) {
          changes.push({
            path: 'faculty.' + id + '.clinicalGroup',
            currentValue: a.clinicalGroup,
            proposedValue: d.clinicalGroup
          });
        }
      }
    });
    return changes;
  }
  function diffSetupMeta(active, draft) {
    var changes = [];
    ['semesterSeason', 'semesterYear', 'semesterName'].forEach(function (key) {
      changes = changes.concat(diffValue('meta.' + key, active.meta && active.meta[key], draft.meta && draft.meta[key]));
    });
    changes = changes.concat(diffValue('meta.leadFaculty', active.meta && active.meta.leadFaculty, draft.meta && draft.meta.leadFaculty));
    return changes;
  }
  function diffSetup(active, draft) {
    var changes = [];
    changes = changes.concat(diffSetupMeta(active, draft));
    changes = changes.concat(diffValue('calendar.semesterStartDate',
      active.calendar && active.calendar.semesterStartDate,
      draft.calendar && draft.calendar.semesterStartDate));
    changes = changes.concat(diffValue('holidays', active.holidays, draft.holidays));
    changes = changes.concat(diffArrayById(active.sections, draft.sections, 'sections', 'id'));
    changes = changes.concat(diffFaculty(active, draft));
    changes = changes.concat(diffArrayById(active.facilities, draft.facilities, 'facilities', 'id'));
    changes = changes.concat(diffValue('orientations', active.orientations, draft.orientations));
    changes = changes.concat(diffConfig(active.config, draft.config, 'config'));
    changes = changes.concat(diffStudents(active, draft));
    return changes;
  }
  function upsertProposal(semester, change, proposer) {
    var list = ensureArray(semester);
    var existing = list.find(function (p) {
      return p.status === 'pending' && p.path === change.path &&
        p.proposedBy && p.proposedBy.userId === proposer.userId;
    });
    if (existing) {
      existing.proposedValue = change.proposedValue;
      existing.currentValue = change.currentValue;
      existing.proposedAt = new Date().toISOString();
      return existing;
    }
    var prop = {
      id: uid(),
      status: 'pending',
      path: change.path,
      currentValue: change.currentValue,
      proposedValue: change.proposedValue,
      proposedBy: {
        userId: proposer.userId,
        name: proposer.name,
        email: proposer.email || ''
      },
      proposedAt: new Date().toISOString(),
      reviewedBy: null,
      reviewedAt: null,
      supersedes: null
    };
    list.push(prop);
    return prop;
  }
  function submitConfigProposals(semester, draftConfig, proposer) {
    var changes = diffConfig(semester.config, draftConfig, 'config');
    changes.forEach(function (c) {
      upsertProposal(semester, c, proposer);
    });
    return changes.length;
  }
  function submitSetupProposals(semester, draftSnapshot, proposer) {
    var changes = diffSetup(semester, draftSnapshot);
    changes.forEach(function (c) {
      upsertProposal(semester, c, proposer);
    });
    return changes.length;
  }
  function afterApprove(semester, prop) {
    if (!semester || !prop) return;
    var path = prop.path || '';
    if (path.indexOf('config') === 0 && DataModel) {
      DataModel.syncSemesterForConfig(semester);
    }
    if (path.indexOf('calendar') === 0 || path === 'holidays' ||
        path.indexOf('meta.semester') === 0 || path === 'orientations' ||
        path.indexOf('orientations.') === 0) {
      if (CalendarEngine) CalendarEngine.rebuildWeeks(semester);
    }
    if (path.indexOf('facilities') === 0 || path === 'students' ||
        path.indexOf('students.') === 0) {
      if (DataModel) {
        DataModel.normalizeFacilities(semester);
        DataModel.syncSemesterForConfig(semester);
      }
    }
    if (ClinicalSites && path.indexOf('config') === 0) {
      ClinicalSites.applyPrimarySitesToStudents(semester);
    }
  }
  function approve(semester, proposalId, reviewer) {
    var prop = ensureArray(semester).find(function (p) { return p.id === proposalId; });
    if (!prop || prop.status !== 'pending') return false;
    if (isStale(prop, semester)) return false;
    setValueAtPath(semester, prop.path, prop.proposedValue);
    afterApprove(semester, prop);
    prop.status = 'approved';
    prop.reviewedBy = { userId: reviewer.userId, name: reviewer.name };
    prop.reviewedAt = new Date().toISOString();
    return true;
  }
  function deny(semester, proposalId, reviewer) {
    var prop = ensureArray(semester).find(function (p) { return p.id === proposalId; });
    if (!prop || prop.status !== 'pending') return false;
    prop.status = 'denied';
    prop.reviewedBy = { userId: reviewer.userId, name: reviewer.name };
    prop.reviewedAt = new Date().toISOString();
    return true;
  }
  function clearProposal(semester, proposalId, userId) {
    var list = ensureArray(semester);
    var idx = list.findIndex(function (p) { return p.id === proposalId; });
    if (idx < 0) return false;
    var prop = list[idx];
    if (prop.status === 'pending' && prop.proposedBy && prop.proposedBy.userId !== userId) {
      return false;
    }
    if (prop.status === 'denied' && prop.proposedBy && prop.proposedBy.userId !== userId) {
      return false;
    }
    list.splice(idx, 1);
    return true;
  }
  function mergeProposalLists(local, remote) {
    var byId = {};
    (remote || []).forEach(function (p) { byId[p.id] = p; });
    (local || []).forEach(function (p) {
      if (!byId[p.id] || p.proposedAt > (byId[p.id].proposedAt || '')) {
        byId[p.id] = p;
      }
    });
    return Object.keys(byId).map(function (id) { return byId[id]; });
  }
  function formatProposalLabel(path, semester) {
    if (ProposalFormat.formatLabel) {
      return ProposalFormat.formatLabel(path, semester);
    }
    if (!path) return '';
    return path;
  }
export {
  uid,
  ensureArray,
  getByPath,
  getPendingForUser,
  getPendingAll,
  isStale,
  getValueAtPath,
  setValueAtPath,
  diffValue,
  diffObjectTree,
  diffConfig,
  diffArrayById,
  diffStudents,
  diffSetup,
  upsertProposal,
  submitConfigProposals,
  submitSetupProposals,
  afterApprove,
  approve,
  deny,
  clearProposal,
  mergeProposalLists,
  formatProposalLabel
};
