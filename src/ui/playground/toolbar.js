/**
 * Shared playground file toolbar (load, import, save, save as).
 */

import * as CourseDefaults from '../../core/course-defaults.js';
import * as PlaygroundStorage from '../../storage/playground-storage.js';
import * as Setup from '../setup/index.js';
import { LIVE, PLAYGROUND, setSetupScope } from '../setup/scope.js';
import { state, getData } from '../../core/state.js';
import { showAlert } from '../dialogs.js';
import { updatePlaygroundStatusLine } from '../playground-shell.js';
import { getPlaygroundData, renderSetupTab } from './index.js';
import * as PlaygroundDashboard from './dashboard.js';

function flushPlaygroundForm() {
  var data = getPlaygroundData();
  if (!data) return null;
  setSetupScope(PLAYGROUND);
  Setup.collectFromForm(data);
  setSetupScope(LIVE);
  return data;
}

export function updatePlaygroundToolbar(data) {
  var status = document.getElementById('playgroundStatus');
  if (!status) return;
  if (!data) {
    status.textContent = 'No playground loaded. Use the toolbar to copy a semester, load a template, or import a file.';
    return;
  }
  var fileBit = PlaygroundStorage.connectionLabel();
  status.textContent = (data.meta.courseId || 'Course') + ' — ' + (data.meta.semesterName || 'Playground') +
    ' (isolated from live semester file)' +
    (fileBit ? ' · connected: ' + fileBit : '');
}

function afterLoad() {
  updatePlaygroundStatusLine();
  PlaygroundDashboard.render();
  renderSetupTab();
  updatePlaygroundToolbar(getPlaygroundData());
}

function suggestedNameFromData(data) {
  return PlaygroundStorage.suggestedFileName(
    data.meta.courseId,
    data.meta.semesterSeason,
    data.meta.semesterYear
  );
}

function savePlayground(forcePicker) {
  flushPlaygroundForm();
  var root = state.playgroundRoot;
  var data = getPlaygroundData();
  if (!root || !data) {
    showAlert('Playground', 'Nothing to save.');
    return;
  }
  var name = suggestedNameFromData(data);
  var saveFn = forcePicker ? PlaygroundStorage.saveToPicker : PlaygroundStorage.saveCurrent;
  saveFn(root, name).then(function (savedName) {
    state.playgroundDirty = false;
    updatePlaygroundToolbar(data);
    updatePlaygroundStatusLine();
    showAlert('Saved', 'Playground saved as ' + (savedName || name));
  }).catch(function () {});
}

export function initToolbar() {
  var loadSemBtn = document.getElementById('playgroundLoadSemesterBtn');
  var loadCourseBtn = document.getElementById('playgroundLoadCourseBtn');
  var saveBtn = document.getElementById('playgroundSaveBtn');
  var saveAsBtn = document.getElementById('playgroundSaveAsBtn');
  var importBtn = document.getElementById('playgroundImportBtn');
  var select = document.getElementById('playgroundCourseSelect');

  if (select && CourseDefaults) {
    select.innerHTML = CourseDefaults.list().map(function (c) {
      return '<option value="' + c.courseId + '">' + c.displayName + '</option>';
    }).join('');
  }

  if (loadSemBtn) {
    loadSemBtn.addEventListener('click', function () {
      var sem = getData();
      if (!sem) {
        showAlert('Playground', 'Connect a semester file first.');
        return;
      }
      state.playgroundRoot = PlaygroundStorage.createFromSemester(sem);
      state.playgroundDirty = true;
      afterLoad();
    });
  }

  if (loadCourseBtn) {
    loadCourseBtn.addEventListener('click', function () {
      var courseId = select ? select.value : 'REGN15P';
      state.playgroundRoot = PlaygroundStorage.createFromCourseDefaults(courseId);
      state.playgroundDirty = true;
      afterLoad();
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', function () { savePlayground(false); });
  }
  if (saveAsBtn) {
    saveAsBtn.addEventListener('click', function () { savePlayground(true); });
  }

  if (importBtn) {
    importBtn.addEventListener('click', function () {
      PlaygroundStorage.openImportPicker().then(function (root) {
        state.playgroundRoot = root;
        state.playgroundDirty = false;
        afterLoad();
      }).catch(function () {});
    });
  }

  PlaygroundStorage.reconnectHandle().then(function () {
    updatePlaygroundToolbar(getPlaygroundData());
  });
}
