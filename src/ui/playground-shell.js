/**
 * Playground app shell — isolated from live clinical/theory course context.
 */

import { state } from '../core/state.js';
import * as TheoryData from '../core/theory-data.js';
import { applyNavShell, updateCourseStatusLabel } from './course-selector.js';
import { getPlaygroundData } from './playground/index.js';

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
  var defaultTab = resolveNavShell() === 'theory' ? 'theory-master' : 'dashboard';
  chromeApi().then(function (m) {
    m.closeMenu();
    m.switchTab(defaultTab);
    m.refresh();
  });
}

export function updatePlaygroundStatusLine() {
  var trigger = document.getElementById('courseStatusLine');
  if (!trigger || !isPlaygroundShell()) return;
  var data = getPlaygroundData();
  if (!data || !data.meta) {
    trigger.textContent = 'Playground — no file loaded';
    return;
  }
  var season = data.meta.semesterSeason === 'fall' ? 'Fall' : (data.meta.semesterSeason === 'spring' ? 'Spring' : '');
  trigger.textContent = 'Playground · ' + (data.meta.courseId || 'Course') +
    (season ? ' · ' + season + ' ' + (data.meta.semesterYear || '') : '');
}
