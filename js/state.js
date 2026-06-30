/* global App */
var App = App || {};

App.state = {
  fileRoot: null,
  data: null,
  dirty: false,
  fileHandle: null,
  fileName: null,
  saveTimer: null,
  simFacultyRoot: null,
  simFacultyFileHandle: null,
  simFacultyFileName: null,
  simFacultyDirty: false,
  simFacultyReady: false,
  simFacultySaveTimer: null,
  currentTab: 'dashboard',
  listeners: []
};

App.onStateChange = function (fn) {
  App.state.listeners.push(fn);
};

App.syncSemesterToFile = function () {
  if (!App.state.fileRoot || !App.state.data) return;
  var idx = App.state.fileRoot.semesters.findIndex(function (s) {
    return s.id === App.state.data.id;
  });
  if (idx >= 0) App.state.fileRoot.semesters[idx] = App.state.data;
};

App.getFileRoot = function () {
  App.syncSemesterToFile();
  return App.state.fileRoot;
};

App.setFileRoot = function (fileRoot) {
  App.state.fileRoot = fileRoot;
  if (!fileRoot || !fileRoot.semesters || !fileRoot.semesters.length) {
    App.state.data = null;
    return;
  }
  var activeId = fileRoot.meta.activeSemesterId;
  var sem = fileRoot.semesters.find(function (s) { return s.id === activeId; });
  App.state.data = sem || fileRoot.semesters[0];
  if (!sem) fileRoot.meta.activeSemesterId = App.state.data.id;
};

App.switchSemester = function (semesterId) {
  if (!App.state.fileRoot) return;
  App.syncSemesterToFile();
  var sem = App.state.fileRoot.semesters.find(function (s) { return s.id === semesterId; });
  if (!sem) return;
  App.state.fileRoot.meta.activeSemesterId = semesterId;
  App.state.data = sem;
  App.CalendarEngine.rebuildWeeks(sem);
  document.documentElement.classList.toggle('dark', !!App.state.fileRoot.meta.darkMode);
  App.notifyChange();
  App.UI.Dashboard.populateFilters(sem);
  App.UI.refresh();
};

App.addSemester = function (season, year) {
  if (!App.state.fileRoot || !App.state.data) return null;
  App.syncSemesterToFile();
  var cur = App.state.data.meta;
  var nextSeason = season || (cur.semesterSeason === 'spring' ? 'fall' : 'spring');
  var nextYear = year || (nextSeason === 'fall' && cur.semesterSeason === 'spring'
    ? cur.semesterYear
    : (nextSeason === 'spring' && cur.semesterSeason === 'fall' ? cur.semesterYear + 1 : cur.semesterYear));
  var newSem = App.DataModel.createNewSemesterFromTemplate(App.state.data, nextSeason, nextYear);
  App.DataModel.applyConfigToSemester(
    newSem,
    App.DataModel.getSchedulingDefaults(App.state.fileRoot),
    false
  );
  App.Scheduler.regenerateAll(newSem);
  App.state.fileRoot.semesters.push(newSem);
  App.state.fileRoot.meta.activeSemesterId = newSem.id;
  App.state.data = newSem;
  App.notifyChange();
  App.UI.Dashboard.populateFilters(newSem);
  App.UI.refresh();
  return newSem;
};

App.notifyChange = function () {
  App.state.dirty = true;
  App.syncSemesterToFile();
  App.state.listeners.forEach(function (fn) { fn(); });
  if (App.Storage && App.Storage.scheduleAutoSave) App.Storage.scheduleAutoSave();
};

App.notifySimFacultyChange = function () {
  App.state.simFacultyDirty = true;
  App.state.listeners.forEach(function (fn) { fn(); });
  if (App.SimFacultyStorage && App.SimFacultyStorage.scheduleAutoSave) {
    App.SimFacultyStorage.scheduleAutoSave();
  }
};

App.markSimFacultyClean = function () {
  App.state.simFacultyDirty = false;
  App.state.listeners.forEach(function (fn) { fn(); });
};

App.setData = function (data) {
  App.state.data = data;
  App.syncSemesterToFile();
  App.notifyChange();
};

App.getData = function () {
  return App.state.data;
};

App.markClean = function () {
  App.state.dirty = false;
  App.state.listeners.forEach(function (fn) { fn(); });
};
