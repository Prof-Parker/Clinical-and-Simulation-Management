/**
 * Setup UI scope — live semester vs playground sandbox.
 */

import { getData, notifyChange, state } from '../../core/state.js';

export var LIVE = {
  id: 'live',
  prefix: '',
  viewId: 'view-setup',
  rootId: null,
  isPlayground: false
};

export var PLAYGROUND = {
  id: 'playground',
  prefix: 'pg-',
  viewId: 'view-playground',
  rootId: 'playgroundSetupRoot',
  isPlayground: true
};

var current = LIVE;
var playgroundDataFn = null;

export function setSetupScope(scope) {
  current = scope || LIVE;
}

export function getSetupScope() {
  return current;
}

export function scopeFromElement(el) {
  if (!el) return LIVE;
  if (el.closest('#playgroundSetupRoot')) return PLAYGROUND;
  if (el.closest('#view-setup')) return LIVE;
  return LIVE;
}

export function setPlaygroundDataResolver(fn) {
  playgroundDataFn = fn;
}

export function setupEl(logicalId) {
  return document.getElementById(current.prefix + logicalId);
}

export function setupElIn(scope, logicalId) {
  return document.getElementById(scope.prefix + logicalId);
}

export function scopeRootEl(scope) {
  scope = scope || current;
  if (scope.rootId) return document.getElementById(scope.rootId);
  return document.getElementById(scope.viewId);
}

export function setupQueryAll(logicalContainerId, selector) {
  var c = setupEl(logicalContainerId);
  return c ? c.querySelectorAll(selector) : [];
}

export function resolveScopeData() {
  if (current.isPlayground && playgroundDataFn) return playgroundDataFn();
  return getData();
}

export function resolveScopeFileRoot() {
  if (current.isPlayground) return state.playgroundRoot;
  return state.fileRoot;
}

export function persistScopeChange() {
  if (current.isPlayground) {
    state.playgroundDirty = true;
    return;
  }
  notifyChange();
}

export function syncPlaygroundSemester(data) {
  if (!state.playgroundRoot || !data) return;
  var semesters = state.playgroundRoot.semesters || [];
  if (!semesters.length) {
    state.playgroundRoot.semesters = [data];
    state.playgroundRoot.meta.activeSemesterId = data.id;
    state.playgroundDirty = true;
    return;
  }
  var idx = semesters.findIndex(function (s) {
    return s.id === state.playgroundRoot.meta.activeSemesterId;
  });
  if (idx < 0) idx = 0;
  state.playgroundRoot.semesters[idx] = data;
  state.playgroundDirty = true;
}
