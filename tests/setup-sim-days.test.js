/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as DataModel from '../src/core/data-model/index.js';
import * as CalendarEngine from '../src/core/calendar-engine.js';
import * as SimFacultyStorage from '../src/storage/sim-faculty-storage.js';
import * as Storage from '../src/storage/semester-storage.js';
import { setFileRoot, state } from '../src/core/state.js';
import { switchTab } from '../src/ui/chrome.js';
import * as Setup from '../src/ui/setup/index.js';
import * as SetupConfig from '../src/ui/setup-config/index.js';
import { initUI } from '../src/main.js';
import { loadIndexHtml, mockEngineerSession } from './ui-dom-harness.js';

var sessionStub = mockEngineerSession();

vi.mock('../src/auth/user-session.js', () => ({
  init: vi.fn(function () { return Promise.resolve({ needsGate: false }); }),
  getSession: function () { return sessionStub; },
  isValidated: function () { return true; },
  validateAndSetSession: vi.fn(),
  requireSession: vi.fn(),
  attribution: vi.fn(function () { return 'Test User'; }),
  clearSession: vi.fn(),
  beginUserSwitch: vi.fn(),
  logout: vi.fn(),
  showGateModal: vi.fn(),
  hideGateModal: vi.fn(),
  initGateUI: vi.fn(),
  getGateStep: vi.fn(),
  updateGateStep: vi.fn()
}));

function simDayRows() {
  return document.getElementById('cfgSimDaysList')
    .querySelectorAll('[data-sim-day-row]').length;
}

describe('setup simulation days list', () => {
  beforeEach(async function () {
    loadIndexHtml();
    vi.spyOn(Storage, 'updateStatusUI').mockImplementation(function () {});
    vi.spyOn(Storage, 'configureImportInput').mockImplementation(function () {});
    vi.spyOn(Storage, '_idbGet').mockResolvedValue(undefined);
    vi.spyOn(Storage, 'shouldShowOnedriveBanner').mockResolvedValue(false);
    vi.spyOn(Storage, 'init').mockImplementation(function () {
      return Promise.resolve(state.fileRoot);
    });
    var fileRoot = DataModel.createDefaultFile();
    fileRoot.semesters.forEach(function (sem) {
      DataModel.migrateSemester(sem);
      CalendarEngine.rebuildWeeks(sem);
    });
    setFileRoot(fileRoot);
    await SimFacultyStorage.init(state.fileRoot);
    initUI();
    switchTab('setup');
    Setup.render(state.data);
    SetupConfig.render(state.data);
  });

  afterEach(function () {
    vi.restoreAllMocks();
  });

  it('adds an unused weekday row when Add day is clicked', function () {
    var before = simDayRows();
    document.getElementById('cfgSimDaysList').querySelector('.add-sim-day').click();
    expect(simDayRows()).toBe(before + 1);
    expect(state.data.config.simDays.length).toBe(before + 1);
  });

  it('removes a row when a row remove button is clicked', function () {
    var before = simDayRows();
    document.getElementById('cfgSimDaysList').querySelector('.remove-sim-day').click();
    expect(simDayRows()).toBe(before - 1);
  });
});
