/**
 * Practicum schedule cell HTML shared by editable schedule and Dash overview.
 */

import * as DataModel from '../../core/data-model/index.js';
import * as ClinicalSites from '../../core/clinical-sites.js';
import * as Orientation from '../../core/orientation.js';
import * as MakeupDisplay from '../../core/makeup-display.js';
import * as ScheduleHolidayLabel from '../../core/schedule-holiday-label.js';
import * as Validator from '../../core/validator.js';
import { escapeHtml } from './schedule-filters.js';
import { resolveDisplayedSimGuestGroup } from './guest-group.js';

export function renderCellHtml(cell, student, data, weekIndex) {
  if (!cell) return '<div class="cell-empty">-</div>';
  if (cell.inactive || ScheduleHolidayLabel.isBreakWeek(data, weekIndex)) {
    return '<div class="cell-holiday">Break</div>';
  }

  var cfg = data.config;
  var cDay = DataModel.getClinicalDayForGroup(student.clinicalGroup, cfg);
  var clinMeta = MakeupDisplay.findMakeupRecord(student, weekIndex, 'clinical');
  var hasScheduledClin = cell.clinical || cell.clinicalMissed;
  var hasMakeupClin = cell.makeupClinical;
  var hasSim = cell.sim;
  var isOrientWeek = Orientation && Orientation.isOrientationWeek(data, student, weekIndex);
  var orientLabel = isOrientWeek
    ? Orientation.getOrientationLabel(data, student, weekIndex)
    : '';
  var orientHtml = isOrientWeek
    ? '<span class="badge-orient">' + escapeHtml(orientLabel) + '</span>'
    : '';
  var holidayLabel = ScheduleHolidayLabel.formatHolidayIndicator(
    ScheduleHolidayLabel.holidayIndicatorDays(data, student, weekIndex)
  );
  var holidayHtml = holidayLabel
    ? '<span class="badge-holiday">' + escapeHtml(holidayLabel) + '</span>'
    : '';

  if (hasMakeupClin && !hasScheduledClin && !hasSim && !isOrientWeek) {
    var clinTier = MakeupDisplay.getClinicalMakeupTier(cell, student, weekIndex);
    var clinStar = clinMeta && clinMeta.overload ? '*' : '';
    var joinDay = clinMeta && clinMeta.joinedDay ? ' (' + clinMeta.joinedDay.toUpperCase() + ')' : '';
    return '<div class="cell-makeup ' + MakeupDisplay.tierClass(clinTier) + '">Make-Up CLIN' + joinDay + clinStar + '</div>';
  }

  if (!hasScheduledClin && !hasSim && !hasMakeupClin) {
    if (isOrientWeek && holidayHtml) {
      return '<div class="flex-col">' + orientHtml + holidayHtml + '</div>';
    }
    if (isOrientWeek) return '<div class="flex-col">' + orientHtml + '</div>';
    if (holidayLabel) return '<div class="cell-holiday">' + escapeHtml(holidayLabel) + '</div>';
    return '<div class="cell-empty">-</div>';
  }

  var html = '<div class="flex-col">';
  if (holidayHtml) html += holidayHtml;
  if (orientHtml) html += orientHtml;
  if (hasScheduledClin) {
    var cls = cell.clinicalMissed ? 'badge-clin badge-clin-missed' : 'badge-clin';
    var siteSuffix = ClinicalSites
      ? ClinicalSites.facilityInitialsForCell(data, student, weekIndex)
      : '';
    var siteText = siteSuffix ? ' ' + escapeHtml(siteSuffix) : '';
    html += '<span class="' + cls + '">CLIN (' + escapeHtml(String(cDay || '').toUpperCase()) + ')' + siteText + '</span>';
  }
  if (hasMakeupClin && (hasScheduledClin || hasSim)) {
    var mTier = MakeupDisplay.getClinicalMakeupTier(cell, student, weekIndex);
    var star = clinMeta && clinMeta.overload ? '*' : '';
    var day = clinMeta && clinMeta.joinedDay ? clinMeta.joinedDay.toUpperCase() : String(cDay || '').toUpperCase();
    html += '<span class="badge-clin badge-clin-makeup ' + MakeupDisplay.tierClass(mTier) + '">MAKEUP (' + escapeHtml(day) + ')' + star + '</span>';
  }
  if (hasSim) {
    var simTier = cell.simMakeup ? MakeupDisplay.getSimMakeupTier(cell, student, weekIndex) : null;
    var simCls = 'badge-sim';
    if (simTier) {
      simCls += ' badge-sim-makeup ' + MakeupDisplay.tierClass(simTier);
    } else if (cell.simOverload) {
      simCls += ' badge-sim-overload';
    }
    var simStar = cell.simMakeup && cell.simOverload ? '*' : '';
    var guestGroup = resolveDisplayedSimGuestGroup(student, cell, weekIndex, data);
    var guestNote = guestGroup
      ? ' (' + escapeHtml(guestGroup) + '*)'
      : '';
    var guestTitle = guestGroup
      ? ' title="Primary: ' + escapeHtml(student.simGroup) + ' · Guest: ' + escapeHtml(guestGroup) + '"'
      : '';
    html += '<span class="' + simCls + '"' + guestTitle + '>SIM ' + escapeHtml(String(cell.sim)) + guestNote +
      ' (' + escapeHtml(String(cell.simDay || 'Mon').toUpperCase()) + ')' + simStar + '</span>';
  }
  html += '</div>';
  return html;
}

export function scheduleRightColsHtml(vr) {
  var badge = Validator.statusBadge(vr);
  return '<td class="sticky-col-r-clin" style="text-align:center"><span class="stat-pill stat-clin">' +
    vr.stats.clinicals + '</span></td>' +
    '<td class="sticky-col-r-sims" style="text-align:center"><span class="stat-pill stat-sim">' +
    vr.stats.sims + '</span></td>' +
    '<td class="sticky-col-r-status"><span class="' + badge.cls + '">' + badge.text + '</span></td>';
}
