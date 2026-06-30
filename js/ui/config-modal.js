/* global App */
var App = App || {};
App.UI = App.UI || {};

App.UI.ConfigModal = (function () {
  function init() {
    /* Scheduling configuration lives in Setup tab (SetupConfig module). */
  }

  function open() {
    App.UI.switchTab('setup');
    if (App.UI.SetupConfig) App.UI.SetupConfig.openAdvanced();
  }

  function openForNewSemester() {
    if (App.UI.SetupConfig) App.UI.SetupConfig.beginNewSemesterFlow();
  }

  function close() {}

  function save() {}

  return { open: open, openForNewSemester: openForNewSemester, close: close, save: save, init: init };
})();
