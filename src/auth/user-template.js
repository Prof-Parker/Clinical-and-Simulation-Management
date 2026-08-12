/**
 * Role templates and capability matrix.
 */

var ROLES = {
    program_engineer: {
      id: 'program_engineer',
      displayName: 'Program Engineer',
      tabs: ['dashboard', 'student', 'faculty', 'roles', 'makeup', 'audit', 'setup',
        'playground-dashboard', 'playground-setup',
        'theory-master', 'theory-lecture', 'theory-coordinator', 'users', 'clinical-sites'],
      actions: ['*'],
      dashboardReadOnly: false
    },
    admin_staff: {
      id: 'admin_staff',
      displayName: 'Administrative Staff',
      tabs: ['dashboard', 'student', 'faculty', 'setup', 'audit', 'theory-master', 'theory-lecture', 'theory-coordinator', 'users', 'clinical-sites'],
      actions: [
        'setup.edit', 'setup.save', 'setup.regenerate', 'setup.importPlayground',
        'audit.admin', 'semester.batchCreate', 'semester.switch',
        'users.manage', 'clinicalSites.edit', 'proposals.review',
        'theory.view', 'theory.edit', 'theory.export', 'theory.hourTargets.edit', 'theory.contactHourRules.edit',
        'student.calendar.export',
        'faculty.reviewSchedule', 'faculty.manageSubs', 'faculty.export',
        'files.programData', 'files.saveAs', 'files.openCopy', 'files.downloadBackup', 'files.clearStorage'
      ],
      dashboardReadOnly: false
    },
    lead_course_faculty: {
      id: 'lead_course_faculty',
      displayName: 'Full Time Faculty',
      tabs: ['dashboard', 'student', 'faculty', 'setup', 'roles', 'makeup',
        'playground-dashboard', 'playground-setup', 'clinical-sites',
        'theory-master', 'theory-lecture', 'theory-coordinator'],
      actions: [
        'dashboard.propose', 'setup.propose', 'setup.saveDraft',
        'roles.edit', 'makeup.edit', 'playground.edit', 'clinicalSites.propose', 'proposals.submit',
        'theory.view', 'theory.edit', 'theory.export',
        'student.calendar.export',
        'faculty.selfSchedule', 'faculty.requestSub', 'faculty.claimSub', 'faculty.export',
        'files.openCopy', 'files.downloadBackup', 'files.saveAsEscape', 'files.programDataReconnect'
      ],
      dashboardReadOnly: false
    },
    adjunct_faculty: {
      id: 'adjunct_faculty',
      displayName: 'Adjunct Faculty',
      tabs: ['dashboard', 'student', 'faculty', 'roles', 'theory-lecture'],
      actions: [
        'roles.edit', 'theory.view', 'files.downloadBackup',
        'faculty.selfSchedule', 'faculty.requestSub', 'faculty.claimSub', 'faculty.export'
      ],
      dashboardReadOnly: true
    }
  };

  var TAB_LABELS = {
    dashboard: 'Dashboard',
    student: 'Student View',
    faculty: 'Faculty Schedule',
    roles: 'Simulation Roles',
    makeup: 'Makeup Finder',
    audit: 'Audit',
    setup: 'Setup',
    'playground-dashboard': 'Dashboard',
    'playground-setup': 'Setup',
    users: 'Users',
    'clinical-sites': 'Clinical Sites',
    'theory-master': 'Master Calendar',
    'theory-lecture': 'Lecture Assignments',
    'theory-coordinator': 'Coordinator'
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

export {
  ROLES,
  TAB_LABELS,
  listRoles,
  getRole,
  roleDisplayName,
  canTab,
  canAction,
  isDashboardReadOnly,
  exportRoleTemplate
};
