/**
 * @vitest-environment jsdom
 *
 * Renders theory Master / Lecture / Coordinator views with real calendar content.
 * Prefers gitignored mock-onedrive fixtures when present; otherwise uses a
 * synthetic semester with theory events so CI still catches blank-grid regressions
 * (e.g. missing esc helpers during chip render).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as DataModel from '../src/core/data-model/index.js';
import * as CalendarEngine from '../src/core/calendar-engine.js';
import * as TheoryData from '../src/core/theory-data.js';
import * as TheoryLibrary from '../src/storage/theory-library-storage.js';
import * as SimFacultyStorage from '../src/storage/sim-faculty-storage.js';
import * as Storage from '../src/storage/semester-storage.js';
import { setFileRoot, state } from '../src/core/state.js';
import { switchTab } from '../src/ui/chrome.js';
import { initUI } from '../src/main.js';
import { loadIndexHtml, mockEngineerSession } from './ui-dom-harness.js';

var __dirname = dirname(fileURLToPath(import.meta.url));
var mockSemesterPath = join(__dirname, '..', 'mock-onedrive', 'semesters', 'F2026_REGN_program.json');
var mockLibraryPath = join(__dirname, '..', 'mock-onedrive', 'theory-content-library_REGN15.json');

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

function makeSyntheticProgramWithTheoryEvents() {
  var fileRoot = DataModel.createDefaultFile();
  var sem = fileRoot.semesters[0];
  sem.calendar.semesterStartDate = '2026-08-16';
  CalendarEngine.rebuildWeeks(sem);
  DataModel.migrateSemester(sem);
  sem.theory.days = [
    {
      date: '2026-08-19',
      weekIndex: 0,
      weekday: 'Wed',
      weekLabel: 1,
      isHoliday: false,
      isBreak: false,
      events: [
        {
          id: 'ev_theory_1',
          track: 'theory',
          title: 'REGN15 Syllabus',
          description: '',
          timeStart: '0800',
          timeEnd: '1050',
          moduleCode: '1A',
          moduleRef: null,
          moduleRefs: [],
          faculty: [{ name: 'Faculty Needed', role: 'lecturer', needed: true }],
          categories: ['lecture'],
          contentArea: null,
          facultyRequired: null,
          skillRefs: []
        },
        {
          id: 'ev_skills_1',
          track: 'skills',
          title: 'Skills Lab',
          description: 'Hand hygiene; PPE',
          timeStart: '1200',
          timeEnd: '1550',
          moduleCode: null,
          moduleRef: null,
          moduleRefs: [],
          faculty: [{ name: 'Faculty Needed', role: 'skills', needed: true }],
          categories: [],
          contentArea: null,
          facultyRequired: 2,
          skillRefs: []
        }
      ]
    }
  ];
  TheoryData.migrateTheory(sem);
  if (!fileRoot.meta) fileRoot.meta = {};
  fileRoot.meta.activeCourseCode = 'REGN15';
  fileRoot.meta.activeSemesterId = sem.id;
  return fileRoot;
}

function loadProgramFileRoot() {
  if (existsSync(mockSemesterPath)) {
    var program = JSON.parse(readFileSync(mockSemesterPath, 'utf8'));
    program.semesters.forEach(function (sem) {
      DataModel.migrateSemester(sem);
      if (!sem.calendar || !sem.calendar.weeks || !sem.calendar.weeks.length) {
        CalendarEngine.rebuildWeeks(sem);
      }
    });
    if (!program.meta) program.meta = {};
    if (!program.meta.activeCourseCode) program.meta.activeCourseCode = 'REGN15';
    return { fileRoot: program, source: 'mock-onedrive' };
  }
  return { fileRoot: makeSyntheticProgramWithTheoryEvents(), source: 'synthetic' };
}

function loadTheoryLibraryIfPresent() {
  if (!existsSync(mockLibraryPath)) return false;
  var raw = JSON.parse(readFileSync(mockLibraryPath, 'utf8'));
  state.theoryLibraryRoot = TheoryLibrary.migrateLibrary(raw);
  return true;
}

describe('theory master calendar render (mock-onedrive / synthetic)', () => {
  var source;

  beforeEach(async function () {
    loadIndexHtml();
    vi.spyOn(Storage, 'updateStatusUI').mockImplementation(function () {});
    vi.spyOn(Storage, 'configureImportInput').mockImplementation(function () {});
    vi.spyOn(Storage, '_idbGet').mockResolvedValue(undefined);
    vi.spyOn(Storage, 'shouldShowOnedriveBanner').mockResolvedValue(false);
    vi.spyOn(Storage, 'init').mockImplementation(function () {
      return Promise.resolve(state.fileRoot);
    });

    var loaded = loadProgramFileRoot();
    source = loaded.source;
    setFileRoot(loaded.fileRoot);
    loadTheoryLibraryIfPresent();
    await SimFacultyStorage.init(state.fileRoot);
    expect(function () { initUI(); }).not.toThrow();
  });

  afterEach(function () {
    vi.restoreAllMocks();
    state.theoryLibraryRoot = null;
  });

  it('Master Calendar paints week grid and event chips', function () {
    var theory = state.data && state.data.theory;
    expect(theory).toBeTruthy();
    var eventCount = (theory.days || []).reduce(function (n, d) {
      return n + ((d.events && d.events.length) || 0);
    }, 0);
    expect(eventCount, 'fixture must include theory events (' + source + ')').toBeGreaterThan(0);

    expect(function () { switchTab('theory-master'); }).not.toThrow();

    var grid = document.getElementById('theoryMasterGrid');
    expect(grid).toBeTruthy();
    expect(grid.querySelector('table.theory-master-table'), 'week grid table missing').toBeTruthy();
    expect(grid.querySelectorAll('tr.theory-week-theory-row').length).toBe(18);
    expect(grid.querySelectorAll('tr.theory-week-practicum-row').length).toBe(18);

    var chips = grid.querySelectorAll('[data-event-id], .theory-track');
    expect(chips.length, 'expected event chips in Master Calendar (' + source + ')').toBeGreaterThan(0);
    expect(grid.textContent).toMatch(/Wk\s*1/);

    expect(document.getElementById('theoryTopicLibraryPanel')).toBeTruthy();
    expect(document.getElementById('theoryMasterToolbar')).toBeTruthy();
  });

  it('Lecture Assignments lists rows for theory events', function () {
    expect(function () { switchTab('theory-lecture'); }).not.toThrow();
    var tbody = document.getElementById('theoryLectureTableBody');
    expect(tbody).toBeTruthy();
    var rows = tbody.querySelectorAll('tr');
    expect(rows.length).toBeGreaterThan(0);
    expect(tbody.textContent).not.toMatch(/No lecture assignments in this term/);
  });

  it('Coordinator calendar grid renders with week structure', function () {
    expect(function () { switchTab('theory-coordinator'); }).not.toThrow();
    var grid = document.getElementById('theoryCoordinatorGrid');
    expect(grid).toBeTruthy();
    expect(grid.innerHTML.length).toBeGreaterThan(0);
    expect(grid.textContent).toMatch(/Wk|Week|Lecture/i);
  });
});
