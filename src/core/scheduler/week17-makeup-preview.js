/**
 * Enumerate and rank Week 17 clinical makeup configuration outcomes for Setup UI.
 */

import { getCanonicalFacilityId, getSimDays } from '../data-model/index.js';
import { getClinicalCaps } from './helpers.js';
import {
  WEEK17_MODES,
  normalizeWeek17Mode,
  collectWeek17MakeupNeeds,
  facilityDisplayLabel
} from './week17-makeup-candidates.js';
import { planWeek17ClinicalMakeups } from './week17-clinical-makeup.js';
import { compareOutcomeRank, makeupGroupsNeeded, evenSplitSizes } from './week17-makeup-split.js';

function cloneSemesterShallow(data) {
  return JSON.parse(JSON.stringify({
    config: data.config,
    students: data.students,
    facilities: data.facilities,
    holidays: data.holidays || [],
    calendar: data.calendar
  }));
}

function summarizePlan(plan, meta) {
  var lines = (plan.bySiteDay || []).map(function (row) {
    return row.facilityLabel + ' ' + row.day + ': ' + row.studentCount +
      ' student' + (row.studentCount === 1 ? '' : 's') + ' → ' +
      row.makeupGroups + ' group' + (row.makeupGroups === 1 ? '' : 's') +
      (row.groupSizes && row.groupSizes.length
        ? ' (' + row.groupSizes.join(' + ') + ')'
        : '');
  });
  return {
    id: meta.id,
    label: meta.label,
    mode: meta.mode,
    targetDay: meta.targetDay || null,
    preferredSiteId: meta.preferredSiteId || null,
    preferredSiteMatch: !!meta.preferredSiteMatch,
    totalMakeupGroups: plan.totalMakeupGroups,
    scheduledCount: plan.scheduledCount,
    unscheduledCount: plan.unscheduledCount,
    conflictNotesCount: plan.conflictNotesCount || (plan.notes || []).length,
    bySiteDay: plan.bySiteDay,
    notes: plan.notes || [],
    summaryLines: lines,
    maxPerClinicalGroup: plan.maxPerClinicalGroup
  };
}

/**
 * Build ranked outcome cards from the current semester's Week 17 makeup needs.
 * Uses a cloned need snapshot; does not mutate the live semester.
 */
export function previewWeek17MakeupOutcomes(data) {
  if (!data || !data.students) return [];
  var cfg = data.config || {};
  var caps = getClinicalCaps(cfg);
  var maxPer = caps.normal;
  var needsLive = collectWeek17MakeupNeeds(data, { includeShortfall: false });
  if (!needsLive.length) {
    return [{
      id: 'none',
      label: 'No Week 17 clinical makeups to consolidate',
      mode: normalizeWeek17Mode(cfg.week17MakeupMode),
      totalMakeupGroups: 0,
      scheduledCount: 0,
      unscheduledCount: 0,
      conflictNotesCount: 0,
      bySiteDay: [],
      notes: [],
      summaryLines: ['No students currently have a Week 17 makeup clinical.'],
      maxPerClinicalGroup: maxPer,
      preferredSiteMatch: false
    }];
  }

  var outcomes = [];
  var simDays = getSimDays(cfg);
  var facilities = (data.facilities || []).map(function (f) {
    return getCanonicalFacilityId(data, f.id);
  }).filter(Boolean);

  function runOnClone(mode, extra, meta) {
    var clone = cloneSemesterShallow(data);
    // Mirror need list onto clone students by id
    var byId = {};
    clone.students.forEach(function (s) { byId[s.id] = s; });
    var needs = needsLive.map(function (n) {
      return {
        student: byId[n.studentId],
        studentId: n.studentId,
        clinicalGroup: n.clinicalGroup,
        assignedSiteId: n.assignedSiteId,
        assignedDay: n.assignedDay,
        weekIndex: n.weekIndex,
        hadMakeup: false,
        clinicalConflict: n.clinicalConflict
      };
    }).filter(function (n) { return n.student; });

    // Clear week17 makeups on clone so eligibility checks pass
    var wi = needs[0] && needs[0].weekIndex;
    clone.students.forEach(function (s) {
      var cell = s.schedule[wi];
      if (cell && cell.makeupClinical) {
        cell.makeupClinical = false;
        if (!cell.clinical) cell.facilityId = null;
      }
      s.makeups = (s.makeups || []).filter(function (m) {
        return !(m.type === 'clinical' && m.weekIndex === wi);
      });
    });

    var plan = planWeek17ClinicalMakeups(clone, Object.assign({
      mode: mode,
      needs: needs
    }, extra || {}));
    outcomes.push(summarizePlan(plan, meta));
  }

  runOnClone(WEEK17_MODES.byAssignedDay, {}, {
    id: 'assigned-day',
    label: 'Cluster by assigned clinical day',
    mode: WEEK17_MODES.byAssignedDay,
    preferredSiteMatch: false
  });

  simDays.forEach(function (day) {
    runOnClone(WEEK17_MODES.byTargetDay, { targetDay: day }, {
      id: 'target-' + day,
      label: 'Target makeup day: ' + day,
      mode: WEEK17_MODES.byTargetDay,
      targetDay: day,
      preferredSiteMatch: false
    });
  });

  facilities.forEach(function (facId) {
    var label = facilityDisplayLabel(data, facId);
    runOnClone(WEEK17_MODES.byPreferredSite, { preferredSiteId: facId }, {
      id: 'site-' + facId,
      label: 'Prefer consolidate at ' + label + ' (site-assigned students first)',
      mode: WEEK17_MODES.byPreferredSite,
      preferredSiteId: facId,
      preferredSiteMatch: true
    });
    simDays.forEach(function (day) {
      runOnClone(WEEK17_MODES.byPreferredSite, {
        preferredSiteId: facId,
        forcedDay: day,
        targetDay: day
      }, {
        id: 'site-' + facId + '-' + day,
        label: 'Prefer ' + label + ' on ' + day,
        mode: WEEK17_MODES.byPreferredSite,
        preferredSiteId: facId,
        targetDay: day,
        preferredSiteMatch: true
      });
    });
  });

  // Baseline: current distribution without rebalance (groups by site+assigned day)
  var baselineBuckets = {};
  needsLive.forEach(function (n) {
    var cell = n.student.schedule[n.weekIndex];
    var day = n.assignedDay;
    var mk = (n.student.makeups || []).find(function (m) {
      return m.type === 'clinical' && m.weekIndex === n.weekIndex;
    });
    if (mk && mk.joinedDay) day = mk.joinedDay;
    var siteId = n.assignedSiteId || (cell && cell.facilityId);
    var key = (siteId || '?') + '|' + day;
    if (!baselineBuckets[key]) {
      baselineBuckets[key] = {
        facilityId: siteId,
        facilityLabel: facilityDisplayLabel(data, siteId),
        day: day,
        studentCount: 0
      };
    }
    baselineBuckets[key].studentCount++;
  });
  var baselineBySiteDay = Object.keys(baselineBuckets).sort().map(function (k) {
    var b = baselineBuckets[k];
    return {
      facilityId: b.facilityId,
      facilityLabel: b.facilityLabel,
      day: b.day,
      studentCount: b.studentCount,
      makeupGroups: makeupGroupsNeeded(b.studentCount, maxPer),
      groupSizes: evenSplitSizes(b.studentCount, maxPer)
    };
  });
  var baselineGroups = baselineBySiteDay.reduce(function (sum, r) {
    return sum + r.makeupGroups;
  }, 0);
  outcomes.push({
    id: 'current',
    label: 'Current placement (no consolidation)',
    mode: WEEK17_MODES.current,
    targetDay: null,
    preferredSiteId: null,
    preferredSiteMatch: false,
    totalMakeupGroups: baselineGroups,
    scheduledCount: needsLive.length,
    unscheduledCount: 0,
    conflictNotesCount: 0,
    bySiteDay: baselineBySiteDay,
    notes: [],
    summaryLines: baselineBySiteDay.map(function (row) {
      return row.facilityLabel + ' ' + row.day + ': ' + row.studentCount +
        ' students → ' + row.makeupGroups + ' groups (' +
        (row.groupSizes || []).join(' + ') + ')';
    }),
    maxPerClinicalGroup: maxPer
  });

  outcomes.sort(compareOutcomeRank);
  return outcomes;
}

export function applyPreviewOutcomeToConfig(cfg, outcome) {
  if (!cfg || !outcome) return cfg;
  if (outcome.mode === WEEK17_MODES.current) {
    cfg.week17MakeupMode = WEEK17_MODES.current;
    return cfg;
  }
  cfg.week17MakeupMode = outcome.mode;
  if (outcome.targetDay) cfg.week17MakeupTargetDay = outcome.targetDay;
  if (outcome.preferredSiteId) {
    cfg.week17MakeupPreferredSiteId = outcome.preferredSiteId;
  }
  return cfg;
}
