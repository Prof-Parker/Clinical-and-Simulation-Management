/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as UserTemplate from '../src/auth/user-template.js';
import { applyFileMenuGating, canCreateNewFile, canShowSaveAs } from '../src/ui/file-menu-gating.js';
import { buildSaveChoices, DEST } from '../src/ui/hybrid-save-ui.js';
import { state } from '../src/core/state.js';

var projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
var sessionStub = { role: 'program_engineer', validated: true };

vi.mock('../src/auth/user-session.js', () => ({
  getSession: function () { return sessionStub; },
  isValidated: function () { return !!sessionStub; }
}));

vi.mock('../src/storage/program-data.js', () => ({
  isProgramDataConnected: function () { return !!state.programDataDirHandle; },
  supportsDirectoryPicker: function () { return true; }
}));

vi.mock('../src/storage/storage-idb.js', () => ({
  supportsFS: function () { return globalThis.__testSupportsFS !== false; }
}));

function loadMenuDom() {
  var html = readFileSync(join(projectRoot, 'index.html'), 'utf8');
  document.documentElement.innerHTML = html;
}

describe('file role capabilities', () => {
  it('grants files.* matrix per role', () => {
    expect(UserTemplate.canAction('adjunct_faculty', 'files.downloadBackup')).toBe(true);
    expect(UserTemplate.canAction('adjunct_faculty', 'files.openCopy')).toBe(false);
    expect(UserTemplate.canAction('adjunct_faculty', 'files.connectRaw')).toBe(false);

    expect(UserTemplate.canAction('lead_course_faculty', 'files.openCopy')).toBe(true);
    expect(UserTemplate.canAction('lead_course_faculty', 'files.saveAsEscape')).toBe(true);
    expect(UserTemplate.canAction('lead_course_faculty', 'files.saveAs')).toBe(false);

    expect(UserTemplate.canAction('admin_staff', 'files.programData')).toBe(true);
    expect(UserTemplate.canAction('admin_staff', 'files.saveAs')).toBe(true);
    expect(UserTemplate.canAction('admin_staff', 'files.connectRaw')).toBe(false);

    expect(UserTemplate.canAction('program_engineer', 'files.connectRaw')).toBe(true);
    expect(UserTemplate.canAction('program_engineer', 'files.clearStorage')).toBe(true);
  });
});

describe('file-menu-gating', () => {
  beforeEach(() => {
    loadMenuDom();
    globalThis.__testSupportsFS = true;
    state.fileHandle = null;
    state.programDataDirHandle = null;
    sessionStub = { role: 'adjunct_faculty', validated: true };
  });

  it('hides advanced tools for adjunct', () => {
    applyFileMenuGating();
    expect(document.getElementById('exportBtn').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('importBtn').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('saveAsBtn').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('openFileBtn').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('clearStorageBtn').classList.contains('hidden')).toBe(true);
  });

  it('shows engineer advanced tools when FS is available', () => {
    sessionStub = { role: 'program_engineer', validated: true };
    applyFileMenuGating();
    expect(document.getElementById('menuFileAdvancedGroup').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('openFileBtn').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('menuFileEngineerNote').classList.contains('hidden')).toBe(false);
    expect(canCreateNewFile()).toBe(true);
  });

  it('marks danger zone classic when FS unavailable', () => {
    globalThis.__testSupportsFS = false;
    applyFileMenuGating();
    var zone = document.getElementById('menuFileDangerZone');
    expect(zone.classList.contains('is-classic')).toBe(true);
    expect(document.getElementById('menuFileClassicGuide').classList.contains('hidden')).toBe(false);
  });

  it('allows lead Save as only when Sync is not linked', () => {
    sessionStub = { role: 'lead_course_faculty', validated: true };
    state.fileHandle = null;
    expect(canShowSaveAs()).toBe(true);
    state.fileHandle = { name: 'F2026.json' };
    expect(canShowSaveAs()).toBe(false);
  });
});

describe('hybrid-save choice order', () => {
  it('lists folder and overwrite before create new', () => {
    var choices = buildSaveChoices({
      supportsFS: true,
      supportsDirectory: true,
      allowDownload: true,
      allowCreateNew: true,
      suggestedName: 'F2026_REGN_program.json'
    });
    var dests = choices.map(function (c) { return c.dest; });
    expect(dests.indexOf(DEST.FOLDER)).toBe(0);
    expect(dests.indexOf(DEST.OVERWRITE)).toBeLessThan(dests.indexOf(DEST.NEW));
    expect(dests.indexOf(DEST.DOWNLOAD)).toBeLessThan(dests.indexOf(DEST.NEW));
    expect(choices.find(function (c) { return c.dest === DEST.NEW; }).danger).toBe(true);
    expect(choices.find(function (c) { return c.dest === DEST.FOLDER; }).primary).toBe(true);
  });

  it('omits Create new when allowCreateNew is false', () => {
    var choices = buildSaveChoices({
      supportsFS: true,
      supportsDirectory: true,
      allowDownload: true,
      allowCreateNew: false
    });
    expect(choices.some(function (c) { return c.dest === DEST.NEW; })).toBe(false);
  });
});
