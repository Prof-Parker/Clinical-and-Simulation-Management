/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as DataModel from '../src/core/data-model/index.js';
import * as CalendarEngine from '../src/core/calendar-engine.js';
import * as SimFacultyStorage from '../src/storage/sim-faculty-storage.js';
import * as Storage from '../src/storage/semester-storage.js';
import { setFileRoot, state, getData } from '../src/core/state.js';
import { initUI } from '../src/main.js';
import * as Setup from '../src/ui/setup/index.js';
import { loadIndexHtml, mockEngineerSession } from './ui-dom-harness.js';

var sessionStub = mockEngineerSession();

vi.mock('../src/auth/user-session.js', () => ({
  init: vi.fn(function () {
    return Promise.resolve({ needsGate: false });
  }),
  getSession: function () { return sessionStub; },
  isValidated: function () { return true; },
  validateAndSetSession: vi.fn(),
  requireSession: vi.fn(),
  attribution: vi.fn(function () { return 'Test User'; }),
  clearSession: vi.fn(),
  logout: vi.fn(),
  showGateModal: vi.fn(),
  hideGateModal: vi.fn(),
  initGateUI: vi.fn(),
  getGateStep: vi.fn(),
  updateGateStep: vi.fn()
}));

function prepareSemesterData() {
  var fileRoot = DataModel.createDefaultFile();
  fileRoot.meta.fileVersion = DataModel.FILE_VERSION || fileRoot.meta.fileVersion;
  fileRoot.semesters.forEach(function (sem) {
    DataModel.migrateSemester(sem);
    CalendarEngine.rebuildWeeks(sem);
  });
  setFileRoot(fileRoot);
  return fileRoot;
}

function clickRemove(selector) {
  var btn = document.querySelector(selector);
  expect(btn, 'missing ' + selector).toBeTruthy();
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

describe('setup delete buttons', () => {
  beforeEach(async function () {
    loadIndexHtml();
    vi.spyOn(Storage, 'updateStatusUI').mockImplementation(function () {});
    vi.spyOn(Storage, 'configureImportInput').mockImplementation(function () {});
    vi.spyOn(Storage, '_idbGet').mockResolvedValue(undefined);
    vi.spyOn(Storage, 'shouldShowOnedriveBanner').mockResolvedValue(false);
    vi.spyOn(Storage, 'init').mockImplementation(function () {
      return Promise.resolve(state.fileRoot);
    });
    prepareSemesterData();
    await SimFacultyStorage.init(state.fileRoot);
    initUI();
    await Setup.render(getData());
  });

  afterEach(function () {
    vi.restoreAllMocks();
  });

  it('removes a facility row', async function () {
    var data = getData();
    var before = data.facilities.length;
    expect(before).toBeGreaterThan(1);
    var btn = document.querySelector('#setupFacilities .remove-facility');
    expect(btn).toBeTruthy();
    var facId = btn.getAttribute('data-fac-id');
    btn.click();
    await Setup.render(getData());
    expect(getData().facilities.length).toBe(before - 1);
    expect(document.querySelector('.remove-facility[data-fac-id="' + facId + '"]')).toBeFalsy();
  });

  it('removes a clinical group row', function () {
    var data = getData();
    var before = data.config.clinicalGroups.length;
    expect(before).toBeGreaterThan(1);
    var blocks = document.querySelectorAll('#cfgClinicalGroupsList .clin-group-block');
    var lastBlock = blocks[blocks.length - 1];
    var removeBtn = lastBlock.querySelector('.remove-clin-group');
    expect(removeBtn).toBeTruthy();
    removeBtn.click();
    expect(getData().config.clinicalGroups.length).toBe(before - 1);
    expect(document.querySelectorAll('#cfgClinicalGroupsList .clin-group-block').length).toBe(before - 1);
  });

  it('removes a simulation group row', function () {
    var data = getData();
    var before = data.config.simGroups.length;
    expect(before).toBeGreaterThan(1);
    var rows = document.querySelectorAll('#cfgSimGroupsList .remove-sim-group');
    expect(rows.length).toBeGreaterThan(0);
    rows[rows.length - 1].click();
    expect(getData().config.simGroups.length).toBe(before - 1);
    expect(document.querySelectorAll('#cfgSimGroupsList [data-sim-group-row]').length).toBe(before - 1);
  });
});
