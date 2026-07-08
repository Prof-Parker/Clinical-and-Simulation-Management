/**
 * User credential file storage.
 */

import * as Storage from './semester-storage.js';
import * as UserData from '../auth/user-data.js';
import { state } from '../core/state.js';

var CACHE_KEY = 'userProfileData';
  var HANDLE_KEY = 'userProfileFileHandle';
  var META_KEY = 'userProfileMeta';

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

  function getUserFile() {
    return state.userFile;
  }

  function setUserFile(userFile) {
    state.userFile = userFile;
  }

  function isReady() {
    return !!state.userFile;
  }

  function readFromHandle(handle) {
    return handle.getFile().then(function (file) {
      return file.text();
    }).then(function (text) {
      return UserData.migrateUserFile(JSON.parse(text));
    });
  }

  function openFilePicker() {
    if (!supportsFS()) return importViaInput();
    return window.showOpenFilePicker({
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      multiple: false
    }).then(function (handles) {
      var handle = handles[0];
      state.userFileHandle = handle;
      state.userFileName = handle.name;
      return idbSet(HANDLE_KEY, handle).then(function () {
        return readFromHandle(handle);
      }).then(function (userFile) {
        if (!userFile) throw new Error('Invalid user file');
        setUserFile(userFile);
        return idbSet(CACHE_KEY, userFile).then(function () {
          return setMeta({ lastImportedFileName: handle.name, hasLoadedData: true });
        }).then(function () { return userFile; });
      });
    });
  }

  function importViaInput() {
    return new Promise(function (resolve, reject) {
      var input = document.getElementById('importUserFileInput');
      if (!input) return reject(new Error('No import input'));
      input.onchange = function (e) {
        var file = e.target.files[0];
        input.value = '';
        if (!file) return reject(new Error('No file'));
        var reader = new FileReader();
        reader.onload = function () {
          try {
            var userFile = UserData.migrateUserFile(JSON.parse(reader.result));
            if (!userFile) return reject(new Error('Invalid user file'));
            state.userFileHandle = null;
            state.userFileName = file.name;
            setUserFile(userFile);
            idbSet(CACHE_KEY, userFile).then(function () {
              return setMeta({ lastImportedFileName: file.name, hasLoadedData: true });
            }).then(function () { resolve(userFile); }).catch(reject);
          } catch (err) { reject(err); }
        };
        reader.onerror = reject;
        reader.readAsText(file);
      };
      input.click();
    });
  }

  function importFromFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var userFile = UserData.migrateUserFile(JSON.parse(reader.result));
          if (!userFile) return reject(new Error('Invalid user file'));
          resolve(userFile);
        } catch (e) { reject(e); }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    }).then(function (userFile) {
      state.userFileHandle = null;
      state.userFileName = file.name;
      setUserFile(userFile);
      return idbSet(CACHE_KEY, userFile).then(function () {
        return setMeta({ lastImportedFileName: file.name, hasLoadedData: true });
      }).then(function () { return userFile; });
    });
  }

  function reconnectHandle() {
    if (!supportsFS()) return Promise.resolve(null);
    return idbGet(HANDLE_KEY).then(function (handle) {
      if (!handle) return null;
      return handle.queryPermission({ mode: 'readwrite' }).then(function (perm) {
        if (perm !== 'granted') return null;
        state.userFileHandle = handle;
        state.userFileName = handle.name;
        return readFromHandle(handle);
      });
    }).catch(function () { return null; });
  }

  function init() {
    return reconnectHandle().then(function (fromHandle) {
      if (fromHandle) {
        setUserFile(fromHandle);
        return fromHandle;
      }
      return idbGet(CACHE_KEY).then(function (cached) {
        if (cached) setUserFile(UserData.migrateUserFile(cached));
        return getUserFile();
      });
    });
  }

  function clearProfile() {
    state.userFile = null;
    state.userFileHandle = null;
    state.userFileName = null;
    return idbSet(CACHE_KEY, null).then(function () {
      return idbSet(HANDLE_KEY, null);
    }).then(function () {
      return setMeta({ lastImportedFileName: '', hasLoadedData: false });
    });
  }

  function exportUserFileDownload(userFile, filename) {
    var blob = new Blob([UserData.serializeUserFile(userFile)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || (userFile.userId + '.user.json');
    a.click();
    URL.revokeObjectURL(a.href);
  }

export {
  init,
  isReady,
  getUserFile,
  setUserFile,
  openFilePicker,
  importViaInput,
  importFromFile,
  exportUserFileDownload,
  reconnectHandle,
  clearProfile
};
