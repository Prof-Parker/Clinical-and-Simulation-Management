/**
 * Shape checks for file-kind stamps and legacy semester roots.
 * Uses kind string literals (same values as FILE_KINDS) to avoid import cycles.
 */

/** True when raw looks like a pre-multi-semester semester object (no `semesters` array). */
export function looksLikeLegacySemester(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  if (Array.isArray(raw.semesters)) return false;
  if (Array.isArray(raw.students)) return true;
  if (raw.calendar && typeof raw.calendar === 'object') return true;
  if (raw.config && typeof raw.config === 'object') return true;
  return false;
}

/**
 * Verify that a stamped/detected kind matches the object's structural shape.
 * Prevents forged meta.fileKind from laundering unrelated JSON.
 */
export function shapeMatchesKind(raw, kind) {
  if (!raw || typeof raw !== 'object' || !kind) return false;
  switch (kind) {
    case 'program_semester':
    case 'playground':
      return Array.isArray(raw.semesters) || looksLikeLegacySemester(raw);
    case 'users_registry':
      return !!(raw.users && typeof raw.users === 'object' && !Array.isArray(raw.semesters));
    case 'user_credential':
      return !!(raw.userId && !Array.isArray(raw.semesters) && !raw.users);
    case 'clinical_sites_library':
      return Array.isArray(raw.sites) && !Array.isArray(raw.semesters);
    case 'theory_content_library':
      return Array.isArray(raw.topics) && !Array.isArray(raw.semesters);
    default:
      return true;
  }
}
