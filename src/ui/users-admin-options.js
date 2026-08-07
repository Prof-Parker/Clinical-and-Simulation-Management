/**
 * DOM helpers for Users admin selects and help-desk status (no innerHTML of user text).
 */

import * as UserData from '../auth/user-data.js';
import * as UserTemplate from '../auth/user-template.js';

function appendOption(selectEl, value, label, opts) {
  opts = opts || {};
  var opt = document.createElement('option');
  opt.value = value == null ? '' : String(value);
  opt.textContent = label == null ? '' : String(label);
  if (opts.selected) opt.selected = true;
  if (opts.disabled) opt.disabled = true;
  selectEl.appendChild(opt);
  return opt;
}

function fillRoleFilterOptions(selectEl, selectedRole) {
  selectEl.textContent = '';
  appendOption(selectEl, '', 'All roles', { selected: !selectedRole });
  UserTemplate.listRoles().forEach(function (r) {
    appendOption(selectEl, r.id, r.displayName, { selected: selectedRole === r.id });
  });
}

function fillRoleOptions(selectEl, selectedRole) {
  selectEl.textContent = '';
  UserTemplate.listRoles().forEach(function (role) {
    appendOption(selectEl, role.id, role.displayName, { selected: selectedRole === role.id });
  });
}

function fillHelpDeskEngineerOptions(selectEl, registry) {
  selectEl.textContent = '';
  var selectedId = String((registry.meta && registry.meta.helpDeskEngineerUserId) || '');
  var engineers = UserData.listProgramEngineers(registry);
  var selectedValid = false;
  appendOption(selectEl, '', '(Not assigned)', { selected: !selectedId });
  engineers.forEach(function (eng) {
    if (eng.userId === selectedId) selectedValid = true;
    appendOption(selectEl, eng.userId, eng.label, { selected: eng.userId === selectedId });
  });
  if (selectedId && !selectedValid) {
    var stale = registry.users[selectedId];
    var staleLabel = stale
      ? (UserData.formatFullName(stale.firstName, stale.lastName) || selectedId) +
        ' — invalid or inactive'
      : selectedId + ' — missing';
    appendOption(selectEl, selectedId, staleLabel, { selected: true, disabled: true });
  }
  return { selectedId: selectedId, selectedValid: !selectedId || selectedValid };
}

function setHelpDeskStatusEl(container, registry) {
  var existing = container.querySelector('#usersHelpDeskStatus');
  if (existing) existing.remove();
  var p = document.createElement('p');
  p.id = 'usersHelpDeskStatus';
  p.className = 'section-sub';
  var helpDesk = UserData.getHelpDeskEngineer(registry);
  if (helpDesk.error) {
    var assigned = String((registry.meta && registry.meta.helpDeskEngineerUserId) || '');
    if (!assigned) {
      p.className = 'section-sub text-muted';
      p.textContent = 'No help desk engineer assigned for forgot-password emails.';
    } else {
      p.style.color = 'var(--danger, #b91c1c)';
      p.textContent = 'Help desk engineer assignment is invalid. Choose an active program engineer.';
    }
  } else {
    var name = UserData.formatFullName(helpDesk.entry.firstName, helpDesk.entry.lastName) || helpDesk.userId;
    p.textContent = 'Forgot-password emails go to ' + name + ' (' + helpDesk.email + ').';
  }
  var filters = container.querySelector('.users-admin-filters');
  if (filters) container.insertBefore(p, filters);
  else container.appendChild(p);
}

export {
  appendOption,
  fillRoleFilterOptions,
  fillRoleOptions,
  fillHelpDeskEngineerOptions,
  setHelpDeskStatusEl
};
