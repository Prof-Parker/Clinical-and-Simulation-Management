import { describe, it, expect } from 'vitest';
import {
  isGenericSkillsLabTitle,
  isUniqueSkillsEventTitle,
  skillsSeriesKey,
  skillsSeriesLabel
} from '../src/core/faculty-schedule/skills-series.js';
import {
  clinicalSeriesKey,
  clinicalSeriesLabel
} from '../src/core/faculty-schedule/clinical-series.js';
import { groupSlots, compressedChipHtml } from '../src/ui/faculty/chips.js';

describe('skills-series titles', () => {
  it('treats Skills / Skills lab / 35P Skills as a recurring series', () => {
    expect(isGenericSkillsLabTitle('Skills lab')).toBe(true);
    expect(isGenericSkillsLabTitle('35P Skills')).toBe(true);
    expect(isGenericSkillsLabTitle('REGN 15P Skills Lab')).toBe(true);
    expect(isUniqueSkillsEventTitle('35P Skills')).toBe(false);
  });

  it('treats Fair, Sign Offs, IV Lab, and Skims as unique events', () => {
    expect(isUniqueSkillsEventTitle('35P Skills Fair')).toBe(true);
    expect(isUniqueSkillsEventTitle('Skills Sign Offs')).toBe(true);
    expect(isUniqueSkillsEventTitle('IV Lab')).toBe(true);
    expect(isUniqueSkillsEventTitle('35P Skims Final Evaluation')).toBe(true);
    expect(isUniqueSkillsEventTitle('Skills Open Practice')).toBe(true);
    expect(isGenericSkillsLabTitle('35P Skills Fair')).toBe(false);
  });

  it('uses different keys for Fair vs Skims at the same weekday and hours', () => {
    var shared = { weekday: 'Monday', start: '1300', end: '1700', courseCode: 'REGN35P' };
    var fair = skillsSeriesKey(Object.assign({ title: '35P Skills Fair', date: '2026-08-17' }, shared));
    var skims = skillsSeriesKey(Object.assign({
      title: '35P Skims Final Evaluation',
      date: '2026-12-07'
    }, shared));
    var weekly = skillsSeriesKey(Object.assign({ title: '35P Skills', date: '2026-08-24' }, {
      weekday: 'Monday', start: '1300', end: '1430', courseCode: 'REGN35P'
    }));
    expect(fair).not.toBe(skims);
    expect(skillsSeriesLabel('35P Skills Fair', true)).toBe('Skills Fair');
    expect(weekly.indexOf('recurring')).toBeGreaterThan(-1);
  });
});

describe('clinical-series keys', () => {
  it('keys by clinical group so C2 early and C4 late stay separate', () => {
    expect(clinicalSeriesKey({ clinicalGroup: 'C2', courseCode: 'REGN35P' }))
      .not.toBe(clinicalSeriesKey({ clinicalGroup: 'C4', courseCode: 'REGN35P' }));
    expect(clinicalSeriesLabel('C2', 'SRMC')).toBe('SRMC Clinical C2');
    expect(clinicalSeriesLabel('C1', 'MERCY')).toBe('MERCY Clinical C1');
  });
});

describe('faculty chip grouping', () => {
  it('shows per-session faculty count and does not merge unique 4hr labs', () => {
    function seat(partial) {
      return Object.assign({
        courseId: 'REGN35P-36P',
        courseLabel: 'REGN 35P/36P',
        kind: 'skills',
        hoursPerInstance: 4,
        openCount: 1,
        open: true,
        slotId: 's'
      }, partial);
    }
    var fairSeats = [0, 1, 2, 3].map(function (i) {
      return seat({
        slotId: 'fair' + i,
        seriesKey: 'skills|once|2026-08-17|skills_fair',
        seriesLabel: 'Skills Fair',
        seriesOnce: true,
        facultyPerInstance: 5
      });
    });
    var skimsSeats = [0, 1, 2].map(function (i) {
      return seat({
        slotId: 'skims' + i,
        seriesKey: 'skills|once|2026-12-07|skims_final',
        seriesLabel: 'Skims Final Evaluation (All Groups) Scheduled',
        seriesOnce: true,
        facultyPerInstance: 4
      });
    });
    var weekly = [0, 1, 2].map(function (i) {
      return seat({
        slotId: 'wk' + i,
        hoursPerInstance: 1.5,
        seriesKey: 'skills|recurring|Monday|1300|1430',
        seriesLabel: 'Skills Lab',
        seriesOnce: false,
        facultyPerInstance: 4
      });
    });
    var groups = groupSlots(fairSeats.concat(skimsSeats).concat(weekly));
    expect(groups.length).toBe(3);
    var html = groups.map(function (g) { return compressedChipHtml(g, { date: '2026-08-24' }); }).join('');
    expect(html).toMatch(/Skills Fair 4hr \(5\)/);
    expect(html).toMatch(/Skills Lab 1\.5hr \(4\)/);
    expect(html).not.toMatch(/\(7\)/);
  });
});
