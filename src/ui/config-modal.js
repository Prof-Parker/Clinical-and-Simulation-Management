/**
 * Advanced config modal shortcuts.
 */

import * as SetupConfig from './setup-config/index.js';
import { openSetupModal } from './setup-modal.js';

function init() {
  /* Scheduling configuration lives in Setup tab (SetupConfig module). */
}

function open() {
  openSetupModal({ returnTab: 'practicum' });
  if (SetupConfig) SetupConfig.openAdvanced();
}

function openForNewSemester() {
  if (SetupConfig) SetupConfig.beginNewSemesterFlow();
}

function close() {}

function save() {}

export {
  open,
  openForNewSemester,
  close,
  save,
  init
};
