/**
 * Advisory coverage for skills that require testout (Intro + Testout + recommended counts).
 */

import { skillKindLabel } from '../storage/theory-library-model.js';
import { migrateEventSkillPlacements } from './skill-placements.js';

function emptyCounts() {
  return { introduction: 0, practice: 0, testout: 0, untagged: 0 };
}

function collectPlacements(theory) {
  var out = [];
  ((theory && theory.days) || []).forEach(function (day) {
    (day.events || []).forEach(function (ev) {
      if (!ev || ev.track !== 'skills') return;
      migrateEventSkillPlacements(ev);
      (ev.skillPlacements || []).forEach(function (p) {
        if (!p || !p.skillId) return;
        out.push({
          skillId: p.skillId,
          kind: p.kind || '',
          dayId: day.id,
          eventId: ev.id
        });
      });
    });
  });
  return out;
}

/**
 * @param {object} theory - semester theory root
 * @param {object[]} skills - library skills list
 * @returns {{ tier: string, items: object[], issueCount: number, hasRequiresTestout: boolean }}
 */
export function summarizeSkillCoverage(theory, skills) {
  var placements = collectPlacements(theory);
  var bySkill = {};
  placements.forEach(function (p) {
    if (!bySkill[p.skillId]) bySkill[p.skillId] = emptyCounts();
    var c = bySkill[p.skillId];
    if (p.kind === 'introduction' || p.kind === 'practice' || p.kind === 'testout') {
      c[p.kind] += 1;
    } else {
      c.untagged += 1;
    }
  });

  var items = [];
  var hasMissingRequired = false;
  var hasSoftIssue = false;
  var requiresList = (skills || []).filter(function (s) { return s && s.requiresTestout; });

  requiresList.forEach(function (skill) {
    var counts = bySkill[skill.id] || emptyCounts();
    var recTestout = skill.recommendedTestoutCount != null ? skill.recommendedTestoutCount : 1;
    if (recTestout < 1) recTestout = 1;
    var recPractice = skill.recommendedPracticeCount != null ? skill.recommendedPracticeCount : 0;
    if (recPractice < 0) recPractice = 0;

    var missingIntro = counts.introduction < 1;
    var missingTestout = counts.testout < 1;
    var belowTestoutRec = counts.testout < recTestout;
    var belowPracticeRec = recPractice > 0 && counts.practice < recPractice;
    var hasUntagged = counts.untagged > 0;

    var notes = [];
    if (missingIntro) notes.push('Needs at least one Intro');
    if (missingTestout) notes.push('Needs at least one Testout');
    if (!missingTestout && belowTestoutRec) {
      notes.push('Testout ' + counts.testout + '/' + recTestout + ' recommended');
    }
    if (belowPracticeRec) {
      notes.push('Practice ' + counts.practice + '/' + recPractice + ' recommended');
    }
    if (hasUntagged) {
      notes.push(counts.untagged + ' untagged placement(s)');
    }

    var status = 'ok';
    if (missingIntro || missingTestout) {
      status = 'missing';
      hasMissingRequired = true;
    } else if (belowTestoutRec || belowPracticeRec || hasUntagged) {
      status = 'below';
      hasSoftIssue = true;
    }

    items.push({
      skillId: skill.id,
      title: skill.title || skill.id,
      counts: counts,
      recommendedTestoutCount: recTestout,
      recommendedPracticeCount: recPractice,
      status: status,
      notes: notes
    });
  });

  items.sort(function (a, b) {
    var order = { missing: 0, below: 1, ok: 2 };
    var d = (order[a.status] != null ? order[a.status] : 9) -
      (order[b.status] != null ? order[b.status] : 9);
    if (d !== 0) return d;
    return String(a.title).localeCompare(String(b.title));
  });

  var tier = 'green';
  if (hasMissingRequired) tier = 'red';
  else if (hasSoftIssue) tier = 'yellow';

  var issueCount = items.filter(function (i) { return i.status !== 'ok'; }).length;

  return {
    tier: tier,
    items: items,
    issueCount: issueCount,
    hasRequiresTestout: requiresList.length > 0,
    placementKindLabel: skillKindLabel
  };
}

export function shouldShowSkillCoveragePanel(summary) {
  return !!(summary && summary.hasRequiresTestout);
}
