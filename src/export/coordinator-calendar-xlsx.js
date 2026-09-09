/**
 * Coordinator ADN calendar Excel export (ExcelJS).
 * Visual contract: blank sheet "REGN 15 15P" + EXAMPLE stacked day lines.
 * Column I: weekly totals. Footer: target vs scheduled contact hours.
 */

import * as DataModel from '../core/data-model/index.js';
import * as CalendarEngine from '../core/calendar-engine.js';
import {
  weekSummaryForLabel,
  contactHourValidations,
  practicumCourseCode
} from '../core/theory-coordinator.js';
import { parseDate } from '../core/calendar-dates.js';
import { dateForWeekdayInWeekRange } from '../core/calendar-weeks.js';
import { showAlert } from '../ui/dialogs.js';
import {
  WEEKDAYS,
  buildDayLines,
  coordinatorSheetName,
  semesterBandLabel
} from './coordinator-day-lines.js';

var FONT_NAME = 'Aptos Narrow';
var FILL_BAND = 'FF00B050';
var FILL_CONTENT = 'FFD6EAF8';
var FILL_HOLIDAY = 'FFFFF2CC';
var FILL_TOTALS = 'FFF3F4F6';
var COL_WEEK = 1;
var COL_SUN = 2;
var COL_TOTALS = 9;
var MIN_CONTENT_ROWS = 8;

function loadExcelJS() {
  return import('exceljs').then(function (mod) {
    return mod && mod.default ? mod.default : mod;
  });
}

function thinMediumBorder() {
  var edge = { style: 'medium', color: { argb: 'FF000000' } };
  return { top: edge, left: edge, bottom: edge, right: edge };
}

function dayOuterBorder(isTop, isBottom) {
  var edge = { style: 'medium', color: { argb: 'FF000000' } };
  return {
    left: edge,
    right: edge,
    top: isTop ? edge : undefined,
    bottom: isBottom ? edge : undefined
  };
}

function fillSolid(argb) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: argb } };
}

function applyFont(cell, opts) {
  opts = opts || {};
  cell.font = {
    name: FONT_NAME,
    size: opts.size || 11,
    bold: !!opts.bold,
    color: { argb: opts.color || 'FF000000' }
  };
}

function formatHour(n) {
  var rounded = Math.round((n || 0) * 100) / 100;
  if (Math.abs(rounded - Math.round(rounded)) < 0.001) return String(Math.round(rounded));
  return String(rounded);
}

function weekDates(semester, weekLabel) {
  if (!semester.calendar || !semester.calendar.weeks || !semester.calendar.weeks.length) {
    CalendarEngine.rebuildWeeks(semester);
  }
  var week = semester.calendar.weeks[weekLabel - 1];
  var out = {};
  WEEKDAYS.forEach(function (wd) {
    out[wd] = week ? dateForWeekdayInWeekRange(week, wd) : null;
  });
  return out;
}

function isoToExcelDate(iso) {
  var d = parseDate(iso);
  if (!d) return null;
  return d;
}

function isHolidayLine(text) {
  var t = String(text || '').trim().toUpperCase();
  return t === 'HOLIDAY' || t.indexOf('HOLIDAY') === 0 || t === 'LABOR DAY' ||
    t.indexOf('DAY OFF') >= 0;
}

function styleContentCell(cell, text, isTop, isBottom) {
  cell.value = text == null ? '' : text;
  cell.fill = fillSolid(isHolidayLine(text) ? FILL_HOLIDAY : FILL_CONTENT);
  cell.border = dayOuterBorder(isTop, isBottom);
  applyFont(cell, { size: 11, bold: isHolidayLine(text) });
  cell.alignment = { vertical: 'top', wrapText: true };
}

function styleEmptyContentCell(cell, isTop, isBottom) {
  cell.value = '';
  cell.fill = fillSolid(FILL_CONTENT);
  cell.border = dayOuterBorder(isTop, isBottom);
  applyFont(cell, { size: 11 });
}

function writeHeaderRow(ws) {
  var headers = ['', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Weekly totals'];
  headers.forEach(function (h, i) {
    var cell = ws.getCell(1, i + 1);
    cell.value = h || null;
    if (h) {
      applyFont(cell, { size: 18, bold: true });
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
  });
  ws.getRow(1).height = 24.75;
}

function writeWeekBlock(ws, startRow, opts) {
  var weekLabel = opts.weekLabel;
  var dates = opts.dates;
  var dayLines = opts.dayLines;
  var summary = opts.summary;
  var bandLabel = opts.bandLabel;

  var maxLines = MIN_CONTENT_ROWS;
  WEEKDAYS.forEach(function (wd) {
    var n = (dayLines[wd] || []).length;
    if (n > maxLines) maxLines = n;
  });

  var headerRow = startRow;
  var contentStart = startRow + 1;
  var contentEnd = contentStart + maxLines - 1;

  var weekCell = ws.getCell(headerRow, COL_WEEK);
  weekCell.value = 'Week ' + weekLabel;
  applyFont(weekCell, { size: 16, bold: true });
  weekCell.border = thinMediumBorder();

  WEEKDAYS.forEach(function (wd, i) {
    var cell = ws.getCell(headerRow, COL_SUN + i);
    var iso = dates[wd];
    var d = isoToExcelDate(iso);
    cell.value = d || '';
    if (d) cell.numFmt = 'm/d/yyyy';
    applyFont(cell, { size: 14, bold: true });
    cell.border = thinMediumBorder();
    cell.alignment = { horizontal: 'center' };
  });

  var totalsHeader = ws.getCell(headerRow, COL_TOTALS);
  totalsHeader.value = 'Totals';
  applyFont(totalsHeader, { size: 11, bold: true });
  totalsHeader.fill = fillSolid(FILL_TOTALS);
  totalsHeader.border = thinMediumBorder();

  var bandCell = ws.getCell(contentStart, COL_WEEK);
  bandCell.value = bandLabel || '';
  bandCell.fill = fillSolid(FILL_BAND);
  applyFont(bandCell, { size: 11, bold: true });
  bandCell.border = thinMediumBorder();
  if (contentEnd > contentStart) {
    ws.mergeCells(contentStart, COL_WEEK, contentEnd, COL_WEEK);
  }

  for (var r = contentStart; r <= contentEnd; r++) {
    var lineIdx = r - contentStart;
    var isTop = r === contentStart;
    var isBottom = r === contentEnd;
    WEEKDAYS.forEach(function (wd, i) {
      var cell = ws.getCell(r, COL_SUN + i);
      var list = dayLines[wd] || [];
      var text = list[lineIdx];
      if (text != null && text !== '') styleContentCell(cell, text, isTop, isBottom);
      else styleEmptyContentCell(cell, isTop, isBottom);
    });
  }

  var totalsLines = [
    'Lecture: ' + formatHour(summary.lecture),
    'Skills: ' + formatHour(summary.skills_lab),
    'Clinical: ' + formatHour(summary.clinical),
    'Sim: ' + formatHour(summary.simulation)
  ];
  for (var tr = contentStart; tr <= contentEnd; tr++) {
    var tCell = ws.getCell(tr, COL_TOTALS);
    var tIdx = tr - contentStart;
    tCell.value = totalsLines[tIdx] || '';
    tCell.fill = fillSolid(FILL_TOTALS);
    tCell.border = dayOuterBorder(tr === contentStart, tr === contentEnd);
    applyFont(tCell, { size: 10, bold: tIdx === 0 });
    tCell.alignment = { vertical: 'top', wrapText: true };
  }

  return contentEnd + 1;
}

function writeTargetFooter(ws, startRow, validations) {
  var row = startRow + 1;
  var title = ws.getCell(row, COL_WEEK);
  title.value = 'Target vs scheduled';
  applyFont(title, { size: 14, bold: true });
  row += 1;

  var header = ['Course', 'Scheduled (h)', 'Target (h)', 'Status'];
  header.forEach(function (h, i) {
    var cell = ws.getCell(row, COL_WEEK + i);
    cell.value = h;
    applyFont(cell, { size: 11, bold: true });
    cell.fill = fillSolid(FILL_TOTALS);
    cell.border = thinMediumBorder();
  });
  row += 1;

  (validations || []).forEach(function (v) {
    var vals = [
      v.courseCode || '',
      formatHour(v.scheduled),
      v.target == null ? '—' : formatHour(v.target),
      v.status || ''
    ];
    vals.forEach(function (val, i) {
      var cell = ws.getCell(row, COL_WEEK + i);
      cell.value = val;
      cell.border = thinMediumBorder();
      applyFont(cell, { size: 11 });
    });
    row += 1;
  });
  return row;
}

function setColumnWidths(ws) {
  ws.getColumn(1).width = 12.5;
  for (var c = 2; c <= 8; c++) ws.getColumn(c).width = 18;
  ws.getColumn(9).width = 16;
}

/**
 * @param {object} facultyOverlay slotId → name
 */
export function buildCoordinatorWorkbook(semester, facultyOverlay) {
  facultyOverlay = facultyOverlay || {};
  var theory = semester.theory;
  if (!theory) {
    return Promise.reject(new Error('No theory calendar on semester'));
  }
  if (!semester.calendar || !semester.calendar.weeks || !semester.calendar.weeks.length) {
    CalendarEngine.rebuildWeeks(semester);
  }

  var sheetName = coordinatorSheetName(theory);
  var bandLabel = semesterBandLabel(semester);
  var practicumCode = practicumCourseCode(theory);

  return loadExcelJS().then(function (ExcelJS) {
    var wb = new ExcelJS.Workbook();
    wb.creator = 'Clinical and Simulation Management';
    wb.created = new Date();
    var ws = wb.addWorksheet(sheetName, {
      views: [{ state: 'frozen', xSplit: 0, ySplit: 1, topLeftCell: 'A2' }]
    });
    setColumnWidths(ws);
    writeHeaderRow(ws);

    var nextRow = 2;
    for (var w = 1; w <= 18; w++) {
      var dates = weekDates(semester, w);
      var dayLines = {};
      WEEKDAYS.forEach(function (wd) {
        dayLines[wd] = buildDayLines(theory, semester, w, wd, facultyOverlay);
      });
      var summary = weekSummaryForLabel(theory, semester, w, practicumCode);
      nextRow = writeWeekBlock(ws, nextRow, {
        weekLabel: w,
        dates: dates,
        dayLines: dayLines,
        summary: summary,
        bandLabel: bandLabel
      });
      nextRow += 1;
    }

    writeTargetFooter(ws, nextRow, contactHourValidations(theory, semester));
    return wb;
  });
}

export function exportFilename(semester) {
  var parts = DataModel.parseSemesterDisplay(semester);
  var base;
  if (parts.season && parts.year) {
    base = (parts.season === 'fall' ? 'Fall' : 'Spring') + '-' + parts.year;
  } else {
    base = (parts.name || 'semester').replace(/[^\w\-]+/g, '-');
  }
  return base + '-coordinator-calendar.xlsx';
}

export function downloadCoordinatorCalendar(semester, facultyOverlay) {
  return buildCoordinatorWorkbook(semester, facultyOverlay).then(function (wb) {
    return wb.xlsx.writeBuffer().then(function (buf) {
      var blob = new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = exportFilename(semester);
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }).catch(function (err) {
    console.error(err);
    showAlert('Export failed', 'Could not build the coordinator Excel file. Please try again.');
  });
}
