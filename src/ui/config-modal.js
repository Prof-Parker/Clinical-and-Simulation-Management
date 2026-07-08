/**
 * Advanced config modal shortcuts.
 */

import * as SetupConfig from './setup-config/index.js';
import { switchTab } from './chrome.js';

function init() {
    /* Scheduling configuration lives in Setup tab (SetupConfig module). */
  }

  function open() {
    switchTab('setup');
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
