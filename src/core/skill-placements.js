/**
 * Skills-lab event placement shapes: skill + intro/practice/testout kind.
 */

import { SKILL_KINDS, skillKindLabel } from '../storage/theory-library-model.js';

function normalizePlacementKind(raw) {
  var key = String(raw || '').toLowerCase().trim();
  if (SKILL_KINDS.indexOf(key) < 0) return '';
  return key;
}

/**
 * Normalize one placement. Accepts legacy string skill ids.
 * @returns {{ skillId: string, kind: string }|null}
 */
export function normalizeSkillPlacement(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'string') {
    var id = raw.trim();
    if (!id) return null;
    return { skillId: id, kind: '' };
  }
  if (typeof raw !== 'object') return null;
  var skillId = String(raw.skillId || raw.id || '').trim();
  if (!skillId) return null;
  return {
    skillId: skillId,
    kind: normalizePlacementKind(raw.kind)
  };
}

/**
 * Soft-migrate skillRefs (string[]) / partial skillPlacements into skillPlacements,
 * and keep skillRefs as denormalized id list.
 */
export function migrateEventSkillPlacements(ev) {
  if (!ev || typeof ev !== 'object') return ev;
  var placements = [];
  if (Array.isArray(ev.skillPlacements) && ev.skillPlacements.length) {
    placements = ev.skillPlacements.map(normalizeSkillPlacement).filter(Boolean);
  } else if (Array.isArray(ev.skillRefs)) {
    placements = ev.skillRefs.map(normalizeSkillPlacement).filter(Boolean);
  }
  ev.skillPlacements = placements;
  ev.skillRefs = placements.map(function (p) { return p.skillId; });
  return ev;
}

/** Build description text from placements using a title resolver. */
export function formatSkillPlacementsDescription(placements, resolveTitle) {
  return (placements || []).map(function (p) {
    if (!p || !p.skillId) return '';
    var title = resolveTitle ? resolveTitle(p.skillId) : p.skillId;
    if (!title) return '';
    var label = skillKindLabel(p.kind);
    return label ? (title + ' (' + label + ')') : title;
  }).filter(Boolean).join('; ');
}

export function skillRefsFromPlacements(placements) {
  return (placements || []).map(function (p) {
    return p && p.skillId ? p.skillId : '';
  }).filter(Boolean);
}

export {
  normalizePlacementKind,
  skillKindLabel,
  SKILL_KINDS
};
