/**
 * Playground sandbox — setup tab and shared data accessors.
 */

import * as Setup from '../setup/index.js';
import { LIVE, PLAYGROUND, setSetupScope, setPlaygroundDataResolver } from '../setup/scope.js';
import { mountPlaygroundSetup, setPlaygroundSetupVisible } from '../playground-setup-mount.js';
import { initRosterDragDrop } from '../setup/roster.js';
import { state } from '../../core/state.js';
import { updatePlaygroundToolbar } from './toolbar.js';

export function getPlaygroundData() {
  if (!state.playgroundRoot || !state.playgroundRoot.semesters.length) return null;
  var id = state.playgroundRoot.meta.activeSemesterId;
  return state.playgroundRoot.semesters.find(function (s) { return s.id === id; }) ||
    state.playgroundRoot.semesters[0];
}

export function renderSetupTab() {
  mountPlaygroundSetup();
  initRosterDragDrop();
  var data = getPlaygroundData();
  updatePlaygroundToolbar(data);
  setPlaygroundSetupVisible(!!data);
  if (!data) return Promise.resolve();
  setSetupScope(PLAYGROUND);
  return Setup.render(data).finally(function () {
    setSetupScope(LIVE);
  });
}

export function init() {
  setPlaygroundDataResolver(getPlaygroundData);
  mountPlaygroundSetup();
}
