/**
 * Student calendar filters for theory-track orientation rows.
 * Setup orientations remain the student source of truth; synced mirrors
 * are for the faculty master calendar only.
 */

import { SYNCED_ORIENTATION_CATEGORY } from '../core/theory-practicum-sync.js';

/**
 * Whether a theory.days orientation event should appear on a student's
 * ICS / detailed calendar. Skips synced_orientation mirrors and
 * group-scoped rows that do not include the student.
 */
export function includeTheoryOrientationForStudent(ev, student) {
  if (!ev || ev.track !== 'orientation') return false;
  var cats = ev.categories || [];
  if (cats.indexOf(SYNCED_ORIENTATION_CATEGORY) >= 0) return false;
  var groups = ev.groups;
  if (Array.isArray(groups) && groups.length) {
    var cg = student && student.clinicalGroup;
    return !!cg && groups.indexOf(cg) >= 0;
  }
  return true;
}
