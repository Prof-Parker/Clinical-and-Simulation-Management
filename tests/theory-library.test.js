import { describe, it, expect, beforeEach } from 'vitest';
import * as TheoryLibrary from '../src/storage/theory-library-storage.js';
import { state } from '../src/core/state.js';

describe('theory-library.test.js', () => {
  beforeEach(() => {
    state.theoryLibraryRoot = null;
    state.theoryLibraryFileHandle = null;
  });

  it('creates and migrates empty library', () => {
    var lib = TheoryLibrary.createEmptyLibrary('REGN15');
    expect(lib.meta.courseId).toBe('REGN15');
    expect(lib.meta.version).toBe(2);
    expect(lib.meta.curriculumMeta).toEqual(TheoryLibrary.emptyCurriculumMeta());
    expect(lib.topics).toEqual([]);
    expect(lib.skills).toEqual([]);
    var migrated = TheoryLibrary.migrateLibrary({ topics: [{ id: 't1', title: 'Topic' }] });
    expect(migrated.topics.length).toBe(1);
    expect(Array.isArray(migrated.skills)).toBe(true);
    expect(migrated.topics[0].description).toBe('');
    expect(migrated.topics[0].curriculumMeta).toEqual(TheoryLibrary.emptyCurriculumMeta());
    expect(migrated.topics[0].defaultSkills).toBeUndefined();
  });

  it('builds skills bank from topic defaultSkills with inferred kinds', () => {
    var migrated = TheoryLibrary.migrateLibrary({
      meta: { courseId: 'REGN15' },
      topics: [{
        id: 't1',
        title: 'Topic',
        defaultSkills: [
          'Medication PO Intro',
          'Foley practice',
          'TEST OUT Foley',
          'Hand hygiene',
          '/',
          'r'
        ]
      }]
    });
    expect(migrated.skills.length).toBe(4);
    var intro = migrated.skills.find(function (s) { return s.title === 'Medication PO Intro'; });
    var practice = migrated.skills.find(function (s) { return s.title === 'Foley practice'; });
    var testout = migrated.skills.find(function (s) { return s.title === 'TEST OUT Foley'; });
    var plain = migrated.skills.find(function (s) { return s.title === 'Hand hygiene'; });
    expect(intro.kinds).toContain('introduction');
    expect(practice.kinds).toContain('practice');
    expect(testout.kinds).toContain('testout');
    expect(plain.kinds).toEqual([]);
    expect(migrated.topics[0].defaultSkills).toBeUndefined();
    expect(plain.description).toBe('');
    expect(plain.curriculumMeta).toEqual(TheoryLibrary.emptyCurriculumMeta());
  });

  it('excludes holiday and break titles from the skills bank', () => {
    var migrated = TheoryLibrary.migrateLibrary({
      meta: { courseId: 'REGN15' },
      topics: [{
        id: 't1',
        title: 'Topic',
        defaultSkills: ['Hand hygiene', 'Thanksgiving Break', 'No Class']
      }],
      skills: [
        { id: 'skill_thanksgiving_break', title: 'Thanksgiving Break', kinds: [] },
        { id: 'skill_hand_hygiene', title: 'Hand hygiene', kinds: [] }
      ]
    });
    expect(migrated.skills.map(function (s) { return s.title; })).toEqual(['Hand hygiene']);
  });

  it('infers skill kinds from titles', () => {
    expect(TheoryLibrary.inferSkillKinds('Medication PO Intro')).toEqual(['introduction']);
    expect(TheoryLibrary.inferSkillKinds('Foley practice')).toEqual(['practice']);
    expect(TheoryLibrary.inferSkillKinds('Testout Blood glucose')).toEqual(['testout']);
    expect(TheoryLibrary.inferSkillKinds('Hand hygiene')).toEqual([]);
  });

  it('updates and removes topics and skills with description and curriculum meta', async () => {
    state.theoryLibraryRoot = TheoryLibrary.createEmptyLibrary('REGN15');
    var topic = await TheoryLibrary.addTopic('Syllabus', {
      moduleRef: '1A',
      description: 'Course orientation and syllabus overview',
      curriculumMeta: Object.assign(TheoryLibrary.emptyCurriculumMeta(), {
        notes: 'COR Unit 1 stub'
      })
    });
    expect(topic.title).toBe('Syllabus');
    expect(topic.description).toBe('Course orientation and syllabus overview');
    expect(topic.defaultSkills).toBeUndefined();
    expect(topic.curriculumMeta.notes).toBe('COR Unit 1 stub');
    expect(topic.curriculumMeta.acenStandards).toEqual([]);

    await TheoryLibrary.updateTopic(topic.id, {
      title: 'REGN15 Syllabus',
      moduleRef: 'M1',
      description: 'Updated description',
      curriculumMeta: Object.assign(TheoryLibrary.emptyCurriculumMeta(), {
        acenStandards: ['ACEN-6.1']
      })
    });
    var updatedTopic = TheoryLibrary.getTopicById(topic.id);
    expect(updatedTopic.title).toBe('REGN15 Syllabus');
    expect(updatedTopic.moduleRef).toBe('M1');
    expect(updatedTopic.description).toBe('Updated description');
    expect(updatedTopic.curriculumMeta.acenStandards).toEqual(['ACEN-6.1']);
    expect(updatedTopic.defaultSkills).toBeUndefined();

    var skill = await TheoryLibrary.addSkill('PPE', {
      kinds: ['introduction'],
      description: 'Donning and doffing PPE'
    });
    expect(skill.title).toBe('PPE');
    expect(skill.description).toBe('Donning and doffing PPE');
    await TheoryLibrary.updateSkill(skill.id, {
      title: 'PPE & Hand hygiene',
      kinds: ['introduction', 'practice'],
      description: 'PPE with hand hygiene practice'
    });
    expect(TheoryLibrary.getSkillById(skill.id).kinds).toEqual(['introduction', 'practice']);
    expect(TheoryLibrary.getSkillById(skill.id).description).toBe('PPE with hand hygiene practice');

    await TheoryLibrary.removeSkill(skill.id);
    expect(TheoryLibrary.getSkillById(skill.id)).toBe(null);
    await TheoryLibrary.removeTopic(topic.id);
    expect(TheoryLibrary.getTopicById(topic.id)).toBe(null);
  });
});
