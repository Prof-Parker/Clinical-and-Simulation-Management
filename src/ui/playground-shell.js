/**
 * Playground app shell — isolated from live clinical/theory course context.
 */

import { state } from '../core/state.js';
import * as TheoryData from '../core/theory-data.js';
import { applyNavShell, updateCourseStatusLabel } from './course-selector.js';
import { getPlaygroundData } from './playground/index.js';
import * as DataModel from '../core/data-model/index.js';
import { courseStatusAriaLabel } from './semester-label.js';

function chromeApi() {
  return import('./chrome.js');
}

export function isPlaygroundShell() {
  return state.appShell === 'playground';
}

export function resolveNavShell() {
  if (state.appShell === 'playground') return 'playground';
  return TheoryData.isTheoryCourseCode(getActiveCourseCodeFromMeta()) ? 'theory' : 'clinical';
}

function getActiveCourseCodeFromMeta() {
  var fileRoot = state.fileRoot;
  if (fileRoot && fileRoot.meta && fileRoot.meta.activeCourseCode) {
    return fileRoot.meta.activeCourseCode;
  }
  return state.data && state.data.meta ? state.data.meta.courseId : null;
}

export function enterPlaygroundShell() {
  state.appShell = 'playground';
  applyNavShell('playground');
  updatePlaygroundStatusLine();
  chromeApi().then(function (m) {
    m.closeMenu();
    m.switchTab('playground-dashboard');
  });
}

export function exitPlaygroundShell() {
  state.appShell = null;
  applyNavShell(resolveNavShell());
  updateCourseStatusLabel();
  chromeApi().then(function (m) {
    m.closeMenu();
    m.switchTab('dashboard');
    m.refresh();
  });
}

export function updatePlaygroundStatusLine() {
  var strong = document.getElementById('contextChipStrong');
  var phaseEl = document.getElementById('contextChipPhase');
  var chip = document.getElementById('contextChip');
  var phaseValue = document.getElementById('contextPhaseValue');
  var data = getPlaygroundData();
  if (!strong) return;
  if (!isPlaygroundShell()) return;
  if (!data || !data.meta) {
    strong.textContent = 'Playground — no file loaded';
    if (phaseEl) phaseEl.textContent = '';
    if (phaseValue) phaseValue.textContent = 'playground';
    if (chip) {
      chip.setAttribute('aria-label', 'Playground, no file loaded');
      chip.removeAttribute('title');
    }
    return;
  }
  var parts = DataModel.parseSemesterDisplay(data);
  var fileBit = state.playgroundFileName ? ' · ' + state.playgroundFileName : '';
  var code = data.meta.courseId || 'Course';
  var seasonLabel = parts.season === 'fall' ? 'Fall' : (parts.season === 'spring' ? 'Spring' : '');
  var semesterText = seasonLabel ? seasonLabel + ' ' + (parts.year || '') : (parts.name || 'Semester');
  strong.textContent = 'Playground · ' + semesterText + ' · ' + code;
  if (phaseEl) phaseEl.textContent = '';
  if (phaseValue) phaseValue.textContent = 'playground';
  if (chip) {
    chip.setAttribute(
      'aria-label',
      'Playground, ' + courseStatusAriaLabel(parts, data.meta.courseId, '') + fileBit
    );
    if (fileBit) chip.title = 'playground file: ' + state.playgroundFileName;
    else chip.removeAttribute('title');
  }
}
