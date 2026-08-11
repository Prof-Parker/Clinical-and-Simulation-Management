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
    expect(plain.requiresTestout).toBe(false);
    expect(plain.recommendedTestoutCount).toBe(0);
    expect(plain.recommendedPracticeCount).toBe(0);
    expect(migrated.topics[0].defaultSkills).toBeUndefined();
    expect(plain.description).toBe('');
    expect(plain.curriculumMeta).toEqual(TheoryLibrary.emptyCurriculumMeta());
  });

  it('normalizes requiresTestout and recommended counts on skills', () => {
    var migrated = TheoryLibrary.migrateLibrary({
      meta: { courseId: 'REGN15' },
      topics: [],
      skills: [
        {
          id: 'skill_hand_hygiene',
          title: 'Hand hygiene',
          kinds: [],
          requiresTestout: true,
          recommendedTestoutCount: 2,
          recommendedPracticeCount: 3
        },
        {
          id: 'skill_vitals',
          title: 'Vital signs',
          kinds: [],
          requiresTestout: true,
          recommendedTestoutCount: 0
        }
      ]
    });
    var hand = migrated.skills.find(function (s) { return s.id === 'skill_hand_hygiene'; });
    var vitals = migrated.skills.find(function (s) { return s.id === 'skill_vitals'; });
    expect(hand.requiresTestout).toBe(true);
    expect(hand.recommendedTestoutCount).toBe(2);
    expect(hand.recommendedPracticeCount).toBe(3);
    expect(vitals.requiresTestout).toBe(true);
    expect(vitals.recommendedTestoutCount).toBe(1);
  });

  it('persists requiresTestout settings via addSkill and updateSkill', async () => {
    state.theoryLibraryRoot = TheoryLibrary.createEmptyLibrary('REGN15');
    var skill = await TheoryLibrary.addSkill('Hand hygiene', {
      requiresTestout: true,
      recommendedTestoutCount: 2,
      recommendedPracticeCount: 1
    });
    expect(skill.requiresTestout).toBe(true);
    expect(skill.recommendedTestoutCount).toBe(2);
    expect(skill.recommendedPracticeCount).toBe(1);
    await TheoryLibrary.updateSkill(skill.id, {
      requiresTestout: false,
      recommendedTestoutCount: 5,
      recommendedPracticeCount: 4
    });
    var updated = TheoryLibrary.getSkillById(skill.id);
    expect(updated.requiresTestout).toBe(false);
    expect(updated.recommendedTestoutCount).toBe(5);
    expect(updated.recommendedPracticeCount).toBe(4);
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

  it('updates and removes topics and skills with description and learning objectives', async () => {
    state.theoryLibraryRoot = TheoryLibrary.createEmptyLibrary('REGN15');
    var topic = await TheoryLibrary.addTopic('Syllabus', {
      description: 'Course orientation and syllabus overview',
      learningObjectives: ['Identify course policies', 'Locate the COR'],
      curriculumMeta: Object.assign(TheoryLibrary.emptyCurriculumMeta(), {
        notes: 'COR Unit 1 stub'
      })
    });
    expect(topic.title).toBe('Syllabus');
    expect(topic.description).toBe('Course orientation and syllabus overview');
    expect(topic.learningObjectives).toEqual(['Identify course policies', 'Locate the COR']);
    expect(topic.defaultSkills).toBeUndefined();
    expect(topic.curriculumMeta.notes).toBe('COR Unit 1 stub');
    expect(topic.curriculumMeta.acenStandards).toEqual([]);

    await TheoryLibrary.updateTopic(topic.id, {
      title: 'REGN15 Syllabus',
      description: 'Updated description',
      learningObjectives: ['Updated objective'],
      curriculumMeta: Object.assign(TheoryLibrary.emptyCurriculumMeta(), {
        acenStandards: ['ACEN-6.1']
      })
    });
    var updatedTopic = TheoryLibrary.getTopicById(topic.id);
    expect(updatedTopic.title).toBe('REGN15 Syllabus');
    expect(updatedTopic.learningObjectives).toEqual(['Updated objective']);
    expect(updatedTopic.description).toBe('Updated description');
    expect(updatedTopic.curriculumMeta.acenStandards).toEqual(['ACEN-6.1']);
    expect(updatedTopic.defaultSkills).toBeUndefined();

    var skill = await TheoryLibrary.addSkill('PPE', {
      kinds: ['introduction'],
      description: 'Donning and doffing PPE',
      learningObjectives: ['Demonstrate donning PPE']
    });
    expect(skill.title).toBe('PPE');
    expect(skill.description).toBe('Donning and doffing PPE');
    expect(skill.learningObjectives).toEqual(['Demonstrate donning PPE']);
    await TheoryLibrary.updateSkill(skill.id, {
      title: 'PPE & Hand hygiene',
      kinds: ['introduction', 'practice'],
      description: 'PPE with hand hygiene practice',
      learningObjectives: ['Demonstrate PPE', 'Perform hand hygiene']
    });
    expect(TheoryLibrary.getSkillById(skill.id).kinds).toEqual(['introduction', 'practice']);
    expect(TheoryLibrary.getSkillById(skill.id).description).toBe('PPE with hand hygiene practice');
    expect(TheoryLibrary.getSkillById(skill.id).learningObjectives).toEqual([
      'Demonstrate PPE',
      'Perform hand hygiene'
    ]);

    await TheoryLibrary.removeSkill(skill.id);
    expect(TheoryLibrary.getSkillById(skill.id)).toBe(null);
    await TheoryLibrary.removeTopic(topic.id);
    expect(TheoryLibrary.getTopicById(topic.id)).toBe(null);
  });

  it('normalizes missing learningObjectives to empty arrays', () => {
    var migrated = TheoryLibrary.migrateLibrary({
      meta: { courseId: 'REGN15' },
      topics: [{ id: 't1', title: 'Topic', moduleRef: 'legacy' }],
      skills: [{ id: 's1', title: 'Hand hygiene', kinds: [] }]
    });
    expect(migrated.topics[0].learningObjectives).toEqual([]);
    expect(migrated.topics[0].moduleRef).toBe('legacy');
    expect(migrated.skills[0].learningObjectives).toEqual([]);
  });
});
