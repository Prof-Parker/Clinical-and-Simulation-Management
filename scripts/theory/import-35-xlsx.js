/**
 * Import REGN 35 prototype workbook into canonical semester.theory.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import ExcelJS from 'exceljs';
import { createEmptyTheory } from '../../src/core/theory-data.js';
import { parseDate, toISO, addDays } from '../../src/core/calendar-dates.js';
import { uid } from '../../src/core/data-model/students.js';
import {
  linesToEvents,
  parseHeaderCell,
  buildTopicsAndSkills
} from './map-35-events.js';

var __dirname = path.dirname(fileURLToPath(import.meta.url));
var DEFAULT_XLSX = path.join(__dirname, '..', '..', 'docs', 'Design Docs', 'protypes', '35.xlsx');

var WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
var COL_SUN = 2;
var COL_FRI = 7;

function cellText(ws, r, c) {
  var cell = ws.getCell(r, c);
  var v = cell.value;
  if (v == null || v === '') return '';
  if (typeof v === 'object') {
    if (v.richText) {
      return v.richText.map(function (t) { return t.text; }).join('');
    }
    if (v.text) return String(v.text);
    if (v.result != null) return String(v.result);
    if (v instanceof Date) {
      return v.toISOString().slice(0, 10);
    }
    return '';
  }
  return String(v);
}

function weekdayFromIso(iso) {
  var d = parseDate(iso);
  return d ? WEEKDAYS[d.getDay()] : 'Sun';
}

/** Sunday of instructional week 1 is semesterStartDate; col B=Sun … G=Fri. */
function dateForWeekCol(startDate, weekIndex0, col) {
  var origin = parseDate(startDate);
  if (!origin) return '';
  var offset = weekIndex0 * 7 + (col - COL_SUN);
  return toISO(addDays(origin, offset));
}

function isHeaderRow(ws, r, monthCtx) {
  var n = 0;
  for (var c = COL_SUN; c <= COL_FRI; c++) {
    var parsed = parseHeaderCell(cellText(ws, r, c), monthCtx);
    if (parsed && parsed.weekday) n += 1;
  }
  return n >= 2;
}

function weekNumberAt(ws, r) {
  var a = cellText(ws, r, 1).trim();
  if (!/^\d+$/.test(a)) return 0;
  var n = parseInt(a, 10);
  return n >= 1 && n <= 18 ? n : 0;
}

function collectWeekBlocks(ws) {
  var monthCtx = { month: 8 };
  var headerRows = [];
  var weekRows = [];
  var last = ws.actualRowCount || ws.rowCount || 0;
  for (var r = 1; r <= last; r++) {
    var probe = { month: monthCtx.month };
    if (isHeaderRow(ws, r, probe)) {
      headerRows.push(r);
      monthCtx.month = probe.month;
    }
    var wn = weekNumberAt(ws, r);
    if (wn) weekRows.push({ row: r, week: wn });
  }
  var blocks = [];
  weekRows.forEach(function (wr, idx) {
    var headerRow = 0;
    for (var i = 0; i < headerRows.length; i++) {
      if (headerRows[i] < wr.row) headerRow = headerRows[i];
    }
    var nextHeader = last + 1;
    for (var j = 0; j < headerRows.length; j++) {
      if (headerRows[j] > wr.row) {
        nextHeader = headerRows[j];
        break;
      }
    }
    var nextWeek = idx + 1 < weekRows.length ? weekRows[idx + 1].row : last + 1;
    var endRow = Math.min(nextHeader, nextWeek) - 1;
    blocks.push({
      week: wr.week,
      headerRow: headerRow,
      startRow: headerRow ? headerRow + 1 : wr.row,
      endRow: endRow,
      weekRow: wr.row
    });
  });
  return { blocks: blocks, last: last };
}

function toTheoryEvent(draft, weekLabel) {
  var moduleCode = null;
  if (draft.track === 'theory' && weekLabel) moduleCode = String(weekLabel) + 'A';
  return {
    id: uid(),
    track: draft.track,
    title: draft.title,
    description: draft.description || '',
    moduleCode: moduleCode,
    moduleRef: null,
    moduleRefs: [],
    timeStart: draft.timeStart,
    timeEnd: draft.timeEnd,
    allDay: false,
    faculty: draft.faculty || [],
    categories: draft.categories || [],
    contentArea: null,
    courseCode: draft.courseCode,
    facultyRequired: null,
    groups: (draft.groups || []).slice(),
    contentTags: ['MS'],
    facilityId: draft.facilityId || '',
    siteId: draft.siteId || '',
    siteLabel: draft.siteLabel || ''
  };
}

function attachTopicRefs(days, topics) {
  days.forEach(function (day) {
    (day.events || []).forEach(function (ev) {
      if (ev.track !== 'theory') return;
      var base = String(ev.description || ev.title || '').trim();
      var topic = (topics || []).find(function (t) {
        return t.title === base || t.title.indexOf(base) === 0 || base.indexOf(t.title) === 0;
      });
      if (topic) {
        ev.moduleRef = topic.id;
        ev.moduleRefs = [topic.id];
      }
    });
  });
}

export async function importRegn35FromXlsx(options) {
  options = options || {};
  var xlsxPath = options.xlsxPath || DEFAULT_XLSX;
  var startDate = options.semesterStartDate || '2026-08-16';

  var wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);
  var ws = wb.worksheets[0];
  if (!ws) throw new Error('REGN 35 workbook has no sheets');

  var collected = collectWeekBlocks(ws);
  var daysMap = {};
  var allDrafts = [];

  collected.blocks.forEach(function (block) {
    var weekIndex0 = block.week - 1;
    for (var c = COL_SUN; c <= COL_FRI; c++) {
      var date = dateForWeekCol(startDate, weekIndex0, c);
      if (!date) continue;
      var lines = [];
      for (var r = block.startRow; r <= block.endRow; r++) {
        var cell = ws.getCell(r, c);
        if (cell.isMerged && cell.master &&
            (cell.master.row !== r || cell.master.col !== c)) {
          continue;
        }
        lines.push(cellText(ws, r, c));
      }
      var drafts = linesToEvents(lines);
      drafts.forEach(function (d) {
        d.date = date;
        d.weekLabel = block.week;
        allDrafts.push(d);
        if (!daysMap[date]) {
          daysMap[date] = {
            id: date,
            date: date,
            weekIndex: weekIndex0,
            weekday: weekdayFromIso(date),
            weekLabel: block.week,
            isHoliday: false,
            isBreak: false,
            events: []
          };
        }
        daysMap[date].events.push(toTheoryEvent(d, block.week));
      });
    }
  });

  var theory = createEmptyTheory(['REGN35', 'REGN36', 'REGN35P', 'REGN36P']);
  theory.days = Object.keys(daysMap).sort().map(function (d) { return daysMap[d]; });
  theory.settings.lectureWeekdays = ['Mon'];
  theory.settings.defaultLectureStart = '0800';
  theory.settings.defaultLectureEnd = '1205';
  theory.settings.lectureSessions = [{ weekday: 'Mon', start: '0800', end: '1205' }];
  theory.instructionalWeekdays = ['Mon', 'Wed', 'Thu', 'Fri'];

  var built = buildTopicsAndSkills(allDrafts);
  attachTopicRefs(theory.days, built.topics);

  var eventCount = theory.days.reduce(function (n, d) { return n + d.events.length; }, 0);
  var lectureCount = theory.days.reduce(function (n, d) {
    return n + d.events.filter(function (e) { return e.track === 'theory'; }).length;
  }, 0);
  var validation = {
    weekCount: collected.blocks.length,
    dayCount: theory.days.length,
    eventCount: eventCount,
    lectureCount: lectureCount,
    topicCount: built.topics.length
  };
  if (validation.eventCount < 40) {
    throw new Error('REGN 35 import too few events: ' + validation.eventCount);
  }
  if (validation.lectureCount < 8) {
    throw new Error('REGN 35 import too few lectures: ' + validation.lectureCount);
  }

  return {
    theory: theory,
    topics: built.topics,
    skills: built.skills,
    validation: validation
  };
}
