/* global App */
var App = App || {};

/**
 * Per-course default configuration templates (program engineer maintained).
 * Spec: docs/AUDIT_TRACKING_IMPLEMENTATION.md §2.1 / §2.3.
 *
 * Kept as a JS module (not repo JSON) because this repo blocks committing
 * .json files and the service worker bypasses cache for .json requests.
 *
 * `configOverrides` are deltas merged over App.DataModel.defaultConfig() at
 * lookup time (this file loads before data-model.js).
 */
App.CourseDefaults = (function () {
  var COURSES = [
    {
      courseId: 'REGN15P',
      displayName: 'REGN 15P',
      description: 'First-semester clinical & simulation',
      // Current program defaults in data-model.js are the 15P template.
      configOverrides: {},
      contentAreas: ['MS']
    },
    {
      courseId: 'REGN25P',
      displayName: 'REGN 25P',
      description: 'Second-semester clinical & simulation',
      // TODO(program engineer): tune 25P day counts, groups, and start weeks.
      configOverrides: {},
      contentAreas: ['MS', 'OB']
    },
    {
      courseId: 'REGN35P-36P',
      displayName: 'REGN 35P/36P',
      description: 'Two half-semester clinical courses sharing groups and scheduling (one file per term)',
      // TODO(program engineer): tune combined 35P/36P half-semester defaults.
      configOverrides: {},
      contentAreas: ['MS', 'PEDS', 'MH']
    },
    {
      courseId: 'REGN48P',
      displayName: 'REGN 48P',
      description: 'Fourth-semester clinical & simulation (practicum placement logic planned for a later phase)',
      // TODO(program engineer): tune 48P defaults; practicum student-assignment
      // logic is out of scope for the audit-tracking milestone.
      configOverrides: {},
      contentAreas: ['MS']
    }
  ];

  function list() {
    return COURSES.map(function (c) {
      return { courseId: c.courseId, displayName: c.displayName, description: c.description };
    });
  }

  function findEntry(courseId) {
    return COURSES.find(function (c) { return c.courseId === courseId; }) || null;
  }

  function buildConfig(entry) {
    var cfg = App.DataModel.defaultConfig();
    Object.keys(entry.configOverrides || {}).forEach(function (key) {
      cfg[key] = JSON.parse(JSON.stringify(entry.configOverrides[key]));
    });
    return App.DataModel.normalizeConfig(cfg);
  }

  function get(courseId) {
    var entry = findEntry(courseId);
    if (!entry) return null;
    return {
      courseId: entry.courseId,
      displayName: entry.displayName,
      description: entry.description,
      config: buildConfig(entry),
      contentAreas: (entry.contentAreas || ['MS']).slice()
    };
  }

  function displayName(courseId) {
    var entry = findEntry(courseId);
    return entry ? entry.displayName : (courseId || '');
  }

  /**
   * Apply a course template to a semester: sets meta.courseId and, when the
   * course has a template, replaces config with the course defaults.
   */
  function applyToSemester(semester, courseId) {
    if (!semester || !semester.meta) return semester;
    semester.meta.courseId = courseId || '';
    var course = get(courseId);
    if (course) {
      App.DataModel.applyConfigToSemester(semester, course.config, false);
      App.DataModel.syncSemesterForConfig(semester);
    }
    return semester;
  }

  return {
    list: list,
    get: get,
    displayName: displayName,
    applyToSemester: applyToSemester
  };
})();
