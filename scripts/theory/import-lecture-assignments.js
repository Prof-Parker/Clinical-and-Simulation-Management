/**
 * Parse Lecture Assignments docx into instructional rows.
 */

var MONTHS = {
  January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
  July: 7, August: 8, September: 9, October: 10, November: 11, December: 12
};

var WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function pad2(n) { return String(n).padStart(2, '0'); }

function isoDate(year, month, day) {
  return year + '-' + pad2(month) + '-' + pad2(day);
}

function isFacultyName(s) {
  return /^Mr\.|^Ms\.|^Mrs\.|^Dr\.|Brian|Robin|Julie|Staff/i.test(s);
}

function parseMonthDay(cell, year) {
  var m = cell.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})$/i);
  if (!m) return null;
  var month = MONTHS[m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase()];
  if (!month) return null;
  return isoDate(year, month, parseInt(m[2], 10));
}

function weekLabelFromDate(firstDate, date) {
  var fd = new Date(firstDate + 'T12:00:00');
  var d = new Date(date + 'T12:00:00');
  var diff = Math.round((d - fd) / (7 * 24 * 60 * 60 * 1000));
  return Math.max(1, Math.min(18, diff + 1));
}

export function parseLectureAssignmentCells(cells) {
  var year = 2026;
  var rows = [];
  var firstDate = null;
  var i = 0;
  while (i < cells.length) {
    var c = cells[i];
    if (/^\d+$/.test(c) && parseInt(c, 10) <= 18) {
      i++;
      continue;
    }
    if (WEEKDAYS.indexOf(c) >= 0) {
      var weekday = c.slice(0, 3);
      var date = null;
      if (MONTHS[cells[i + 1]] && /^\d+$/.test(cells[i + 2])) {
        date = isoDate(year, MONTHS[cells[i + 1]], parseInt(cells[i + 2], 10));
        i += 3;
      } else if (parseMonthDay(cells[i + 1], year)) {
        date = parseMonthDay(cells[i + 1], year);
        i += 2;
      } else {
        i++;
        continue;
      }
      if (!firstDate) firstDate = date;
      var currentWeek = weekLabelFromDate(firstDate, date);
      var topicParts = [];
      var lecturer = '';
      var skillsParts = [];
      var phase = 'topic';
      while (i < cells.length) {
        var t = cells[i];
        if (WEEKDAYS.indexOf(t) >= 0) break;
        if (t === 'N/A') { i++; continue; }
        if (isFacultyName(t)) {
          if (!lecturer) lecturer = t;
          else lecturer += ' / ' + t;
          phase = 'skills';
          i++;
          continue;
        }
        if (phase === 'topic') topicParts.push(t);
        else skillsParts.push(t);
        i++;
      }
      rows.push({
        week: currentWeek,
        weekday: weekday,
        date: date,
        topic: topicParts.join('; ').trim(),
        lecturer: lecturer,
        skillsLab: skillsParts.join('; ').trim()
      });
      continue;
    }
    i++;
  }
  return rows;
}

export function lectureRowsToEvents(rows, lectureWeekdays) {
  var eventsByDate = {};
  rows.forEach(function (row) {
    if (!eventsByDate[row.date]) eventsByDate[row.date] = [];
    var slotIdx = lectureWeekdays.indexOf(row.weekday);
    var moduleCode = null;
    if (slotIdx >= 0) {
      moduleCode = row.week + String.fromCharCode(65 + slotIdx);
    }
    if (row.topic) {
      eventsByDate[row.date].push({
        track: 'theory',
        moduleCode: moduleCode,
        title: moduleCode ? ('Module ' + moduleCode + ' — ' + row.topic.split(';')[0]) : row.topic,
        description: row.topic,
        timeStart: '0800',
        timeEnd: row.weekday === 'Thu' ? '1115' : '1050',
        faculty: row.lecturer ? row.lecturer.split(/\s*\/\s*/).map(function (n) {
          return { name: n.trim(), role: 'lecturer' };
        }) : [],
        categories: ['lecture']
      });
    }
    if (row.skillsLab && row.skillsLab.toLowerCase() !== 'n/a') {
      eventsByDate[row.date].push({
        track: 'skills',
        title: 'Skills lab',
        description: row.skillsLab,
        timeStart: '1200',
        timeEnd: '1550',
        location: 'Clinical Classroom (8220 and 8217)',
        faculty: [],
        categories: ['skills_lab']
      });
    }
  });
  return eventsByDate;
}
