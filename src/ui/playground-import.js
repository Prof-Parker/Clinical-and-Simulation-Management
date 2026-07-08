/**
 * Import playground into semester.
 */

import * as DataModel from '../core/data-model/index.js';
import * as Permissions from '../auth/permissions.js';
import * as PlaygroundStorage from '../storage/playground-storage.js';
import { getData, setFileRoot } from '../core/state.js';
import { refresh } from './chrome.js';
import { showAlert, showConfirm } from './dialogs.js';

function init() {
    var btn = document.getElementById('importPlaygroundSetupBtn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      if (!Permissions.guard('setup.importPlayground')) return;
      PlaygroundStorage.openImportPicker().then(function (root) {
        var sem = root.semesters && root.semesters[0];
        if (!sem) {
          showAlert('Import', 'Invalid playground file.');
          return;
        }
        showConfirm('Import playground',
          'Create a new semester file from this playground configuration?',
          function () {
            setFileRoot(root);
            state.fileHandle = null;
            state.dirty = true;
            refresh();
            showAlert('Imported', 'Playground loaded as semester data. Save to OneDrive when ready.');
          });
      }).catch(function () {});
    });

    var templateBtn = document.getElementById('createCourseTemplateBtn');
    if (templateBtn) {
      templateBtn.addEventListener('click', function () {
        if (!Permissions.canAction('*')) return;
        var sem = getData();
        if (!sem) return;
        var courseId = sem.meta.courseId || 'REGN15P';
        var payload = {
          courseId: courseId,
          config: DataModel.cloneConfig(sem.config),
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

export {
  init
};
