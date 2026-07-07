/* global App */
var App = App || {};
App.UI = App.UI || {};

App.UI.Playground = (function () {
  function getPlaygroundData() {
    if (!App.state.playgroundRoot || !App.state.playgroundRoot.semesters.length) return null;
    var id = App.state.playgroundRoot.meta.activeSemesterId;
    return App.state.playgroundRoot.semesters.find(function (s) { return s.id === id; }) ||
      App.state.playgroundRoot.semesters[0];
  }

  function render() {
    var panel = document.getElementById('view-playground');
    if (!panel) return;
    var data = getPlaygroundData();
    var status = document.getElementById('playgroundStatus');
    if (!data) {
      if (status) status.textContent = 'No playground loaded. Import a semester or course template below.';
      return;
    }
    if (status) {
      status.textContent = (data.meta.courseId || 'Course') + ' — ' + (data.meta.semesterName || 'Playground') +
        ' (isolated from live semester file)';
    }
    if (App.UI.SetupConfig && App.UI.SetupConfig.renderIntoPlayground) {
      App.UI.SetupConfig.renderIntoPlayground(data);
    }
  }

  function loadFromCurrentSemester() {
    var sem = App.getData();
    if (!sem) {
      App.UI.showAlert('Playground', 'Connect a semester file first.');
      return;
    }
    App.state.playgroundRoot = App.PlaygroundStorage.createFromSemester(sem);
    render();
  }

  function loadFromCourseDefaults() {
    var select = document.getElementById('playgroundCourseSelect');
    var courseId = select ? select.value : 'REGN15P';
    App.state.playgroundRoot = App.PlaygroundStorage.createFromCourseDefaults(courseId);
    render();
  }

  function savePlayground() {
    var root = App.state.playgroundRoot;
    var data = getPlaygroundData();
    if (!root || !data) {
      App.UI.showAlert('Playground', 'Nothing to save.');
      return;
    }
    var name = App.PlaygroundStorage.suggestedFileName(
      data.meta.courseId,
      data.meta.semesterSeason,
      data.meta.semesterYear
    );
    App.PlaygroundStorage.saveToPicker(root, name).then(function (savedName) {
      App.UI.showAlert('Saved', 'Playground saved as ' + (savedName || name));
    }).catch(function () {});
  }

  function init() {
    var loadSemBtn = document.getElementById('playgroundLoadSemesterBtn');
    var loadCourseBtn = document.getElementById('playgroundLoadCourseBtn');
    var saveBtn = document.getElementById('playgroundSaveBtn');
    var importBtn = document.getElementById('playgroundImportBtn');

    if (loadSemBtn) loadSemBtn.addEventListener('click', loadFromCurrentSemester);
    if (loadCourseBtn) loadCourseBtn.addEventListener('click', loadFromCourseDefaults);
    if (saveBtn) saveBtn.addEventListener('click', savePlayground);
    if (importBtn) {
      importBtn.addEventListener('click', function () {
        App.PlaygroundStorage.openImportPicker().then(function (root) {
          App.state.playgroundRoot = root;
          render();
        }).catch(function () {});
      });
    }

    var select = document.getElementById('playgroundCourseSelect');
    if (select && App.CourseDefaults) {
      select.innerHTML = App.CourseDefaults.list().map(function (c) {
        return '<option value="' + c.courseId + '">' + c.displayName + '</option>';
      }).join('');
    }
  }

  return { init: init, render: render, getPlaygroundData: getPlaygroundData };
})();
