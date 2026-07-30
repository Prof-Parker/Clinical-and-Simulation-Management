/* eslint-disable no-console */
import { describe, it, expect } from 'vitest';
import { PATHS, theoryLibraryPath, playgroundPath, semesterPath, userCredentialPath } from '../src/storage/program-data.js';

describe('program-data paths', () => {
  it('exposes layout path constants', () => {
    expect(PATHS.REGISTRY).toBe('users/users-registry.json');
    expect(PATHS.CLINICAL_SITES).toBe('clinical-sites-library.json');
    expect(PATHS.SEMESTERS_DIR).toBe('semesters');
    expect(PATHS.PLAYGROUNDS_DIR).toBe('playgrounds');
  });

  it('builds relative paths', () => {
    expect(theoryLibraryPath('REGN15')).toBe('theory-content-library_REGN15.json');
    expect(playgroundPath('user_F2026_REGN15P_playground.json'))
      .toBe('playgrounds/user_F2026_REGN15P_playground.json');
    expect(semesterPath('F2026_REGN_program.json')).toBe('semesters/F2026_REGN_program.json');
    expect(userCredentialPath('engineer.user.json')).toBe('users/engineer.user.json');
  });
});
