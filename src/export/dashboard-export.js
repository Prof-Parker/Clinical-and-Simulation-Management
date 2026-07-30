/**
 * Dashboard Excel export.
 */

import * as XLSX from 'xlsx';
import * as CalendarEngine from '../core/calendar-engine.js';
import * as ClinicalSites from '../core/clinical-sites.js';
import * as DataModel from '../core/data-model/index.js';
import * as MakeupDisplay from '../core/makeup-display.js';
import * as Orientation from '../core/orientation.js';
import * as ScheduleHolidayLabel from '../core/schedule-holiday-label.js';
import * as Validator from '../core/validator.js';
import { showAlert } from '../ui/dialogs.js';

var DISCLAIMER = 'For reference only, refer to app for most current schedule.';

  function cellToExportText(cell, student, data, weekIndex) {
    if (!cell) return '-';
    if (cell.inactive || ScheduleHolidayLabel.isBreakWeek(data, weekIndex)) return 'Break';

    var cfg = data.config;
    var cDay = DataModel.getClinicalDayForGroup(student.clinicalGroup, cfg);
    var clinMeta = MakeupDisplay.findMakeupRecord(student, weekIndex, 'clinical');
    var hasScheduledClin = cell.clinical || cell.clinicalMissed;
    var hasMakeupClin = cell.makeupClinical;
    var hasSim = cell.sim;
    var isOrientWeek = Orientation && Orientation.isOrientationWeek(data, student, weekIndex);
    var orientLabel = isOrientWeek ? Orientation.orientationLabelForExport(data, student, weekIndex) : '';
    var holidayLabel = ScheduleHolidayLabel.formatHolidayIndicator(
      ScheduleHolidayLabel.holidayIndicatorDays(data, student, weekIndex)
    );

    if (hasMakeupClin && !hasScheduledClin && !hasSim && !isOrientWeek) {
      var joinDay = clinMeta && clinMeta.joinedDay ? ' (' + clinMeta.joinedDay.toUpperCase() + ')' : '';
      var clinStar = clinMeta && clinMeta.overload ? '*' : '';
      return 'Make-Up CLIN' + joinDay + clinStar;
    }

    if (!hasScheduledClin && !hasSim && !hasMakeupClin) {
      var emptyParts = [];
      if (orientLabel) emptyParts.push(orientLabel);
      if (holidayLabel) emptyParts.push(holidayLabel);
      return emptyParts.length ? emptyParts.join(' ') : '-';
    }

    var parts = [];
    if (holidayLabel) parts.push(holidayLabel);
    if (orientLabel) parts.push(orientLabel);
    if (hasScheduledClin) {
      var siteSuffix = ClinicalSites
        ? ClinicalSites.facilityInitialsForCell(data, student, weekIndex)
        : '';
      var siteText = siteSuffix ? ' ' + siteSuffix : '';
      parts.push(cell.clinicalMissed
        ? 'CLIN* (' + cDay.toUpperCase() + ')' + siteText
        : 'CLIN (' + cDay.toUpperCase() + ')' + siteText);
    }
    if (hasMakeupClin && (hasScheduledClin || hasSim)) {
      var star = clinMeta && clinMeta.overload ? '*' : '';
      var day = clinMeta && clinMeta.joinedDay ? clinMeta.joinedDay.toUpperCase() : cDay.toUpperCase();
      parts.push('MAKEUP (' + day + ')' + star);
    }
    if (hasSim) {
      var simStar = cell.simMakeup && cell.simOverload ? '*' : '';
      var guestNote = cell.simGuestGroup ? ' (' + cell.simGuestGroup + '*)' : '';
      parts.push('SIM ' + cell.sim + guestNote + ' (' + (cell.simDay || 'Mon').toUpperCase() + ')' + simStar);
    }
    return parts.join('\n');
  }

  function daySimCount(students, weekIndex, day) {
    var n = 0;
    students.forEach(function (s) {
      var c = s.schedule[weekIndex];
      if (c && c.sim && c.simDay === day) n++;
    });
    return n;
  }

  function buildMetadataRow(data, filterSummary) {
    var parts = DataModel.parseSemesterDisplay(data);
    var label;
    if (parts.season) {
      label = (parts.season === 'fall' ? 'Fall' : 'Spring') + ' ' + parts.year;
    } else {
      label = parts.name || 'Semester';
    }
    var line = label + ' · Exported ' + new Date().toLocaleString();
    if (filterSummary) line += ' · ' + filterSummary;
    return line;
  }

  function buildFilterSummaryFromDom() {
    if (typeof document === 'undefined') return '';
    var bits = [];
    function selText(id, allLabel) {
      var el = document.getElementById(id);
      if (!el || el.value === 'all') return null;
      var opt = el.options[el.selectedIndex];
      return opt ? opt.textContent : el.value;
    }
    var g = selText('scheduleGroupFilter', 'All Clinical Groups');
    if (g) bits.push('Clinical: ' + g);
    var sg = selText('scheduleSimGroupFilter', 'All Sim Groups');
    if (sg) bits.push('Sim group: ' + sg);
    var f = selText('scheduleFacilityFilter', 'All Facilities');
    if (f) bits.push('Facility: ' + f);
    var sec = selText('scheduleSectionFilter', 'All Sections');
    if (sec) bits.push('Section: ' + sec);
    var st = selText('scheduleStatusFilter', 'All Statuses');
    if (st) bits.push('Status: ' + st);
    var searchEl = document.getElementById('scheduleStudentSearch');
    if (searchEl && searchEl.value.trim()) bits.push('Search: "' + searchEl.value.trim() + '"');
    if (document.getElementById('scheduleFilterMakeupClean') &&
        document.getElementById('scheduleFilterMakeupClean').checked) {
      bits.push('Makeup (no conflict)');
    }
    if (document.getElementById('scheduleFilterMakeupConflict') &&
        document.getElementById('scheduleFilterMakeupConflict').checked) {
      bits.push('Makeup (conflict)');
    }
    if (document.getElementById('scheduleFilterGuestSim') &&
        document.getElementById('scheduleFilterGuestSim').checked) {
      bits.push('Guest sim');
    }
    if (!bits.length) return 'Filters: none (all students)';
    return 'Filters: ' + bits.join(' · ');
  }

  function applyTopRowMerge(ws, colCount) {
    if (!ws['!merges']) ws['!merges'] = [];
    ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(0, colCount - 1) } });
  }

  function buildMasterScheduleSheet(data, students, validation, filterSummary) {
    var rows = [];
    rows.push([DISCLAIMER]);
    rows.push([buildMetadataRow(data, filterSummary)]);
    rows.push([]);

    var header = ['Name', 'Grp'];
    for (var i = 0; i < 18; i++) {
      header.push(CalendarEngine.getWeekDisplay(data, i, true));
    }
    header.push('Clinicals', 'Sims', 'Status');
    rows.push(header);

    students.forEach(function (student) {
      var vr = validation.students[student.id];
      var badge = Validator.statusBadge(vr);
      var row = [student.name, student.clinicalGroup];
      student.schedule.forEach(function (cell, wi) {
        row.push(cellToExportText(cell, student, data, wi));
      });
      row.push(String(vr.stats.clinicals), String(vr.stats.sims), badge.text);
      rows.push(row);
    });

    var simDays = DataModel.getSimDays(data.config);
    simDays.forEach(function (day) {
      var simRow = ['Sim (' + day + ')', ''];
      for (var w = 0; w < 18; w++) {
        simRow.push(String(daySimCount(students, w, day)));
      }
      simRow.push('', '', '');
      rows.push(simRow);
    });

    var clinRow = ['Students in clinical', ''];
    for (var cw = 0; cw < 18; cw++) {
      var clinCount = 0;
      students.forEach(function (s) {
        var c = s.schedule[cw];
        if (c && ((c.clinical && !c.clinicalMissed) || c.makeupClinical)) clinCount++;
      });
      clinRow.push(String(clinCount));
    }
    clinRow.push('', '', '');
    rows.push(clinRow);

    return rows;
  }

  function buildSimProgressionSheet(data, students, filterSummary) {
    var rows = [];
    rows.push([DISCLAIMER]);
    rows.push([buildMetadataRow(data, filterSummary)]);
    rows.push([]);
    rows.push(['Student', 'Clinical', 'Sim Group', 'Sim 1', 'Sim 2', 'Sim 3', 'Sim 4', 'Sim 5']);

    students.forEach(function (student) {
      var simCols = [];
      for (var n = 1; n <= 5; n++) {
        var content = '—';
        student.schedule.forEach(function (cell, wi) {
          if (cell.sim === n) {
            content = CalendarEngine.getWeekDisplay(data, wi, true) + ' (' + (cell.simDay || 'Mon') + ')';
            if (cell.simGuestGroup) content += ' · ' + cell.simGuestGroup;
          }
        });
        simCols.push(content);
      }
      rows.push([student.name, student.clinicalGroup, student.simGroup].concat(simCols));
    });

    return rows;
  }

  function buildWorkbook(data, students, validation, filterSummary) {
    var masterRows = buildMasterScheduleSheet(data, students, validation, filterSummary);
    var simRows = buildSimProgressionSheet(data, students, filterSummary);
    var wb = XLSX.utils.book_new();

    var wsMaster = XLSX.utils.aoa_to_sheet(masterRows);
    applyTopRowMerge(wsMaster, masterRows[3] ? masterRows[3].length : 1);
    XLSX.utils.book_append_sheet(wb, wsMaster, 'Master Schedule');

    var wsSim = XLSX.utils.aoa_to_sheet(simRows);
    applyTopRowMerge(wsSim, simRows[3] ? simRows[3].length : 1);
    XLSX.utils.book_append_sheet(wb, wsSim, 'Sim Progression');

    return wb;
  }

  function exportFilename(data) {
    var parts = DataModel.parseSemesterDisplay(data);
    var base;
    if (parts.season && parts.year) {
      base = (parts.season === 'fall' ? 'Fall' : 'Spring') + '-' + parts.year;
    } else {
      base = (parts.name || 'semester').replace(/[^\w\-]+/g, '-');
    }
    return base + '-schedule-export.xlsx';
  }

  function download(data, students, validation, filterSummary) {
    if (typeof XLSX === 'undefined') {
      showAlert('Export failed', 'Excel export library failed to load. Please refresh the page and try again.');
      return;
    }
    var summary = filterSummary != null ? filterSummary : buildFilterSummaryFromDom();
    var wb = buildWorkbook(data, students, validation, summary);
    var buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    var blob = new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = exportFilename(data);
    a.click();
    URL.revokeObjectURL(a.href);
  }

export {
  DISCLAIMER,
  cellToExportText,
  buildMasterScheduleSheet,
  buildSimProgressionSheet,
  buildFilterSummaryFromDom,
  buildWorkbook,
  exportFilename,
  download
};
