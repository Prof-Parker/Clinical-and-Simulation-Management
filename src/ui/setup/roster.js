/** Student roster editor and drag-drop on setup. */

import { getData } from '../../core/state.js';
import { showAlert, showConfirm } from '../dialogs.js';
import * as DataModel from '../../core/data-model/index.js';
import * as RosterBalance from '../../core/roster-balance.js';
import * as ClinicalSites from '../../core/clinical-sites.js';
import { escAttr, escHtml } from './dom-utils.js';
import { guardSetupEdit, resolveSetupData, setupAfterChange, collectFromForm } from './index.js';
import { scopeFromElement, setSetupScope, setupEl } from './scope.js';

var dragStudentId = null;

function sectionSelectHtml(data, student) {
    var html = '<option value="">Unassigned</option>';
    var listed = {};
    (data.sections || []).forEach(function (sec) {
      listed[sec.name] = true;
      html += '<option value="' + escAttr(sec.name) + '"' + (student.section === sec.name ? ' selected' : '') + '>' + escAttr(sec.name) + '</option>';
    });
    if (student.section && !listed[student.section]) {
      html += '<option value="' + escAttr(student.section) + '" selected>' + escAttr(student.section) + ' (unlisted)</option>';
    }
    return html;
  }

function facilityName(data, facilityId) {
    var f = data.facilities.find(function (fac) { return fac.id === facilityId; });
    return f ? f.name : 'Unassigned';
  }

function getCohortFacilityIdForGroup(data, clinicalGroup) {
    if (ClinicalSites) {
      var primary = ClinicalSites.getPrimaryGroupFacility(data, clinicalGroup);
      if (primary) return primary;
    }
    var cohort = data.students.filter(function (s) { return s.clinicalGroup === clinicalGroup; });
    if (cohort.length) return getCohortFacilityId(cohort, data);
    return DataModel.getDefaultFacilityIdForClinicalGroup(clinicalGroup, data.facilities || []);
  }

function getCohortFacilityId(cohort, data) {
    if (!cohort.length) {
      var unique = DataModel.getUniqueFacilitiesForSelect(data);
      return unique.length ? unique[0].id : null;
    }
    var counts = {};
    cohort.forEach(function (s) {
      if (s.facilityId) {
        var canon = DataModel.getCanonicalFacilityId(data, s.facilityId);
        counts[canon] = (counts[canon] || 0) + 1;
      }
    });
    var best = DataModel.getCanonicalFacilityId(data, cohort[0].facilityId) ||
      (DataModel.getUniqueFacilitiesForSelect(data)[0] && DataModel.getUniqueFacilitiesForSelect(data)[0].id);
    var bestN = 0;
    Object.keys(counts).forEach(function (id) {
      if (counts[id] > bestN) {
        bestN = counts[id];
        best = id;
      }
    });
    return best;
  }

function applyGroupFacility(data, clinicalGroup, facilityId) {
    facilityId = DataModel.getCanonicalFacilityId(data, facilityId);
    data.students.forEach(function (s) {
      if (s.clinicalGroup === clinicalGroup) s.facilityId = facilityId;
    });
  }

function cohortFacilitySelectHtml(data, clinicalGroup, selectedId) {
    selectedId = DataModel.getCanonicalFacilityId(data, selectedId);
    return DataModel.getUniqueFacilitiesForSelect(data).map(function (f) {
      return '<option value="' + f.id + '"' + (selectedId === f.id ? ' selected' : '') + '>' + escAttr(f.name) + '</option>';
    }).join('');
  }

function predominantSection(cohort) {
    var counts = {};
    var best = '';
    var bestN = 0;
    cohort.forEach(function (s) {
      if (!s.section) return;
      counts[s.section] = (counts[s.section] || 0) + 1;
      if (counts[s.section] > bestN) {
        bestN = counts[s.section];
        best = s.section;
      }
    });
    return best;
  }

function cohortSectionSummaryText(cohort) {
    var counts = {};
    cohort.forEach(function (s) {
      if (!s.section) return;
      counts[s.section] = (counts[s.section] || 0) + 1;
    });
    var keys = Object.keys(counts);
    if (!keys.length) return '';
    if (keys.length === 1) return keys[0];
    return keys.map(function (k) { return k + ' (' + counts[k] + ')'; }).join(', ');
  }

function cohortSectionBulkSelectHtml(data, clinicalGroup, cohort) {
    var selected = predominantSection(cohort);
    var mixed = cohort.length > 0 && cohort.some(function (s) {
      return s.section && s.section !== selected;
    });
    var html = '<label class="setup-cohort-section-bulk">' +
      '<span class="setup-cohort-section-label">Section</span>' +
      '<select data-cohort-section-bulk="' + escAttr(clinicalGroup) + '" aria-label="Set section for all in ' + clinicalGroup + '">' +
      '<option value=""' + (mixed ? ' selected' : '') + '>' + (mixed ? 'Mixed sections' : 'Set all…') + '</option>';
    (data.sections || []).forEach(function (sec) {
      if (!sec.name) return;
      html += '<option value="' + escAttr(sec.name) + '"' +
        (!mixed && selected === sec.name ? ' selected' : '') + '>' + escAttr(sec.name) + '</option>';
    });
    html += '</select></label>';
    return html;
  }

function applyCohortSection(data, clinicalGroup, sectionName) {
    data.students.forEach(function (s) {
      if (s.clinicalGroup === clinicalGroup) s.section = sectionName;
    });
  }

function defaultSectionForNewStudent(data, clinicalGroup) {
    var cohort = data.students.filter(function (s) { return s.clinicalGroup === clinicalGroup; });
    var fromCohort = predominantSection(cohort);
    if (fromCohort) return fromCohort;
    var groups = DataModel.getClinicalGroups(data.config);
    var gi = groups.indexOf(clinicalGroup);
    if (gi >= 0 && data.sections && data.sections[gi] && data.sections[gi].name) {
      return data.sections[gi].name;
    }
    return (data.sections && data.sections[0] && data.sections[0].name) ? data.sections[0].name : '';
  }

function moveCohortSelectHtml(data, student) {
    var html = '<option value="">Move…</option>';
    DataModel.getClinicalGroups(data.config).forEach(function (g) {
      if (g === student.clinicalGroup) return;
      html += '<option value="' + g + '">' + g + '</option>';
    });
    return html;
  }

function studentRowHtml(data, student) {
    return '<div class="setup-student-row" data-student-id="' + student.id + '">' +
      '<button type="button" class="drag-handle" draggable="true" aria-label="Drag to move ' + escAttr(student.name || 'student') + ' to another cohort" title="Drag to another cohort">⠿</button>' +
      '<select class="move-cohort-select" data-student-id="' + student.id + '" aria-label="Move to clinical group" title="Move to clinical group">' +
      moveCohortSelectHtml(data, student) + '</select>' +
      '<input type="text" data-field="name" data-id="' + student.id + '" value="' + escAttr(student.name) + '" placeholder="Student name" aria-label="Student name">' +
      '<select data-field="section" data-id="' + student.id + '" aria-label="Section">' + sectionSelectHtml(data, student) + '</select>' +
      '<select data-field="simGroup" data-id="' + student.id + '" aria-label="Simulation group">' +
      DataModel.getSimGroups(data.config).map(function (sg) {
        return '<option value="' + sg + '"' + (student.simGroup === sg ? ' selected' : '') + '>' + sg + '</option>';
      }).join('') +
      '</select>' +
      '<span class="setup-facility-readonly" title="Set via Clinical groups in Facilities &amp; Clinical Groups">' + escAttr(facilityName(data, student.facilityId)) + '</span>' +
      '<button type="button" class="btn btn-icon-remove remove-student-btn" data-student-id="' + student.id + '" aria-label="Remove student" title="Remove student">&times;</button>' +
      '</div>';
  }

function createNewStudentForGroup(data, clinicalGroup) {
    var groups = DataModel.getClinicalGroups(data.config);
    var simGroups = DataModel.getSimGroups(data.config);
    var facId = getCohortFacilityIdForGroup(data, clinicalGroup);
    var section = defaultSectionForNewStudent(data, clinicalGroup);
    var student = DataModel.createStudent(
      DataModel.nextDefaultStudentName(data.students),
      clinicalGroup,
      RosterBalance.simGroupForClinicalCohort(data.students, clinicalGroup, groups, simGroups),
      facId,
      section
    );
    return student;
  }

function needsRebalance(data) {
    var groups = DataModel.getClinicalGroups(data.config);
    var maxStudents = data.config.maxStudents || 30;
    var maxPer = data.config.maxPerClinicalGroup || 6;
    if (data.students.length !== maxStudents) return true;
    var counts = {};
    groups.forEach(function (g) { counts[g] = 0; });
    var orphan = false;
    data.students.forEach(function (s) {
      if (counts[s.clinicalGroup] !== undefined) counts[s.clinicalGroup]++;
      else orphan = true;
    });
    if (orphan) return true;
    if (groups.some(function (g) { return (counts[g] || 0) > maxPer; })) return true;
    var vals = groups.map(function (g) { return counts[g] || 0; });
    if (!vals.length) return false;
    return Math.max.apply(null, vals) - Math.min.apply(null, vals) > 1;
  }

function rebalanceStudents(data, syncCount) {
    var groups = DataModel.getClinicalGroups(data.config);
    var maxStudents = data.config.maxStudents || 30;
    if (!groups.length) return;

    if (syncCount) {
      while (data.students.length < maxStudents) {
        var targetGroup = groups[data.students.length % groups.length];
        data.students.push(createNewStudentForGroup(data, targetGroup));
      }
      while (data.students.length > maxStudents) {
        var removeIdx = -1;
        for (var i = data.students.length - 1; i >= 0; i--) {
          if (!String(data.students[i].name || '').trim()) {
            removeIdx = i;
            break;
          }
        }
        data.students.splice(removeIdx >= 0 ? removeIdx : data.students.length - 1, 1);
      }
    }

    RosterBalance.rebalance(data.students, data.config);
  }

function updateRebalanceButton(data) {
    var btn = setupEl('rebalanceStudentsBtn');
    if (!btn) return;
    btn.classList.toggle('needs-attention', needsRebalance(data));
  }

function renderRoster(data) {
    var container = setupEl('setupRoster');
    container.innerHTML = '';

    var maxPer = data.config.maxPerClinicalGroup || 6;
    var columnHeadersHtml =
      '<div class="setup-roster-columns" aria-hidden="true">' +
      '<span></span><span>Move</span><span>Name</span><span>Section</span><span>Sim</span><span>Site</span><span></span>' +
      '</div>';

    DataModel.getClinicalGroups(data.config).forEach(function (g) {
      var cohort = data.students.filter(function (s) { return s.clinicalGroup === g; });
      var clinDay = DataModel.getClinicalDayForGroup(g, data.config);
      var sectionSummary = cohortSectionSummaryText(cohort);
      var groupDiv = document.createElement('div');
      groupDiv.className = 'setup-group';
      groupDiv.innerHTML =
        '<div class="setup-group-header">' +
        '<div class="setup-group-header-main">' +
        '<h4>' + g + ' Cohort</h4>' +
        '<span class="setup-group-day">' + clinDay + ' clinical</span>' +
        '<span class="setup-group-count">' + cohort.length + ' / ' + maxPer + ' students</span>' +
        (sectionSummary ? '<span class="setup-group-sections section-sub" title="Registrar sections in this cohort">' +
          escHtml(sectionSummary) + '</span>' : '') +
        '</div>' +
        '<div class="setup-group-header-actions">' +
        cohortSectionBulkSelectHtml(data, g, cohort) +
        '<button type="button" class="btn btn-sm add-student-btn" data-clinical-group="' + g + '">Add student</button>' +
        '</div></div>' +
        columnHeadersHtml;
      var inner = document.createElement('div');
      inner.className = 'setup-group-dropzone';
      inner.setAttribute('data-drop-group', g);
      cohort.forEach(function (s) {
        inner.innerHTML += studentRowHtml(data, s);
      });
      if (!cohort.length) {
        inner.innerHTML += '<p class="section-sub setup-drop-hint" style="margin:0.5rem;text-align:center">Drop students here or add one</p>';
      }
      groupDiv.appendChild(inner);
      container.appendChild(groupDiv);
    });

    updateRebalanceButton(data);
  }

function addStudent(data, clinicalGroup) {
    collectFromForm(data);
    var maxStudents = data.config.maxStudents || 30;
    var maxPer = data.config.maxPerClinicalGroup || 6;
    if (data.students.length >= maxStudents) {
      showAlert('Cannot add student', 'Maximum students (' + maxStudents + ') reached. Increase max in scheduling configuration or remove a student.');
      return;
    }
    var inGroup = data.students.filter(function (s) { return s.clinicalGroup === clinicalGroup; }).length;
    if (inGroup >= maxPer) {
      showAlert('Cannot add student', clinicalGroup + ' already has ' + maxPer + ' students (configured maximum per clinical group).');
      return;
    }
    data.students.push(createNewStudentForGroup(data, clinicalGroup));
    setupAfterChange(data);
  }

function removeStudent(data, studentId) {
    collectFromForm(data);
    data.students = data.students.filter(function (s) { return s.id !== studentId; });
    setupAfterChange(data);
  }

function moveStudentToGroup(data, studentId, clinicalGroup) {
    var student = data.students.find(function (s) { return s.id === studentId; });
    if (!student) return;
    var maxPer = data.config.maxPerClinicalGroup || 6;
    var inTarget = data.students.filter(function (s) {
      return s.clinicalGroup === clinicalGroup && s.id !== studentId;
    }).length;
    if (inTarget >= maxPer) {
      showAlert('Cannot move student', clinicalGroup + ' already has ' + maxPer + ' students.');
      return;
    }
    student.clinicalGroup = clinicalGroup;
    student.facilityId = getCohortFacilityIdForGroup(data, clinicalGroup);
    var groups = DataModel.getClinicalGroups(data.config);
    var simGroups = DataModel.getSimGroups(data.config);
    student.simGroup = RosterBalance.simGroupForClinicalCohort(
      data.students, clinicalGroup, groups, simGroups, studentId
    );
    setupAfterChange(data);
  }

function initRosterDragDrop() {
    document.querySelectorAll('#setupRoster, #pg-setupRoster').forEach(function (roster) {
      if (!roster || roster.dataset.dragInit) return;
      roster.dataset.dragInit = '1';
      initOneRoster(roster);
    });
  }

function initOneRoster(roster) {
    roster.addEventListener('dragstart', function (e) {
      var handle = e.target.closest('.drag-handle');
      if (!handle) {
        e.preventDefault();
        return;
      }
      var row = handle.closest('.setup-student-row');
      if (!row) return;
      dragStudentId = row.getAttribute('data-student-id');
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragStudentId);
    });

    roster.addEventListener('dragend', function (e) {
      var row = e.target.closest('.setup-student-row');
      if (row) row.classList.remove('dragging');
      roster.querySelectorAll('.setup-group-dropzone').forEach(function (z) {
        z.classList.remove('drag-over');
      });
      dragStudentId = null;
    });

    roster.addEventListener('dragover', function (e) {
      var zone = e.target.closest('.setup-group-dropzone');
      if (!zone) return;
      e.preventDefault();
      zone.classList.add('drag-over');
    });

    roster.addEventListener('dragleave', function (e) {
      var zone = e.target.closest('.setup-group-dropzone');
      if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove('drag-over');
    });

    roster.addEventListener('drop', function (e) {
      var zone = e.target.closest('.setup-group-dropzone');
      if (!zone) return;
      e.preventDefault();
      zone.classList.remove('drag-over');
      var id = dragStudentId || e.dataTransfer.getData('text/plain');
      if (!id) return;
      if (!guardSetupEdit()) return;
      setSetupScope(scopeFromElement(roster));
      var data = resolveSetupData();
      collectFromForm(data);
      moveStudentToGroup(data, id, zone.getAttribute('data-drop-group'));
    });

    roster.addEventListener('change', function (e) {
      setSetupScope(scopeFromElement(roster));
      if (e.target.hasAttribute('data-cohort-section-bulk')) {
        var sectionName = e.target.value;
        if (!sectionName) return;
        if (!guardSetupEdit()) return;
        var data = resolveSetupData();
        collectFromForm(data);
        applyCohortSection(data, e.target.getAttribute('data-cohort-section-bulk'), sectionName);
        setupAfterChange(data);
        return;
      }
      if (e.target.classList.contains('move-cohort-select')) {
        var target = e.target.value;
        if (!target) return;
        if (!guardSetupEdit()) return;
        var data = resolveSetupData();
        collectFromForm(data);
        moveStudentToGroup(data, e.target.getAttribute('data-student-id'), target);
      }
    });

    roster.addEventListener('click', function (e) {
      setSetupScope(scopeFromElement(roster));
      var addBtn = e.target.closest('.add-student-btn');
      if (addBtn) {
        if (!guardSetupEdit()) return;
        addStudent(resolveSetupData(), addBtn.getAttribute('data-clinical-group'));
        return;
      }
      var removeBtn = e.target.closest('.remove-student-btn');
      if (removeBtn) {
        if (!guardSetupEdit()) return;
        showConfirm('Remove student?', 'Remove this student from the roster?', function () {
          removeStudent(resolveSetupData(), removeBtn.getAttribute('data-student-id'));
        }, { confirmLabel: 'Remove' });
      }
    });
  }

export {
  renderRoster,
  initRosterDragDrop,
  needsRebalance,
  rebalanceStudents,
  getCohortFacilityIdForGroup,
  cohortFacilitySelectHtml,
  addStudent,
  removeStudent,
  moveStudentToGroup
};
