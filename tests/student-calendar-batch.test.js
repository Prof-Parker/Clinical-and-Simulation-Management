/* eslint-disable no-console */
import { describe, it, expect } from 'vitest';
import {
  DataModel,
  CalendarEngine,
  Scheduler,
  AuditExport
} from './_harness.js';
import {
  filterStudents,
  attachmentFilename,
  slugName
} from '../src/export/student-calendar-batch.js';
import {
  buildEmailRows,
  rowsToJson,
  applyTemplate
} from '../src/export/power-automate-json.js';
import {
  buildSummaryHtml,
  buildDetailedHtml,
  holidayLabelForWeek,
  summaryEventsForWeek
} from '../src/export/student-calendar-html.js';
import { formatSummaryDate } from '../src/export/student-calendar-summary.js';

describe('student-calendar-batch.test.js', () => {
  it('filters, builds HTML/JSON, and includes audit hours', () => {
    let failed = 0;
    function assert(condition, message) {
      if (!condition) {
        failed++;
        console.error('FAIL: ' + message);
      }
    }

    var fileRoot = DataModel.createDefaultFile();
    var sem = fileRoot.semesters[0];
    DataModel.migrateSemester(sem);
    CalendarEngine.rebuildWeeks(sem);
    Scheduler.regenerateAll(sem);

    sem.holidays = [{
      id: 'h1', type: 'holiday', date: sem.calendar.weeks[10].startDate, label: 'Veterans Day'
    }];
    CalendarEngine.rebuildWeeks(sem);
    assert(
      holidayLabelForWeek(sem.calendar.weeks[10]).indexOf('Veterans Day') >= 0,
      'holiday label Veterans Day'
    );

    sem.orientations = [{
      id: 'o1',
      clinicalGroup: 'C1',
      date: sem.calendar.weeks[2].startDate,
      facilityId: sem.facilities[0].id,
      timeStart: '0800',
      timeEnd: '1200'
    }];

    var c1 = filterStudents(sem, { mode: 'clinicalGroup', value: 'C1' });
    assert(c1.length > 0 && c1.every(function (s) { return s.clinicalGroup === 'C1'; }), 'clinical filter');
    var sg = sem.students[0].simGroup;
    var bySim = filterStudents(sem, { mode: 'simGroup', value: sg });
    assert(bySim.every(function (s) { return s.simGroup === sg; }), 'sim filter');

    var student = sem.students.find(function (s) { return s.clinicalGroup === 'C1'; }) || sem.students[0];
    student.email = 'student1@example.edu';
    var summaryHtml = buildSummaryHtml(sem, student, {});
    assert(summaryHtml.indexOf('Clinical and Sim Summary') >= 0, 'summary title');
    assert(summaryHtml.indexOf('Orient') >= 0 || summaryHtml.indexOf('orientation') >= 0 ||
      summaryHtml.indexOf('0800') >= 0 || summaryHtml.indexOf('8:00') >= 0,
      'summary includes orientation or times');

    var detailedHtml = buildDetailedHtml(sem, student, {});
    assert(detailedHtml.indexOf('Detailed Weekly') >= 0, 'detailed title');
    assert(detailedHtml.indexOf('Wk 1') >= 0, 'detailed has weeks');
    assert(detailedHtml.indexOf('student-cal-week-divider') >= 0, 'detailed has theory/practicum divider');
    assert(detailedHtml.indexOf('student-cal-master-table') >= 0, 'detailed uses master-style grid');

    var fname = attachmentFilename(sem, student, 'summary');
    assert(fname.indexOf('_summary.pdf') > 0, 'attachment ends with _summary.pdf');
    assert(fname.indexOf(slugName(student.name)) === 0, 'attachment starts with slug');
    assert(fname.length <= 48, 'attachment short enough for deep OneDrive paths');
    assert(slugName('Student 1') === 'Student_1', 'slug name');
    assert(slugName('A Very Long Student Name That Exceeds Limit XYZ', 24).length === 24,
      'slug truncates to max');

    var rows = buildEmailRows([student], {
      calendarType: 'summary',
      semesterName: sem.meta.semesterName,
      leadFacultyName: 'Lead Faculty',
      subjectTemplate: '{{semesterName}} — {{studentName}}',
      bodyTemplate: 'Hi {{studentName}} file {{attachmentName}}',
      attachmentFor: function (s) { return attachmentFilename(sem, s, 'summary'); }
    });
    assert(rows[0].Email === 'student1@example.edu', 'json email');
    assert(rows[0].Subject.indexOf(student.name) >= 0, 'subject merge');
    assert(rows[0].AttachmentFilename === fname, 'attachment filename in row');
    var json = rowsToJson(rows);
    var parsed = JSON.parse(json);
    assert(Array.isArray(parsed.emails), 'json has emails array');
    assert(parsed.emails[0].Email === 'student1@example.edu', 'json email field');
    assert(parsed.emails[0].AttachmentFilename === fname, 'json attachment field');

    assert(applyTemplate('Hello {{studentName}}', { studentName: 'Student 1' }) === 'Hello Student 1',
      'template merge');

    var req = AuditExport.buildRequirementsSummary(sem);
    assert(req[0].clinicalHours != null, 'audit summary has clinicalHours');
    assert(req[0].simHours != null, 'audit summary has simHours');
    assert(req[0].orientationHours != null, 'audit summary has orientationHours');

    expect(failed).toBe(0);
  });

  it('lists each summary event on its weekday date and does not repeat the week number', () => {
    var fileRoot = DataModel.createDefaultFile();
    var sem = fileRoot.semesters[0];
    DataModel.migrateSemester(sem);
    CalendarEngine.rebuildWeeks(sem);
    Scheduler.regenerateAll(sem);

    var student = sem.students[0];
    var wi = 5;
    student.simGroup = 'SG3';
    student.schedule[wi] = {
      clinical: true,
      sim: 1,
      simDay: 'Tue',
      simGuestGroup: 'SG3',
      facilityId: student.facilityId
    };
    sem.config.clinicalGroupDays = sem.config.clinicalGroupDays || {};
    sem.config.clinicalGroupDays[student.clinicalGroup] = 'Mon';

    var week = sem.calendar.weeks[wi];
    var clinIso = CalendarEngine.dateForWeekdayInWeekRange(week, 'Mon');
    var simIso = CalendarEngine.dateForWeekdayInWeekRange(week, 'Tue');
    expect(clinIso).toBeTruthy();
    expect(simIso).toBeTruthy();
    expect(clinIso).not.toBe(week.startDate);

    var events = summaryEventsForWeek(sem, student, wi, false);
    expect(events.map(function (ev) { return ev.dateIso; })).toEqual([clinIso, simIso]);
    expect(events[0].weekday).toBe('Monday');
    expect(events[0].activity).toMatch(/^Clinical \(/);
    expect(events[0].times).toMatch(/AM|PM/);
    expect(events[1].weekday).toBe('Tuesday');
    expect(events[1].activity).toBe('Simulation 1 (Sim group 3, guest)');
    expect(events[1].times).toMatch(/AM|PM/);

    var html = buildSummaryHtml(sem, student, {});
    expect(html).toContain('<th>Day</th>');
    expect(html).toContain('<th>Times</th>');
    expect(html.split('>Week 6<').length - 1).toBe(1);
    expect(html).toContain('rowspan="' + events.length + '"');
    expect(html).toContain(formatSummaryDate(clinIso));
    expect(html).toContain(formatSummaryDate(simIso));
    expect(html).toContain('Monday');
    expect(html).toContain('Tuesday');
    expect(html).not.toContain('Clinical Monday');
    expect(html).not.toContain(
      '>Week 6</td><td>' + formatSummaryDate(week.startDate)
    );
  });
});
