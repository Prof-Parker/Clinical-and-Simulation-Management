/* global App */
var App = App || {};

App.UserStorage = (function () {
  var CACHE_KEY = 'userProfileData';
  var HANDLE_KEY = 'userProfileFileHandle';
  var META_KEY = 'userProfileMeta';

  function idbGet(key) { return App.Storage._idbGet(key); }
  function idbSet(key, val) { return App.Storage._idbSet(key, val); }
  function supportsFS() { return App.Storage && App.Storage.supportsFS(); }

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
    return App.state.userFile;
  }

  function setUserFile(userFile) {
    App.state.userFile = userFile;
  }

  function isReady() {
    return !!App.state.userFile;
  }

  function readFromHandle(handle) {
    return handle.getFile().then(function (file) {
      return file.text();
    }).then(function (text) {
      return App.UserData.migrateUserFile(JSON.parse(text));
    });
  }

  function openFilePicker() {
    if (!supportsFS()) return importViaInput();
    return window.showOpenFilePicker({
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      multiple: false
    }).then(function (handles) {
      var handle = handles[0];
      App.state.userFileHandle = handle;
      App.state.userFileName = handle.name;
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
            var userFile = App.UserData.migrateUserFile(JSON.parse(reader.result));
            if (!userFile) return reject(new Error('Invalid user file'));
            App.state.userFileHandle = null;
            App.state.userFileName = file.name;
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
          var userFile = App.UserData.migrateUserFile(JSON.parse(reader.result));
          if (!userFile) return reject(new Error('Invalid user file'));
          resolve(userFile);
        } catch (e) { reject(e); }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    }).then(function (userFile) {
      App.state.userFileHandle = null;
      App.state.userFileName = file.name;
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
        App.state.userFileHandle = handle;
        App.state.userFileName = handle.name;
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
        if (cached) setUserFile(App.UserData.migrateUserFile(cached));
        return getUserFile();
      });
    });
  }

  function clearProfile() {
    App.state.userFile = null;
    App.state.userFileHandle = null;
    App.state.userFileName = null;
    return idbSet(CACHE_KEY, null).then(function () {
      return idbSet(HANDLE_KEY, null);
    }).then(function () {
      return setMeta({ lastImportedFileName: '', hasLoadedData: false });
    });
  }

  function exportUserFileDownload(userFile, filename) {
    var blob = new Blob([App.UserData.serializeUserFile(userFile)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || (userFile.userId + '.user.json');
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return {
    init: init,
    isReady: isReady,
    getUserFile: getUserFile,
    setUserFile: setUserFile,
    openFilePicker: openFilePicker,
    importViaInput: importViaInput,
    importFromFile: importFromFile,
    exportUserFileDownload: exportUserFileDownload,
    reconnectHandle: reconnectHandle,
    clearProfile: clearProfile
  };
})();
