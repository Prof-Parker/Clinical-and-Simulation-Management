import { describe, it, expect } from 'vitest';
import {
  parseSemesterFileName,
  offsetSemester,
  neighborSemesters
} from '../src/ui/semester-window.js';

describe('semester picker helpers', () => {
  it('parses ProgramData semester file names', () => {
    expect(parseSemesterFileName('F2026_REGN15P.json')).toEqual({
      fileName: 'F2026_REGN15P.json',
      season: 'fall',
      year: 2026,
      courseId: 'REGN15P'
    });
    expect(parseSemesterFileName('S2026_REGN15P.json').season).toBe('spring');
    expect(parseSemesterFileName('F2026_REGN_program.json').courseId).toBe('REGN_program');
    expect(parseSemesterFileName('notes.txt')).toBeNull();
  });

  it('offsets seasons across year boundaries', () => {
    expect(offsetSemester('fall', 2026, -1)).toEqual({ season: 'spring', year: 2026 });
    expect(offsetSemester('fall', 2026, -2)).toEqual({ season: 'fall', year: 2025 });
    expect(offsetSemester('fall', 2026, 1)).toEqual({ season: 'spring', year: 2027 });
    expect(offsetSemester('fall', 2026, 2)).toEqual({ season: 'fall', year: 2027 });
    expect(offsetSemester('spring', 2026, -1)).toEqual({ season: 'fall', year: 2025 });
    expect(offsetSemester('spring', 2026, 1)).toEqual({ season: 'fall', year: 2026 });
  });

  it('lists ±2 neighbors excluding current', () => {
    expect(neighborSemesters('fall', 2026, 2)).toEqual([
      { season: 'fall', year: 2025 },
      { season: 'spring', year: 2026 },
      { season: 'spring', year: 2027 },
      { season: 'fall', year: 2027 }
    ]);
  });
});
