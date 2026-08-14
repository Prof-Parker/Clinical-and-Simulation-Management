/**
 * Self-scheduling conflict and eligibility rules.
 */

import {
  userMatchesAllSpecialties,
  normalizeSpecialties
} from './specialties.js';
import { hhmmToMinutes } from './slot-inventory.js';

var MAX_CONSECUTIVE_HOURS = 13;
var SITE_TRAVEL_GAP_MINUTES = 60;

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function gapMinutes(aEnd, bStart) {
  return bStart - aEnd;
}

/**
 * Expand slots into per-date timed intervals for conflict checks.
 */
function expandIntervals(slots) {
  var out = [];
  (slots || []).forEach(function (slot) {
    var instances = slot.instances && slot.instances.length
      ? slot.instances
      : [{ date: '_', timeStart: slot.timeStart, timeEnd: slot.timeEnd }];
    instances.forEach(function (inst) {
      var start = hhmmToMinutes(inst.timeStart || slot.timeStart);
      var end = hhmmToMinutes(inst.timeEnd || slot.timeEnd);
      if (end <= start) end += 24 * 60;
      out.push({
        slotId: slot.slotId,
        kind: slot.kind,
        date: inst.date || '_',
        start: start,
        end: end,
        siteId: slot.siteId || slot.facilityId || '',
        clinicalGroup: slot.clinicalGroup || ''
      });
    });
  });
  return out;
}

function sameCapacityUnit(a, b) {
  if (a.slotId === b.slotId) return true;
  if (a.kind === 'clinical' && b.kind === 'clinical' &&
      a.clinicalGroup && a.clinicalGroup === b.clinicalGroup) {
    return true;
  }
  return false;
}

/**
 * Validate cart against specialty + conflict rules.
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateCart(slots, userSpecialties, opts) {
  opts = opts || {};
  var errors = [];
  var list = slots || [];
  var allowSpecialtyOverride = !!opts.allowSpecialtyOverride;
  var allowHoursOverride = !!opts.allowHoursOverride;

  list.forEach(function (slot) {
    if (!allowSpecialtyOverride &&
        !userMatchesAllSpecialties(userSpecialties, slot.specialties)) {
      errors.push('Missing specialty for ' + (slot.courseLabel || '') + ' ' + slot.kind +
        ' (' + normalizeSpecialties(slot.specialties).join(', ') + ').');
    }
  });

  // Duplicate signup for the same slot capacity unit
  var seen = {};
  list.forEach(function (slot) {
    if (seen[slot.slotId]) {
      errors.push('Cannot sign up more than once for the same slot (' + slot.slotId + ').');
    }
    seen[slot.slotId] = true;
  });

  var intervals = expandIntervals(list);
  intervals.sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.start - b.start;
  });

  for (var i = 0; i < intervals.length; i++) {
    for (var j = i + 1; j < intervals.length; j++) {
      var a = intervals[i];
      var b = intervals[j];
      if (a.date !== b.date) break;
      if (sameCapacityUnit(a, b) && a.slotId !== b.slotId) {
        errors.push('Cannot fill multiple openings of the same slot on ' + a.date + '.');
      }
      if (rangesOverlap(a.start, a.end, b.start, b.end)) {
        errors.push('Overlapping assignments on ' + a.date + '.');
        continue;
      }
      var later = a.start <= b.start ? b : a;
      var earlier = a.start <= b.start ? a : b;
      var gap = gapMinutes(earlier.end, later.start);
      var sameSite = !a.siteId || !b.siteId || a.siteId === b.siteId;
      var bothClinical = a.kind === 'clinical' && b.kind === 'clinical';
      if (bothClinical && !sameSite && gap < SITE_TRAVEL_GAP_MINUTES) {
        errors.push('Clinical at different sites on ' + a.date +
          ' requires at least 1 hour between shifts.');
      }
    }
  }

  // Consecutive hours on a day across cart
  var byDate = {};
  intervals.forEach(function (iv) {
    if (!byDate[iv.date]) byDate[iv.date] = [];
    byDate[iv.date].push(iv);
  });
  Object.keys(byDate).forEach(function (date) {
    var day = byDate[date].slice().sort(function (a, b) { return a.start - b.start; });
    if (!day.length) return;
    var blockStart = day[0].start;
    var blockEnd = day[0].end;
    for (var k = 1; k < day.length; k++) {
      if (day[k].start <= blockEnd) {
        blockEnd = Math.max(blockEnd, day[k].end);
      } else if (day[k].start - blockEnd < SITE_TRAVEL_GAP_MINUTES &&
          day[k].kind === 'clinical' && day[k - 1].kind === 'clinical' &&
          day[k].siteId && day[k - 1].siteId && day[k].siteId !== day[k - 1].siteId) {
        // already flagged above
        blockStart = day[k].start;
        blockEnd = day[k].end;
      } else if (day[k].start === blockEnd) {
        blockEnd = day[k].end;
      } else {
        blockStart = day[k].start;
        blockEnd = day[k].end;
      }
      var hours = (blockEnd - blockStart) / 60;
      if (!allowHoursOverride && hours > MAX_CONSECUTIVE_HOURS) {
        errors.push('More than ' + MAX_CONSECUTIVE_HOURS +
          ' consecutive hours on ' + date + ' (admin override required).');
      }
    }
    // Also check span of contiguous block starting from merge of adjacent non-overlapping consecutives
    var span = (day[day.length - 1].end - day[0].start) / 60;
    var contiguous = true;
    for (var t = 1; t < day.length; t++) {
      if (day[t].start > day[t - 1].end) {
        contiguous = false;
        break;
      }
    }
    if (contiguous && !allowHoursOverride && span > MAX_CONSECUTIVE_HOURS) {
      var msg = 'More than ' + MAX_CONSECUTIVE_HOURS +
        ' consecutive hours on ' + date + ' (admin override required).';
      if (errors.indexOf(msg) < 0) errors.push(msg);
    }
  });

  // Deduplicate errors
  var uniq = [];
  var seenErr = {};
  errors.forEach(function (e) {
    if (seenErr[e]) return;
    seenErr[e] = true;
    uniq.push(e);
  });
  return { ok: uniq.length === 0, errors: uniq };
}

function userCanSeeSlot(slot, userSpecialties, showAll) {
  if (showAll) return true;
  return userMatchesAllSpecialties(userSpecialties, slot.specialties);
}

export {
  MAX_CONSECUTIVE_HOURS,
  SITE_TRAVEL_GAP_MINUTES,
  rangesOverlap,
  expandIntervals,
  validateCart,
  userCanSeeSlot
};
