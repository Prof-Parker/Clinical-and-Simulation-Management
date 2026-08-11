/**
 * Workspace rail + contextual subnav — maps destinations to Dash/Cal/Tools/Setup/Libs.
 */

import * as Permissions from '../auth/permissions.js';
import { isPlaygroundShell, enterPlaygroundShell, exitPlaygroundShell } from './playground-shell.js';

/** @type {Record<string, string[]>} */
export var WORKSPACE_TABS = {
  dashboard: ['dashboard'],
  calendars: ['theory-master', 'faculty', 'roles', 'student', 'theory-lecture'],
  tools: ['makeup', 'audit', 'sandbox', 'theory-coordinator'],
  setup: ['setup'],
  libraries: ['users', 'clinical-sites'],
  playground: ['playground-dashboard', 'playground-setup']
};

var SUBNAV_BY_WORKSPACE = {
  calendars: 'calSubnav',
  tools: 'toolsSubnav',
  libraries: 'librariesSubnav',
  playground: 'playgroundSubnav'
};

/** @type {Record<string, string>} */
var lastTabByWorkspace = {};

export function workspaceForTab(tabId) {
  if (tabId === 'sandbox') return 'tools';
  if (tabId === 'playground-dashboard' || tabId === 'playground-setup') return 'playground';
  var keys = Object.keys(WORKSPACE_TABS);
  for (var i = 0; i < keys.length; i++) {
    var ws = keys[i];
    if (ws === 'playground') continue;
    if (WORKSPACE_TABS[ws].indexOf(tabId) >= 0) return ws;
  }
  return 'dashboard';
}

function tabAllowed(tabId) {
  if (tabId === 'sandbox') return Permissions.canTab('playground-dashboard');
  return Permissions.canTab(tabId);
}

function firstAllowedTab(workspace) {
  var tabs = WORKSPACE_TABS[workspace] || [];
  var remembered = lastTabByWorkspace[workspace];
  if (remembered && tabAllowed(remembered) && tabs.indexOf(remembered) >= 0) {
    return remembered;
  }
  for (var i = 0; i < tabs.length; i++) {
    if (tabAllowed(tabs[i])) return tabs[i];
  }
  return null;
}

function hideAllSubnavs() {
  Object.keys(SUBNAV_BY_WORKSPACE).forEach(function (ws) {
    var el = document.getElementById(SUBNAV_BY_WORKSPACE[ws]);
    if (el) el.classList.add('hidden');
  });
}

/**
 * Sync rail + subnav visibility/active state from current tab / playground shell.
 * @param {string} [tabId]
 */
export function syncWorkspaceNav(tabId) {
  var playground = isPlaygroundShell();
  var activeTab = tabId || '';
  var workspace = playground ? 'playground' : workspaceForTab(activeTab);

  if (activeTab && !playground && activeTab !== 'sandbox') {
    lastTabByWorkspace[workspaceForTab(activeTab)] = activeTab;
  }
  if (playground && (activeTab === 'playground-dashboard' || activeTab === 'playground-setup')) {
    lastTabByWorkspace.playground = activeTab;
  }

  document.querySelectorAll('.workspace-rail-btn[data-workspace]').forEach(function (btn) {
    var ws = btn.getAttribute('data-workspace');
    if (playground) {
      // Map playground dash/setup onto Dash/Setup rail; hide Cal/Tools/Libs.
      var show = ws === 'dashboard' || ws === 'setup';
      btn.classList.toggle('hidden', !show);
      btn.disabled = !show;
      if (ws === 'dashboard') {
        btn.classList.toggle('active', activeTab === 'playground-dashboard');
      } else if (ws === 'setup') {
        btn.classList.toggle('active', activeTab === 'playground-setup');
      } else {
        btn.classList.remove('active');
      }
      return;
    }

    var dest = firstAllowedTab(ws);
    btn.classList.toggle('hidden', !dest);
    btn.disabled = !dest;
    btn.classList.toggle('active', ws === workspace);
  });

  hideAllSubnavs();
  var subnavId = playground ? 'playgroundSubnav' : SUBNAV_BY_WORKSPACE[workspace];
  var subnav = subnavId ? document.getElementById(subnavId) : null;
  if (subnav) subnav.classList.remove('hidden');

  document.querySelectorAll('.workspace-subnav .nav-tab[data-tab]').forEach(function (btn) {
    var t = btn.dataset.tab;
    var allowed = tabAllowed(t);
    btn.classList.toggle('hidden', !allowed);
    btn.disabled = !allowed;
    btn.classList.toggle('active', t === activeTab);
  });

  var sandboxBtn = document.querySelector('.workspace-subnav .nav-tab[data-action="sandbox"]');
  if (sandboxBtn && !playground) {
    sandboxBtn.classList.toggle('hidden', !tabAllowed('sandbox'));
    sandboxBtn.disabled = !tabAllowed('sandbox');
    sandboxBtn.classList.remove('active');
  }

  var exitSub = document.getElementById('playgroundExitSubnavBtn');
  if (exitSub) exitSub.classList.toggle('hidden', !playground);
}

/**
 * @param {string} workspace
 * @returns {string|null} tab id, or 'sandbox' to enter playground
 */
export function selectWorkspace(workspace) {
  if (isPlaygroundShell()) {
    if (workspace === 'dashboard') return 'playground-dashboard';
    if (workspace === 'setup') return 'playground-setup';
    return null;
  }
  return firstAllowedTab(workspace);
}

export function applyWorkspaceGating() {
  syncWorkspaceNav(
    (typeof document !== 'undefined' && document.querySelector('.view-panel.active'))
      ? String(document.querySelector('.view-panel.active').id || '').replace(/^view-/, '')
      : ''
  );
}

/**
 * @param {{ switchTab: function(string): void, onSandbox?: function(): void, onExitPlayground?: function(): void }} opts
 */
export function initWorkspaceNav(opts) {
  var switchTab = opts.switchTab;
  var onSandbox = opts.onSandbox || enterPlaygroundShell;
  var onExitPlayground = opts.onExitPlayground || exitPlaygroundShell;

  document.querySelectorAll('.workspace-rail-btn[data-workspace]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var ws = btn.getAttribute('data-workspace');
      var tab = selectWorkspace(ws);
      if (!tab) return;
      if (tab === 'sandbox') {
        onSandbox();
        return;
      }
      switchTab(tab);
    });
  });

  document.querySelectorAll('.workspace-subnav .nav-tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (btn.id === 'playgroundExitSubnavBtn') {
        onExitPlayground();
        return;
      }
      if (btn.dataset.action === 'sandbox' || btn.dataset.tab === 'sandbox') {
        onSandbox();
        return;
      }
      var tab = btn.dataset.tab;
      if (tab) switchTab(tab);
    });
  });
}
