/**
 * Week 17 clinical makeup batch planner — site-locked clustering by config mode.
 */

import { getCanonicalFacilityId, getSimDays, sameFacilitySite } from '../data-model/index.js';
import * as CalendarEngine from '../calendar-engine.js';
import { getClinicalCaps } from './helpers.js';
import { withProvenance } from './makeup.js';
import {
  WEEK17_MODES,
  normalizeWeek17Mode,
  getWeek17Index,
  getStudentAssignedSite,
  canStudentTakeWeek17Day,
  allowedDaysForStudent,
  hostGroupsForSiteDay,
  collectWeek17MakeupNeeds,
  facilityDisplayLabel
} from './week17-makeup-candidates.js';
import {
  makeupGroupsNeeded,
  evenSplitSizes,
  packStudentsIntoSessions,
  compareOutcomeRank
} from './week17-makeup-split.js';
import { transferConflictsTowardPreferredSite } from './week17-conflict-transfer.js';

function clearWeek17ClinicalMakeups(data) {
  var wi = getWeek17Index(data);
  (data.students || []).forEach(function (s) {
    var cell = s.schedule[wi];
    if (cell && cell.makeupClinical) {
      cell.makeupClinical = false;
      // Keep facilityId only if regular clinical remains; otherwise clear makeup site stamp.
      if (!cell.clinical) cell.facilityId = null;
    }
    s.makeups = (s.makeups || []).filter(function (m) {
      return !(m.type === 'clinical' && m.weekIndex === wi);
    });
  });
}

function pickDayForStudent(data, need, mode, cfg, forcedDay) {
  var wi = need.weekIndex;
  var elig = { ignoreExistingMakeup: true };
  if (forcedDay) {
    return canStudentTakeWeek17Day(data, need.student, wi, forcedDay, elig) ? forcedDay : null;
  }
  var days = allowedDaysForStudent(data, need.student, mode, cfg);
  for (var i = 0; i < days.length; i++) {
    if (canStudentTakeWeek17Day(data, need.student, wi, days[i], elig)) return days[i];
  }
  return null;
}

function assignDayBuckets(data, needs, mode, cfg, opts) {
  opts = opts || {};
  var buckets = {}; // key: siteId|day
  var unscheduled = [];
  var notes = [];
  var preferredId = opts.preferredSiteId
    ? getCanonicalFacilityId(data, opts.preferredSiteId)
    : null;

  function addToBucket(need, day) {
    var siteId = need.assignedSiteId;
    if (!siteId) {
      unscheduled.push(need);
      notes.push(need.studentId + ': no assigned clinical site');
      return;
    }
    var key = siteId + '|' + day;
    if (!buckets[key]) {
      buckets[key] = { facilityId: siteId, day: day, needs: [] };
    }
    buckets[key].needs.push(need);
  }

  var preferredNeeds = [];
  var otherNeeds = [];
  needs.forEach(function (need) {
    if (mode === WEEK17_MODES.byPreferredSite && preferredId &&
        sameFacilitySite(data, need.assignedSiteId, preferredId)) {
      preferredNeeds.push(need);
    } else {
      otherNeeds.push(need);
    }
  });

  function placeList(list, forcedDay, allowFallback) {
    list.forEach(function (need) {
      var day = pickDayForStudent(data, need, mode, cfg, forcedDay);
      if (!day && allowFallback && forcedDay) {
        day = pickDayForStudent(data, need, mode, cfg, null);
      }
      if (!day) {
        unscheduled.push(need);
        notes.push(
          (need.student.name || need.studentId) +
          ': no guest-sim-safe Week 17 day at assigned site'
        );
        return;
      }
      addToBucket(need, day);
    });
  }

  if (mode === WEEK17_MODES.byTargetDay) {
    placeList(needs, cfg.week17MakeupTargetDay || 'Mon', false);
  } else if (mode === WEEK17_MODES.byPreferredSite) {
    // Preferred-site cohort first; other sites may fall back if forced day conflicts.
    placeList(preferredNeeds, opts.forcedDay || null, true);
    placeList(otherNeeds, opts.forcedDay || null, true);
  } else {
    placeList(needs, opts.forcedDay || null, false);
  }

  return { buckets: buckets, unscheduled: unscheduled, notes: notes };
}

function buildSessionsFromBuckets(data, buckets, maxPerGroup) {
  var sessions = [];
  var totalGroups = 0;
  Object.keys(buckets).sort().forEach(function (key) {
    var b = buckets[key];
    var ids = b.needs.map(function (n) { return n.studentId; });
    var hosts = hostGroupsForSiteDay(data, b.facilityId, b.day);
    var packed = packStudentsIntoSessions(ids, maxPerGroup, hosts, 0);
    totalGroups += packed.length || makeupGroupsNeeded(ids.length, maxPerGroup);
    packed.forEach(function (sess) {
      sessions.push({
        facilityId: b.facilityId,
        day: b.day,
        hostGroup: sess.hostKey,
        studentIds: sess.studentIds,
        size: sess.size,
        overload: sess.overload,
        groupSizes: evenSplitSizes(ids.length, maxPerGroup)
      });
    });
  });
  return { sessions: sessions, totalGroups: totalGroups };
}

function applySessions(data, sessions, needsById, weekIndex) {
  var fallbackWi = CalendarEngine.resolveMakeupWeeks(data).clinicalFallback;
  sessions.forEach(function (sess) {
    var facId = getCanonicalFacilityId(data, sess.facilityId);
    sess.studentIds.forEach(function (sid) {
      var need = needsById[sid];
      if (!need) return;
      var student = need.student;
      var cell = student.schedule[weekIndex];
      if (!cell) return;
      cell.makeupClinical = true;
      cell.facilityId = facId;
      student.makeups.push(withProvenance({
        weekIndex: weekIndex,
        type: 'clinical',
        clinicalConflict: !!need.clinicalConflict,
        facilityId: facId,
        joinedDay: sess.day,
        hostGroup: sess.hostGroup,
        week18Fallback: weekIndex === fallbackWi,
        overload: !!sess.overload
      }, ''));
    });
  });
}

function planOnce(data, needs, mode, cfg, bucketOpts, maxPer, wi) {
  var assign = assignDayBuckets(data, needs, mode, cfg, bucketOpts || {});
  var built = buildSessionsFromBuckets(data, assign.buckets, maxPer);
  var bySiteDay = [];
  Object.keys(assign.buckets).sort().forEach(function (key) {
    var b = assign.buckets[key];
    var count = b.needs.length;
    bySiteDay.push({
      facilityId: b.facilityId,
      facilityLabel: facilityDisplayLabel(data, b.facilityId),
      day: b.day,
      studentCount: count,
      makeupGroups: makeupGroupsNeeded(count, maxPer),
      groupSizes: evenSplitSizes(count, maxPer)
    });
  });
  return {
    mode: mode,
    weekIndex: wi,
    week: wi + 1,
    maxPerClinicalGroup: maxPer,
    scheduledCount: needs.length - assign.unscheduled.length,
    unscheduledCount: assign.unscheduled.length,
    totalMakeupGroups: built.totalGroups,
    bySiteDay: bySiteDay,
    sessions: built.sessions,
    notes: assign.notes,
    conflictNotesCount: assign.notes.length,
    preferredSiteMatch: mode === WEEK17_MODES.byPreferredSite,
    unscheduledIds: assign.unscheduled.map(function (n) { return n.studentId; })
  };
}

/**
 * Plan Week 17 makeups for a need list (does not mutate schedule until applySessions).
 * For byPreferredSite without forcedDay, tries common weekdays and keeps the fewest-groups plan.
 */
export function planWeek17ClinicalMakeups(data, planOpts) {
  planOpts = planOpts || {};
  var cfg = data.config || {};
  var mode = normalizeWeek17Mode(planOpts.mode != null ? planOpts.mode : cfg.week17MakeupMode);
  var caps = getClinicalCaps(cfg);
  var maxPer = caps.normal;
  var wi = getWeek17Index(data);
  var needs = planOpts.needs || collectWeek17MakeupNeeds(data, { includeShortfall: false });
  var mergedCfg = Object.assign({}, cfg, {
    week17MakeupTargetDay: planOpts.targetDay || cfg.week17MakeupTargetDay
  });
  var baseOpts = {
    preferredSiteId: planOpts.preferredSiteId || cfg.week17MakeupPreferredSiteId,
    forcedDay: planOpts.forcedDay || null
  };

  if (mode === WEEK17_MODES.byPreferredSite && !baseOpts.forcedDay) {
    var candidates = [null].concat(getSimDays(mergedCfg));
    var best = null;
    candidates.forEach(function (day) {
      var plan = planOnce(data, needs, mode, mergedCfg, {
        preferredSiteId: baseOpts.preferredSiteId,
        forcedDay: day
      }, maxPer, wi);
      if (!best || compareOutcomeRank(plan, best) < 0) best = plan;
    });
    return best;
  }

  return planOnce(data, needs, mode, mergedCfg, baseOpts, maxPer, wi);
}

/**
 * Clear and reassign Week 17 clinical makeups according to semester config.
 * No-op when mode is `current`.
 */
export function rebalanceWeek17ClinicalMakeups(data) {
  if (!data || !data.students || !data.students.length) return null;
  var cfg = data.config || {};
  var mode = normalizeWeek17Mode(cfg.week17MakeupMode);
  if (mode === WEEK17_MODES.current) return null;

  var transfer = { transferred: 0, details: [] };
  if (mode === WEEK17_MODES.byPreferredSite) {
    transfer = transferConflictsTowardPreferredSite(data);
  }

  // Snapshot who currently has a cluster-week makeupClinical (synthetic or real).
  var priorMk = collectWeek17MakeupNeeds(data, { includeShortfall: false });
  clearWeek17ClinicalMakeups(data);

  var needsById = {};
  function addNeed(n) {
    if (!n || !n.studentId || needsById[n.studentId]) return;
    n.assignedSiteId = getStudentAssignedSite(data, n.student);
    n.clinicalConflict = n.clinicalConflict || (n.student.schedule || []).some(function (c) {
      return c && c.clinical && c.clinicalMissed;
    });
    needsById[n.studentId] = n;
  }

  collectWeek17MakeupNeeds(data, { includeShortfall: true }).forEach(addNeed);
  // Keep prior makeup cohort members who still have a shortfall or unresolved miss
  // after clear (covers stamped makeups in tests and conflict transfers).
  priorMk.forEach(function (p) {
    var student = p.student;
    var counted = 0;
    (student.schedule || []).forEach(function (c) {
      if (!c || c.inactive) return;
      if (c.clinical && !c.clinicalMissed) counted++;
      if (c.makeupClinical) counted++;
    });
    var neededClin = (data.config && data.config.clinicalDaysRequired) || 10;
    var stillNeeds = counted < neededClin ||
      (student.schedule || []).some(function (c) { return c && c.clinical && c.clinicalMissed; });
    if (!stillNeeds) return;
    addNeed({
      student: student,
      studentId: student.id,
      clinicalGroup: student.clinicalGroup,
      assignedSiteId: getStudentAssignedSite(data, student),
      assignedDay: p.assignedDay,
      weekIndex: p.weekIndex,
      hadMakeup: false,
      clinicalConflict: p.clinicalConflict
    });
  });

  var needs = Object.keys(needsById).map(function (id) { return needsById[id]; });
  needs.sort(function (a, b) {
    return String(a.studentId).localeCompare(String(b.studentId));
  });
  if (!needs.length) {
    return {
      scheduledCount: 0,
      totalMakeupGroups: 0,
      conflictTransfers: transfer.transferred,
      transferDetails: transfer.details
    };
  }

  var plan = planWeek17ClinicalMakeups(data, {
    mode: mode,
    needs: needs,
    preferredSiteId: cfg.week17MakeupPreferredSiteId,
    targetDay: cfg.week17MakeupTargetDay,
    forcedDay: (mode === WEEK17_MODES.byTargetDay || mode === WEEK17_MODES.byPreferredSite)
      ? (cfg.week17MakeupTargetDay || 'Mon')
      : null
  });
  applySessions(data, plan.sessions, needsById, plan.weekIndex);
  plan.conflictTransfers = transfer.transferred;
  plan.transferDetails = transfer.details;
  data._week17ClusteringStale = false;
  return plan;
}

export {
  WEEK17_MODES,
  normalizeWeek17Mode,
  getWeek17Index,
  collectWeek17MakeupNeeds,
  clearWeek17ClinicalMakeups,
  makeupGroupsNeeded,
  evenSplitSizes
};
