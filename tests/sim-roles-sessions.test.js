import { describe, it, expect } from 'vitest';
import {
  DataModel,
  CalendarEngine,
  Scheduler,
  RosterBalance
} from './_harness.js';
import { buildSimRoleSessions, buildSimSummaryLabel } from '../src/ui/sim-roles.js';

function makeSemester() {
  var cfg = DataModel.normalizeConfig(DataModel.defaultConfig());
  var students = [];
  for (var i = 0; i < 30; i++) {
    students.push(DataModel.createStudent('Student ' + (i + 1), 'C1', 'SG1', 'fac0', ''));
  }
  RosterBalance.rebalance(students, cfg);
  var sem = {
    config: cfg,
    students: students,
    facilities: [{ id: 'fac0', name: 'Facility 1' }],
    faculty: [],
    sections: [],
    holidays: [],
    calendar: { semesterStartDate: '2026-01-12', weeks: [] },
    meta: {}
  };
  CalendarEngine.rebuildWeeks(sem);
  Scheduler.regenerateAll(sem);
  return sem;
}

describe('sim roles session filters', () => {
  it('builds week-based session labels from the program sim calendar', () => {
    const sem = makeSemester();
    const sessions = buildSimRoleSessions(sem, 1);
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions[0].label).toMatch(/Monday|Tue/);
    expect(sessions[0].label).toMatch(/Week \d+/);
    expect(sessions[0].hostGroup).toMatch(/^SG\d+$/);

    const summary = buildSimSummaryLabel(sem, 1);
    expect(summary).toMatch(/^Simulation 1 \(/);
  });
});
