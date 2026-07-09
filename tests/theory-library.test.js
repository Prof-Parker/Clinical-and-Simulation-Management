import { describe, it, expect } from 'vitest';
import * as TheoryLibrary from '../src/storage/theory-library-storage.js';

describe('theory-library.test.js', () => {
  it('creates and migrates empty library', () => {
    var lib = TheoryLibrary.createEmptyLibrary('REGN15');
    expect(lib.meta.courseId).toBe('REGN15');
    expect(lib.topics).toEqual([]);
    var migrated = TheoryLibrary.migrateLibrary({ topics: [{ id: 't1', title: 'Topic' }] });
    expect(migrated.topics.length).toBe(1);
  });
});
