/**
 * Eligible-list sim block week allocation (per sim day, holiday-aware).
 */

import * as CalendarEngine from '../calendar-engine.js';
import { getSimDays } from '../data-model/index.js';

/**
 * Absolute even/odd streams from simStartWeek (pre-holiday provenance).
 */
export function getNominalSimWeekStreams(cfg) {
  var start = (cfg.simStartWeek || 5) - 1;
  var evenWeeks = [];
  var oddWeeks = [];
  for (var i = 0; i < 9; i++) {
    var ew = start + i * 2;
    var ow = start + 1 + i * 2;
    if (ew < 18) evenWeeks.push(ew);
    if (ow < 18) oddWeeks.push(ow);
  }
  return { evenWeeks: evenWeeks, oddWeeks: oddWeeks };
}

/**
 * Weeks from simStart that are eligible for a given sim weekday.
 */
export function collectEligibleWeeksForDay(data, cfg, day) {
  var start = (cfg.simStartWeek || 5) - 1;
  var list = [];
  for (var wi = start; wi < 18; wi++) {
    if (CalendarEngine.isSchedulingBlockedDay(data, wi, day)) continue;
    list.push(wi);
  }
  return list;
}

function splitEvenOddSlots(eligible) {
  var evenSlots = [];
  var oddSlots = [];
  for (var i = 0; i < eligible.length; i++) {
    if (i % 2 === 0) evenSlots.push(eligible[i]);
    else oddSlots.push(eligible[i]);
  }
  return { evenSlots: evenSlots, oddSlots: oddSlots };
}

/**
 * Resolve even/odd week indices for one sim block on one weekday.
 * @deprecated Prefer buildProgramSimBlocks; kept for tests that call resolve directly.
 */
export function resolveSimBlockWeeks(data, evenWeeks, oddWeeks, blockIndex) {
  // Legacy signature used absolute streams + inactive checks. Map onto eligible
  // Mon list when possible so old call sites still get non-colliding weeks.
  var cfg = data.config || {};
  var day = (getSimDays(cfg)[0]) || 'Mon';
  var slots = splitEvenOddSlots(collectEligibleWeeksForDay(data, cfg, day));
  var nominal = getNominalSimWeekStreams(cfg);
  return {
    evenWeekIndex: slots.evenSlots[blockIndex] != null ? slots.evenSlots[blockIndex] : null,
    oddWeekIndex: slots.oddSlots[blockIndex] != null ? slots.oddSlots[blockIndex] : null,
    nominalEvenWeekIndex: nominal.evenWeeks[blockIndex] != null ? nominal.evenWeeks[blockIndex] : null,
    nominalOddWeekIndex: nominal.oddWeeks[blockIndex] != null ? nominal.oddWeeks[blockIndex] : null
  };
}

/**
 * Build program sim blocks with per-day week indices.
 */
export function buildProgramSimBlocks(data, cfg) {
  var needed = cfg.simDaysRequired || 5;
  var simDays = getSimDays(cfg);
  var nominal = getNominalSimWeekStreams(cfg);
  var byDay = {};
  simDays.forEach(function (day) {
    byDay[day] = splitEvenOddSlots(collectEligibleWeeksForDay(data, cfg, day));
  });

  var blocks = [];
  var weekToSim = {};

  for (var i = 0; i < needed; i++) {
    var weeksByDay = {};
    var sharedEven = null;
    var sharedOdd = null;
    var daysAgree = true;
    simDays.forEach(function (day, dayIdx) {
      var evenWi = byDay[day].evenSlots[i] != null ? byDay[day].evenSlots[i] : null;
      var oddWi = byDay[day].oddSlots[i] != null ? byDay[day].oddSlots[i] : null;
      weeksByDay[day] = { evenWeekIndex: evenWi, oddWeekIndex: oddWi };
      if (dayIdx === 0) {
        sharedEven = evenWi;
        sharedOdd = oddWi;
      } else if (evenWi !== sharedEven || oddWi !== sharedOdd) {
        daysAgree = false;
      }
      [evenWi, oddWi].forEach(function (wi) {
        if (wi == null) return;
        if (weekToSim[wi] == null) weekToSim[wi] = i + 1;
      });
    });

    var weekSet = {};
    Object.keys(weeksByDay).forEach(function (day) {
      var entry = weeksByDay[day];
      if (entry.evenWeekIndex != null) weekSet[entry.evenWeekIndex] = true;
      if (entry.oddWeekIndex != null) weekSet[entry.oddWeekIndex] = true;
    });
    var weeks = Object.keys(weekSet).map(function (k) { return parseInt(k, 10); });
    weeks.sort(function (a, b) { return a - b; });

    blocks.push({
      simNum: i + 1,
      evenWeekIndex: sharedEven,
      oddWeekIndex: sharedOdd,
      daysAligned: daysAgree,
      weeksByDay: weeksByDay,
      nominalEvenWeekIndex: nominal.evenWeeks[i] != null ? nominal.evenWeeks[i] : null,
      nominalOddWeekIndex: nominal.oddWeeks[i] != null ? nominal.oddWeeks[i] : null,
      weeks: weeks
    });
  }

  return { blocks: blocks, weekToSim: weekToSim };
}

/** Week index for a sim group pattern + day within a block. */
export function weekIndexForPatternDay(block, pattern, day) {
  if (!block) return null;
  var odd = pattern === 'odd';
  if (block.weeksByDay && day && block.weeksByDay[day]) {
    var entry = block.weeksByDay[day];
    return odd ? entry.oddWeekIndex : entry.evenWeekIndex;
  }
  return odd ? block.oddWeekIndex : block.evenWeekIndex;
}
