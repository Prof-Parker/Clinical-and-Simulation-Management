/**
 * Shared semester root hydration helpers for Storage open/activate/init paths.
 */

import * as DataModel from '../core/data-model/index.js';
import * as CalendarEngine from '../core/calendar-engine.js';

/**
 * Resolve the active semester from a file root, or null when none exist.
 */
export function resolveActiveSemester(fileRoot) {
  if (!fileRoot) return null;
  if (!fileRoot.meta || typeof fileRoot.meta !== 'object') fileRoot.meta = {};
  var semesters = Array.isArray(fileRoot.semesters) ? fileRoot.semesters : [];
  if (!semesters.length) return null;
  return semesters.find(function (s) {
    return s.id === fileRoot.meta.activeSemesterId;
  }) || semesters[0];
}

/**
 * Migrate cached/loaded raw JSON, recovering to a default file on failure.
 * @returns {{ fileRoot: object, loadedFromFile: boolean }}
 */
export function migrateLoadedRoot(raw, loadedFromFile) {
  var fileRoot;
  var fromFile = !!loadedFromFile;
  try {
    fileRoot = raw ? DataModel.migrateFile(raw) : DataModel.createDefaultFile();
  } catch (e) {
    fileRoot = DataModel.createDefaultFile();
    fromFile = false;
  }
  var sem = resolveActiveSemester(fileRoot);
  if (!sem) {
    fileRoot = DataModel.createDefaultFile();
    fromFile = false;
    sem = fileRoot.semesters[0];
  }
  return { fileRoot: fileRoot, loadedFromFile: fromFile, semester: sem };
}

export function needsRegeneration(semester) {
  if (!semester || !semester.students || !semester.students.length) return false;
  return semester.students.every(function (s) {
    return (s.schedule || []).every(function (c) {
      return !c || (!c.clinical && !c.sim && !c.makeupClinical && !c.inactive);
    });
  });
}

/**
 * Rebuild weeks and optionally regenerate empty schedules for an active semester.
 */
export function prepareActiveSemester(sem, Scheduler) {
  CalendarEngine.rebuildWeeks(sem);
  if (needsRegeneration(sem) && Scheduler) {
    Scheduler.regenerateAll(sem);
  }
  return sem;
}
