/**
 * Dashboard Excel export.
 *
 * ExcelJS is dynamically imported so it stays out of the main app chunk
 * (Workbox precache fails when any asset exceeds ~2 MiB by default).
 */

import * as CalendarEngine from '../core/calendar-engine.js';
import * as ClinicalSites from '../core/clinical-sites.js';
import * as DataModel from '../core/data-model/index.js';
import * as MakeupDisplay from '../core/makeup-display.js';
import * as Orientation from '../core/orientation.js';
import * as ScheduleHolidayLabel from '../core/schedule-holiday-label.js';
import * as Validator from '../core/validator.js';
import { showAlert } from '../ui/dialogs.js';
import { addPrototypeScheduleSheet } from './dashboard-export-prototype.js';

var DISCLAIMER = 'For reference only, refer to app for most current schedule.';

function loadExcelJS() {
  return import('exceljs').then(function (mod) {
    return mod && mod.default ? mod.default : mod;
  });
}

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
    if (document.getElementById('scheduleFilterMakeupWeek') &&
        document.getElementById('scheduleFilterMakeupWeek').checked) {
      bits.push('Makeup week clinical');
    }
    if (!bits.length) return 'Filters: none (all students)';
    return 'Filters: ' + bits.join(' · ');
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

  function appendAoaSheet(workbook, name, rows, mergeCols) {
    var ws = workbook.addWorksheet(name);
    (rows || []).forEach(function (row, ri) {
      (row || []).forEach(function (val, ci) {
        var cell = ws.getCell(ri + 1, ci + 1);
        cell.value = val == null || val === '' ? null : val;
        if (typeof val === 'string' && val.indexOf('\n') >= 0) {
          cell.alignment = { wrapText: true, vertical: 'top' };
        }
      });
    });
    if (mergeCols && mergeCols > 1) {
      ws.mergeCells(1, 1, 1, mergeCols);
    }
    return ws;
  }

  function buildWorkbook(data, students, validation, filterSummary) {
    var summary = filterSummary != null ? filterSummary : '';
    var masterRows = buildMasterScheduleSheet(data, students, validation, summary);
    var simRows = buildSimProgressionSheet(data, students, summary);
    return loadExcelJS().then(function (ExcelJS) {
      var wb = new ExcelJS.Workbook();
      wb.creator = 'Clinical and Simulation Management';
      wb.created = new Date();

      addPrototypeScheduleSheet(wb, data, students, {
        disclaimer: DISCLAIMER,
        metaLine: buildMetadataRow(data, summary)
      });

      appendAoaSheet(
        wb,
        'Master Schedule',
        masterRows,
        masterRows[3] ? masterRows[3].length : 1
      );
      appendAoaSheet(
        wb,
        'Sim Progression',
        simRows,
        simRows[3] ? simRows[3].length : 1
      );

      return wb;
    });
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
    var summary = filterSummary != null ? filterSummary : buildFilterSummaryFromDom();
    return buildWorkbook(data, students, validation, summary).then(function (wb) {
      return wb.xlsx.writeBuffer().then(function (buf) {
        var blob = new Blob([buf], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = exportFilename(data);
        a.click();
        URL.revokeObjectURL(a.href);
      });
    }).catch(function (err) {
      console.error(err);
      showAlert('Export failed', 'Could not build the Excel file. Please try again.');
    });
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
