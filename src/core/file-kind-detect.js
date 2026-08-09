/**
 * File-kind detection / inference (separated to keep file-kind.js under the line cap).
 * Kind string literals match FILE_KINDS in file-kind.js (avoids import cycles).
 */

import { looksLikeLegacySemester, shapeMatchesKind } from './file-kind-shape.js';

function baseName(fileName) {
  return String(fileName || '').split(/[/\\]/).pop() || '';
}

export function detectFileKind(raw, fileName) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.meta && raw.meta.fileKind && shapeMatchesKind(raw, raw.meta.fileKind)) {
    return raw.meta.fileKind;
  }
  if (raw.fileKind === 'user_credential' && shapeMatchesKind(raw, 'user_credential')) {
    return 'user_credential';
  }
  return inferFileKind(raw, fileName);
}

export function inferFileKind(raw, fileName) {
  var name = baseName(fileName);
  if (!raw || typeof raw !== 'object') {
    return inferFromFilenameOnly(name);
  }

  var hasSemesters = Array.isArray(raw.semesters);
  // Prefer semester roots over libraries that may also carry topics/sites.
  if (hasSemesters) {
    if (raw.meta && raw.meta.playgroundSource) return 'playground';
    if (/_playground\.json$/i.test(name)) return 'playground';
    return 'program_semester';
  }
  // Identity-only credentials: userId + no semester root (legacy files may still have `key`).
  if (raw.userId && !raw.users) return 'user_credential';
  if (raw.users && typeof raw.users === 'object') return 'users_registry';
  if (raw.topics && Array.isArray(raw.topics)) return 'theory_content_library';
  if (raw.sites && Array.isArray(raw.sites)) return 'clinical_sites_library';
  if (looksLikeLegacySemester(raw)) return 'program_semester';

  return inferFromFilenameOnly(name);
}

export function inferFromFilenameOnly(name) {
  if (!name) return null;
  if (/^users-registry\.json$/i.test(name)) return 'users_registry';
  if (/\.user\.json$/i.test(name)) return 'user_credential';
  if (/^clinical-sites-library\.json$/i.test(name)) return 'clinical_sites_library';
  if (/^theory-content-library_/i.test(name) && /\.json$/i.test(name)) {
    return 'theory_content_library';
  }
  if (/_playground\.json$/i.test(name)) return 'playground';
  if (/^[FS]20\d{2}_.+\.json$/i.test(name) && !/_playground/i.test(name)) {
    return 'program_semester';
  }
  return null;
}
