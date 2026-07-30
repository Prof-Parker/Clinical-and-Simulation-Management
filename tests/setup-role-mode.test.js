/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadIndexHtml, mockEngineerSession } from './ui-dom-harness.js';

var activeSession = null;

vi.mock('../src/auth/user-session.js', () => ({
  init: vi.fn(function () { return Promise.resolve({ needsGate: false }); }),
  getSession: function () { return activeSession; },
  isValidated: function () { return !!activeSession; },
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

var SetupConfig = await import('../src/ui/setup-config/index.js');

var ADVANCED_INPUT_IDS = [
  'cfgClinDays', 'cfgSimDays', 'cfgMaxStudents', 'cfgMaxClinGroup',
  'cfgMaxClinOverload', 'cfgMaxSimSession', 'cfgClinStart', 'cfgSimStart'
];

describe('setup role mode input gating', () => {
  beforeEach(function () {
    loadIndexHtml();
    activeSession = null;
  });

  afterEach(function () {
    vi.restoreAllMocks();
    activeSession = null;
  });

  it('disables advanced config inputs while signed out', function () {
    SetupConfig.applyRoleMode();
    ADVANCED_INPUT_IDS.forEach(function (id) {
      expect(document.getElementById(id).disabled, id).toBe(true);
    });
  });

  it('re-enables advanced config inputs once an editing role signs in', function () {
    SetupConfig.applyRoleMode();
    activeSession = mockEngineerSession();
    SetupConfig.applyRoleMode();
    ADVANCED_INPUT_IDS.forEach(function (id) {
      var el = document.getElementById(id);
      expect(el.disabled, id).toBe(false);
      expect(el.dataset.roleDisabled, id).toBeUndefined();
    });
  });

  it('leaves widget-owned disabled state alone', function () {
    var sel = document.getElementById('leadFacultySelect');
    sel.disabled = true;
    SetupConfig.applyRoleMode();
    activeSession = mockEngineerSession();
    SetupConfig.applyRoleMode();
    expect(sel.disabled).toBe(true);
  });
});
