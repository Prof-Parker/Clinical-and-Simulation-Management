/** Master schedule filter controls and student filtering. */

import * as DataModel from '../../core/data-model/index.js';
import * as CalendarEngine from '../../core/calendar-engine.js';
import * as ClinicalSites from '../../core/clinical-sites.js';

function studentStatusKey(vr) {
    if (!vr.valid) return 'pending';
    if (vr.warnings && vr.warnings.length) return 'warning';
    return 'complete';
  }

function studentHasMakeupTier(student, tier) {
    return student.schedule.some(function (cell, weekIndex) {
      if (!cell) return false;
      if (cell.makeupClinical &&
          MakeupDisplay.getClinicalMakeupTier(cell, student, weekIndex) === tier) {
        return true;
      }
      if (cell.simMakeup &&
          MakeupDisplay.getSimMakeupTier(cell, student, weekIndex) === tier) {
        return true;
      }
      return false;
    });
  }

function studentHasGuestSim(student) {
    return student.schedule.some(function (cell) {
      return cell && cell.simGuestGroup;
    });
  }

function getScheduleFilteredStudents(data, validation) {
    var groupEl = document.getElementById('scheduleGroupFilter');
    var simEl = document.getElementById('scheduleSimGroupFilter');
    var facEl = document.getElementById('scheduleFacilityFilter');
    var sectionEl = document.getElementById('scheduleSectionFilter');
    var statusEl = document.getElementById('scheduleStatusFilter');
    var searchEl = document.getElementById('scheduleStudentSearch');
    var makeupCleanEl = document.getElementById('scheduleFilterMakeupClean');
    var makeupConflictEl = document.getElementById('scheduleFilterMakeupConflict');
    var guestSimEl = document.getElementById('scheduleFilterGuestSim');
    if (!groupEl || !simEl || !facEl) return data.students.slice();
    var groupVal = groupEl.value;
    var simVal = simEl.value;
    var facilityVal = facEl.value;
    var sectionVal = sectionEl ? sectionEl.value : 'all';
    var statusVal = statusEl ? statusEl.value : 'all';
    var searchVal = searchEl ? (searchEl.value || '').toLowerCase() : '';
    var wantMakeupClean = makeupCleanEl && makeupCleanEl.checked;
    var wantMakeupConflict = makeupConflictEl && makeupConflictEl.checked;
    var wantGuestSim = guestSimEl && guestSimEl.checked;
    var filterNonStd = wantMakeupClean || wantMakeupConflict || wantGuestSim;
    return data.students.filter(function (s) {
      if (groupVal !== 'all' && s.clinicalGroup !== groupVal) return false;
      if (simVal !== 'all' && s.simGroup !== simVal) return false;
      if (facilityVal !== 'all' && ClinicalSites &&
          !ClinicalSites.studentHasAnyWeekAtFacility(data, s, facilityVal)) return false;
      if (facilityVal !== 'all' && !ClinicalSites &&
          !DataModel.sameFacilitySite(data, s.facilityId, facilityVal)) return false;
      if (sectionVal !== 'all' && s.section !== sectionVal) return false;
      if (searchVal && s.name.toLowerCase().indexOf(searchVal) < 0) return false;
      if (statusVal !== 'all' && validation) {
        var vr = validation.students[s.id];
        if (!vr || studentStatusKey(vr) !== statusVal) return false;
      }
      if (filterNonStd) {
        var matches = false;
        if (wantMakeupClean && studentHasMakeupTier(s, 'clean')) matches = true;
        if (wantMakeupConflict && studentHasMakeupTier(s, 'conflict')) matches = true;
        if (wantGuestSim && studentHasGuestSim(s)) matches = true;
        if (!matches) return false;
      }
      return true;
    });
  }

function populateFilters(data) {
    var cfg = data.config;
    var weekFilter = document.getElementById('weekFilter');
    var weekVal = weekFilter.value;
    weekFilter.innerHTML = '';
    for (var i = 0; i < 18; i++) {
      var opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = CalendarEngine.getWeekDisplay(data, i, true);
      weekFilter.appendChild(opt);
    }
    if (weekVal !== '' && weekFilter.querySelector('option[value="' + weekVal + '"]')) {
      weekFilter.value = weekVal;
    }

    var gf = document.getElementById('scheduleGroupFilter');
    var groupVal = gf ? gf.value : 'all';
    if (gf) {
      gf.innerHTML = '<option value="all">All Clinical Groups</option>';
      DataModel.getClinicalGroups(cfg).forEach(function (g) {
        var day = DataModel.getClinicalDayForGroup(g, cfg);
        gf.innerHTML += '<option value="' + g + '">' + g + ' (' + day + ')</option>';
      });
      if (groupVal && gf.querySelector('option[value="' + groupVal + '"]')) gf.value = groupVal;
    }

    var sgf = document.getElementById('scheduleSimGroupFilter');
    var simVal = sgf ? sgf.value : 'all';
    if (sgf) {
      sgf.innerHTML = '<option value="all">All Sim Groups</option>';
      DataModel.getSimGroups(cfg).forEach(function (g) {
        sgf.innerHTML += '<option value="' + g + '">' + g + '</option>';
      });
      if (simVal && sgf.querySelector('option[value="' + simVal + '"]')) sgf.value = simVal;
    }

    var sf = document.getElementById('scheduleSectionFilter');
    var sectionVal = sf ? sf.value : 'all';
    if (sf) {
      sf.innerHTML = '<option value="all">All Sections</option>';
      var sectionNames = [];
      if (data.sections && data.sections.length) {
        data.sections.forEach(function (sec) {
          if (sec.name) sectionNames.push(sec.name);
        });
      } else {
        data.students.forEach(function (s) {
          if (s.section && sectionNames.indexOf(s.section) < 0) sectionNames.push(s.section);
        });
      }
      sectionNames.sort().forEach(function (sec) {
        sf.innerHTML += '<option value="' + escapeHtml(sec) + '">' + escapeHtml(sec) + '</option>';
      });
      if (sectionVal && sf.querySelector('option[value="' + sectionVal + '"]')) sf.value = sectionVal;
    }

    var sff = document.getElementById('scheduleFacilityFilter');
    if (sff) {
      var facVal = sff.value;
      sff.innerHTML = '<option value="all">All Facilities</option>';
      (DataModel.getUniqueFacilitiesForSelect(data) || []).forEach(function (f) {
        sff.innerHTML += '<option value="' + f.id + '">' + escapeHtml(f.name) + '</option>';
      });
      if (facVal && sff.querySelector('option[value="' + facVal + '"]')) sff.value = facVal;
    }
  }

function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

export {
  getScheduleFilteredStudents,
  populateFilters,
  escapeHtml,
  studentStatusKey
};
