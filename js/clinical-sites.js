/* global App */
var App = App || {};

App.ClinicalSites = (function () {
  function getGroupFacilities(data, group) {
    if (!data || !group) return [];
    var cfg = App.DataModel.normalizeConfig(data.config);
    var raw = (cfg.clinicalGroupFacilities && cfg.clinicalGroupFacilities[group]) || [];
    if (!raw.length && data.facilities && data.facilities.length) {
      var def = App.DataModel.getDefaultFacilityIdForClinicalGroup(group, data.facilities);
      return def ? [App.DataModel.getCanonicalFacilityId(data, def)] : [];
    }
    var seen = {};
    var list = [];
    raw.forEach(function (id) {
      if (!id) return;
      var canon = App.DataModel.getCanonicalFacilityId(data, id);
      if (!canon || !App.DataModel.findFacilityById(data, canon)) return;
      var key = canon;
      if (seen[key]) return;
      seen[key] = true;
      list.push(canon);
    });
    return list;
  }

  function getPrimaryGroupFacility(data, group) {
    var list = getGroupFacilities(data, group);
    return list.length ? list[0] : null;
  }

  function groupHasMultipleSites(data, group) {
    return getGroupFacilities(data, group).length > 1;
  }

  function groupUsesWeekRanges(data, group) {
    if (!data || !data.config || !group) return false;
    var list = data.config.clinicalGroupSiteWeeks && data.config.clinicalGroupSiteWeeks[group];
    return !!(list && list.length);
  }

  function clampWeekIndex(wi) {
    var n = parseInt(wi, 10);
    if (isNaN(n)) return 0;
    if (n < 0) return 0;
    if (n > 17) return 17;
    return n;
  }

  function normalizeSiteWeekRange(data, group, range) {
    if (!range || range.facilityId == null) return null;
    var allowed = getGroupFacilities(data, group);
    var facId = App.DataModel.getCanonicalFacilityId(data, range.facilityId);
    if (!facId || !App.DataModel.findFacilityById(data, facId)) return null;
    var ok = allowed.some(function (id) {
      return App.DataModel.sameFacilitySite(data, id, facId);
    });
    if (!ok) return null;
    var start = clampWeekIndex(range.startWeekIndex);
    var end = clampWeekIndex(range.endWeekIndex);
    if (start > end) {
      var tmp = start;
      start = end;
      end = tmp;
    }
    return { facilityId: facId, startWeekIndex: start, endWeekIndex: end };
  }

  function getGroupSiteWeekRanges(data, group) {
    if (!groupUsesWeekRanges(data, group)) return [];
    var raw = data.config.clinicalGroupSiteWeeks[group] || [];
    var list = [];
    raw.forEach(function (r) {
      var norm = normalizeSiteWeekRange(data, group, r);
      if (norm) list.push(norm);
    });
    list.sort(function (a, b) {
      return a.startWeekIndex - b.startWeekIndex || a.endWeekIndex - b.endWeekIndex;
    });
    return list;
  }

  function weekInRange(weekIndex, range) {
    return weekIndex >= range.startWeekIndex && weekIndex <= range.endWeekIndex;
  }

  function resolveFacilityForClinicalOrdinal(data, group, ordinalIndex) {
    var list = getGroupFacilities(data, group);
    if (!list.length) return null;
    var idx = ordinalIndex;
    if (idx < 0) idx = 0;
    return list[idx % list.length];
  }

  function resolveFacilityForWeek(data, group, weekIndex, ordinalIndex) {
    if (groupUsesWeekRanges(data, group)) {
      var ranges = getGroupSiteWeekRanges(data, group);
      for (var i = 0; i < ranges.length; i++) {
        if (weekInRange(weekIndex, ranges[i])) return ranges[i].facilityId;
      }
      return getPrimaryGroupFacility(data, group);
    }
    return resolveFacilityForClinicalOrdinal(data, group, ordinalIndex);
  }

  function weekCoveredByRanges(weekIndex, ranges) {
    for (var i = 0; i < ranges.length; i++) {
      if (weekInRange(weekIndex, ranges[i])) return true;
    }
    return false;
  }

  function getStudentFacilityAtWeek(data, student, weekIndex) {
    if (!student || weekIndex == null || weekIndex < 0) return null;
    var cell = student.schedule && student.schedule[weekIndex];
    if (cell && cell.facilityId) {
      return App.DataModel.getCanonicalFacilityId(data, cell.facilityId);
    }
    var resolved = resolveFacilityForWeek(data, student.clinicalGroup, weekIndex, 0);
    if (resolved) return resolved;
    if (student.facilityId) {
      return App.DataModel.getCanonicalFacilityId(data, student.facilityId);
    }
    return null;
  }

  function studentAtFacilityAtWeek(data, student, weekIndex, facilityId) {
    if (!facilityId) return false;
    var atWeek = getStudentFacilityAtWeek(data, student, weekIndex);
    return App.DataModel.sameFacilitySite(data, atWeek, facilityId);
  }

  function facilityInitialsForCell(data, student, weekIndex) {
    if (!student || !groupHasMultipleSites(data, student.clinicalGroup)) return '';
    var facId = getStudentFacilityAtWeek(data, student, weekIndex);
    if (!facId) return '';
    if (App.Orientation && App.Orientation.facilityInitials) {
      return App.Orientation.facilityInitials(data, facId);
    }
    return '';
  }

  function studentHasAnyWeekAtFacility(data, student, facilityId) {
    if (!student || !facilityId) return false;
    for (var w = 0; w < 18; w++) {
      var cell = student.schedule[w];
      if (!cell || cell.inactive) continue;
      if (!(cell.clinical || cell.makeupClinical)) continue;
      if (studentAtFacilityAtWeek(data, student, w, facilityId)) return true;
    }
    return App.DataModel.sameFacilitySite(data, student.facilityId, facilityId);
  }

  function applyPrimarySitesToStudents(data) {
    if (!data || !data.students) return;
    data.students.forEach(function (s) {
      var primary = getPrimaryGroupFacility(data, s.clinicalGroup);
      if (primary) s.facilityId = primary;
    });
  }

  function validateGroupSiteWeeks(data, group) {
    var warnings = [];
    if (!groupUsesWeekRanges(data, group)) {
      return { warnings: warnings };
    }
    var allowed = getGroupFacilities(data, group);
    var raw = (data.config.clinicalGroupSiteWeeks[group] || []).slice();
    raw.forEach(function (r, idx) {
      if (!r) return;
      var start = parseInt(r.startWeekIndex, 10);
      var end = parseInt(r.endWeekIndex, 10);
      if (!isNaN(start) && !isNaN(end) && start > end) {
        warnings.push(group + ' range ' + (idx + 1) + ': start week is after end week.');
      }
      var facId = App.DataModel.getCanonicalFacilityId(data, r.facilityId);
      if (facId && !allowed.some(function (id) {
        return App.DataModel.sameFacilitySite(data, id, facId);
      })) {
        warnings.push(group + ' range ' + (idx + 1) + ': facility is not in the group site list.');
      }
    });
    var ranges = getGroupSiteWeekRanges(data, group);
    for (var i = 0; i < ranges.length; i++) {
      for (var j = i + 1; j < ranges.length; j++) {
        var a = ranges[i];
        var b = ranges[j];
        if (a.startWeekIndex <= b.endWeekIndex && b.startWeekIndex <= a.endWeekIndex) {
          warnings.push(group + ': week ranges overlap (Wk ' + (a.startWeekIndex + 1) + '–' +
            (a.endWeekIndex + 1) + ' and Wk ' + (b.startWeekIndex + 1) + '–' + (b.endWeekIndex + 1) + ').');
          break;
        }
      }
    }
    return { warnings: warnings };
  }

  function findGroupSiteWeekGaps(data, group) {
    var gaps = [];
    if (!groupUsesWeekRanges(data, group)) return gaps;
    var clinStart = (data.config.clinicalStartWeek || 5) - 1;
    var ranges = getGroupSiteWeekRanges(data, group);
    for (var w = clinStart; w < 18; w++) {
      if (App.CalendarEngine.isWeekInactive(data, w)) continue;
      if (!weekCoveredByRanges(w, ranges)) gaps.push(w);
    }
    return gaps;
  }

  function isWeekGapForGroup(data, group, weekIndex) {
    if (!groupUsesWeekRanges(data, group)) return false;
    if (App.CalendarEngine.isWeekInactive(data, weekIndex)) return false;
    var clinStart = (data.config.clinicalStartWeek || 5) - 1;
    if (weekIndex < clinStart) return false;
    return findGroupSiteWeekGaps(data, group).indexOf(weekIndex) >= 0;
  }

  function getSiteWeekPlanNotes(data) {
    var notes = [];
    if (!data || !data.config) return notes;
    App.DataModel.getClinicalGroups(data.config).forEach(function (group) {
      if (!groupUsesWeekRanges(data, group)) return;
      validateGroupSiteWeeks(data, group).warnings.forEach(function (w) {
        notes.push(w);
      });
      var gaps = findGroupSiteWeekGaps(data, group);
      if (gaps.length) {
        var labels = gaps.map(function (w) {
          return 'Wk ' + (w + 1);
        }).join(', ');
        notes.push(group + ': weeks without a site assignment (' + labels +
          ') — clinical at those weeks uses the primary site.');
      }
    });
    return notes;
  }

  function normalizeGroupSiteWeeks(data) {
    if (!data || !data.config) return;
    var cfg = data.config;
    if (!cfg.clinicalGroupSiteWeeks) cfg.clinicalGroupSiteWeeks = {};
    App.DataModel.getClinicalGroups(cfg).forEach(function (g) {
      if (!groupUsesWeekRanges(data, g)) {
        cfg.clinicalGroupSiteWeeks[g] = [];
        return;
      }
      var list = [];
      (cfg.clinicalGroupSiteWeeks[g] || []).forEach(function (r) {
        var norm = normalizeSiteWeekRange(data, g, r);
        if (norm) list.push(norm);
      });
      list.sort(function (a, b) {
        return a.startWeekIndex - b.startWeekIndex || a.endWeekIndex - b.endWeekIndex;
      });
      cfg.clinicalGroupSiteWeeks[g] = list;
    });
  }

  function collectGroupFacilitiesFromDom(data) {
    var cfg = data.config;
    if (!cfg.clinicalGroupFacilities) cfg.clinicalGroupFacilities = {};
    var groups = App.DataModel.getClinicalGroups(cfg);
    groups.forEach(function (g) { cfg.clinicalGroupFacilities[g] = []; });
    document.querySelectorAll('#cfgClinicalGroupsList [data-clin-site-facility]').forEach(function (el) {
      var group = el.getAttribute('data-clin-group');
      if (!group || !cfg.clinicalGroupFacilities[group]) return;
      var val = el.value;
      if (val) cfg.clinicalGroupFacilities[group].push(val);
    });
    groups.forEach(function (g) {
      var list = cfg.clinicalGroupFacilities[g] || [];
      var seen = {};
      cfg.clinicalGroupFacilities[g] = list.filter(function (id) {
        var canon = App.DataModel.getCanonicalFacilityId(data, id);
        if (!canon || seen[canon]) return false;
        seen[canon] = true;
        return true;
      });
      if (!cfg.clinicalGroupFacilities[g].length) {
        var fallback = App.DataModel.getDefaultFacilityIdForClinicalGroup(g, data.facilities || []);
        if (fallback) cfg.clinicalGroupFacilities[g] = [fallback];
      }
    });
    Object.keys(cfg.clinicalGroupFacilities).forEach(function (key) {
      if (groups.indexOf(key) < 0) delete cfg.clinicalGroupFacilities[key];
    });
    collectGroupSiteWeeksFromDom(data);
    normalizeGroupSiteWeeks(data);
  }

  function collectGroupSiteWeeksFromDom(data) {
    var cfg = data.config;
    if (!cfg.clinicalGroupSiteWeeks) cfg.clinicalGroupSiteWeeks = {};
    var groups = App.DataModel.getClinicalGroups(cfg);
    groups.forEach(function (g) {
      var toggle = document.querySelector(
        '[data-clin-week-ranges-toggle][data-clin-group="' + g + '"]'
      );
      if (!toggle || !toggle.checked) {
        cfg.clinicalGroupSiteWeeks[g] = [];
        return;
      }
      cfg.clinicalGroupSiteWeeks[g] = [];
      document.querySelectorAll('[data-clin-site-range-row="' + g + '"]').forEach(function (row) {
        var facEl = row.querySelector('[data-clin-site-range-facility]');
        var startEl = row.querySelector('[data-clin-site-range-start]');
        var endEl = row.querySelector('[data-clin-site-range-end]');
        if (!facEl || !startEl || !endEl || !facEl.value) return;
        cfg.clinicalGroupSiteWeeks[g].push({
          facilityId: facEl.value,
          startWeekIndex: parseInt(startEl.value, 10),
          endWeekIndex: parseInt(endEl.value, 10)
        });
      });
    });
    Object.keys(cfg.clinicalGroupSiteWeeks).forEach(function (key) {
      if (groups.indexOf(key) < 0) delete cfg.clinicalGroupSiteWeeks[key];
    });
  }

  return {
    getGroupFacilities: getGroupFacilities,
    getPrimaryGroupFacility: getPrimaryGroupFacility,
    groupHasMultipleSites: groupHasMultipleSites,
    groupUsesWeekRanges: groupUsesWeekRanges,
    getGroupSiteWeekRanges: getGroupSiteWeekRanges,
    resolveFacilityForClinicalOrdinal: resolveFacilityForClinicalOrdinal,
    resolveFacilityForWeek: resolveFacilityForWeek,
    getStudentFacilityAtWeek: getStudentFacilityAtWeek,
    studentAtFacilityAtWeek: studentAtFacilityAtWeek,
    facilityInitialsForCell: facilityInitialsForCell,
    studentHasAnyWeekAtFacility: studentHasAnyWeekAtFacility,
    applyPrimarySitesToStudents: applyPrimarySitesToStudents,
    collectGroupFacilitiesFromDom: collectGroupFacilitiesFromDom,
    collectGroupSiteWeeksFromDom: collectGroupSiteWeeksFromDom,
    normalizeGroupSiteWeeks: normalizeGroupSiteWeeks,
    validateGroupSiteWeeks: validateGroupSiteWeeks,
    findGroupSiteWeekGaps: findGroupSiteWeekGaps,
    isWeekGapForGroup: isWeekGapForGroup,
    getSiteWeekPlanNotes: getSiteWeekPlanNotes
  };
})();
