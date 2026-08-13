/**
 * REGN 35 prototype cell mapping (no xlsx required).
 */

import { describe, it, expect } from 'vitest';
import {
  classifyEventTitle,
  parseTimeRange,
  parseGroups,
  parseFacultyTokens,
  siteFromTitle,
  linesToEvents,
  inheritSimGroups,
  SITES,
  ALL_CLINICAL_GROUPS
} from '../scripts/theory/map-35-events.js';

describe('classifyEventTitle', () => {
  it('maps lecture / skills / clinical / sim / orientation', () => {
    expect(classifyEventTitle('MS 35 Lecture').track).toBe('theory');
    expect(classifyEventTitle('35 Lecture').courseCode).toBe('REGN35');
    expect(classifyEventTitle('35P Skills').track).toBe('skills');
    expect(classifyEventTitle('MS MERCY Clinical').track).toBe('clinical');
    expect(classifyEventTitle('35P Simulation-1').track).toBe('simulation');
    expect(classifyEventTitle('Mandatory MERCY Orientation').track).toBe('orientation');
    expect(classifyEventTitle('HOLIDAY').skip).toBe(true);
    expect(classifyEventTitle('No classes').skip).toBe(true);
  });
});

describe('parseTimeRange / parseGroups / parseFacultyTokens', () => {
  it('normalizes spaced HHMM ranges', () => {
    expect(parseTimeRange('0800- 1230')).toEqual({ start: '0800', end: '1230' });
    expect(parseTimeRange('1445 -1700')).toEqual({ start: '1445', end: '1700' });
  });

  it('parses group phrases', () => {
    expect(parseGroups('Group 2')).toEqual(['C2']);
    expect(parseGroups('Groups 1 and 2')).toEqual(['C1', 'C2']);
    expect(parseGroups('(ALL Groups)')).toEqual(ALL_CLINICAL_GROUPS);
    expect(parseGroups('Cardiac I')).toBeNull();
  });

  it('counts Faculty Needed vs Full Time Faculty', () => {
    var mixed = parseFacultyTokens(
      '(Full Time Faculty), Faculty Needed, Faculty Needed, Faculty Needed',
      'skills'
    );
    expect(mixed.length).toBe(4);
    expect(mixed.filter(function (s) { return s.needed; }).length).toBe(3);
    expect(mixed.filter(function (s) { return !s.needed; })[0].name).toBe('Full Time Faculty');
    var needed = parseFacultyTokens('Professor Faculty Needed', 'lecturer');
    expect(needed.length).toBe(1);
    expect(needed[0].needed).toBe(true);
    expect(needed[0].role).toBe('lecturer');
  });
});

describe('siteFromTitle', () => {
  it('maps Mercy and SRMC/RMC clinical titles', () => {
    expect(siteFromTitle('MS MERCY Clinical').id).toBe(SITES.mmcr.id);
    expect(siteFromTitle('SRMC Make up Clinical').id).toBe(SITES.srmc.id);
    expect(siteFromTitle('RMC Clinical').id).toBe(SITES.srmc.id);
    expect(siteFromTitle('MS 35 Lecture')).toBeNull();
  });
});

describe('linesToEvents', () => {
  it('stacks lecture then skills then sim and inherits sim groups', () => {
    var events = linesToEvents([
      'MS 35 Lecture',
      'Cardiac II- Arrhythmias',
      '0800-1205',
      'Professor Full Time Faculty',
      '35P Skills',
      'Groups 1 and 2',
      '1300-1430 (Full Time Faculty),',
      'Faculty Needed, Faculty Needed,',
      'Faculty Needed',
      '35P Simulation-1',
      '1445 -1700 (Full Time Faculty),',
      'Faculty Needed, Faculty Needed,',
      'Faculty Needed'
    ]);
    expect(events.map(function (e) { return e.track; })).toEqual([
      'theory', 'skills', 'simulation'
    ]);
    expect(events[0].description).toContain('Cardiac II');
    expect(events[1].groups).toEqual(['C1', 'C2']);
    expect(events[2].groups).toEqual(['C1', 'C2']);
    expect(events[1].faculty.filter(function (s) { return s.needed; }).length).toBe(3);
  });

  it('merges Mandatory SRMC + Orientation time line', () => {
    var events = linesToEvents([
      'Mandatory SRMC',
      'Orientation 1330-1500',
      'Skills Open Practice',
      '(all groups)',
      '(Full Time Faculty) Faculty Needed'
    ]);
    expect(events[0].title).toBe('Mandatory SRMC Orientation');
    expect(events[0].timeStart).toBe('1330');
    expect(events[0].timeEnd).toBe('1500');
    expect(events[1].track).toBe('skills');
  });
});

describe('inheritSimGroups', () => {
  it('copies skills groups onto same-day sim with no groups', () => {
    var events = [
      { track: 'skills', groups: ['C3', 'C4'] },
      { track: 'simulation', groups: [] }
    ];
    inheritSimGroups(events);
    expect(events[1].groups).toEqual(['C3', 'C4']);
  });
});
