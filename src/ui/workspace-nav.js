/**
 * Workspace rail + expand-out flyout — Dash / Cal / Audit / Student / Libs.
 * Flyout opens while navigating the rail; collapses after a destination click or leaving the sidebar.
 */

import * as Permissions from '../auth/permissions.js';
import { isPlaygroundShell, enterPlaygroundShell, exitPlaygroundShell } from './playground-shell.js';

/** @type {Record<string, string[]>} */
export var WORKSPACE_TABS = {
  dashboard: ['dashboard'],
  calendars: ['theory-master', 'practicum', 'faculty', 'sandbox', 'theory-coordinator'],
  audit: ['audit', 'curriculum-crosswalk'],
  student: ['student', 'makeup', 'roles'],
  libraries: ['users', 'clinical-sites', 'theory-content-search'],
  playground: ['playground-dashboard', 'playground-setup']
};

/** Tabs that live under a workspace but are not listed in the flyout. */
var HIDDEN_FLYOUT_TABS = {
  calendars: ['theory-lecture']
};

var WORKSPACE_LABELS = {
  calendars: 'Cal',
  audit: 'Audit',
  student: 'Student',
  libraries: 'Libs',
  playground: 'Sandbox'
};

/** @type {Record<string, string>} */
var lastTabByWorkspace = {};

/** Whether the expand-out flyout is currently shown. */
var flyoutOpen = false;
/** Workspace whose flyout nav is shown while open. */
var flyoutWorkspace = null;
var flyoutLeaveTimer = null;

export function workspaceForTab(tabId) {
  if (tabId === 'sandbox') return 'calendars';
  if (tabId === 'theory-lecture') return 'calendars';
  if (tabId === 'setup') return 'calendars';
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
  if (remembered && tabAllowed(remembered) &&
      (tabs.indexOf(remembered) >= 0 ||
        (HIDDEN_FLYOUT_TABS[workspace] || []).indexOf(remembered) >= 0)) {
    return remembered;
  }
  for (var i = 0; i < tabs.length; i++) {
    if (tabAllowed(tabs[i])) return tabs[i];
  }
  if (workspace === 'calendars' && tabAllowed('theory-lecture') && !tabAllowed('theory-master')) {
    return 'theory-lecture';
  }
  return null;
}

function workspaceHasAllowedTab(workspace) {
  return !!firstAllowedTab(workspace);
}

function workspaceExpands(workspace) {
  return workspace === 'calendars' || workspace === 'audit' ||
    workspace === 'student' || workspace === 'libraries' || workspace === 'playground';
}

function setFlyoutExpanded(on) {
  flyoutOpen = !!on;
  var shell = document.querySelector('.workspace-shell');
  var flyout = document.getElementById('railFlyout');
  if (shell) shell.classList.toggle('rail-expanded', flyoutOpen);
  if (flyout) flyout.classList.toggle('hidden', !flyoutOpen);
}

function collapseFlyout() {
  if (flyoutLeaveTimer) {
    clearTimeout(flyoutLeaveTimer);
    flyoutLeaveTimer = null;
  }
  flyoutOpen = false;
  setFlyoutExpanded(false);
  document.querySelectorAll('.workspace-rail-btn[aria-expanded]').forEach(function (btn) {
    btn.setAttribute('aria-expanded', 'false');
  });
}

function openFlyoutFor(workspace) {
  if (!workspaceExpands(workspace)) {
    collapseFlyout();
    return;
  }
  flyoutWorkspace = workspace;
  setFlyoutExpanded(true);
  paintFlyoutContents(workspace, currentActiveTab());
  document.querySelectorAll('.workspace-rail-btn[data-workspace]').forEach(function (btn) {
    if (!btn.hasAttribute('aria-expanded')) return;
    btn.setAttribute('aria-expanded', btn.getAttribute('data-workspace') === workspace ? 'true' : 'false');
  });
}

function currentActiveTab() {
  var active = document.querySelector('.view-panel.active');
  return active ? String(active.id || '').replace(/^view-/, '') : '';
}

function paintFlyoutContents(workspace, activeTab) {
  var head = document.getElementById('railFlyoutHead');
  if (head) head.textContent = WORKSPACE_LABELS[workspace] || workspace;

  document.querySelectorAll('.rail-flyout-nav').forEach(function (nav) {
    var forWs = nav.getAttribute('data-flyout-workspace');
    nav.classList.toggle('hidden', forWs !== workspace);
  });

  document.querySelectorAll('#railFlyout .rail-flyout-item[data-tab], #railFlyout .rail-flyout-item[data-action]').forEach(function (btn) {
    var t = btn.dataset.tab;
    var action = btn.dataset.action;
    var allowed;
    if (action === 'sandbox' || t === 'sandbox') {
      allowed = tabAllowed('sandbox');
    } else if (t === 'theory-master') {
      allowed = tabAllowed('theory-master') || tabAllowed('theory-lecture');
    } else if (t === 'playground-setup' || t === 'playground-dashboard') {
      allowed = tabAllowed(t);
    } else {
      allowed = t ? tabAllowed(t) : true;
    }
    btn.classList.toggle('hidden', !allowed);
    btn.disabled = !allowed;
    var isActive = t === activeTab ||
      (t === 'theory-master' && (activeTab === 'theory-master' || activeTab === 'theory-lecture')) ||
      (action === 'sandbox' && isPlaygroundShell());
    btn.classList.toggle('active', isActive);
  });

  var exitBtn = document.getElementById('playgroundExitFlyoutBtn');
  if (exitBtn) {
    exitBtn.classList.toggle('hidden', workspace !== 'playground');
  }
}

/**
 * Sync rail + flyout active state from current tab / playground shell.
 * Does not force the flyout open — expand/collapse is interaction-driven.
 * @param {string} [tabId]
 */
export function syncWorkspaceNav(tabId) {
  var playground = isPlaygroundShell();
  var activeTab = tabId || '';
  var workspace = playground ? 'playground' : workspaceForTab(activeTab);

  if (activeTab && !playground && activeTab !== 'sandbox' && activeTab !== 'setup') {
    lastTabByWorkspace[workspaceForTab(activeTab)] = activeTab;
  }
  if (playground && (activeTab === 'playground-dashboard' || activeTab === 'playground-setup')) {
    lastTabByWorkspace.playground = activeTab;
  }

  document.querySelectorAll('.workspace-rail-btn[data-workspace]').forEach(function (btn) {
    var ws = btn.getAttribute('data-workspace');
    if (playground) {
      var show = ws === 'dashboard';
      btn.classList.toggle('hidden', !show);
      btn.disabled = !show;
      btn.classList.toggle('active', ws === 'dashboard');
      if (btn.hasAttribute('aria-expanded')) {
        btn.setAttribute('aria-expanded', flyoutOpen && flyoutWorkspace === 'playground' ? 'true' : 'false');
      }
      return;
    }

    var dest = workspaceHasAllowedTab(ws);
    btn.classList.toggle('hidden', !dest);
    btn.disabled = !dest;
    btn.classList.toggle('active', ws === workspace);
    if (btn.hasAttribute('aria-expanded')) {
      btn.setAttribute('aria-expanded',
        flyoutOpen && workspaceExpands(ws) && flyoutWorkspace === ws ? 'true' : 'false');
    }
  });

  if (playground) {
    if (flyoutOpen) {
      flyoutWorkspace = 'playground';
      paintFlyoutContents('playground', activeTab);
      setFlyoutExpanded(true);
    } else {
      setFlyoutExpanded(false);
    }
  } else if (!flyoutOpen || workspace === 'dashboard') {
    if (workspace === 'dashboard') collapseFlyout();
    else setFlyoutExpanded(false);
  } else {
    flyoutWorkspace = flyoutWorkspace || workspace;
    paintFlyoutContents(flyoutWorkspace, activeTab);
    setFlyoutExpanded(true);
  }

  syncTheoryLectureToggle(activeTab);
}

function syncTheoryLectureToggle(activeTab) {
  var group = document.getElementById('theoryViewToggle');
  if (!group) return;
  var show = activeTab === 'theory-master' || activeTab === 'theory-lecture';
  group.classList.toggle('hidden', !show);
  group.querySelectorAll('[data-theory-view]').forEach(function (btn) {
    var mode = btn.getAttribute('data-theory-view');
    var active = (mode === 'master' && activeTab === 'theory-master') ||
      (mode === 'lecture' && activeTab === 'theory-lecture');
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  var masterOk = tabAllowed('theory-master');
  var lectureOk = tabAllowed('theory-lecture');
  group.querySelectorAll('[data-theory-view="master"]').forEach(function (btn) {
    btn.classList.toggle('hidden', !masterOk);
    btn.disabled = !masterOk;
  });
  group.querySelectorAll('[data-theory-view="lecture"]').forEach(function (btn) {
    btn.classList.toggle('hidden', !lectureOk);
    btn.disabled = !lectureOk;
  });
}

/**
 * @param {string} workspace
 * @returns {string|null} tab id, or 'sandbox' to enter playground
 */
export function selectWorkspace(workspace) {
  if (isPlaygroundShell()) {
    if (workspace === 'dashboard') return 'playground-dashboard';
    return null;
  }
  if (workspace === 'calendars') {
    var first = firstAllowedTab('calendars');
    if (first === 'theory-master' && !tabAllowed('theory-master') && tabAllowed('theory-lecture')) {
      return 'theory-lecture';
    }
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

function clearFlyoutLeaveTimer() {
  if (flyoutLeaveTimer) {
    clearTimeout(flyoutLeaveTimer);
    flyoutLeaveTimer = null;
  }
}

function scheduleFlyoutCollapse() {
  clearFlyoutLeaveTimer();
  flyoutLeaveTimer = setTimeout(function () {
    flyoutLeaveTimer = null;
    collapseFlyout();
  }, 180);
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
      if (isPlaygroundShell()) {
        openFlyoutFor('playground');
        var pgTab = selectWorkspace(ws);
        if (pgTab) switchTab(pgTab);
        return;
      }
      if (ws === 'dashboard' || !workspaceExpands(ws)) {
        collapseFlyout();
      } else {
        openFlyoutFor(ws);
      }
      var tab = selectWorkspace(ws);
      if (!tab) return;
      if (tab === 'sandbox') {
        onSandbox();
        return;
      }
      switchTab(tab);
    });
  });

  document.querySelectorAll('#railFlyout .rail-flyout-item').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (btn.id === 'playgroundExitFlyoutBtn') {
        collapseFlyout();
        onExitPlayground();
        return;
      }
      if (btn.dataset.action === 'sandbox' || btn.dataset.tab === 'sandbox') {
        collapseFlyout();
        onSandbox();
        return;
      }
      var tab = btn.dataset.tab;
      if (tab === 'theory-master' && !tabAllowed('theory-master') && tabAllowed('theory-lecture')) {
        collapseFlyout();
        switchTab('theory-lecture');
        return;
      }
      if (tab) {
        collapseFlyout();
        switchTab(tab);
      }
    });
  });

  document.querySelectorAll('#theoryViewToggle [data-theory-view]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var mode = btn.getAttribute('data-theory-view');
      if (mode === 'master') switchTab('theory-master');
      if (mode === 'lecture') switchTab('theory-lecture');
    });
  });

  var rail = document.getElementById('workspaceRail');
  var flyout = document.getElementById('railFlyout');
  function bindHoverZone(el) {
    if (!el) return;
    el.addEventListener('pointerenter', clearFlyoutLeaveTimer);
    el.addEventListener('pointerleave', scheduleFlyoutCollapse);
    el.addEventListener('focusin', clearFlyoutLeaveTimer);
    el.addEventListener('focusout', function (e) {
      var next = e.relatedTarget;
      if (next && ((rail && rail.contains(next)) || (flyout && flyout.contains(next)))) return;
      scheduleFlyoutCollapse();
    });
  }
  bindHoverZone(rail);
  bindHoverZone(flyout);
}
