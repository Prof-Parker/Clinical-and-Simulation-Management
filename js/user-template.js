/* global App */
var App = App || {};

/**
 * Standard role templates and capability matrix.
 * Spec: docs/Design Docs/User_roles_design.md
 */
App.UserTemplate = (function () {
  var ROLES = {
    program_engineer: {
      id: 'program_engineer',
      displayName: 'Program Engineer',
      tabs: ['dashboard', 'student', 'roles', 'makeup', 'audit', 'setup', 'playground', 'users', 'clinical-sites', 'theory'],
      actions: ['*'],
      dashboardReadOnly: false
    },
    admin_staff: {
      id: 'admin_staff',
      displayName: 'Administrative Staff',
      tabs: ['dashboard', 'student', 'setup', 'audit', 'users', 'clinical-sites'],
      actions: [
        'setup.edit', 'setup.save', 'setup.regenerate', 'setup.importPlayground',
        'audit.admin', 'semester.batchCreate', 'semester.switch',
        'users.manage', 'clinicalSites.edit', 'proposals.review'
      ],
      dashboardReadOnly: false
    },
    lead_course_faculty: {
      id: 'lead_course_faculty',
      displayName: 'Lead Course Faculty',
      tabs: ['dashboard', 'student', 'setup', 'roles', 'playground', 'clinical-sites'],
      actions: [
        'dashboard.propose', 'setup.propose', 'setup.saveDraft',
        'roles.edit', 'playground.edit', 'clinicalSites.propose', 'proposals.submit'
      ],
      dashboardReadOnly: false
    },
    adjunct_faculty: {
      id: 'adjunct_faculty',
      displayName: 'Adjunct Faculty',
      tabs: ['dashboard', 'student', 'roles'],
      actions: ['roles.edit'],
      dashboardReadOnly: true
    }
  };

  var TAB_LABELS = {
    dashboard: 'Dashboard',
    student: 'Student View',
    roles: 'Simulation Roles',
    makeup: 'Makeup Finder',
    audit: 'Audit',
    setup: 'Setup',
    playground: 'Playground',
    users: 'Users',
    'clinical-sites': 'Clinical Sites',
    theory: 'Theory Scheduling'
  };

  function listRoles() {
    return Object.keys(ROLES).map(function (id) {
      return { id: id, displayName: ROLES[id].displayName };
    });
  }

  function getRole(roleId) {
    return ROLES[roleId] || null;
  }

  function roleDisplayName(roleId) {
    var r = getRole(roleId);
    return r ? r.displayName : roleId || 'Unknown';
  }

  function canTab(roleId, tabId) {
    var role = getRole(roleId);
    if (!role) return false;
    return role.tabs.indexOf(tabId) >= 0;
  }

  function canAction(roleId, action) {
    var role = getRole(roleId);
    if (!role) return false;
    if (role.actions.indexOf('*') >= 0) return true;
    return role.actions.indexOf(action) >= 0;
  }

  function isDashboardReadOnly(roleId) {
    var role = getRole(roleId);
    return role ? !!role.dashboardReadOnly : true;
  }

  function exportRoleTemplate(roleId) {
    var role = getRole(roleId);
    if (!role) return null;
    return JSON.parse(JSON.stringify(role));
  }

  return {
    ROLES: ROLES,
    TAB_LABELS: TAB_LABELS,
    listRoles: listRoles,
    getRole: getRole,
    roleDisplayName: roleDisplayName,
    canTab: canTab,
    canAction: canAction,
    isDashboardReadOnly: isDashboardReadOnly,
    exportRoleTemplate: exportRoleTemplate
  };
})();
