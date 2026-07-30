/* eslint-disable no-console */
import { describe, it, expect, vi } from 'vitest';
import { DEST, isAbortError, isCancelError } from '../src/ui/hybrid-save-ui.js';
import { suggestedNameOf, ensureReadwritePermission, writeSuggestedNameInDirectory } from '../src/storage/hybrid-save.js';
import { writeTextToHandle } from '../src/storage/guarded-write.js';
import * as FileKind from '../src/core/file-kind.js';

describe('hybrid-save', () => {
  it('exports destination tokens', () => {
    expect(DEST.NEW).toBe('new');
    expect(DEST.OVERWRITE).toBe('overwrite');
    expect(DEST.FOLDER).toBe('folder');
    expect(DEST.DOWNLOAD).toBe('download');
  });

  it('suggestedNameOf resolves string or function', () => {
    expect(suggestedNameOf({ suggestedName: 'a.json' })).toBe('a.json');
    expect(suggestedNameOf({ suggestedName: function () { return 'b.json'; } })).toBe('b.json');
    expect(suggestedNameOf({})).toBe('data.json');
  });

  it('ensureReadwritePermission returns false for null handle', async () => {
    expect(await ensureReadwritePermission(null)).toBe(false);
  });

  it('isAbortError / isCancelError treat browser abort as cancel', () => {
    expect(isAbortError({ name: 'AbortError' })).toBe(true);
    expect(isAbortError({ message: 'The user aborted a request.' })).toBe(true);
    expect(isCancelError({ name: 'AbortError' })).toBe(true);
    expect(isCancelError(new Error('cancelled'))).toBe(true);
    expect(isCancelError(new Error('other'))).toBe(false);
  });

  it('writeSuggestedNameInDirectory uses getFileHandle with suggested name', async () => {
    var wrote = false;
    var dir = {
      queryPermission: function () { return Promise.resolve('granted'); },
      getFileHandle: vi.fn(function (name, opts) {
        expect(name).toBe('F2026_REGN15P.json');
        expect(opts && opts.create).toBe(true);
        return Promise.resolve({
          name: name,
          queryPermission: function () { return Promise.resolve('granted'); }
        });
      })
    };
    var result = await writeSuggestedNameInDirectory(dir, {
      suggestedName: 'F2026_REGN15P.json',
      write: function () {
        wrote = true;
        return Promise.resolve();
      }
    });
    expect(dir.getFileHandle).toHaveBeenCalled();
    expect(wrote).toBe(true);
    expect(result.name).toBe('F2026_REGN15P.json');
  });

  it('writeTextToHandle uses keepExistingData and truncates to written size', async () => {
    var closed = false;
    var truncatedTo = null;
    var written = null;
    var handle = {
      createWritable: vi.fn(function (opts) {
        expect(opts && opts.keepExistingData).toBe(true);
        return Promise.resolve({
          write: function (blob) {
            written = blob;
            return Promise.resolve();
          },
          truncate: function (size) {
            truncatedTo = size;
            return Promise.resolve();
          },
          close: function () {
            closed = true;
            return Promise.resolve();
          },
          abort: function () { return Promise.resolve(); }
        });
      })
    };
    await writeTextToHandle(handle, '{"ok":true}');
    expect(handle.createWritable).toHaveBeenCalled();
    expect(written).toBeTruthy();
    expect(truncatedTo).toBe(written.size);
    expect(closed).toBe(true);
  });

  it('empty *.user.json hard-blocks program_semester write', async () => {
    var handle = {
      name: 'overwrite-test.user.json',
      getFile: function () {
        return Promise.resolve({ size: 0, text: function () { return Promise.resolve(''); } });
      }
    };
    var g = await FileKind.guardBeforeWrite(handle, FileKind.FILE_KINDS.PROGRAM_SEMESTER);
    expect(g.proceed).toBe(false);
    expect(g.hardBlock).toBe(true);
  });
});
