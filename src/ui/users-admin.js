/**
 * Users registry admin tab.
 */

import * as Permissions from '../auth/permissions.js';
import * as UserData from '../auth/user-data.js';
import * as UserSession from '../auth/user-session.js';
import * as UserTemplate from '../auth/user-template.js';
import * as UsersRegistryStorage from '../storage/users-registry-storage.js';
import { escapeHtml, showAlert, showConfirm, showDialog } from './dialogs.js';
import { refresh } from './chrome.js';
import { showTemporaryCredentialDialog } from './users-temp-credentials.js';

var filterState = {
  query: '',
  role: '',
  status: ''
};

function esc(text) {
  return escapeHtml ? escapeHtml(text == null ? '' : String(text)) : String(text == null ? '' : text);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function buildRoleOptions(selectedRole) {
  return UserTemplate.listRoles().map(function (role) {
    return '<option value="' + esc(role.id) + '"' +
      (selectedRole === role.id ? ' selected' : '') + '>' +
      esc(role.displayName) + '</option>';
  }).join('');
}

function displayField(value) {
  var v = String(value || '').trim();
  return v ? esc(v) : '<span class="text-muted">—</span>';
}

function userMatchesFilters(uid, entry, filters) {
  if (filters.role && entry.role !== filters.role) return false;
  if (filters.status && entry.status !== filters.status) return false;
  var q = String(filters.query || '').trim().toLowerCase();
  if (!q) return true;
  var haystack = [
    uid,
    entry.firstName,
    entry.lastName,
    UserData.formatFullName(entry.firstName, entry.lastName),
    entry.email
  ].join(' ').toLowerCase();
  return haystack.indexOf(q) >= 0;
}

function buildRoleFilterOptions(selectedRole) {
  var html = '<option value="">All roles</option>';
  UserTemplate.listRoles().forEach(function (r) {
    html += '<option value="' + esc(r.id) + '"' + (selectedRole === r.id ? ' selected' : '') + '>' +
      esc(r.displayName) + '</option>';
  });
  return html;
}

function buildHelpDeskEngineerOptions(registry) {
  var selectedId = String((registry.meta && registry.meta.helpDeskEngineerUserId) || '');
  var engineers = UserData.listProgramEngineers(registry);
  var html = '<option value="">(Not assigned)</option>';
  var selectedValid = false;
  engineers.forEach(function (eng) {
    if (eng.userId === selectedId) selectedValid = true;
    html += '<option value="' + esc(eng.userId) + '"' +
      (eng.userId === selectedId ? ' selected' : '') + '>' +
      esc(eng.label) + '</option>';
  });
  if (selectedId && !selectedValid) {
    var stale = registry.users[selectedId];
    var staleLabel = stale
      ? (UserData.formatFullName(stale.firstName, stale.lastName) || selectedId) +
        ' — invalid or inactive'
      : selectedId + ' — missing';
    html += '<option value="' + esc(selectedId) + '" selected disabled>' +
      esc(staleLabel) + '</option>';
  }
  return { html: html, selectedId: selectedId, selectedValid: !selectedId || selectedValid };
}

function helpDeskStatusHtml(registry) {
  var helpDesk = UserData.getHelpDeskEngineer(registry);
  if (helpDesk.error) {
    var assigned = String((registry.meta && registry.meta.helpDeskEngineerUserId) || '');
    if (!assigned) {
      return '<p class="section-sub text-muted">No help desk engineer assigned for forgot-password emails.</p>';
    }
    return '<p class="section-sub" style="color:var(--danger, #b91c1c)">Help desk engineer assignment is invalid. Choose an active program engineer.</p>';
  }
  var name = UserData.formatFullName(helpDesk.entry.firstName, helpDesk.entry.lastName) || helpDesk.userId;
  return '<p class="section-sub">Forgot-password emails go to ' + esc(name) +
    ' (' + esc(helpDesk.email) + ').</p>';
}

function buildUserRowsHtml(registry, filters) {
  return Object.keys(registry.users)
    .filter(function (uid) {
      return userMatchesFilters(uid, registry.users[uid], filters);
    })
    .sort(function (a, b) {
      var ea = registry.users[a];
      var eb = registry.users[b];
      var na = UserData.formatFullName(ea.firstName, ea.lastName).toLowerCase();
      var nb = UserData.formatFullName(eb.firstName, eb.lastName).toLowerCase();
      if (na !== nb) return na < nb ? -1 : 1;
      return a < b ? -1 : 1;
    })
    .map(function (uid) {
      var u = registry.users[uid];
      return '<tr>' +
        '<td><code>' + esc(uid) + '</code></td>' +
        '<td>' + displayField(u.firstName) + '</td>' +
        '<td>' + displayField(u.lastName) + '</td>' +
        '<td>' + displayField(u.email) + '</td>' +
        '<td>' + esc(UserTemplate.roleDisplayName(u.role)) + '</td>' +
        '<td><span class="stat-pill' + (u.status === 'active' ? '' : ' stat-muted') + '">' +
          esc(u.status) + '</span></td>' +
        '<td class="users-actions-cell">' +
          '<button type="button" class="btn btn-sm" data-users-edit="' + esc(uid) + '">Edit</button> ' +
          '<button type="button" class="btn btn-sm" data-users-reissue="' + esc(uid) + '">Reset password</button> ' +
          (u.status === 'active'
            ? '<button type="button" class="btn btn-sm btn-danger" data-users-revoke="' + esc(uid) + '">Revoke</button>'
            : '') +
        '</td></tr>';
    }).join('');
}

function wireRowActions(container, registry) {
  container.querySelectorAll('[data-users-edit]').forEach(function (btn) {
    btn.addEventListener('click', function () { editUser(btn.dataset.usersEdit); });
  });
  container.querySelectorAll('[data-users-reissue]').forEach(function (btn) {
    btn.addEventListener('click', function () { resetPassword(btn.dataset.usersReissue); });
  });
  container.querySelectorAll('[data-users-revoke]').forEach(function (btn) {
    btn.addEventListener('click', function () { revokeUser(btn.dataset.usersRevoke); });
  });
}

function refreshUserTable(registry) {
  var tbody = document.getElementById('usersTableBody');
  var summary = document.getElementById('usersFilterSummary');
  if (!tbody) return;
  var total = Object.keys(registry.users).length;
  var rows = buildUserRowsHtml(registry, filterState);
  var shown = rows ? (rows.match(/<tr>/g) || []).length : 0;
  tbody.innerHTML = rows ||
    '<tr><td colspan="7" class="text-muted">No users match the current filters.</td></tr>';
  if (summary) {
    summary.textContent = shown === total
      ? total + ' user' + (total === 1 ? '' : 's')
      : 'Showing ' + shown + ' of ' + total + ' users';
  }
  wireRowActions(document.getElementById('usersAdminPanel'), registry);
}

function readFilterStateFromDom() {
  var search = document.getElementById('usersSearchInput');
  var role = document.getElementById('usersRoleFilter');
  var status = document.getElementById('usersStatusFilter');
  filterState.query = search ? search.value : filterState.query;
  filterState.role = role ? role.value : filterState.role;
  filterState.status = status ? status.value : filterState.status;
}

function wireFilters(registry) {
  var search = document.getElementById('usersSearchInput');
  var role = document.getElementById('usersRoleFilter');
  var status = document.getElementById('usersStatusFilter');
  function onFilterChange() {
    readFilterStateFromDom();
    refreshUserTable(registry);
  }
  if (search) search.addEventListener('input', onFilterChange);
  if (role) role.addEventListener('change', onFilterChange);
  if (status) status.addEventListener('change', onFilterChange);
}

function render() {
  var container = document.getElementById('usersAdminPanel');
  if (!container) return;
  if (!Permissions.canAction('users.manage')) {
    container.innerHTML = '<p class="section-sub">You do not have permission to manage users.</p>';
    return;
  }
  var registry = UsersRegistryStorage.getRegistry();
  if (!registry) {
    container.innerHTML = '<p class="section-sub">Connect users-registry.json from the menu to manage users.</p>' +
      '<button type="button" class="btn btn-sm" id="usersConnectRegistryBtn">Connect registry</button>';
    var connectBtn = document.getElementById('usersConnectRegistryBtn');
    if (connectBtn) connectBtn.addEventListener('click', function () {
      UsersRegistryStorage.openFilePicker().then(function () { render(); });
    });
    return;
  }

  var helpDeskOpts = buildHelpDeskEngineerOptions(registry);
  container.innerHTML =
    '<div class="users-admin-toolbar">' +
    '<button type="button" class="btn btn-primary btn-sm" id="usersCreateBtn">Create user</button>' +
    '<button type="button" class="btn btn-sm" id="usersSaveRegistryBtn">Save registry</button>' +
    '<label class="section-sub" for="usersHelpDeskEngineerSelect" style="display:inline-flex;align-items:center;gap:0.5rem;margin:0">' +
      'Help desk engineer' +
      '<select id="usersHelpDeskEngineerSelect" class="select-control" aria-label="Help desk engineer">' +
        helpDeskOpts.html +
      '</select>' +
    '</label>' +
    '</div>' +
    helpDeskStatusHtml(registry) +
    '<div class="filters users-admin-filters">' +
    '<input type="search" id="usersSearchInput" class="users-search-input" ' +
      'placeholder="Search name or email" aria-label="Search users by name or email" ' +
      'value="' + esc(filterState.query) + '">' +
    '<select id="usersRoleFilter" class="select-control" aria-label="Filter by role">' +
      buildRoleFilterOptions(filterState.role) +
    '</select>' +
    '<select id="usersStatusFilter" class="select-control" aria-label="Filter by status">' +
    '<option value="">All statuses</option>' +
    '<option value="active"' + (filterState.status === 'active' ? ' selected' : '') + '>Active</option>' +
    '<option value="revoked"' + (filterState.status === 'revoked' ? ' selected' : '') + '>Revoked</option>' +
    '</select>' +
    '</div>' +
    '<p id="usersFilterSummary" class="section-sub users-filter-summary"></p>' +
    '<div class="users-table-wrap">' +
    '<table class="data-table users-data-table">' +
    '<thead><tr>' +
    '<th>User ID</th><th>First name</th><th>Last name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th>' +
    '</tr></thead>' +
    '<tbody id="usersTableBody"></tbody>' +
    '</table></div>' +
    '<div id="usersCreateForm" class="hidden users-create-form">' +
    '<h4>Create user</h4>' +
    '<p class="section-sub">A temporary password is generated automatically (72-hour expiry; required change at next sign-in).</p>' +
    '<div class="users-name-row">' +
    '<label>First name<input type="text" id="usersNewFirstName" autocomplete="given-name" required></label>' +
    '<label>Last name<input type="text" id="usersNewLastName" autocomplete="family-name" required></label>' +
    '</div>' +
    '<label>Email<input type="email" id="usersNewEmail" autocomplete="email" required></label>' +
    '<label>Role<select id="usersNewRole" required></select></label>' +
    '<button type="button" class="btn btn-primary btn-sm" id="usersCreateConfirmBtn">Create New User</button>' +
    '</div>';

  refreshUserTable(registry);
  wireFilters(registry);

  document.getElementById('usersCreateBtn').addEventListener('click', function () {
    document.getElementById('usersCreateForm').classList.remove('hidden');
    var sel = document.getElementById('usersNewRole');
    sel.innerHTML = buildRoleOptions('');
  });
  document.getElementById('usersSaveRegistryBtn').addEventListener('click', function () {
    UsersRegistryStorage.mergeSave(registry).then(function (result) {
      if (result.conflict) {
        showAlert('Conflict', 'Registry was updated elsewhere. Reload and try again.');
      } else {
        showAlert('Saved', 'Registry saved.');
      }
    }).catch(function (err) {
      showAlert('Save registry', (err && err.message) || 'Could not save registry');
    });
  });
  var helpDeskSelect = document.getElementById('usersHelpDeskEngineerSelect');
  if (helpDeskSelect) {
    helpDeskSelect.addEventListener('change', function () {
      var result = UserData.setHelpDeskEngineerUserId(registry, helpDeskSelect.value);
      if (result.error) {
        showAlert('Help desk engineer', result.error);
        render();
        return;
      }
      UsersRegistryStorage.mergeSave(result.registry).then(function (saveResult) {
        if (saveResult && saveResult.conflict) {
          showAlert('Conflict', 'Registry was updated elsewhere. Reload and try again.');
        }
        render();
      }).catch(function (err) {
        showAlert('Help desk engineer', (err && err.message) || 'Could not save help desk engineer');
        render();
      });
    });
  }
  document.getElementById('usersCreateConfirmBtn').addEventListener('click', createUser);
}

function createUser() {
  var firstName = document.getElementById('usersNewFirstName').value.trim();
  var lastName = document.getElementById('usersNewLastName').value.trim();
  var email = document.getElementById('usersNewEmail').value.trim();
  var role = document.getElementById('usersNewRole').value;
  if (!firstName) {
    showAlert('Create user', 'First name is required.');
    return;
  }
  if (!lastName) {
    showAlert('Create user', 'Last name is required.');
    return;
  }
  if (!email) {
    showAlert('Create user', 'Email is required.');
    return;
  }
  if (!isValidEmail(email)) {
    showAlert('Create user', 'Enter a valid email address.');
    return;
  }
  if (!role) {
    showAlert('Create user', 'Role is required.');
    return;
  }
  var registry = UsersRegistryStorage.getRegistry();
  if (!UserData.isRegistryEmailAvailable(registry, email)) {
    showAlert('Create user', 'That email address is already assigned to another user.');
    return;
  }
  var fullName = UserData.formatFullName(firstName, lastName);
  var userId = UserData.uid('usr');
  var tempPassword;
  try {
    tempPassword = UserData.generateTemporaryPassword();
  } catch (err) {
    showAlert('Create user', (err && err.message) || 'Could not generate temporary password');
    return;
  }
  UserData.hashPassword(tempPassword).then(function (passwordHash) {
    var session = UserSession.getSession();
    email = UserData.normalizeEmail(email);
    var profile = { firstName: firstName, lastName: lastName, email: email };
    var entry = UserData.createRegistryEntry(role, passwordHash, session ? session.name : '', profile);
    UserData.markTemporaryPassword(entry);
    UsersRegistryStorage.addOrUpdateUser(userId, entry);
    return UsersRegistryStorage.mergeSave(UsersRegistryStorage.getRegistry()).then(function (result) {
      if (result && result.conflict) {
        showAlert('Conflict', 'Registry was updated elsewhere. Reload and try again.');
        return;
      }
      showTemporaryCredentialDialog('User created', {
        fullName: fullName,
        email: email,
        password: tempPassword,
        expiresAt: entry.temporaryPasswordExpiresAt,
        lastName: lastName
      });
      render();
      if (refresh) refresh();
    });
  }).catch(function (err) {
    showAlert('Create user', (err && err.message) || 'Could not create user');
  });
}

function editUser(userId) {
  var registry = UsersRegistryStorage.getRegistry();
  var entry = registry.users[userId];
  if (!entry) return;
  showDialog(
    'Edit user',
    '<label class="section-sub" for="usersEditFirstName">First name</label>' +
    '<input id="usersEditFirstName" type="text" autocomplete="given-name" required value="' +
      esc(entry.firstName) + '" style="width:100%;margin:0.25rem 0 0.75rem">' +
    '<label class="section-sub" for="usersEditLastName">Last name</label>' +
    '<input id="usersEditLastName" type="text" autocomplete="family-name" required value="' +
      esc(entry.lastName) + '" style="width:100%;margin:0.25rem 0 0.75rem">' +
    '<label class="section-sub" for="usersEditEmail">Email</label>' +
    '<input id="usersEditEmail" type="email" autocomplete="email" required value="' +
      esc(entry.email) + '" style="width:100%;margin:0.25rem 0 0.75rem">' +
    '<label class="section-sub" for="usersEditRole">Role</label>' +
    '<select id="usersEditRole" class="select-control" required style="width:100%;margin:0.25rem 0">' +
      buildRoleOptions(entry.role) + '</select>',
    function () {
      var firstName = document.getElementById('usersEditFirstName').value.trim();
      var lastName = document.getElementById('usersEditLastName').value.trim();
      var email = document.getElementById('usersEditEmail').value.trim();
      var role = document.getElementById('usersEditRole').value;
      if (!firstName || !lastName || !email || !role) {
        showAlert('Edit user', 'First name, last name, email, and role are required.');
        return;
      }
      if (!isValidEmail(email)) {
        showAlert('Edit user', 'Enter a valid email address.');
        return;
      }
      if (!UserData.isRegistryEmailAvailable(registry, email, userId)) {
        showAlert('Edit user', 'That email address is already assigned to another user.');
        return;
      }
      entry.firstName = firstName;
      entry.lastName = lastName;
      entry.email = UserData.normalizeEmail(email);
      entry.role = role;
      UsersRegistryStorage.mergeSave(registry).then(function (result) {
        if (result.conflict) {
          showAlert('Conflict', 'Registry was updated elsewhere. Reload and try again.');
          return;
        }
        showAlert('User updated', 'Updated ' + UserData.formatFullName(firstName, lastName) + '.');
        render();
      }).catch(function (err) {
        showAlert('Edit user', (err && err.message) || 'Could not update user');
      });
    }
  );
}

function resetPassword(userId) {
  var registry = UsersRegistryStorage.getRegistry();
  var entry = registry.users[userId];
  if (!entry) return;
  var label = UserData.formatFullName(entry.firstName, entry.lastName) || userId;
  showConfirm(
    'Reset password',
    'Generate a new temporary password for ' + label +
      '? The previous password will stop working immediately. The temporary password expires in 72 hours.',
    function () {
      var tempPassword;
      try {
        tempPassword = UserData.generateTemporaryPassword();
      } catch (err) {
        showAlert('Reset password', (err && err.message) || 'Could not generate temporary password');
        return;
      }
      UserData.hashPassword(tempPassword).then(function (passwordHash) {
        entry.passwordHash = passwordHash;
        if (entry.keyHash) delete entry.keyHash;
        UserData.markTemporaryPassword(entry);
        return UsersRegistryStorage.mergeSave(registry);
      }).then(function (result) {
        if (result && result.conflict) {
          showAlert('Conflict', 'Registry was updated elsewhere. Reload and try again.');
          return;
        }
        showTemporaryCredentialDialog('Password reset', {
          fullName: label,
          email: String(entry.email || ''),
          password: tempPassword,
          expiresAt: entry.temporaryPasswordExpiresAt,
          lastName: entry.lastName
        });
        render();
      }).catch(function (err) {
        showAlert('Reset password', (err && err.message) || 'Could not reset password');
      });
    },
    { confirmLabel: 'Generate temporary password' }
  );
}

function revokeUser(userId) {
  var entry = UsersRegistryStorage.getRegistry().users[userId];
  var label = entry
    ? UserData.formatFullName(entry.firstName, entry.lastName) || userId
    : userId;
  showConfirm('Revoke user', 'Revoke access for ' + label + '?', function () {
    UsersRegistryStorage.removeUser(userId);
    UsersRegistryStorage.mergeSave(UsersRegistryStorage.getRegistry()).then(function () {
      render();
    }).catch(function (err) {
      showAlert('Revoke user', (err && err.message) || 'Could not save registry');
      render();
    });
  });
}

function init() {
  /* render on tab switch */
}

export {
  init,
  render
};
