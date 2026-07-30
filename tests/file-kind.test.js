/* eslint-disable no-console */
import { describe, it, expect } from 'vitest';
import * as FileKind from '../src/core/file-kind.js';

describe('file-kind', () => {
  const K = FileKind.FILE_KINDS;

  function assert(condition, message) {
    expect(condition, message).toBe(true);
  }

  it('infers each kind from fixture shape + filename', () => {
    assert(
      FileKind.inferFileKind({ userId: 'u1' }, 'smith.user.json') === K.USER_CREDENTIAL,
      'user credential shape'
    );
    assert(
      FileKind.inferFileKind({ meta: {}, users: {} }, 'users-registry.json') === K.USERS_REGISTRY,
      'registry shape'
    );
    assert(
      FileKind.inferFileKind({ meta: {}, topics: [] }, 'theory-content-library_REGN15.json') ===
        K.THEORY_CONTENT_LIBRARY,
      'theory library shape'
    );
    assert(
      FileKind.inferFileKind({ meta: {}, sites: [] }, 'clinical-sites-library.json') ===
        K.CLINICAL_SITES_LIBRARY,
      'sites library shape'
    );
    assert(
      FileKind.inferFileKind(
        { meta: { playgroundSource: { courseId: 'REGN15P' } }, semesters: [] },
        'anything.json'
      ) === K.PLAYGROUND,
      'playgroundSource'
    );
    assert(
      FileKind.inferFileKind({ meta: {}, semesters: [] }, 'user_F2026_REGN15P_playground.json') ===
        K.PLAYGROUND,
      'playground filename'
    );
    assert(
      FileKind.inferFileKind({ meta: {}, semesters: [{}] }, 'F2026_REGN_program.json') ===
        K.PROGRAM_SEMESTER,
      'program semester'
    );
  });

  it('disambiguates playground vs program_semester', () => {
    var program = { meta: {}, semesters: [{ id: '1' }] };
    var playground = {
      meta: { playgroundSource: { courseId: 'REGN15P' } },
      semesters: [{ id: '1' }]
    };
    assert(FileKind.inferFileKind(program, 'F2026_REGN15P.json') === K.PROGRAM_SEMESTER, 'program');
    assert(FileKind.inferFileKind(playground, 'F2026_REGN15P.json') === K.PLAYGROUND, 'playground meta');
    assert(
      FileKind.inferFileKind(program, 'user_F2026_REGN15P_playground.json') === K.PLAYGROUND,
      'legacy playground by name'
    );
  });

  it('respects explicit meta.fileKind over inference', () => {
    var raw = { meta: { fileKind: K.PLAYGROUND }, semesters: [{}] };
    assert(FileKind.detectFileKind(raw, 'F2026_REGN_program.json') === K.PLAYGROUND, 'stamp wins');
  });

  it('filename accept/reject matrix', () => {
    assert(FileKind.filenameMatchesKind('user_F2026_REGN15P_playground.json', K.PLAYGROUND), 'pg ok');
    assert(!FileKind.filenameMatchesKind('F2026_REGN_program.json', K.PLAYGROUND), 'pg reject program');
    assert(FileKind.filenameConflictsWithKind('F2026_REGN_program.json', K.PLAYGROUND), 'pg conflict');

    assert(FileKind.filenameMatchesKind('F2026_REGN15P.json', K.PROGRAM_SEMESTER), 'sem ok');
    assert(FileKind.filenameMatchesKind('F2026_REGN_program.json', K.PROGRAM_SEMESTER), 'sem program');
    assert(FileKind.filenameConflictsWithKind('user_x_playground.json', K.PROGRAM_SEMESTER), 'sem conflict');

    assert(FileKind.filenameMatchesKind('users-registry.json', K.USERS_REGISTRY), 'registry ok');
    assert(FileKind.filenameConflictsWithKind('other.json', K.USERS_REGISTRY), 'registry warn');

    assert(FileKind.filenameMatchesKind('engineer.user.json', K.USER_CREDENTIAL), 'user ok');
    assert(FileKind.filenameConflictsWithKind('users-registry.json', K.USER_CREDENTIAL), 'user conflict');

    assert(FileKind.filenameMatchesKind('clinical-sites-library.json', K.CLINICAL_SITES_LIBRARY), 'sites');
    assert(FileKind.filenameMatchesKind('theory-content-library_REGN15.json', K.THEORY_CONTENT_LIBRARY), 'theory');
  });

  it('blocks high-risk playground → program_semester', () => {
    var program = { meta: { fileKind: K.PROGRAM_SEMESTER }, semesters: [{}] };
    var result = FileKind.evaluateGuard(program, 'F2026_REGN_program.json', K.PLAYGROUND, {
      suggestedName: 'user_F2026_REGN15P_playground.json'
    });
    assert(result.proceed === false, 'not proceed');
    assert(result.hardBlock === true, 'hard block');
    assert(result.code === FileKind.ERROR_CODES.KIND_PLAYGROUND_TO_PROGRAM, 'code');
  });

  it('guardBeforeWrite blocks playground write onto program fixture', async () => {
    var programJson = JSON.stringify({ meta: {}, semesters: [{ id: 's1' }] });
    var handle = {
      name: 'F2026_REGN_program.json',
      getFile: function () {
        return Promise.resolve({
          size: programJson.length,
          text: function () { return Promise.resolve(programJson); }
        });
      }
    };
    var result = await FileKind.guardBeforeWrite(handle, K.PLAYGROUND, {
      suggestedName: 'user_F2026_REGN15P_playground.json'
    });
    assert(result.proceed === false, 'blocked');
    assert(result.hardBlock === true, 'hard');
  });

  it('guardBeforeWrite allows empty / new file', async () => {
    var handle = {
      name: 'user_F2026_REGN15P_playground.json',
      getFile: function () {
        return Promise.resolve({ size: 0, text: function () { return Promise.resolve(''); } });
      }
    };
    var result = await FileKind.guardBeforeWrite(handle, K.PLAYGROUND);
    assert(result.proceed === true, 'empty ok');
  });

  it('stampFileKind writes meta.fileKind (and root for credentials)', () => {
    var root = { meta: {}, semesters: [] };
    FileKind.stampFileKind(root, K.PROGRAM_SEMESTER);
    assert(root.meta.fileKind === K.PROGRAM_SEMESTER, 'semester stamp');

    var user = { userId: 'u' };
    FileKind.stampFileKind(user, K.USER_CREDENTIAL);
    assert(user.fileKind === K.USER_CREDENTIAL, 'credential stamp');
  });

  it('assertFileKind enforces high-risk matrix pairs', () => {
    var pg = { meta: { playgroundSource: {} }, semesters: [] };
    var check = FileKind.assertFileKind(pg, K.PROGRAM_SEMESTER, { fileName: 'x_playground.json' });
    assert(!check.ok && check.hardBlock, 'program←playground');

    var reg = { meta: {}, users: {} };
    var check2 = FileKind.assertFileKind(reg, K.PROGRAM_SEMESTER, { fileName: 'users-registry.json' });
    assert(!check2.ok && check2.hardBlock, 'program←registry');

    var sem = { meta: {}, semesters: [] };
    var check3 = FileKind.assertFileKind(sem, K.USERS_REGISTRY, { fileName: 'F2026.json' });
    assert(!check3.ok && check3.hardBlock, 'registry←semester');
  });

  it('blocks empty overwrite when filename implies wrong kind', async () => {
    var handle = {
      name: 'overwrite-test.user.json',
      getFile: function () {
        return Promise.resolve({ size: 0, text: function () { return Promise.resolve(''); } });
      }
    };
    var result = await FileKind.guardBeforeWrite(handle, K.PROGRAM_SEMESTER);
    assert(result.proceed === false, 'must not proceed');
    assert(result.hardBlock === true, 'hard block');
    assert(result.detected === K.USER_CREDENTIAL, 'detected from name');
    assert(/already cleared|version history|seed/i.test(result.message || ''), 'wipe hint');
  });

  it('hard-blocks polluted user.json that contains program_semester content', () => {
    var polluted = { meta: { fileKind: K.PROGRAM_SEMESTER }, semesters: [{ id: 's1' }] };
    var result = FileKind.evaluateGuard(polluted, 'overwrite-test.user.json', K.PROGRAM_SEMESTER);
    assert(result.proceed === false, 'not proceed');
    assert(result.hardBlock === true, 'hard block despite matching content kind');
    assert(result.detected === K.USER_CREDENTIAL, 'filename wins for high-risk');
    assert(result.title === 'Wrong file type', 'wrong type title');
  });

  it('hard-blocks polluted program file that contains playground content', () => {
    var polluted = {
      meta: { fileKind: K.PLAYGROUND, playgroundSource: { courseId: 'REGN15P' } },
      semesters: [{ id: 's1' }]
    };
    var result = FileKind.evaluateGuard(polluted, 'F2026_REGN_program.json', K.PLAYGROUND, {
      suggestedName: 'user_F2026_REGN15P_playground.json'
    });
    assert(result.proceed === false, 'not proceed');
    assert(result.hardBlock === true, 'hard block despite matching content kind');
    assert(result.detected === K.PROGRAM_SEMESTER, 'filename wins for high-risk');
    assert(result.code === FileKind.ERROR_CODES.KIND_PLAYGROUND_TO_PROGRAM, 'code');
  });

  it('hard-blocks when getFile rejects using filename only', async () => {
    var handle = {
      name: 'overwrite-test.user.json',
      getFile: function () {
        return Promise.reject(Object.assign(new Error('NotAllowedError'), { name: 'NotAllowedError' }));
      }
    };
    var result = await FileKind.guardBeforeWrite(handle, K.PROGRAM_SEMESTER);
    assert(result.proceed === false, 'must not proceed');
    assert(result.hardBlock === true, 'hard block');
    assert(result.detected === K.USER_CREDENTIAL, 'detected from name');
    assert(result.empty === true, 'treated as empty/unreadable');
  });

  it('hard-blocks playground getFile reject onto program filename', async () => {
    var handle = {
      name: 'F2026_REGN_program.json',
      getFile: function () {
        return Promise.reject(Object.assign(new Error('NotAllowedError'), { name: 'NotAllowedError' }));
      }
    };
    var result = await FileKind.guardBeforeWrite(handle, K.PLAYGROUND, {
      suggestedName: 'user_F2026_REGN15P_playground.json'
    });
    assert(result.proceed === false, 'blocked');
    assert(result.hardBlock === true, 'hard');
    assert(result.detected === K.PROGRAM_SEMESTER, 'from name');
  });
});
