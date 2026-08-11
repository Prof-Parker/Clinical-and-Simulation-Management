/**
 * Collapsible skills coverage advisory on Theory Master Calendar.
 */

import * as TheoryLibrary from '../../storage/theory-library-storage.js';
import {
  summarizeSkillCoverage,
  shouldShowSkillCoveragePanel
} from '../../core/skill-coverage.js';
import { escapeHtml } from '../dialogs.js';

function tierHeadline(tier, issueCount, total) {
  if (tier === 'green') {
    return 'Skills coverage: On track';
  }
  if (tier === 'yellow') {
    return 'Skills coverage: Below recommendations (' + issueCount + ' of ' + total + ')';
  }
  return 'Skills coverage: Missing Intro or Testout (' + issueCount + ' of ' + total + ')';
}

function itemLine(item) {
  var counts = item.counts || {};
  var meta = 'Intro ' + (counts.introduction || 0) +
    ' · Practice ' + (counts.practice || 0) +
    (item.recommendedPracticeCount > 0 ? '/' + item.recommendedPracticeCount : '') +
    ' · Testout ' + (counts.testout || 0) + '/' + item.recommendedTestoutCount;
  var notes = (item.notes || []).length
    ? ' — ' + item.notes.join('; ')
    : '';
  return '<li><strong>' + escapeHtml(item.title) + '</strong>: ' +
    escapeHtml(meta) + escapeHtml(notes) + '</li>';
}

export function renderSkillCoveragePanel(theory) {
  var section = document.getElementById('theorySkillCoverageSection');
  var panel = document.getElementById('theorySkillCoverage');
  if (!panel) return;

  if (!TheoryLibrary.isReady()) {
    panel.className = 'setup-schedule-warnings setup-schedule-status theory-skill-coverage hidden';
    panel.innerHTML = '';
    if (section) section.classList.add('hidden');
    return;
  }

  var summary = summarizeSkillCoverage(theory, TheoryLibrary.listSkills());
  if (!shouldShowSkillCoveragePanel(summary)) {
    panel.className = 'setup-schedule-warnings setup-schedule-status theory-skill-coverage hidden';
    panel.innerHTML = '';
    if (section) section.classList.add('hidden');
    return;
  }

  if (section) section.classList.remove('hidden');
  panel.classList.remove('hidden');
  panel.className = 'setup-schedule-warnings setup-schedule-status theory-skill-coverage ' +
    'setup-schedule-status-' + summary.tier;

  var headline = tierHeadline(summary.tier, summary.issueCount, summary.items.length);
  var detailItems = summary.items.map(itemLine).join('');

  panel.innerHTML =
    '<details class="theory-skill-coverage-details">' +
    '<summary><strong>' + escapeHtml(headline) + '</strong>' +
    '<span class="section-sub theory-skill-coverage-summary-hint">Advisory only — expand for details</span>' +
    '</summary>' +
    '<p class="section-sub" style="margin:0.35rem 0 0.5rem">' +
    'Skills marked Requires testout should have at least one Intro and one Testout placement. ' +
    'Recommended practice and extra testout days are advisory.</p>' +
    '<ul>' + detailItems + '</ul>' +
    '</details>';
}
