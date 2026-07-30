/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { state } from '../src/core/state.js';
import * as UserData from '../src/auth/user-data.js';
import * as UsersRegistryStorage from '../src/storage/users-registry-storage.js';
import * as ProgramData from '../src/storage/program-data.js';
import * as Storage from '../src/storage/semester-storage.js';

describe('users-registry-storage durable save', () => {
  beforeEach(function () {
    state.usersRegistry = UserData.createEmptyRegistry();
    state.usersRegistryFileHandle = null;
    state.usersRegistryLoadedRevision = 1;
    state.programDataDirHandle = null;
    vi.spyOn(Storage, '_idbGet').mockResolvedValue(undefined);
    vi.spyOn(Storage, '_idbSet').mockResolvedValue(undefined);
    vi.spyOn(ProgramData, 'isProgramDataConnected').mockReturnValue(false);
  });

  it('rejects mergeSave when there is no writable registry target', async () => {
    await expect(UsersRegistryStorage.mergeSave(state.usersRegistry)).rejects.toThrow(
      /reconnect ProgramData|write access/i
    );
  });
});
