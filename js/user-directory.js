/* global App */
var App = App || {};

/**
 * Active users from users-registry.json for setup pickers and search.
 */
App.UserDirectory = (function () {
  var LEAD_FACULTY_LIMIT = 8;

  function registryUsers() {
    if (!App.UsersRegistryStorage || !App.UsersRegistryStorage.isReady()) return null;
    var registry = App.UsersRegistryStorage.getRegistry();
    if (!registry || !registry.users) return null;
    return registry.users;
  }

  function toUserRecord(userId, entry) {
    var displayName = App.UserData.formatFullName(entry.firstName, entry.lastName);
    if (!displayName && entry.email) displayName = String(entry.email).trim();
    if (!displayName) displayName = userId;
    return {
      userId: userId,
      firstName: entry.firstName || '',
      lastName: entry.lastName || '',
      displayName: displayName,
      email: entry.email || '',
      role: entry.role,
      status: entry.status
    };
  }

  function getActiveUsersByRole(roleId, options) {
    options = options || {};
    var users = registryUsers();
    if (!users) return [];
    var limit = options.limit != null ? options.limit : null;
    var list = Object.keys(users)
      .map(function (uid) {
        return toUserRecord(uid, users[uid]);
      })
      .filter(function (u) {
        return u.status === 'active' && u.role === roleId &&
          !!(u.firstName || u.lastName || u.email);
      })
      .sort(function (a, b) {
        var na = a.displayName.toLowerCase();
        var nb = b.displayName.toLowerCase();
        if (na !== nb) return na < nb ? -1 : 1;
        return a.userId < b.userId ? -1 : 1;
      });
    if (limit != null && limit >= 0) list = list.slice(0, limit);
    return list;
  }

  function getLeadCourseFaculty() {
    return getActiveUsersByRole('lead_course_faculty', { limit: LEAD_FACULTY_LIMIT });
  }

  function getAdjunctFaculty() {
    return getActiveUsersByRole('adjunct_faculty');
  }

  function findByDisplayName(roleId, displayName) {
    var target = String(displayName || '').trim().toLowerCase();
    if (!target) return null;
    return getActiveUsersByRole(roleId).find(function (u) {
      return u.displayName.toLowerCase() === target;
    }) || null;
  }

  return {
    LEAD_FACULTY_LIMIT: LEAD_FACULTY_LIMIT,
    getActiveUsersByRole: getActiveUsersByRole,
    getLeadCourseFaculty: getLeadCourseFaculty,
    getAdjunctFaculty: getAdjunctFaculty,
    findByDisplayName: findByDisplayName
  };
})();
