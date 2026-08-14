import { describe, it, expect } from 'vitest';
import {
  parseSkillLabFragment,
  splitSkillsLabText,
  attachSkillPlacementsToEvents,
  applySkillsFacultyNeeded
} from '../scripts/theory/build-topic-library.js';
import { normalizeSkill } from '../src/storage/theory-library-model.js';

describe('build-topic-library skill placement seed', () => {
  it('parses testout / introduce prefixes into kind + base title', () => {
    expect(parseSkillLabFragment('Testout hand hygiene & PPE')).toEqual({
      title: 'hand hygiene & PPE',
      kind: 'testout'
    });
    expect(parseSkillLabFragment('introduce EWSS')).toEqual({
      title: 'EWSS',
      kind: 'introduction'
    });
    expect(parseSkillLabFragment('Introduction to skills lab')).toEqual({
      title: 'Introduction to skills lab',
      kind: ''
    });
    expect(parseSkillLabFragment('Physical assessments')).toEqual({
      title: 'Physical assessments',
      kind: ''
    });
  });

  it('splits skills-lab blobs on semicolon and comma', () => {
    expect(splitSkillsLabText('Vitals; signs; Chest auscultation boards')).toEqual([
      'Vitals',
      'signs',
      'Chest auscultation boards'
    ]);
    expect(splitSkillsLabText('Fall scales, GCS')).toEqual(['Fall scales', 'GCS']);
  });

  it('attaches skillPlacements and Faculty Needed on skills events', () => {
    var skills = [
      normalizeSkill({ title: 'Physical assessments', courseId: 'REGN15' }),
      normalizeSkill({ title: 'Vitals', courseId: 'REGN15' }),
      normalizeSkill({ title: 'signs', courseId: 'REGN15' }),
      normalizeSkill({ title: 'Chest auscultation boards', courseId: 'REGN15' }),
      normalizeSkill({ title: 'hand hygiene & PPE', courseId: 'REGN15', kinds: ['testout'] })
    ];
    var days = [{
      events: [{
        track: 'skills',
        title: 'Skills lab',
        description: 'Physical assessments; Vitals; signs; Chest auscultation boards; Testout hand hygiene & PPE',
        faculty: [],
        facultyRequired: null,
        skillPlacements: [],
        skillRefs: []
      }]
    }];

    attachSkillPlacementsToEvents(days, skills);
    applySkillsFacultyNeeded(days, 2);

    var ev = days[0].events[0];
    expect(ev.skillPlacements).toEqual([
      { skillId: skills[0].id, kind: '' },
      { skillId: skills[1].id, kind: '' },
      { skillId: skills[2].id, kind: '' },
      { skillId: skills[3].id, kind: '' },
      { skillId: skills[4].id, kind: 'testout' }
    ]);
    expect(ev.skillRefs.length).toBe(5);
    expect(ev.description).toContain('hand hygiene & PPE (Testout)');
    expect(ev.facultyRequired).toBe(2);
    expect(ev.faculty).toEqual([
      { name: 'Faculty Needed', role: 'skills', needed: true },
      { name: 'Faculty Needed', role: 'skills', needed: true }
    ]);
  });
});
