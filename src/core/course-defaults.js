/**
 * Per-course default config templates.
 */

import * as DataModel from './data-model/index.js';

var COURSES = [
    {
      courseId: 'REGN15P',
      displayName: 'REGN 15P',
      description: 'First-semester clinical & simulation',
      configOverrides: { holidayBlocksFullWeek: true },
      contentAreas: ['MS']
    },
    {
      courseId: 'REGN25P',
      displayName: 'REGN 25P',
      description: 'Second-semester clinical & simulation',
      configOverrides: { holidayBlocksFullWeek: false },
      contentAreas: ['MS', 'OB']
    },
    {
      courseId: 'REGN35P-36P',
      displayName: 'REGN 35P/36P',
      description: 'Two half-semester clinical courses sharing groups and scheduling (one file per term)',
      configOverrides: { holidayBlocksFullWeek: true },
      contentAreas: ['MS', 'PEDS', 'MH']
    },
    {
      courseId: 'REGN48P',
      displayName: 'REGN 48P',
      description: 'Fourth-semester clinical & simulation (practicum placement logic planned for a later phase)',
      configOverrides: { holidayBlocksFullWeek: true },
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
    var cfg = DataModel.defaultConfig();
    Object.keys(entry.configOverrides || {}).forEach(function (key) {
      cfg[key] = JSON.parse(JSON.stringify(entry.configOverrides[key]));
    });
    return DataModel.normalizeConfig(cfg);
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
      DataModel.applyConfigToSemester(semester, course.config, false);
      DataModel.syncSemesterForConfig(semester);
    }
    return semester;
  }

export {
  list,
  get,
  displayName,
  applyToSemester
};
