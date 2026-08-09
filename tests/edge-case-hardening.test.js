/* eslint-disable no-console */
import { describe, it, expect } from 'vitest';
import * as DataModel from '../src/core/data-model/index.js';
import { parseDate } from '../src/core/calendar-dates.js';
import { buildWeekList } from '../src/core/calendar-weeks.js';
import * as FileKind from '../src/core/file-kind.js';
import { looksLikeLegacySemester, shapeMatchesKind } from '../src/core/file-kind-shape.js';
import {
  wouldSimClinicalConflict,
  findSimWeek,
  findClinicalMakeupRecord
} from '../src/core/scheduler/helpers.js';
import * as ClinicalSites from '../src/core/clinical-sites.js';
import * as Orientation from '../src/core/orientation.js';

describe('edge-case hardening', () => {
  describe('parseDate', () => {
    it('returns null for empty, truncated, and non-numeric values', () => {
      expect(parseDate('')).toBeNull();
      expect(parseDate(null)).toBeNull();
      expect(parseDate('2026')).toBeNull();
      expect(parseDate('nope')).toBeNull();
      expect(parseDate('2026-13-01')).toBeNull();
      expect(parseDate('2026-02-31')).toBeNull();
    });

    it('parses valid ISO local dates', () => {
      var d = parseDate('2026-08-08');
      expect(d).toBeInstanceOf(Date);
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(7);
      expect(d.getDate()).toBe(8);
    });

    it('buildWeekList falls back when start date is invalid', () => {
      var weeks = buildWeekList('bogus');
      expect(weeks).toHaveLength(18);
      expect(weeks[0].startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(weeks[0].startDate).not.toContain('NaN');
    });
  });

  describe('migrateFile / migrateSemester', () => {
    it('rejects null, arrays, and unrelated JSON shapes', () => {
      expect(function () { DataModel.migrateFile(null); }).toThrow(/expected a JSON object/);
      expect(function () { DataModel.migrateFile([]); }).toThrow(/expected a JSON object/);
      expect(function () { DataModel.migrateFile({ users: {} }); }).toThrow(/unrecognized/);
      expect(function () { DataModel.migrateFile({ meta: {}, sites: [] }); }).toThrow(/unrecognized/);
    });

    it('rejects empty semesters arrays', () => {
      expect(function () {
        DataModel.migrateFile({ meta: { fileKind: 'program_semester' }, semesters: [] });
      }).toThrow(/no semesters/);
    });

    it('coerces null students, schedule cells, and makeups', () => {
      var root = DataModel.migrateFile({
        meta: {},
        semesters: [{
          id: 's1',
          meta: { courseId: 15, semesterSeason: 'fall', semesterYear: 'nope' },
          students: [
            null,
            {
              name: 'Student 1',
              schedule: [null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null],
              makeups: [null, { type: 'clinical', weekIndex: 1 }]
            }
          ],
          facilities: [null],
          holidays: [null, { type: 'mondayHoliday', date: '2026-09-07' }],
          config: 'bad'
        }]
      });
      var sem = root.semesters[0];
      expect(sem.students).toHaveLength(1);
      expect(sem.students[0].schedule).toHaveLength(18);
      sem.students[0].schedule.forEach(function (c) {
        expect(c).toBeTruthy();
        expect(c.facilityId).toBeNull();
      });
      expect(sem.students[0].makeups).toHaveLength(1);
      expect(sem.students[0].makeups[0].id).toBeTruthy();
      expect(sem.facilities.length).toBeGreaterThan(0);
      expect(sem.holidays).toHaveLength(1);
      expect(sem.holidays[0].type).toBe('holiday');
      expect(typeof sem.config).toBe('object');
      expect(Number.isFinite(sem.meta.semesterYear)).toBe(true);
      expect(String(sem.meta.courseId)).toBe('15');
    });

    it('still accepts legacy single-semester roots', () => {
      var root = DataModel.migrateFile({
        students: [{ name: 'Student 1' }],
        calendar: { semesterStartDate: '2026-01-12', weeks: [] },
        config: DataModel.defaultConfig()
      });
      expect(Array.isArray(root.semesters)).toBe(true);
      expect(root.semesters).toHaveLength(1);
      expect(root.semesters[0].students[0].name).toBe('Student 1');
    });

    it('dedupes colliding student ids', () => {
      var root = DataModel.migrateFile({
        meta: {},
        semesters: [{
          students: [
            { id: 'dup', name: 'Student 1' },
            { id: 'dup', name: 'Student 2' }
          ]
        }]
      });
      var ids = root.semesters[0].students.map(function (s) { return s.id; });
      expect(new Set(ids).size).toBe(2);
    });
  });

  describe('file-kind shape validation', () => {
    const K = FileKind.FILE_KINDS;

    it('ignores forged stamps that do not match shape', () => {
      var forged = { meta: { fileKind: K.PROGRAM_SEMESTER }, users: { a: 1 } };
      expect(shapeMatchesKind(forged, K.PROGRAM_SEMESTER)).toBe(false);
      expect(FileKind.detectFileKind(forged, 'users-registry.json')).toBe(K.USERS_REGISTRY);
    });

    it('still honors valid stamps over filename', () => {
      var raw = { meta: { fileKind: K.PLAYGROUND }, semesters: [{}] };
      expect(FileKind.detectFileKind(raw, 'F2026_REGN_program.json')).toBe(K.PLAYGROUND);
    });

    it('does not misclassify semester roots that also have topics', () => {
      var raw = { meta: {}, semesters: [{}], topics: [] };
      expect(FileKind.inferFileKind(raw, 'F2026_REGN15P.json')).toBe(K.PROGRAM_SEMESTER);
    });

    it('recognizes legacy semester shape', () => {
      expect(looksLikeLegacySemester({ students: [], config: {} })).toBe(true);
      expect(FileKind.inferFileKind({ students: [], config: {} }, 'legacy.json'))
        .toBe(K.PROGRAM_SEMESTER);
    });
  });

  describe('null schedule / makeup guards', () => {
    it('wouldSimClinicalConflict tolerates null cells', () => {
      expect(wouldSimClinicalConflict(null, { clinicalGroup: 'C1' }, DataModel.defaultConfig(), 'Mon'))
        .toBe(false);
    });

    it('findSimWeek and findClinicalMakeupRecord tolerate missing arrays', () => {
      expect(findSimWeek({}, 1)).toBe(-1);
      expect(findSimWeek({ schedule: [null, { sim: 2 }] }, 2)).toBe(1);
      expect(findClinicalMakeupRecord({}, 0)).toBeNull();
      expect(findClinicalMakeupRecord({ makeups: null }, 0)).toBeNull();
    });

    it('getStudentFacilityAtWeek tolerates missing cells', () => {
      var data = {
        facilities: [{ id: 'f1', name: 'Site A' }],
        config: DataModel.defaultConfig(),
        students: []
      };
      expect(ClinicalSites.getStudentFacilityAtWeek(data, { schedule: [] }, 0)).toBeNull();
      expect(ClinicalSites.getStudentFacilityAtWeek(data, { schedule: [null] }, 0)).toBeNull();
    });

    it('getOrientationFacilityId tolerates missing group orientation', () => {
      var data = {
        orientations: [],
        facilities: [{ id: 'f1', name: 'Site A' }],
        config: DataModel.defaultConfig(),
        students: []
      };
      var student = { clinicalGroup: 'C1', facilityId: 'f1' };
      expect(Orientation.getOrientationFacilityId(data, student)).toBe('f1');
    });
  });

  describe('normalizeConfig week coercion', () => {
    it('replaces invalid start weeks and day counts', () => {
      var cfg = DataModel.normalizeConfig({
        clinicalStartWeek: 'abc',
        simStartWeek: null,
        clinicalDaysRequired: '',
        simDaysRequired: 'xyz'
      });
      expect(cfg.clinicalStartWeek).toBe(5);
      expect(cfg.simStartWeek).toBe(5);
      expect(cfg.clinicalDaysRequired).toBe(10);
      expect(cfg.simDaysRequired).toBe(5);
    });
  });
});
