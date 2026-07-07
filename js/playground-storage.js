/* global App */
var App = App || {};

App.PlaygroundStorage = (function () {
  function suggestedFileName(courseId, season, year) {
    var token = season && year && courseId
      ? (season === 'fall' ? 'F' : 'S') + year + '_' + courseId
      : 'playground';
    return 'user_' + token + '_playground.json';
  }

  function createFromSemester(semester) {
    var copy = JSON.parse(JSON.stringify(App.getFileRoot()));
    copy.meta = copy.meta || {};
    copy.meta.playgroundSource = {
      courseId: semester.meta.courseId,
      semesterName: semester.meta.semesterName,
      copiedAt: new Date().toISOString()
    };
    if (copy.semesters && copy.semesters.length) {
      copy.semesters = [JSON.parse(JSON.stringify(semester))];
      copy.meta.activeSemesterId = copy.semesters[0].id;
    }
    return copy;
  }

  function createFromCourseDefaults(courseId) {
    var fileRoot = App.DataModel.createDefaultFile();
    var sem = fileRoot.semesters[0];
    if (App.CourseDefaults && courseId) {
      App.CourseDefaults.applyToSemester(sem, courseId);
    }
    App.CalendarEngine.rebuildWeeks(sem);
    App.Scheduler.regenerateAll(sem);
    fileRoot.meta.playgroundSource = { courseId: courseId, copiedAt: new Date().toISOString() };
    return fileRoot;
  }

  function serialize(fileRoot) {
    fileRoot.meta.lastModified = new Date().toISOString();
    return JSON.stringify(fileRoot, null, 2);
  }

  function saveToPicker(fileRoot, suggestedName) {
    if (!App.Storage.supportsFS()) {
      return exportDownload(fileRoot, suggestedName);
    }
    return window.showSaveFilePicker({
      suggestedName: suggestedName || 'user_playground.json',
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
    }).then(function (handle) {
      return handle.createWritable().then(function (writable) {
        return writable.write(serialize(fileRoot)).then(function () {
          return writable.close();
        });
      }).then(function () { return handle.name; });
    });
  }

  function exportDownload(fileRoot, filename) {
    var blob = new Blob([serialize(fileRoot)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || 'user_playground.json';
    a.click();
    URL.revokeObjectURL(a.href);
    return Promise.resolve(filename);
  }

  function importFromFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        try {
          resolve(App.DataModel.migrateFile(JSON.parse(reader.result)));
        } catch (e) { reject(e); }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  function openImportPicker() {
    if (App.Storage.supportsFS()) {
      return window.showOpenFilePicker({
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
      }).then(function (handles) {
        return handles[0].getFile();
      }).then(function (file) { return importFromFile(file); });
    }
    return new Promise(function (resolve, reject) {
      var input = document.getElementById('importPlaygroundInput');
      if (!input) return reject(new Error('No input'));
      input.onchange = function (e) {
        var file = e.target.files[0];
        input.value = '';
        if (!file) return reject(new Error('No file'));
        importFromFile(file).then(resolve).catch(reject);
      };
      input.click();
    });
  }

  return {
    suggestedFileName: suggestedFileName,
    createFromSemester: createFromSemester,
    createFromCourseDefaults: createFromCourseDefaults,
    saveToPicker: saveToPicker,
    exportDownload: exportDownload,
    importFromFile: importFromFile,
    openImportPicker: openImportPicker
  };
})();
