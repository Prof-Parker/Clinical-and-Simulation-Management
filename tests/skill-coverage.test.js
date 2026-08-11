import { describe, it, expect } from 'vitest';
import {
  summarizeSkillCoverage,
  shouldShowSkillCoveragePanel
} from '../src/core/skill-coverage.js';

function theoryWithPlacements(dayPlacements) {
  return {
    days: dayPlacements.map(function (placements, i) {
      return {
        id: 'd' + i,
        events: [{
          id: 'e' + i,
          track: 'skills',
          skillPlacements: placements,
          skillRefs: placements.map(function (p) { return p.skillId; })
        }]
      };
    })
  };
}

describe('skill-coverage.test.js', () => {
  var hand = {
    id: 'skill_hand',
    title: 'Hand hygiene',
    requiresTestout: true,
    recommendedTestoutCount: 2,
    recommendedPracticeCount: 1
  };
  var optional = {
    id: 'skill_opt',
    title: 'Optional skill',
    requiresTestout: false,
    recommendedTestoutCount: 0,
    recommendedPracticeCount: 0
  };

  it('hides panel when no skills require testout', () => {
    var summary = summarizeSkillCoverage({ days: [] }, [optional]);
    expect(shouldShowSkillCoveragePanel(summary)).toBe(false);
    expect(summary.tier).toBe('green');
  });

  it('flags missing intro and testout as red', () => {
    var summary = summarizeSkillCoverage(
      theoryWithPlacements([[{ skillId: 'skill_hand', kind: 'practice' }]]),
      [hand]
    );
    expect(shouldShowSkillCoveragePanel(summary)).toBe(true);
    expect(summary.tier).toBe('red');
    expect(summary.items[0].status).toBe('missing');
    expect(summary.items[0].notes.join(' ')).toMatch(/Intro/);
    expect(summary.items[0].notes.join(' ')).toMatch(/Testout/);
  });

  it('supports multiple testout days and yellow below recommended', () => {
    var summary = summarizeSkillCoverage(
      theoryWithPlacements([
        [{ skillId: 'skill_hand', kind: 'introduction' }],
        [{ skillId: 'skill_hand', kind: 'testout' }]
      ]),
      [hand]
    );
    expect(summary.tier).toBe('yellow');
    expect(summary.items[0].counts.testout).toBe(1);
    expect(summary.items[0].counts.introduction).toBe(1);
    expect(summary.items[0].status).toBe('below');
  });

  it('is green when recommended counts are met', () => {
    var summary = summarizeSkillCoverage(
      theoryWithPlacements([
        [{ skillId: 'skill_hand', kind: 'introduction' }],
        [{ skillId: 'skill_hand', kind: 'practice' }],
        [{ skillId: 'skill_hand', kind: 'testout' }],
        [{ skillId: 'skill_hand', kind: 'testout' }]
      ]),
      [hand, optional]
    );
    expect(summary.tier).toBe('green');
    expect(summary.items.length).toBe(1);
    expect(summary.items[0].status).toBe('ok');
  });

  it('notes untagged placements as yellow when mins are met', () => {
    var summary = summarizeSkillCoverage(
      theoryWithPlacements([
        [{ skillId: 'skill_hand', kind: 'introduction' }],
        [{ skillId: 'skill_hand', kind: 'testout' }],
        [{ skillId: 'skill_hand', kind: 'testout' }],
        [{ skillId: 'skill_hand', kind: 'practice' }],
        [{ skillId: 'skill_hand', kind: '' }]
      ]),
      [hand]
    );
    expect(summary.tier).toBe('yellow');
    expect(summary.items[0].counts.untagged).toBe(1);
  });
});
