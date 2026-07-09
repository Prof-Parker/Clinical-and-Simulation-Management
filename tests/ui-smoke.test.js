/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  UI_TABS,
  UI_SHELL,
  UI_MENU,
  UI_FILE_INPUTS,
  allRegisteredElementIds,
  flattenModalIds,
  validateRegistry,
  viewIdForTab,
  tabIds
} from '../src/ui/ui-registry.js';
import * as UserTemplate from '../src/auth/user-template.js';
import * as DataModel from '../src/core/data-model/index.js';
import * as CalendarEngine from '../src/core/calendar-engine.js';
import * as SimFacultyStorage from '../src/storage/sim-faculty-storage.js';
import * as Storage from '../src/storage/semester-storage.js';
import { setFileRoot, state } from '../src/core/state.js';
import { switchTab } from '../src/ui/chrome.js';
import { initUI } from '../src/main.js';
import { loadIndexHtml, mockEngineerSession } from './ui-dom-harness.js';

var projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

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

describe('ui-registry contract', () => {
  it('has no duplicate or invalid registry entries', () => {
    expect(validateRegistry()).toEqual([]);
  });

  it('lists every program-engineer tab from user-template', () => {
    var engineer = UserTemplate.getRole('program_engineer');
    expect(engineer).toBeTruthy();
    engineer.tabs.forEach(function (tabId) {
      expect(tabIds()).toContain(tabId);
    });
  });

  it('keeps role tab ids as subsets of the registry', () => {
    UserTemplate.listRoles().forEach(function (role) {
      var def = UserTemplate.getRole(role.id);
      def.tabs.forEach(function (tabId) {
        expect(tabIds()).toContain(tabId);
      });
    });
  });
});

describe('ui-smoke DOM contract', () => {
  beforeEach(function () {
    loadIndexHtml();
  });

  it('index.html contains every registered element id', () => {
    var html = readFileSync(join(projectRoot, 'index.html'), 'utf8');
    var missing = [];
    allRegisteredElementIds().forEach(function (id) {
      var inHtml = html.indexOf('id="' + id + '"') >= 0;
      var inDom = !!document.getElementById(id);
      if (!inHtml && !inDom) missing.push(id);
    });
    expect(missing, 'Add missing ids to index.html or fix ui-registry.js: ' + missing.join(', ')).toEqual([]);
  });

  it('each clinical nav tab has matching view panel', () => {
    UI_TABS.filter(function (t) { return t.shell === 'clinical'; }).forEach(function (tab) {
      var nav = document.querySelector('.nav-tab[data-tab="' + tab.id + '"]');
      var view = document.getElementById(viewIdForTab(tab.id));
      expect(nav, 'nav-tab for ' + tab.id).toBeTruthy();
      expect(view, 'view panel for ' + tab.id).toBeTruthy();
    });
  });

  it('shell, menu, file inputs, and modals are present in the DOM', function () {
    UI_SHELL.concat(UI_MENU, UI_FILE_INPUTS).forEach(function (id) {
      expect(document.getElementById(id), 'missing #' + id).toBeTruthy();
    });
    flattenModalIds().forEach(function (id) {
      expect(document.getElementById(id), 'missing modal #' + id).toBeTruthy();
    });
  });
});

describe('ui-smoke wiring and render', () => {
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
    expect(function () { initUI(); }).not.toThrow();
  });

  afterEach(function () {
    vi.restoreAllMocks();
  });

  it('initUI wires nav tabs (click switches active view)', function () {
    var target = UI_TABS.find(function (t) { return t.id === 'setup'; });
    expect(target).toBeTruthy();
    var btn = document.querySelector('.nav-tab[data-tab="setup"]');
    btn.click();
    expect(document.getElementById('view-setup').classList.contains('active')).toBe(true);
    expect(document.getElementById('view-dashboard').classList.contains('active')).toBe(false);
  });

  it('switchTab activates each tab view without throwing', function () {
    UI_TABS.forEach(function (tab) {
      expect(function () { switchTab(tab.id); }).not.toThrow();
      var view = document.getElementById(viewIdForTab(tab.id));
      expect(view.classList.contains('active'), tab.id + ' should be active').toBe(true);
      tab.anchors.forEach(function (anchorId) {
        expect(document.getElementById(anchorId), tab.id + ' anchor #' + anchorId).toBeTruthy();
      });
    });
  });

  it('menu toggle opens and closes the dropdown', function () {
    var dropdown = document.getElementById('menuDropdown');
    var toggle = document.getElementById('menuToggle');
    expect(dropdown.classList.contains('hidden')).toBe(true);
    toggle.click();
    expect(dropdown.classList.contains('hidden')).toBe(false);
    toggle.click();
    expect(dropdown.classList.contains('hidden')).toBe(true);
  });
});
