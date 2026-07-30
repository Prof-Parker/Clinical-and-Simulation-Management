/**
 * Header semester picker — ±2 window around the active semester, plus search.
 * Prefers ProgramData/semesters files (login step-3 model).
 * Classic fallback (iPad / no directory picker): current + in-file semesters + file open.
 */

import { state, getData, getFileRoot } from '../core/state.js';
import * as DataModel from '../core/data-model/index.js';
import * as ProgramData from '../storage/program-data.js';
import * as Storage from '../storage/semester-storage.js';
import * as Permissions from '../auth/permissions.js';
import * as SimFacultyStorage from '../storage/sim-faculty-storage.js';
import { showAlert, showConfirm, showDialog } from './dialogs.js';
import { buildSemesterLabelHtml } from './semester-label.js';
import { populateFilters } from './dashboard/index.js';
import {
  parseSemesterFileName,
  neighborSemesters
} from './semester-window.js';

export { parseSemesterFileName, neighborSemesters };
export { offsetSemester } from './semester-window.js';

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** True when ProgramData folder listing is unavailable (iPad / embedded browsers). */
export function useClassicSemesterPicker() {
  return !ProgramData.supportsDirectoryPicker() || !ProgramData.isProgramDataConnected();
}

function currentParts() {
  var data = getData();
  if (!data) return null;
  return DataModel.parseSemesterDisplay(data);
}

function preferredCourseId() {
  var fileRoot = getFileRoot();
  if (fileRoot && fileRoot.meta && fileRoot.meta.activeCourseCode) {
    return fileRoot.meta.activeCourseCode;
  }
  var data = getData();
  return data && data.meta ? data.meta.courseId : '';
}

function pickBestFile(files, season, year, courseId) {
  var matches = files.filter(function (f) {
    return f.season === season && f.year === year;
  });
  if (!matches.length) return null;
  if (courseId) {
    var exact = matches.find(function (f) {
      return String(f.courseId).toLowerCase() === String(courseId).toLowerCase();
    });
    if (exact) return exact;
  }
  return matches[0];
}

function findInFileSemester(season, year) {
  var fileRoot = getFileRoot();
  if (!fileRoot || !fileRoot.semesters) return null;
  return fileRoot.semesters.find(function (sem) {
    var p = DataModel.parseSemesterDisplay(sem);
    return p.season === season && String(p.year) === String(year);
  }) || null;
}

function closeMenu() {
  var menu = document.getElementById('semesterPickerMenu');
  var btn = document.getElementById('semesterPickerBtn');
  if (menu) menu.classList.add('hidden');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

function afterLoad(fileRoot, fileName) {
  var sem = Storage.activateFileRoot(fileRoot, fileName);
  Storage.cacheData(fileRoot);
  if (SimFacultyStorage && SimFacultyStorage.hydrateFromFileRoot) {
    SimFacultyStorage.hydrateFromFileRoot(fileRoot);
  }
  populateFilters(sem);
  if (Permissions && Permissions.apply) Permissions.apply();
  return import('./chrome.js').then(function (chrome) {
    chrome.refresh();
    chrome.updateCourseStatusLine();
    updateSemesterPickerLabel();
  });
}

function loadProgramDataFile(fileName) {
  return Storage.loadFromProgramData(fileName).then(function (fileRoot) {
    return afterLoad(fileRoot, fileName);
  });
}

function loadClassicFile(file) {
  return Storage.importFromFile(file).then(function (fileRoot) {
    state.fileName = file.name;
    return afterLoad(fileRoot, file.name);
  });
}

function openClassicFilePicker() {
  var input = document.getElementById('semesterPickerFileInput');
  if (!input) {
    showAlert('Unavailable', 'Classic semester file picker is not available.');
    return;
  }
  if (Storage.isIOSDevice && Storage.isIOSDevice()) {
    input.removeAttribute('accept');
  }
  input.click();
}

function switchToTarget(target) {
  if (!target) return;
  function go() {
    var currentName = state.fileName || '';
    if (target.fileName && ProgramData.isProgramDataConnected() && target.fileName !== currentName) {
      loadProgramDataFile(target.fileName).catch(function (err) {
        showAlert('Could not open semester', (err && err.message) || 'Invalid semester file.');
      });
      return;
    }
    if (target.semesterId && getData() && target.semesterId !== getData().id) {
      import('./chrome.js').then(function (chrome) {
        chrome.switchSemester(target.semesterId);
        updateSemesterPickerLabel();
      });
      return;
    }
    if (target.fileName && target.fileName === currentName) {
      return;
    }
    showAlert(
      'Semester not found',
      'No semester file for ' +
        (target.season === 'fall' ? 'Fall' : 'Spring') + ' ' + target.year +
        ' was found in ProgramData/semesters.'
    );
  }
  if (state.dirty) {
    showConfirm('Unsaved changes', 'Save or discard changes before switching semester?', go, {
      confirmLabel: 'Switch anyway'
    });
    return;
  }
  go();
}

function buildOptionHtml(opt) {
  var parts = {
    season: opt.season,
    year: String(opt.year),
    finalized: opt.finalized !== false,
    name: (opt.season === 'fall' ? 'Fall' : 'Spring') + ' ' + opt.year
  };
  var available = opt.current || !!(opt.fileName || opt.semesterId);
  var classes = 'semester-picker-option' + (available ? '' : ' semester-picker-option-disabled');
  var attrs = ' role="option" class="' + classes + '"' +
    (opt.current ? ' aria-selected="true"' : '') +
    ' data-season="' + esc(opt.season) + '" data-year="' + esc(opt.year) + '"';
  if (opt.fileName) attrs += ' data-file="' + esc(opt.fileName) + '"';
  if (opt.semesterId) attrs += ' data-semester-id="' + esc(opt.semesterId) + '"';
  if (!available) attrs += ' aria-disabled="true" title="Semester file not found"';
  return '<li' + attrs + '>' + buildSemesterLabelHtml(parts) +
    (opt.current ? ' <span class="semester-picker-current">Current</span>' : '') +
    '</li>';
}

function listInFileOptions(parts) {
  var fileRoot = getFileRoot();
  var activeId = getData() && getData().id;
  if (!fileRoot || !fileRoot.semesters) return [];
  return fileRoot.semesters.map(function (sem) {
    var p = DataModel.parseSemesterDisplay(sem);
    return {
      season: p.season || parts.season,
      year: parseInt(p.year, 10) || parseInt(parts.year, 10),
      fileName: null,
      semesterId: sem.id,
      finalized: !!p.finalized,
      current: sem.id === activeId
    };
  }).filter(function (opt) {
    return opt.season && opt.year;
  });
}

function renderClassicMenu() {
  var menu = document.getElementById('semesterPickerMenu');
  if (!menu) return;
  var parts = currentParts();
  if (!parts || !parts.season || !parts.year) {
    menu.innerHTML = '';
    return;
  }
  var options = listInFileOptions(parts);
  if (!options.length) {
    options.push({
      season: parts.season,
      year: parseInt(parts.year, 10),
      fileName: state.fileName || null,
      semesterId: getData() && getData().id,
      finalized: parts.finalized,
      current: true
    });
  }
  options.sort(function (a, b) {
    if (a.year !== b.year) return a.year - b.year;
    if (a.season === b.season) return 0;
    return a.season === 'spring' ? -1 : 1;
  });
  menu.innerHTML = options.map(buildOptionHtml).join('') +
    '<li role="option" class="semester-picker-option semester-picker-classic" data-classic="1">' +
    'Open semester file…</li>';
}

function renderProgramDataMenu(files) {
  var menu = document.getElementById('semesterPickerMenu');
  if (!menu) return;
  var parts = currentParts();
  if (!parts || !parts.season || !parts.year) {
    menu.innerHTML = '';
    return;
  }
  var courseId = preferredCourseId();
  var year = parseInt(parts.year, 10);
  var neighbors = neighborSemesters(parts.season, year, 2);
  var options = neighbors.map(function (n) {
    var file = pickBestFile(files, n.season, n.year, courseId);
    var inFile = findInFileSemester(n.season, n.year);
    return {
      season: n.season,
      year: n.year,
      fileName: file ? file.fileName : null,
      semesterId: inFile ? inFile.id : null,
      finalized: inFile ? !!(inFile.meta && inFile.meta.finalized) : true,
      current: false
    };
  }).filter(function (opt) {
    return !!(opt.fileName || opt.semesterId);
  });
  options.push({
    season: parts.season,
    year: year,
    fileName: state.fileName || null,
    semesterId: getData() && getData().id,
    finalized: parts.finalized,
    current: true
  });
  options.sort(function (a, b) {
    if (a.year !== b.year) return a.year - b.year;
    if (a.season === b.season) return 0;
    return a.season === 'spring' ? -1 : 1;
  });
  menu.innerHTML = options.map(buildOptionHtml).join('') +
    '<li role="option" class="semester-picker-option semester-picker-search" data-search="1">' +
    'Search other semesters…</li>';
}

function openSearchDialog() {
  showDialog(
    'Search semesters',
    '<p class="dialog-message">Find a semester by year and season. Opens the matching file from ProgramData/semesters when available.</p>' +
      '<label class="section-sub" for="semesterSearchYear">Year</label>' +
      '<input id="semesterSearchYear" type="number" min="2000" max="2100" step="1" ' +
      'value="' + esc((currentParts() && currentParts().year) || new Date().getFullYear()) + '" ' +
      'style="width:100%;margin:0.25rem 0 0.75rem">' +
      '<label class="section-sub" for="semesterSearchSeason">Season</label>' +
      '<select id="semesterSearchSeason" class="select-control" style="width:100%;margin:0.25rem 0">' +
      '<option value="spring">Spring</option>' +
      '<option value="fall">Fall</option>' +
      '</select>',
    function () {
      var yearEl = document.getElementById('semesterSearchYear');
      var seasonEl = document.getElementById('semesterSearchSeason');
      var year = yearEl ? parseInt(yearEl.value, 10) : NaN;
      var season = seasonEl ? seasonEl.value : '';
      if (!year || year < 2000 || (season !== 'spring' && season !== 'fall')) {
        showAlert('Invalid search', 'Enter a valid year and choose Spring or Fall.');
        return;
      }
      var parts = currentParts();
      if (parts && parts.season === season && String(parts.year) === String(year)) {
        return;
      }
      resolveAndSwitch(season, year);
    }
  );
  var seasonEl = document.getElementById('semesterSearchSeason');
  var parts = currentParts();
  if (seasonEl && parts && parts.season) seasonEl.value = parts.season;
  var save = document.getElementById('dialogSave');
  if (save) save.textContent = 'Open';
}

function resolveAndSwitch(season, year) {
  var courseId = preferredCourseId();
  var inFile = findInFileSemester(season, year);
  if (inFile && getData() && inFile.id === getData().id) return;

  function withFiles(files) {
    var file = pickBestFile(files, season, year, courseId);
    switchToTarget({
      season: season,
      year: year,
      fileName: file ? file.fileName : null,
      semesterId: inFile ? inFile.id : null
    });
  }

  if (ProgramData.isProgramDataConnected()) {
    ProgramData.listSemesterFiles().then(function (names) {
      withFiles(names.map(parseSemesterFileName).filter(Boolean));
    }).catch(function () {
      withFiles([]);
    });
    return;
  }
  withFiles([]);
}

export function updateSemesterPickerLabel() {
  var label = document.getElementById('semesterPickerLabel');
  var btn = document.getElementById('semesterPickerBtn');
  var wrap = document.getElementById('semesterPickerWrap');
  if (!label || !btn) return;
  var parts = currentParts();
  if (!parts || !parts.season) {
    label.innerHTML = '';
    btn.classList.add('hidden');
    if (wrap) wrap.classList.add('hidden');
    return;
  }
  label.innerHTML = buildSemesterLabelHtml(parts);
  btn.classList.remove('hidden');
  if (wrap) wrap.classList.remove('hidden');
  var seasonLabel = parts.season === 'fall' ? 'Fall' : 'Spring';
  btn.setAttribute('aria-label', 'Switch semester, ' + seasonLabel + ' ' + parts.year);
  btn.title = seasonLabel + ' ' + parts.year;
  var canSwitch = !!(parts && parts.season) && (
    useClassicSemesterPicker() ||
    ProgramData.isProgramDataConnected() ||
    Permissions.canAction('semester.switch')
  );
  btn.disabled = !canSwitch;
}

function refreshMenuThenOpen() {
  var menu = document.getElementById('semesterPickerMenu');
  var btn = document.getElementById('semesterPickerBtn');
  if (!menu || !btn) return;
  function show() {
    menu.classList.remove('hidden');
    btn.setAttribute('aria-expanded', 'true');
  }
  if (useClassicSemesterPicker()) {
    renderClassicMenu();
    show();
    return;
  }
  ProgramData.listSemesterFiles().then(function (names) {
    renderProgramDataMenu(names.map(parseSemesterFileName).filter(Boolean));
    show();
  }).catch(function () {
    renderClassicMenu();
    show();
  });
}

export function initSemesterPicker() {
  var wrap = document.getElementById('semesterPickerWrap');
  var btn = document.getElementById('semesterPickerBtn');
  var menu = document.getElementById('semesterPickerMenu');
  var fileInput = document.getElementById('semesterPickerFileInput');
  if (!wrap || !btn || !menu) return;

  updateSemesterPickerLabel();

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (btn.disabled) return;
    var open = !menu.classList.contains('hidden');
    if (open) {
      closeMenu();
      return;
    }
    var courseMenu = document.getElementById('courseStatusDropdown');
    var courseBtn = document.getElementById('courseStatusLine');
    if (courseMenu) courseMenu.classList.add('hidden');
    if (courseBtn) courseBtn.setAttribute('aria-expanded', 'false');
    refreshMenuThenOpen();
  });

  menu.addEventListener('click', function (e) {
    var opt = e.target.closest('[role="option"]');
    if (!opt) return;
    e.stopPropagation();
    if (opt.getAttribute('data-classic') === '1') {
      closeMenu();
      function pick() {
        openClassicFilePicker();
      }
      if (state.dirty) {
        showConfirm('Unsaved changes', 'Save or discard changes before opening another semester?', pick, {
          confirmLabel: 'Open anyway'
        });
        return;
      }
      pick();
      return;
    }
    if (opt.getAttribute('data-search') === '1') {
      closeMenu();
      openSearchDialog();
      return;
    }
    if (opt.getAttribute('aria-disabled') === 'true') return;
    if (opt.getAttribute('aria-selected') === 'true') {
      closeMenu();
      return;
    }
    closeMenu();
    switchToTarget({
      season: opt.dataset.season,
      year: parseInt(opt.dataset.year, 10),
      fileName: opt.dataset.file || null,
      semesterId: opt.dataset.semesterId || null
    });
  });

  if (fileInput) {
    fileInput.addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      loadClassicFile(file).catch(function (err) {
        if (err && err.guard && err.guard.detected === 'playground') {
          showAlert('Playground file', 'This is a playground file. Open it from the Playground tab instead.');
        } else {
          showAlert('Invalid file', (err && err.message) || 'Invalid semester file.');
        }
      });
    });
  }

  document.addEventListener('click', function (e) {
    if (!wrap.contains(e.target)) closeMenu();
  });
}
