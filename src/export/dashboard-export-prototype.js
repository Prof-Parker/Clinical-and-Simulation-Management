/**
 * Prototype-style master schedule sheet (ExcelJS).
 * Mirrors docs/Design Docs/protypes/2026 Spring schedule layout:
 * identity columns + per-week day columns + site/SIM cell labels + gray inactive fills.
 */

import * as CalendarEngine from '../core/calendar-engine.js';
import * as ClinicalSites from '../core/clinical-sites.js';
import * as DataModel from '../core/data-model/index.js';
import * as MakeupDisplay from '../core/makeup-display.js';
import * as Orientation from '../core/orientation.js';
import * as ScheduleHolidayLabel from '../core/schedule-holiday-label.js';

var TITLE = 'Simulation and Clinical Schedule';
var FILL_TITLE = 'D0D0D0';
var FILL_INACTIVE = 'AEAEAE';
var FILL_SEPARATOR = 'A6A6A6';
var ID_COLS = 5;
var WEEK_COUNT = 18;
/** 1-based clinical group palette (Group 1 … Group 7). */
var GROUP_COLORS = [
  '507A2D',
  '6B2A6C',
  '41759C',
  '002465',
  'AB5524',
  'A20000',
  '787800'
];

var DAY_LETTER = {
  Sun: 'U', Mon: 'M', Tue: 'T', Wed: 'W', Thu: 'R', Fri: 'F', Sat: 'S'
};

function groupFillRgb(groupIndex1) {
  if (groupIndex1 < 1 || groupIndex1 > GROUP_COLORS.length) return null;
  return GROUP_COLORS[groupIndex1 - 1];
}

function thinBorder() {
  var edge = { style: 'thin', color: { argb: 'FFB0B0B0' } };
  return { top: edge, left: edge, bottom: edge, right: edge };
}

function fillSolid(rgb) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + rgb } };
}

function applyCenterWrap(cell) {
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
}

function collectExportWeekdays(data, students) {
  var seen = {};
  var cfg = data.config;
  DataModel.getClinicalGroups(cfg).forEach(function (g) {
    seen[DataModel.getClinicalDayForGroup(g, cfg)] = true;
  });
  DataModel.getSimDays(cfg).forEach(function (d) {
    seen[d] = true;
  });
  (students || []).forEach(function (s) {
    (s.schedule || []).forEach(function (cell) {
      if (cell && cell.simDay) seen[cell.simDay] = true;
    });
    for (var wi = 0; wi < WEEK_COUNT; wi++) {
      var meta = MakeupDisplay.findMakeupRecord(s, wi, 'clinical');
      if (meta && meta.joinedDay) seen[meta.joinedDay] = true;
    }
  });
  return DataModel.WEEKDAY_OPTIONS.filter(function (d) {
    return !!seen[d];
  });
}

function siteLabel(data, student, weekIndex) {
  var facId = ClinicalSites.getStudentFacilityAtWeek(data, student, weekIndex);
  if (!facId) return '';
  var fac = DataModel.findFacilityById(data, facId);
  if (fac && fac.shortName) return String(fac.shortName).trim();
  return Orientation.facilityInitials(data, facId);
}

function orientationWeekday(data, student, weekIndex) {
  var orient = Orientation.getOrientationForWeek(data, student, weekIndex);
  if (!orient) return null;
  if (orient.date) {
    var d = CalendarEngine.parseDate(orient.date);
    if (d) return CalendarEngine.weekdayNameForDate(d);
  }
  return DataModel.getClinicalDayForGroup(student.clinicalGroup, data.config);
}

function dayCellSpec(data, student, weekIndex, weekday) {
  var cell = student.schedule && student.schedule[weekIndex];
  if (!cell || cell.inactive || ScheduleHolidayLabel.isBreakWeek(data, weekIndex)) {
    return { text: '', gray: true };
  }

  var parts = [];
  var orientDay = orientationWeekday(data, student, weekIndex);
  if (orientDay === weekday) {
    var label = Orientation.getOrientationLabel(data, student, weekIndex) || 'Orientation';
    parts.push(label.replace(/^Orient\s+/i, 'Orientation\n'));
  }

  var clinDay = DataModel.getClinicalDayForGroup(student.clinicalGroup, data.config);
  var clinMeta = MakeupDisplay.findMakeupRecord(student, weekIndex, 'clinical');
  var makeupDay = clinMeta && clinMeta.joinedDay ? clinMeta.joinedDay : clinDay;
  var hasScheduledClin = !!(cell.clinical || cell.clinicalMissed);
  var hasMakeup = !!cell.makeupClinical;

  if (hasScheduledClin && clinDay === weekday) {
    var site = siteLabel(data, student, weekIndex) || 'CLIN';
    if (cell.clinicalMissed) site += '*';
    parts.push(site);
  } else if (hasMakeup && makeupDay === weekday) {
    var makeupSite = siteLabel(data, student, weekIndex);
    parts.push(makeupSite ? 'MAKEUP ' + makeupSite : 'MAKEUP');
  }

  if (cell.sim && (cell.simDay || 'Mon') === weekday) {
    parts.push('SIM ' + cell.sim);
  }

  return { text: parts.join('\n'), gray: false };
}

function facultyForGroup(data, group) {
  var list = data.faculty || [];
  for (var i = 0; i < list.length; i++) {
    if (list[i] && list[i].clinicalGroup === group) return list[i];
  }
  return null;
}

function groupOrdinalLabel(groupIndex1) {
  return 'G' + groupIndex1;
}

function identityLines(data, group, groupIndex1, cohort) {
  var faculty = facultyForGroup(data, group);
  var facultyName = '';
  if (faculty) {
    facultyName = faculty.needed ? 'Needed' : String(faculty.name || '').trim();
  }
  var primaryId = ClinicalSites.getPrimaryGroupFacility(data, group);
  var place = '';
  if (primaryId) {
    var fac = DataModel.findFacilityById(data, primaryId);
    place = fac ? String(fac.shortName || fac.name || '').trim() : '';
  }
  var section = '';
  for (var i = 0; i < cohort.length; i++) {
    if (cohort[i].section) {
      section = String(cohort[i].section).trim();
      break;
    }
  }
  return {
    section: section,
    facultyName: facultyName,
    place: place,
    groupBanner: 'GROUP ' + groupIndex1
  };
}

function tallyTotals(data, student) {
  var hospitals = 0;
  var sims = 0;
  for (var wi = 0; wi < WEEK_COUNT; wi++) {
    var cell = student.schedule && student.schedule[wi];
    if (!cell || cell.inactive || ScheduleHolidayLabel.isBreakWeek(data, wi)) continue;
    if (cell.sim) sims++;
    if ((cell.clinical && !cell.clinicalMissed) || cell.makeupClinical) hospitals++;
  }
  return { hospitals: hospitals, sims: sims };
}

function sortStudentsByGroup(data, students) {
  var order = DataModel.getClinicalGroups(data.config);
  var rank = {};
  order.forEach(function (g, i) {
    rank[g] = i;
  });
  return students.slice().sort(function (a, b) {
    var ra = rank[a.clinicalGroup];
    var rb = rank[b.clinicalGroup];
    if (ra == null) ra = 999;
    if (rb == null) rb = 999;
    if (ra !== rb) return ra - rb;
    return DataModel.compareStudentsByName(a, b);
  });
}

/**
 * @returns {{ weekdays: string[], dayColCount: number, firstDayCol: number, totalsCol: number }}
 */
export function prototypeLayoutMeta(data, students) {
  var weekdays = collectExportWeekdays(data, students);
  if (!weekdays.length) weekdays = ['Mon', 'Tue'];
  var dayColCount = weekdays.length * WEEK_COUNT;
  return {
    weekdays: weekdays,
    dayColCount: dayColCount,
    firstDayCol: ID_COLS + 1,
    totalsCol: ID_COLS + dayColCount + 1
  };
}

export function addPrototypeScheduleSheet(workbook, data, students, opts) {
  opts = opts || {};
  var disclaimer = opts.disclaimer || '';
  var metaLine = opts.metaLine || '';
  var sheet = workbook.addWorksheet('Schedule', {
    views: [{ state: 'frozen', xSplit: ID_COLS, ySplit: 5 }]
  });

  var sorted = sortStudentsByGroup(data, students || []);
  var layout = prototypeLayoutMeta(data, sorted);
  var weekdays = layout.weekdays;
  var daysPerWeek = weekdays.length;
  var totalsCol = layout.totalsCol;
  var lastCol = totalsCol + 1;

  sheet.getColumn(1).width = 14;
  sheet.getColumn(2).width = 18;
  sheet.getColumn(3).width = 12;
  sheet.getColumn(4).width = 14;
  sheet.getColumn(5).width = 12;
  for (var c = layout.firstDayCol; c < totalsCol; c++) {
    sheet.getColumn(c).width = 11;
  }
  sheet.getColumn(totalsCol).width = 12;
  sheet.getColumn(totalsCol + 1).width = 8;

  // Row 1 — disclaimer / export meta (does not exist on paper prototype)
  if (disclaimer || metaLine) {
    sheet.mergeCells(1, 1, 1, lastCol);
    var note = [disclaimer, metaLine].filter(Boolean).join(' · ');
    sheet.getCell(1, 1).value = note;
    sheet.getCell(1, 1).font = { italic: true, size: 9, color: { argb: 'FF666666' } };
  }

  // Row 2 — title
  sheet.mergeCells(2, 1, 2, ID_COLS);
  var titleCell = sheet.getCell(2, 1);
  titleCell.value = TITLE;
  titleCell.fill = fillSolid(FILL_TITLE);
  titleCell.font = { bold: true, size: 12 };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  for (var tc = 2; tc <= ID_COLS; tc++) {
    sheet.getCell(2, tc).fill = fillSolid(FILL_TITLE);
  }
  sheet.mergeCells(2, totalsCol, 2, lastCol);
  sheet.getCell(2, totalsCol).value = 'Total Number of Days';
  sheet.getCell(2, totalsCol).font = { bold: true };
  applyCenterWrap(sheet.getCell(2, totalsCol));

  // Row 3 — dates
  sheet.getCell(3, ID_COLS).value = 'Dates';
  for (var wi = 0; wi < WEEK_COUNT; wi++) {
    var week = data.calendar && data.calendar.weeks[wi];
    for (var di = 0; di < daysPerWeek; di++) {
      var col = layout.firstDayCol + wi * daysPerWeek + di;
      var iso = week ? CalendarEngine.dateForWeekdayInWeekRange(week, weekdays[di]) : null;
      var cell = sheet.getCell(3, col);
      if (iso) {
        var d = CalendarEngine.parseDate(iso);
        cell.value = d;
        cell.numFmt = 'd-mmm';
      }
      applyCenterWrap(cell);
    }
  }
  sheet.getCell(3, totalsCol).value = 'HOSPITALS';
  sheet.getCell(3, totalsCol + 1).value = 'SIM';
  applyCenterWrap(sheet.getCell(3, totalsCol));
  applyCenterWrap(sheet.getCell(3, totalsCol + 1));

  // Row 4 — week numbers (merged across each week's day columns)
  sheet.getCell(4, ID_COLS).value = 'Week';
  for (var w = 0; w < WEEK_COUNT; w++) {
    var startCol = layout.firstDayCol + w * daysPerWeek;
    var endCol = startCol + daysPerWeek - 1;
    if (daysPerWeek > 1) sheet.mergeCells(4, startCol, 4, endCol);
    var weekCell = sheet.getCell(4, startCol);
    weekCell.value = w + 1;
    applyCenterWrap(weekCell);
    weekCell.font = { bold: true };
  }

  // Row 5 — column headers
  var headers = [
    'Registration Section Number',
    'Instructor & Place',
    'Student Group Number',
    'Student Last Name',
    'Student First Name'
  ];
  headers.forEach(function (h, i) {
    var hc = sheet.getCell(5, i + 1);
    hc.value = h;
    hc.font = { bold: true };
    hc.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  sheet.getRow(5).height = 45;
  for (var wh = 0; wh < WEEK_COUNT; wh++) {
    for (var dh = 0; dh < daysPerWeek; dh++) {
      var hcol = layout.firstDayCol + wh * daysPerWeek + dh;
      var hcell = sheet.getCell(5, hcol);
      hcell.value = DAY_LETTER[weekdays[dh]] || weekdays[dh].charAt(0);
      applyCenterWrap(hcell);
      hcell.font = { bold: true };
    }
  }

  // Body — students grouped by clinical cohort with separator rows
  var groups = DataModel.getClinicalGroups(data.config);
  var row = 6;
  groups.forEach(function (group, gi) {
    var cohort = sorted.filter(function (s) {
      return s.clinicalGroup === group;
    });
    if (!cohort.length) return;
    var groupIndex1 = gi + 1;
    var idLines = identityLines(data, group, groupIndex1, cohort);
    var bannerAt = Math.min(3, Math.max(0, cohort.length - 1));
    var groupRgb = groupFillRgb(groupIndex1);

    cohort.forEach(function (student, si) {
      var r = sheet.getRow(row);
      r.height = 30;

      var aVal = '';
      var bVal = '';
      if (si === 0) {
        aVal = idLines.section;
        bVal = idLines.facultyName;
      } else if (si === 1) {
        bVal = idLines.place;
      } else if (si === 2) {
        bVal = idLines.section;
      }
      if (si === bannerAt && idLines.groupBanner) {
        aVal = idLines.groupBanner;
      }

      sheet.getCell(row, 1).value = aVal || null;
      sheet.getCell(row, 2).value = bVal || null;
      sheet.getCell(row, 3).value = groupOrdinalLabel(groupIndex1) + '-' + (si + 1);
      sheet.getCell(row, 4).value = student.lastName || '';
      sheet.getCell(row, 5).value = student.firstName || '';

      for (var wj = 0; wj < WEEK_COUNT; wj++) {
        for (var dj = 0; dj < daysPerWeek; dj++) {
          var dcol = layout.firstDayCol + wj * daysPerWeek + dj;
          var spec = dayCellSpec(data, student, wj, weekdays[dj]);
          var dcell = sheet.getCell(row, dcol);
          dcell.value = spec.text || null;
          dcell.border = thinBorder();
          applyCenterWrap(dcell);
          if (spec.gray) dcell.fill = fillSolid(FILL_INACTIVE);
        }
      }

      var totals = tallyTotals(data, student);
      sheet.getCell(row, totalsCol).value = totals.hospitals;
      sheet.getCell(row, totalsCol + 1).value = totals.sims;
      applyCenterWrap(sheet.getCell(row, totalsCol));
      applyCenterWrap(sheet.getCell(row, totalsCol + 1));

      if (groupRgb) {
        var fontColor = { argb: 'FF' + groupRgb };
        for (var fc = 1; fc <= lastCol; fc++) {
          var fcell = sheet.getCell(row, fc);
          var prev = fcell.font || {};
          fcell.font = {
            name: prev.name,
            size: prev.size,
            italic: prev.italic,
            underline: prev.underline,
            bold: !!prev.bold || fc === 3 || (!!aVal && fc === 1),
            color: fontColor
          };
        }
      }

      row++;
    });

    // Gray separator between clinical groups
    for (var sc = 1; sc <= lastCol; sc++) {
      sheet.getCell(row, sc).fill = fillSolid(FILL_SEPARATOR);
    }
    sheet.getRow(row).height = 10;
    row++;
  });

  return sheet;
}

export {
  collectExportWeekdays,
  dayCellSpec,
  siteLabel,
  groupFillRgb,
  GROUP_COLORS,
  TITLE,
  FILL_INACTIVE,
  FILL_SEPARATOR
};
