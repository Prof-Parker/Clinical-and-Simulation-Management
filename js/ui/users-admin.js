/* global App */
var App = App || {};
App.UI = App.UI || {};

App.UI.UsersAdmin = (function () {
  var filterState = {
    query: '',
    role: '',
    status: ''
  };

  function esc(text) {
    return App.UI.escapeHtml ? App.UI.escapeHtml(text == null ? '' : String(text)) : String(text == null ? '' : text);
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
      App.UserData.formatFullName(entry.firstName, entry.lastName),
      entry.email
    ].join(' ').toLowerCase();
    return haystack.indexOf(q) >= 0;
  }

  function buildRoleFilterOptions(selectedRole) {
    var html = '<option value="">All roles</option>';
    App.UserTemplate.listRoles().forEach(function (r) {
      html += '<option value="' + esc(r.id) + '"' + (selectedRole === r.id ? ' selected' : '') + '>' +
        esc(r.displayName) + '</option>';
    });
    return html;
  }

  function buildUserRowsHtml(registry, filters) {
    return Object.keys(registry.users)
      .filter(function (uid) {
        return userMatchesFilters(uid, registry.users[uid], filters);
      })
      .sort(function (a, b) {
        var ea = registry.users[a];
        var eb = registry.users[b];
        var na = App.UserData.formatFullName(ea.firstName, ea.lastName).toLowerCase();
        var nb = App.UserData.formatFullName(eb.firstName, eb.lastName).toLowerCase();
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
          '<td>' + esc(App.UserTemplate.roleDisplayName(u.role)) + '</td>' +
          '<td><span class="stat-pill' + (u.status === 'active' ? '' : ' stat-muted') + '">' +
            esc(u.status) + '</span></td>' +
          '<td class="users-actions-cell">' +
            '<button type="button" class="btn btn-sm" data-users-reissue="' + esc(uid) + '">Reissue key</button> ' +
            (u.status === 'active'
              ? '<button type="button" class="btn btn-sm btn-danger" data-users-revoke="' + esc(uid) + '">Revoke</button>'
              : '') +
          '</td></tr>';
      }).join('');
  }

  function wireRowActions(container, registry) {
    container.querySelectorAll('[data-users-reissue]').forEach(function (btn) {
      btn.addEventListener('click', function () { reissueKey(btn.dataset.usersReissue); });
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
    if (!App.Permissions.canAction('users.manage')) {
      container.innerHTML = '<p class="section-sub">You do not have permission to manage users.</p>';
      return;
    }
    var registry = App.UsersRegistryStorage.getRegistry();
    if (!registry) {
      container.innerHTML = '<p class="section-sub">Connect users-registry.json from the menu to manage users.</p>' +
        '<button type="button" class="btn btn-sm" id="usersConnectRegistryBtn">Connect registry</button>';
      var connectBtn = document.getElementById('usersConnectRegistryBtn');
      if (connectBtn) connectBtn.addEventListener('click', function () {
        App.UsersRegistryStorage.openFilePicker().then(function () { render(); });
      });
      return;
    }

    container.innerHTML =
      '<div class="users-admin-toolbar">' +
      '<button type="button" class="btn btn-primary btn-sm" id="usersCreateBtn">Create user</button>' +
      '<button type="button" class="btn btn-sm" id="usersSaveRegistryBtn">Save registry</button>' +
      '</div>' +
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
      '<div class="users-name-row">' +
      '<label>First name<input type="text" id="usersNewFirstName" autocomplete="given-name"></label>' +
      '<label>Last name<input type="text" id="usersNewLastName" autocomplete="family-name"></label>' +
      '</div>' +
      '<label>Email<input type="email" id="usersNewEmail" autocomplete="email"></label>' +
      '<label>Role<select id="usersNewRole"></select></label>' +
      '<button type="button" class="btn btn-primary btn-sm" id="usersCreateConfirmBtn">Create &amp; download user file</button>' +
      '</div>';

    refreshUserTable(registry);
    wireFilters(registry);

    document.getElementById('usersCreateBtn').addEventListener('click', function () {
      document.getElementById('usersCreateForm').classList.remove('hidden');
      var sel = document.getElementById('usersNewRole');
      sel.innerHTML = App.UserTemplate.listRoles().map(function (r) {
        return '<option value="' + esc(r.id) + '">' + esc(r.displayName) + '</option>';
      }).join('');
    });
    document.getElementById('usersSaveRegistryBtn').addEventListener('click', function () {
      App.UsersRegistryStorage.mergeSave(registry).then(function (result) {
        if (result.conflict) {
          App.UI.showAlert('Conflict', 'Registry was updated elsewhere. Reload and try again.');
        } else {
          App.UI.showAlert('Saved', 'Registry saved.');
        }
      });
    });
    document.getElementById('usersCreateConfirmBtn').addEventListener('click', createUser);
  }

  function createUser() {
    var firstName = document.getElementById('usersNewFirstName').value.trim();
    var lastName = document.getElementById('usersNewLastName').value.trim();
    var email = document.getElementById('usersNewEmail').value.trim();
    var role = document.getElementById('usersNewRole').value;
    if (!firstName) {
      App.UI.showAlert('Create user', 'First name is required.');
      return;
    }
    if (!lastName) {
      App.UI.showAlert('Create user', 'Last name is required.');
      return;
    }
    var fullName = App.UserData.formatFullName(firstName, lastName);
    var userId = App.UserData.uid('usr');
    var key = App.UserData.generateKey();
    App.UserData.hashKey(key).then(function (keyHash) {
      var session = App.UserSession.getSession();
      var profile = { firstName: firstName, lastName: lastName, email: email };
      var entry = App.UserData.createRegistryEntry(role, keyHash, session ? session.name : '', profile);
      App.UsersRegistryStorage.addOrUpdateUser(userId, entry);
      var userFile = App.UserData.createUserFile(userId, firstName, lastName, email, key);
      var filename = (firstName + '-' + lastName).replace(/\s+/g, '-').toLowerCase() + '.user.json';
      App.UserStorage.exportUserFileDownload(userFile, filename);
      App.UsersRegistryStorage.mergeSave(App.UsersRegistryStorage.getRegistry());
      App.UI.showAlert('User created', 'Downloaded user file for ' + fullName + '. Share read-only with the user.');
      render();
      if (App.UI && App.UI.refresh) App.UI.refresh();
    });
  }

  function reissueKey(userId) {
    var registry = App.UsersRegistryStorage.getRegistry();
    var entry = registry.users[userId];
    if (!entry) return;
    var key = App.UserData.generateKey();
    App.UserData.hashKey(key).then(function (keyHash) {
      entry.keyHash = keyHash;
      entry.issuedAt = new Date().toISOString();
      App.UsersRegistryStorage.mergeSave(registry);
      App.UI.showAlert('Key reissued', 'Update the user file manually or create a new download from registry.');
      render();
    });
  }

  function revokeUser(userId) {
    var entry = App.UsersRegistryStorage.getRegistry().users[userId];
    var label = entry
      ? App.UserData.formatFullName(entry.firstName, entry.lastName) || userId
      : userId;
    App.UI.showConfirm('Revoke user', 'Revoke access for ' + label + '?', function () {
      App.UsersRegistryStorage.removeUser(userId);
      App.UsersRegistryStorage.mergeSave(App.UsersRegistryStorage.getRegistry());
      render();
    });
  }

  function init() {
    /* render on tab switch */
  }

  return { init: init, render: render };
})();
