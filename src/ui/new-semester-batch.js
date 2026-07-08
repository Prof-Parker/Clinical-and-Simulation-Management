/**
 * Batch new-semester wizard.
 */

import * as CalendarEngine from '../core/calendar-engine.js';
import * as CourseDefaults from '../core/course-defaults.js';
import * as DataModel from '../core/data-model/index.js';
import * as Permissions from '../auth/permissions.js';
import * as Scheduler from '../core/scheduler/index.js';
import * as Setup from './setup/index.js';
import * as Storage from '../storage/semester-storage.js';
import { showAlert } from './dialogs.js';

var wizardState = null;

  function openWizard() {
    if (!Permissions.guard('semester.batchCreate')) return;
    wizardState = {
      season: 'fall',
      year: new Date().getFullYear(),
      startDate: '',
      holidays: [],
      courses: []
    };
    var body = document.getElementById('newSemesterBatchBody');
    if (!body) return;
    body.innerHTML = buildStep1Html();
    bindStep1();
    document.getElementById('newSemesterBatchModal').classList.add('open');
  }

  function closeWizard() {
    document.getElementById('newSemesterBatchModal').classList.remove('open');
    wizardState = null;
  }

  function syncBatchFormToState() {
    var seasonEl = document.getElementById('batchSeason');
    var yearEl = document.getElementById('batchYear');
    var startEl = document.getElementById('batchStartDate');
    if (seasonEl) wizardState.season = seasonEl.value;
    if (yearEl) wizardState.year = parseInt(yearEl.value, 10);
    if (startEl) wizardState.startDate = startEl.value;
  }

  function batchDraftSemester() {
    var fileRoot = DataModel.createDefaultFile();
    var sem = fileRoot.semesters[0];
    sem.meta.semesterSeason = wizardState.season;
    sem.meta.semesterYear = wizardState.year;
    DataModel.applySemesterSeasonYear(sem, wizardState.season, wizardState.year);
    if (wizardState.startDate) sem.calendar.semesterStartDate = wizardState.startDate;
    sem.holidays = JSON.parse(JSON.stringify(wizardState.holidays || []));
    CalendarEngine.rebuildWeeks(sem);
    return sem;
  }

  function renderBatchHolidays() {
    if (!Setup || !Setup.renderHolidays) return;
    syncBatchFormToState();
    var draft = batchDraftSemester();
    Setup.renderHolidays(draft, 'batchHolidays');
    Setup.bindHolidayEditor('batchHolidays', {
      getData: function () {
        syncBatchFormToState();
        var d = batchDraftSemester();
        Setup.collectHolidaysFromDom(d, 'batchHolidays');
        wizardState.holidays = JSON.parse(JSON.stringify(d.holidays || []));
        return d;
      },
      onChange: function (data) {
        wizardState.holidays = JSON.parse(JSON.stringify(data.holidays || []));
        renderBatchHolidays();
      }
    });
  }

  function collectBatchHolidaysFromState() {
    syncBatchFormToState();
    var draft = batchDraftSemester();
    Setup.collectHolidaysFromDom(draft, 'batchHolidays');
    wizardState.holidays = JSON.parse(JSON.stringify(draft.holidays || []));
  }

  function buildStep1Html() {
    var y = new Date().getFullYear();
    var years = '';
    for (var i = y - 1; i <= y + 3; i++) years += '<option value="' + i + '">' + i + '</option>';
    return '<div class="batch-step">' +
      '<p class="section-sub">Shared semester dates and holidays apply to all selected courses.</p>' +
      '<label>Season<select id="batchSeason"><option value="spring">Spring</option>' +
      '<option value="fall" selected>Fall</option></select></label>' +
      '<label>Year<select id="batchYear">' + years + '</select></label>' +
      '<label>Start date<input type="date" id="batchStartDate"></label>' +
      '<div class="setup-holidays-card setup-semester-holidays batch-holidays-card">' +
      '<div class="setup-config-divider"></div>' +
      '<h3 class="section-title" style="margin:0">Holidays &amp; Breaks</h3>' +
      '<div id="batchHolidays" style="margin-top:1rem"></div>' +
      '</div>' +
      '<button type="button" class="btn btn-primary" id="batchNextCoursesBtn">Next: Select courses</button>' +
      '</div>';
  }

  function restoreStep1Fields() {
    document.getElementById('batchSeason').value = wizardState.season;
    document.getElementById('batchYear').value = String(wizardState.year);
    document.getElementById('batchStartDate').value = wizardState.startDate || '';
  }

  function bindStep1() {
    restoreStep1Fields();
    renderBatchHolidays();

    ['batchSeason', 'batchYear', 'batchStartDate'].forEach(function (id) {
      document.getElementById(id).addEventListener('change', function () {
        syncBatchFormToState();
        renderBatchHolidays();
      });
    });

    document.getElementById('batchNextCoursesBtn').addEventListener('click', function () {
      collectBatchHolidaysFromState();
      showStep2();
    });
  }

  function showStep2() {
    var body = document.getElementById('newSemesterBatchBody');
    var courses = CourseDefaults.list();
    var checks = courses.map(function (c) {
      return '<label class="filter-check"><input type="checkbox" data-batch-course="' + c.courseId + '"> ' +
        c.displayName + '</label>';
    }).join('');
    body.innerHTML = '<div class="batch-step">' +
      '<p class="section-sub">Select courses to create semester files for.</p>' +
      checks +
      '<div style="margin-top:1rem;display:flex;gap:0.5rem">' +
      '<button type="button" class="btn" id="batchBackBtn">Back</button>' +
      '<button type="button" class="btn btn-primary" id="batchCreateBtn">Create course files</button>' +
      '</div></div>';
    document.getElementById('batchBackBtn').addEventListener('click', function () {
      body.innerHTML = buildStep1Html();
      bindStep1();
    });
    document.getElementById('batchCreateBtn').addEventListener('click', createFiles);
  }

  function buildSemesterFileRoot(courseId) {
    var fileRoot = DataModel.createDefaultFile();
    fileRoot.meta.revision = 1;
    var sem = fileRoot.semesters[0];
    CourseDefaults.applyToSemester(sem, courseId);
    sem.meta.courseId = courseId;
    sem.meta.semesterSeason = wizardState.season;
    sem.meta.semesterYear = wizardState.year;
    sem.meta.auditPhase = 'setup';
    DataModel.applySemesterSeasonYear(sem, wizardState.season, wizardState.year);
    if (wizardState.startDate) sem.calendar.semesterStartDate = wizardState.startDate;
    sem.holidays = JSON.parse(JSON.stringify(wizardState.holidays || []));
    CalendarEngine.rebuildWeeks(sem);
    Scheduler.regenerateAll(sem);
    return fileRoot;
  }

  function createFiles() {
    var selected = [];
    document.querySelectorAll('[data-batch-course]').forEach(function (el) {
      if (el.checked) selected.push(el.dataset.batchCourse);
    });
    if (!selected.length) {
      showAlert('New semester', 'Select at least one course.');
      return;
    }
    if (Storage.supportsDirectoryPicker()) {
      window.showDirectoryPicker().then(function (dir) {
        return saveAllToDirectory(dir, selected);
      }).then(function () {
        showAlert('Created', 'Created ' + selected.length + ' semester file(s).');
        closeWizard();
      }).catch(function () {});
      return;
    }
    saveSequential(selected, 0);
  }

  function saveAllToDirectory(dirHandle, courseIds) {
    var chain = Promise.resolve();
    courseIds.forEach(function (courseId) {
      chain = chain.then(function () {
        var token = Storage.semesterFileTokenFromMeta(wizardState.season, wizardState.year, courseId);
        var fileRoot = buildSemesterFileRoot(courseId);
        return dirHandle.getFileHandle(token + '.json', { create: true }).then(function (fh) {
          return Storage.writeFileRootToHandle(fh, fileRoot);
        });
      });
    });
    return chain;
  }

  function saveSequential(courseIds, index) {
    if (index >= courseIds.length) {
      showAlert('Created', 'Created ' + courseIds.length + ' semester file(s).');
      closeWizard();
      return;
    }
    var courseId = courseIds[index];
    var token = Storage.semesterFileTokenFromMeta(wizardState.season, wizardState.year, courseId);
    var fileRoot = buildSemesterFileRoot(courseId);
    window.showSaveFilePicker({
      suggestedName: token + '.json',
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
    }).then(function (handle) {
      return Storage.writeFileRootToHandle(handle, fileRoot);
    }).then(function () {
      saveSequential(courseIds, index + 1);
    }).catch(function () {});
  }

  function init() {
    var btn = document.getElementById('newSemesterBatchBtn');
    if (btn) btn.addEventListener('click', openWizard);
    var closeBtn = document.getElementById('newSemesterBatchClose');
    if (closeBtn) closeBtn.addEventListener('click', closeWizard);
  }

export {
  init,
  openWizard
};
