/**
 * Header context chip + popover — semester, course, and course status.
 */

import { getData, getFileRoot } from '../core/state.js';
import * as DataModel from '../core/data-model/index.js';
import * as TheoryData from '../core/theory-data.js';
import * as Audit from '../audit/audit.js';
import {
  formatCourseCompactLabel,
  formatCourseDisplayLabel
} from './semester-label.js';
import { escapeHtml } from './dialogs.js';
import {
  openSemesterSearchDialog,
  openSemesterFileFallback,
  initSemesterPicker
} from './semester-picker.js';
import {
  listSemesterSelectOptions,
  applySemesterSelectValue
} from './semester-select.js';
import {
  getActiveCourseCode,
  setActiveCourseCode
} from './course-selector.js';
import { isPlaygroundShell } from './playground-shell.js';

function phaseLabel(data) {
  if (!data) return '';
  return String(Audit.getPhase(data) || '').replace(/_/g, ' ').trim();
}

export function updateContextChip() {
  var strong = document.getElementById('contextChipStrong');
  var phaseEl = document.getElementById('contextChipPhase');
  var chip = document.getElementById('contextChip');
  var phaseValue = document.getElementById('contextPhaseValue');
  if (!strong || !chip) return;

  if (isPlaygroundShell()) {
    strong.textContent = 'Playground';
    if (phaseEl) phaseEl.textContent = '';
    if (phaseValue) phaseValue.textContent = 'playground';
    chip.setAttribute('aria-label', 'Playground context');
    return;
  }

  var data = getData();
  if (!data || !data.meta) {
    strong.textContent = 'No semester file connected';
    if (phaseEl) phaseEl.textContent = '';
    if (phaseValue) phaseValue.textContent = '—';
    chip.setAttribute('aria-label', 'Semester and course');
    return;
  }

  var parts = DataModel.parseSemesterDisplay(data);
  var seasonLabel = parts.season === 'fall' ? 'Fall' : (parts.season === 'spring' ? 'Spring' : '');
  var code = getActiveCourseCode() || data.meta.courseId || '—';
  var courseText = formatCourseCompactLabel(code);
  var phase = phaseLabel(data);
  var semesterText = seasonLabel
    ? seasonLabel + ' ' + (parts.year || '')
    : (parts.name || 'Semester');

  if (parts.season === 'fall' || parts.season === 'spring') {
    strong.innerHTML =
      '<span class="season-name season-' + parts.season + '">' + seasonLabel + '</span>' +
      ' <span class="context-chip-year">' + escapeHtml(String(parts.year || '')) + '</span>' +
      '<span class="context-chip-sep"> · </span>' +
      '<span class="context-chip-course">' + escapeHtml(courseText) + '</span>';
  } else {
    strong.textContent = semesterText + ' · ' + courseText;
  }
  if (phaseEl) phaseEl.textContent = phase ? ' · ' + phase : '';
  if (phaseValue) phaseValue.textContent = phase || '—';

  chip.setAttribute(
    'aria-label',
    'Semester and course, ' + semesterText + ', ' + courseText + (phase ? ', ' + phase : '')
  );
}

function fillCourseSelect() {
  var select = document.getElementById('contextCourseSelect');
  var fileRoot = getFileRoot();
  if (!select || !fileRoot) return;
  var options = TheoryData.listCourseOptions(fileRoot);
  var active = getActiveCourseCode();
  select.textContent = '';
  if (!options.length) {
    var empty = document.createElement('option');
    empty.value = '';
    empty.textContent = 'No courses';
    select.appendChild(empty);
    return;
  }
  options.forEach(function (opt) {
    var o = document.createElement('option');
    o.value = opt.code;
    o.textContent = formatCourseDisplayLabel(opt.code);
    if (opt.code === active) o.selected = true;
    select.appendChild(o);
  });
}

function fillSemesterSelect() {
  var select = document.getElementById('contextSemSelect');
  if (!select) return Promise.resolve();
  return listSemesterSelectOptions().then(function (options) {
    select.textContent = '';
    if (!options.length) {
      var empty = document.createElement('option');
      empty.value = '';
      empty.textContent = 'No semesters';
      select.appendChild(empty);
      return;
    }
    options.forEach(function (opt) {
      var o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      if (opt.current) o.selected = true;
      select.appendChild(o);
    });
  });
}

function populateContextPop() {
  fillCourseSelect();
  var phaseValue = document.getElementById('contextPhaseValue');
  if (phaseValue) phaseValue.textContent = phaseLabel(getData()) || '—';
  return fillSemesterSelect();
}

export function closeContextPop() {
  var pop = document.getElementById('contextPop');
  var chip = document.getElementById('contextChip');
  if (pop) pop.classList.add('hidden');
  if (chip) chip.setAttribute('aria-expanded', 'false');
}

export function openContextPop() {
  var pop = document.getElementById('contextPop');
  var chip = document.getElementById('contextChip');
  if (!pop || !chip) return;
  populateContextPop().then(function () {
    pop.classList.remove('hidden');
    chip.setAttribute('aria-expanded', 'true');
  });
}

export function initContextChip() {
  initSemesterPicker();
  var wrap = document.getElementById('contextChipWrap');
  var chip = document.getElementById('contextChip');
  var pop = document.getElementById('contextPop');
  var semSelect = document.getElementById('contextSemSelect');
  var courseSelect = document.getElementById('contextCourseSelect');
  var searchBtn = document.getElementById('contextSearchSemestersBtn');
  var openFileBtn = document.getElementById('contextOpenSemesterFileBtn');
  if (!wrap || !chip || !pop) return;

  chip.addEventListener('click', function (e) {
    e.stopPropagation();
    if (pop.classList.contains('hidden')) openContextPop();
    else closeContextPop();
  });

  pop.addEventListener('click', function (e) {
    e.stopPropagation();
  });

  if (semSelect) {
    semSelect.addEventListener('change', function () {
      applySemesterSelectValue(semSelect.value);
      closeContextPop();
    });
  }

  if (courseSelect) {
    courseSelect.addEventListener('change', function () {
      if (!courseSelect.value) return;
      setActiveCourseCode(courseSelect.value);
      closeContextPop();
    });
  }

  if (searchBtn) {
    searchBtn.addEventListener('click', function () {
      closeContextPop();
      openSemesterSearchDialog();
    });
  }

  if (openFileBtn) {
    openFileBtn.addEventListener('click', function () {
      closeContextPop();
      openSemesterFileFallback();
    });
  }

  document.addEventListener('click', function (e) {
    if (!wrap.contains(e.target)) closeContextPop();
  });

  updateContextChip();
}
