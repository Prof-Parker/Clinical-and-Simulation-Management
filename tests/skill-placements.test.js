import { describe, it, expect } from 'vitest';
import {
  normalizeSkillPlacement,
  migrateEventSkillPlacements,
  formatSkillPlacementsDescription,
  skillRefsFromPlacements
} from '../src/core/skill-placements.js';

describe('skill-placements.test.js', () => {
  it('normalizes legacy string skill ids', () => {
    expect(normalizeSkillPlacement('skill_hand_hygiene')).toEqual({
      skillId: 'skill_hand_hygiene',
      kind: ''
    });
  });

  it('normalizes placement objects and rejects invalid kinds', () => {
    expect(normalizeSkillPlacement({ skillId: 's1', kind: 'testout' })).toEqual({
      skillId: 's1',
      kind: 'testout'
    });
    expect(normalizeSkillPlacement({ id: 's2', kind: 'Intro' }).kind).toBe('');
    expect(normalizeSkillPlacement({ skillId: 's3', kind: 'practice' }).kind).toBe('practice');
    expect(normalizeSkillPlacement('')).toBe(null);
  });

  it('migrates skillRefs string array into skillPlacements', () => {
    var ev = { skillRefs: ['a', 'b'] };
    migrateEventSkillPlacements(ev);
    expect(ev.skillPlacements).toEqual([
      { skillId: 'a', kind: '' },
      { skillId: 'b', kind: '' }
    ]);
    expect(ev.skillRefs).toEqual(['a', 'b']);
  });

  it('keeps existing skillPlacements and syncs skillRefs', () => {
    var ev = {
      skillRefs: ['old'],
      skillPlacements: [
        { skillId: 'hand', kind: 'introduction' },
        { skillId: 'hand', kind: 'testout' }
      ]
    };
    migrateEventSkillPlacements(ev);
    expect(ev.skillRefs).toEqual(['hand', 'hand']);
    expect(ev.skillPlacements[0].kind).toBe('introduction');
    expect(ev.skillPlacements[1].kind).toBe('testout');
  });

  it('formats descriptions with kind labels', () => {
    var text = formatSkillPlacementsDescription(
      [
        { skillId: 's1', kind: 'introduction' },
        { skillId: 's1', kind: 'testout' },
        { skillId: 's2', kind: '' }
      ],
      function (id) { return id === 's1' ? 'Hand hygiene' : 'Vitals'; }
    );
    expect(text).toBe('Hand hygiene (Intro); Hand hygiene (Testout); Vitals');
  });

  it('derives skillRefs from placements', () => {
    expect(skillRefsFromPlacements([
      { skillId: 'a', kind: 'practice' },
      { skillId: '', kind: 'testout' }
    ])).toEqual(['a']);
  });
});
