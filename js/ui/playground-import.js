/* global App */
var App = App || {};
App.UI = App.UI || {};

App.UI.PlaygroundImport = (function () {
  function init() {
    var btn = document.getElementById('importPlaygroundSetupBtn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      if (!App.Permissions.guard('setup.importPlayground')) return;
      App.PlaygroundStorage.openImportPicker().then(function (root) {
        var sem = root.semesters && root.semesters[0];
        if (!sem) {
          App.UI.showAlert('Import', 'Invalid playground file.');
          return;
        }
        App.UI.showConfirm('Import playground',
          'Create a new semester file from this playground configuration?',
          function () {
            App.setFileRoot(root);
            App.state.fileHandle = null;
            App.state.dirty = true;
            App.UI.refresh();
            App.UI.showAlert('Imported', 'Playground loaded as semester data. Save to OneDrive when ready.');
          });
      }).catch(function () {});
    });

    var templateBtn = document.getElementById('createCourseTemplateBtn');
    if (templateBtn) {
      templateBtn.addEventListener('click', function () {
        if (!App.Permissions.canAction('*')) return;
        var sem = App.getData();
        if (!sem) return;
        var courseId = sem.meta.courseId || 'REGN15P';
        var payload = {
          courseId: courseId,
          config: App.DataModel.cloneConfig(sem.config),
          exportedAt: new Date().toISOString()
        };
        var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'course-defaults_' + courseId + '.json';
        a.click();
        URL.revokeObjectURL(a.href);
      });
    }
  }

  return { init: init };
})();
