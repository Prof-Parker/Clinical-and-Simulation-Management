/**
 * Playground sandbox tab.
 */

import * as CourseDefaults from '../core/course-defaults.js';
import * as PlaygroundStorage from '../storage/playground-storage.js';
import * as SetupConfig from './setup-config/index.js';
import { getData } from '../core/state.js';
import { showAlert } from './dialogs.js';

function getPlaygroundData() {
    if (!state.playgroundRoot || !state.playgroundRoot.semesters.length) return null;
    var id = state.playgroundRoot.meta.activeSemesterId;
    return state.playgroundRoot.semesters.find(function (s) { return s.id === id; }) ||
      state.playgroundRoot.semesters[0];
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
    if (SetupConfig.renderIntoPlayground) {
      SetupConfig.renderIntoPlayground(data);
    }
  }

  function loadFromCurrentSemester() {
    var sem = getData();
    if (!sem) {
      showAlert('Playground', 'Connect a semester file first.');
      return;
    }
    state.playgroundRoot = PlaygroundStorage.createFromSemester(sem);
    render();
  }

  function loadFromCourseDefaults() {
    var select = document.getElementById('playgroundCourseSelect');
    var courseId = select ? select.value : 'REGN15P';
    state.playgroundRoot = PlaygroundStorage.createFromCourseDefaults(courseId);
    render();
  }

  function savePlayground() {
    var root = state.playgroundRoot;
    var data = getPlaygroundData();
    if (!root || !data) {
      showAlert('Playground', 'Nothing to save.');
      return;
    }
    var name = PlaygroundStorage.suggestedFileName(
      data.meta.courseId,
      data.meta.semesterSeason,
      data.meta.semesterYear
    );
    PlaygroundStorage.saveToPicker(root, name).then(function (savedName) {
      showAlert('Saved', 'Playground saved as ' + (savedName || name));
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
        PlaygroundStorage.openImportPicker().then(function (root) {
          state.playgroundRoot = root;
          render();
        }).catch(function () {});
      });
    }

    var select = document.getElementById('playgroundCourseSelect');
    if (select && CourseDefaults) {
      select.innerHTML = CourseDefaults.list().map(function (c) {
        return '<option value="' + c.courseId + '">' + c.displayName + '</option>';
      }).join('');
    }
  }

export {
  init,
  render,
  getPlaygroundData
};
