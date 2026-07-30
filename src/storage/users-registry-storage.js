/**
 * Users registry file storage.
 */

import * as Storage from './semester-storage.js';
import * as UserData from '../auth/user-data.js';
import * as FileKind from '../core/file-kind.js';
import * as ProgramData from './program-data.js';
import { assertKindOrThrow, guardedWrite, writeTextToHandle } from './guarded-write.js';
import { readHandleText } from './fs-handle.js';
import { hybridSave } from './hybrid-save.js';
import { state } from '../core/state.js';

var CACHE_KEY = 'usersRegistryData';
  var HANDLE_KEY = 'usersRegistryFileHandle';
  var DIR_HANDLE_KEY = 'usersRegistryDirHandle';
  var META_KEY = 'usersRegistryMeta';
  var KIND = FileKind.FILE_KINDS.USERS_REGISTRY;

  function idbGet(key) { return Storage._idbGet(key); }
  function idbSet(key, val) { return Storage._idbSet(key, val); }
  function supportsFS() { return Storage && Storage.supportsFS(); }

  function getMeta() {
    return idbGet(META_KEY).then(function (m) {
      return m || { lastImportedFileName: '', hasLoadedData: false };
    });
  }

  function setMeta(partial) {
    return getMeta().then(function (meta) {
      return idbSet(META_KEY, Object.assign({}, meta, partial));
    });
  }

  function getRegistry() {
    return state.usersRegistry;
  }

  function setRegistry(registry) {
    state.usersRegistry = UserData.migrateRegistry(registry);
  }

  function isReady() {
    return !!state.usersRegistry;
  }

  function serialize(registry) {
    FileKind.stampFileKind(registry, KIND);
    return UserData.serializeRegistry(registry);
  }

  function writeToHandle(handle, registry) {
    return guardedWrite(handle, KIND, function () {
      return writeTextToHandle(handle, serialize(registry));
    });
  }

  function readFromHandle(handle) {
    return readHandleText(handle, 'read').then(function (text) {
      return assertKindOrThrow(UserData.migrateRegistry(JSON.parse(text)), KIND, {
        fileName: handle.name,
        suggestedName: 'users-registry.json'
      });
    });
  }

  function persistRegistry(registry) {
    function afterWrite() {
      state.usersRegistryLoadedRevision = registry.meta.revision;
      return idbSet(CACHE_KEY, registry).then(function () {
        return { conflict: false, registry: registry };
      });
    }
    if (state.usersRegistryFileHandle) {
      return writeToHandle(state.usersRegistryFileHandle, registry).then(afterWrite);
    }
    if (ProgramData.isProgramDataConnected()) {
      return ProgramData.writeRelative(
        ProgramData.PATHS.REGISTRY,
        KIND,
        function () { return serialize(registry); }
      ).then(function (result) {
        state.usersRegistryFileHandle = result.handle;
        return idbSet(HANDLE_KEY, result.handle).then(afterWrite);
      });
    }
    return Promise.reject(new Error(
      'Cannot save users-registry.json: reconnect ProgramData or open the registry with write access.'
    ));
  }

  function saveCurrent() {
    var registry = getRegistry();
    if (!registry) return Promise.resolve();
    return persistRegistry(registry).then(function () { return registry; });
  }

  function reloadFromHandle() {
    if (!state.usersRegistryFileHandle) return Promise.resolve(getRegistry());
    return readFromHandle(state.usersRegistryFileHandle).then(function (fresh) {
      setRegistry(fresh);
      return idbSet(CACHE_KEY, fresh).then(function () { return fresh; });
    });
  }

  function mergeSave(localRegistry) {
    return reloadFromHandle().then(function (remote) {
      if (!remote) remote = UserData.createEmptyRegistry();
      var remoteRev = remote.meta.revision || 1;
      var localRev = (localRegistry && localRegistry.meta && localRegistry.meta.revision) || 1;
      if (remoteRev > localRev && state.usersRegistryLoadedRevision != null &&
          state.usersRegistryLoadedRevision < remoteRev) {
        return { conflict: true, remote: remote, local: localRegistry };
      }
      localRegistry.meta.revision = Math.max(remoteRev, localRev) + 1;
      Object.keys(localRegistry.users || {}).forEach(function (uid) {
        remote.users[uid] = localRegistry.users[uid];
      });
      remote.meta.revision = localRegistry.meta.revision;
      if (localRegistry.meta && localRegistry.meta.helpDeskEngineerUserId != null) {
        remote.meta.helpDeskEngineerUserId = String(localRegistry.meta.helpDeskEngineerUserId);
      }
      setRegistry(remote);
      return persistRegistry(remote);
    });
  }

  function importFromRaw(registry, fileName, fileHandle) {
    assertKindOrThrow(registry, KIND, {
      fileName: fileName || 'users-registry.json',
      suggestedName: 'users-registry.json'
    });
    var migrated = UserData.migrateRegistry(registry);
    state.usersRegistryFileHandle = fileHandle || null;
    state.usersRegistryFileName = fileName || 'users-registry.json';
    setRegistry(migrated);
    state.usersRegistryLoadedRevision = migrated.meta.revision;
    var chain = fileHandle ? idbSet(HANDLE_KEY, fileHandle) : Promise.resolve();
    return chain.then(function () {
      return idbSet(CACHE_KEY, migrated);
    }).then(function () {
      return setMeta({ lastImportedFileName: state.usersRegistryFileName, hasLoadedData: true });
    }).then(function () { return migrated; });
  }

  function openFilePicker() {
    // Classic <input type="file"> — one picker. showOpenFilePicker + getFile()
    // often throws NotAllowedError on OneDrive Desktop paths.
    return importViaInput();
  }

  function importViaInput() {
    return new Promise(function (resolve, reject) {
      var input = document.getElementById('importRegistryFileInput');
      if (!input) return reject(new Error('No import input'));
      input.onchange = function (e) {
        var file = e.target.files[0];
        input.value = '';
        if (!file) return reject(new Error('No file'));
        var reader = new FileReader();
        reader.onload = function () {
          try {
            var registry = UserData.migrateRegistry(JSON.parse(reader.result));
            assertKindOrThrow(registry, KIND, {
              fileName: file.name,
              suggestedName: 'users-registry.json'
            });
            state.usersRegistryFileHandle = null;
            state.usersRegistryFileName = file.name;
            setRegistry(registry);
            state.usersRegistryLoadedRevision = registry.meta.revision;
            idbSet(CACHE_KEY, registry).then(function () {
              return setMeta({ lastImportedFileName: file.name, hasLoadedData: true });
            }).then(function () { resolve(registry); }).catch(reject);
          } catch (err) { reject(err); }
        };
        reader.onerror = reject;
        reader.readAsText(file);
      };
      input.click();
    });
  }

  function createFilePicker() {
    if (!supportsFS()) return Promise.reject(new Error('FS API unavailable'));
    var registry = UserData.createEmptyRegistry();
    return hybridSave({
      kind: KIND,
      suggestedName: 'users-registry.json',
      fileHandleKey: HANDLE_KEY,
      dirHandleKey: DIR_HANDLE_KEY,
      idbGet: idbGet,
      idbSet: idbSet,
      getFileHandle: function () { return state.usersRegistryFileHandle; },
      getDirHandle: function () { return state.usersRegistryDirHandle; },
      allowDownload: true,
      write: function (handle) {
        setRegistry(registry);
        return writeToHandle(handle, registry);
      },
      download: function () {
        var blob = new Blob([serialize(registry)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'users-registry.json';
        a.click();
        URL.revokeObjectURL(a.href);
        setRegistry(registry);
      },
      onPersisted: function (handle, dirHandle) {
        if (!handle) return Promise.resolve(registry);
        state.usersRegistryFileHandle = handle;
        state.usersRegistryFileName = handle.name;
        if (dirHandle) state.usersRegistryDirHandle = dirHandle;
        setRegistry(registry);
        state.usersRegistryLoadedRevision = 1;
        return setMeta({ lastImportedFileName: handle.name, hasLoadedData: true }).then(function () {
          return registry;
        });
      }
    }, {
      forceChooser: true,
      title: 'Users registry',
      message: 'Create, overwrite (validated before write), save to a folder, or download.'
    }).then(function () { return registry; });
  }

  function reconnectHandle() {
    if (!supportsFS()) return Promise.resolve(null);
    return idbGet(HANDLE_KEY).then(function (handle) {
      if (!handle) return null;
      return handle.queryPermission({ mode: 'readwrite' }).then(function (perm) {
        if (perm !== 'granted') return null;
        state.usersRegistryFileHandle = handle;
        state.usersRegistryFileName = handle.name;
        return readFromHandle(handle);
      });
    }).catch(function () { return null; });
  }

  function init() {
    return reconnectHandle().then(function (fromHandle) {
      if (fromHandle) {
        setRegistry(fromHandle);
        state.usersRegistryLoadedRevision = fromHandle.meta.revision;
        return fromHandle;
      }
      return idbGet(CACHE_KEY).then(function (cached) {
        if (cached) {
          setRegistry(cached);
          state.usersRegistryLoadedRevision = cached.meta.revision;
        }
        return getRegistry();
      });
    });
  }

  /** Full reset (fresh-device simulation): cached registry, handles, and state. */
  function clearRegistry() {
    state.usersRegistry = null;
    state.usersRegistryFileHandle = null;
    state.usersRegistryFileName = null;
    state.usersRegistryDirHandle = null;
    state.usersRegistryLoadedRevision = null;
    return idbSet(CACHE_KEY, null).then(function () {
      return idbSet(HANDLE_KEY, null);
    }).then(function () {
      return idbSet(DIR_HANDLE_KEY, null);
    }).then(function () {
      return setMeta({ lastImportedFileName: '', hasLoadedData: false });
    });
  }

  function addOrUpdateUser(userId, entry) {
    var registry = getRegistry();
    if (!registry) return;
    registry.users[userId] = entry;
  }

  function removeUser(userId) {
    var registry = getRegistry();
    if (!registry || !registry.users[userId]) return;
    registry.users[userId].status = 'revoked';
  }

export {
  init,
  isReady,
  getRegistry,
  setRegistry,
  openFilePicker,
  createFilePicker,
  importViaInput,
  importFromRaw,
  clearRegistry,
  saveCurrent,
  mergeSave,
  reloadFromHandle,
  addOrUpdateUser,
  removeUser,
  serialize,
  writeToHandle
};
