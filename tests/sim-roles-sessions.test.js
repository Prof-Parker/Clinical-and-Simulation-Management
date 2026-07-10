import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSimRoleSessions, buildSimSummaryLabel } from '../src/ui/sim-roles.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mockPath = join(__dirname, '..', 'mock-onedrive', 'semesters', 'F2026_REGN_program.json');

function loadF2026() {
  const program = JSON.parse(readFileSync(mockPath, { encoding: 'utf8' }));
  const activeId = program.meta && program.meta.activeSemesterId;
  return program.semesters.find(function (s) { return s.id === activeId; }) || program.semesters[0];
}

describe('sim roles session filters', () => {
  it('builds week-based session labels from the program sim calendar', () => {
    const sem = loadF2026();
    const sessions = buildSimRoleSessions(sem, 1);
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions[0].label).toMatch(/Monday|Tue/);
    expect(sessions[0].label).toMatch(/Week \d+/);
    expect(sessions[0].hostGroup).toMatch(/^SG\d+$/);

    const summary = buildSimSummaryLabel(sem, 1);
    expect(summary).toMatch(/^Simulation 1 \(/);
  });
});
