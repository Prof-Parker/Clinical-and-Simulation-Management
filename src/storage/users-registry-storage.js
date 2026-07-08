/**
 * Users registry file storage.
 */

import * as Storage from './semester-storage.js';
import * as UserData from '../auth/user-data.js';
import { state } from '../core/state.js';

var CACHE_KEY = 'usersRegistryData';
  var HANDLE_KEY = 'usersRegistryFileHandle';
  var META_KEY = 'usersRegistryMeta';

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
    return UserData.serializeRegistry(registry);
  }

  function writeToHandle(handle, registry) {
    return handle.createWritable().then(function (writable) {
      return writable.write(serialize(registry)).then(function () {
        return writable.close();
      });
    });
  }

  function readFromHandle(handle) {
    return handle.getFile().then(function (file) {
      return file.text();
    }).then(function (text) {
      return UserData.migrateRegistry(JSON.parse(text));
    });
  }

  function saveCurrent() {
    var registry = getRegistry();
    if (!registry || !state.usersRegistryFileHandle || !supportsFS()) {
      return Promise.resolve();
    }
    return writeToHandle(state.usersRegistryFileHandle, registry).then(function () {
      return idbSet(CACHE_KEY, registry);
    });
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
      setRegistry(remote);
      return writeToHandle(state.usersRegistryFileHandle, remote).then(function () {
        state.usersRegistryLoadedRevision = remote.meta.revision;
        return idbSet(CACHE_KEY, remote).then(function () {
          return { conflict: false, registry: remote };
        });
      });
    });
  }

  function openFilePicker() {
    if (!supportsFS()) return importViaInput();
    return window.showOpenFilePicker({
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      multiple: false
    }).then(function (handles) {
      var handle = handles[0];
      state.usersRegistryFileHandle = handle;
      state.usersRegistryFileName = handle.name;
      return idbSet(HANDLE_KEY, handle).then(function () {
        return readFromHandle(handle);
      }).then(function (registry) {
        setRegistry(registry);
        state.usersRegistryLoadedRevision = registry.meta.revision;
        return idbSet(CACHE_KEY, registry).then(function () {
          return setMeta({ lastImportedFileName: handle.name, hasLoadedData: true });
        }).then(function () { return registry; });
      });
    });
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
    return window.showSaveFilePicker({
      suggestedName: 'users-registry.json',
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
    }).then(function (handle) {
      state.usersRegistryFileHandle = handle;
      state.usersRegistryFileName = handle.name;
      setRegistry(registry);
      return idbSet(HANDLE_KEY, handle).then(function () {
        return writeToHandle(handle, registry).then(function () {
          state.usersRegistryLoadedRevision = 1;
          return setMeta({ lastImportedFileName: handle.name, hasLoadedData: true }).then(function () {
            return registry;
          });
        });
      });
    });
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
  saveCurrent,
  mergeSave,
  reloadFromHandle,
  addOrUpdateUser,
  removeUser,
  serialize,
  writeToHandle
};
