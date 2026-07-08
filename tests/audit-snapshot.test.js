/* eslint-disable no-console */
import { describe, it, expect } from 'vitest';
import { DataModel, CalendarEngine, Scheduler, AuditSnapshot } from './_harness.js';

describe('audit-snapshot.test.js', () => {
  it('runs assertions', async () => {
    let failed = 0;

    function assert(condition, message) {
      if (!condition) {
        failed++;
        console.error('FAIL: ' + message);
        return;
      }
    }

    function makeSemester() {
      var fileRoot = DataModel.createDefaultFile();
      var sem = fileRoot.semesters[0];
      sem.meta.courseId = 'REGN15P';
      CalendarEngine.rebuildWeeks(sem);
      Scheduler.regenerateAll(sem);
      return sem;
    }

    function clone(obj) {
      return JSON.parse(JSON.stringify(obj));
    }

    var sem = makeSemester();

    var payload = AuditSnapshot.buildCanonicalPayload(sem);
    assert(payload.courseId === 'REGN15P', 'payload includes courseId');
    assert(Array.isArray(payload.students) && payload.students.length === sem.students.length,
      'payload includes all students');
    assert(payload.semesterYear === sem.meta.semesterYear, 'payload includes semester year');
    assert(JSON.stringify(payload).indexOf('lastModified') < 0, 'payload strips meta.lastModified');
    assert(JSON.stringify(payload).indexOf('_simCalendar') < 0, 'payload strips _simCalendar');

    var hash1 = await AuditSnapshot.computeHash(sem);
    var copy = clone(sem);
    copy.meta.lastModified = new Date(Date.now() + 60000).toISOString();
    var hash2 = await AuditSnapshot.computeHash(copy);
    assert(/^[0-9a-f]{64}$/.test(hash1), 'hash is lowercase 64-char hex');
    assert(hash1 === hash2, 'identical semester data produces identical hash');

    var changed = clone(sem);
    var studentWithMakeup = changed.students.find(function (s) { return s.makeups && s.makeups.length; });
    if (!studentWithMakeup) {
      studentWithMakeup = changed.students[0];
      studentWithMakeup.makeups.push({ weekIndex: 3, type: 'clinical' });
    } else {
      studentWithMakeup.makeups[0].weekIndex =
        (studentWithMakeup.makeups[0].weekIndex + 1) % 18;
    }
    var hash3 = await AuditSnapshot.computeHash(changed);
    assert(hash1 !== hash3, 'changed makeup week produces different hash');

    var shuffled = clone(sem);
    shuffled.students.reverse();
    var hash4 = await AuditSnapshot.computeHash(shuffled);
    assert(hash1 === hash4, 'student array order does not affect hash');

    var reordered = clone(sem);
    reordered.students.forEach(function (s) {
      if (s.makeups && s.makeups.length > 1) s.makeups.reverse();
    });
    var hash5 = await AuditSnapshot.computeHash(reordered);
    assert(hash1 === hash5, 'makeup record order does not affect hash');

    var otherCourse = clone(sem);
    otherCourse.meta.courseId = 'REGN25P';
    var hash6 = await AuditSnapshot.computeHash(otherCourse);
    assert(hash1 !== hash6, 'different courseId produces different hash');

    expect(failed).toBe(0);
  });
});
