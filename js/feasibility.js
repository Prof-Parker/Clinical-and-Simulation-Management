/* global App */
var App = App || {};

App.Feasibility = (function () {
  var SUGGESTIONS = {
    roster_over_capacity: 'Reduce student count or increase Max students in Advanced Configuration.',
    clinical_group_over_capacity: 'Increase Max per clinical group, add clinical groups, or rebalance students.',
    roster_imbalance: 'Click Rebalance students to evenly distribute students across clinical groups.',
    insufficient_clinical_weeks: 'Reduce clinical days required, move clinical start week earlier, or remove holidays/breaks.',
    insufficient_sim_weeks: 'Reduce simulation days required, move sim start week earlier, or remove holidays/breaks.',
    insufficient_sim_blocks: 'Reduce simulation days required or remove holidays/breaks so each sim has a full two-week block.',
    insufficient_sim_capacity: 'Increase max students per sim session, add simulation days, or reduce student count.',
    day_overlap_risk: 'Stagger clinical group weekdays away from simulation days where possible.',
    sim_slots_unfilled: 'Regenerate the schedule, rebalance students, or increase max students per sim session / overload cap.',
    sim_headroom_too_high: 'Reduce sim makeup headroom or increase max students per sim session.'
  };

  function makeIssue(id, rule, message, studentCount, studentIds, suggestionKey) {
    return {
      id: id,
      rule: rule,
      message: message,
      studentCount: studentCount || 0,
      studentIds: studentIds || [],
      suggestion: SUGGESTIONS[suggestionKey] || 'Review semester setup and Advanced Configuration.'
    };
  }

  function formatIssue(issue) {
    var n = issue.studentCount || 0;
    var students = n === 1 ? '1 student affected' : n + ' students affected';
    return 'Schedule may not be generatable: ' + issue.message + ' — ' + students +
      '. Suggestion: ' + (issue.suggestion || 'Review semester setup.');
  }

  function countSimSlots(data) {
    var cfg = data.config;
    var simDays = App.DataModel.getSimDays(cfg);
    var simGroups = App.DataModel.getSimGroups(cfg);
    var weeks = App.CalendarEngine.getActiveSchedulingWeeks(data);
    var slotsPerPattern = App.Scheduler.SIM_GROUP_SCHEDULE.SG1.weeks.length;
    return weeks.length * simDays.length * simGroups.length * 0.5 + slotsPerPattern * simDays.length;
  }

  function estimateSimCapacity(data) {
    var cfg = data.config;
    var cap = cfg.maxStudentsPerSimSession || 8;
    var simDays = App.DataModel.getSimDays(cfg);
    var calendar = App.Scheduler.buildProgramSimCalendar(data, cfg);
    var slotCount = 0;
    calendar.blocks.forEach(function (block) {
      block.weeks.forEach(function () {
        slotCount += simDays.length;
      });
    });
    return slotCount * cap;
  }

  function countActiveSimBlocks(data) {
    var calendar = App.Scheduler.buildProgramSimCalendar(data, data.config);
    return calendar.blocks.filter(function (b) { return b.weeks.length > 0; }).length;
  }

  function needsRebalance(data) {
    if (App.UI && App.UI.Setup && App.UI.Setup.needsRebalance) {
      return App.UI.Setup.needsRebalance(data);
    }
    var groups = App.DataModel.getClinicalGroups(data.config);
    var maxStudents = data.config.maxStudents || 30;
    var maxPer = data.config.maxPerClinicalGroup || 6;
    if (data.students.length !== maxStudents) return true;
    var counts = {};
    groups.forEach(function (g) { counts[g] = 0; });
    var orphan = false;
    data.students.forEach(function (s) {
      if (counts[s.clinicalGroup] !== undefined) counts[s.clinicalGroup]++;
      else orphan = true;
    });
    if (orphan) return true;
    if (groups.some(function (g) { return (counts[g] || 0) > maxPer; })) return true;
    var vals = groups.map(function (g) { return counts[g] || 0; });
    if (!vals.length) return false;
    return Math.max.apply(null, vals) - Math.min.apply(null, vals) > 1;
  }

  function checkIncompleteGeneration(data) {
    if (!App.Validator || !data.students || !data.students.length) return [];
    var hasSchedules = data.students.some(function (s) {
      return s.schedule && s.schedule.some(function (c) { return c.sim || c.clinical; });
    });
    if (!hasSchedules) return [];
    var violations = App.Validator.validateStudentSimParticipation(data);
    if (!violations.length) return [];
    var ids = violations.map(function (v) { return v.studentId; }).filter(Boolean);
    return [makeIssue(
      'sim_slots_unfilled',
      'Use existing available sim slots when possible',
      violations.length + ' student(s) missing required simulation days after schedule generation',
      violations.length,
      ids,
      'sim_slots_unfilled'
    )];
  }

  function check(data) {
    if (!data || !data.config) return { ok: true, issues: [] };
    var cfg = data.config;
    var issues = [];
    var maxStudents = cfg.maxStudents || 30;
    var maxPer = cfg.maxPerClinicalGroup || 6;
    var clinReq = cfg.clinicalDaysRequired || 10;
    var simReq = cfg.simDaysRequired || 5;

    if (data.students.length > maxStudents) {
      issues.push(makeIssue(
        'roster_over_capacity',
        'Clinical group and simulation group size',
        'Total students (' + data.students.length + ') exceeds max students (' + maxStudents + ')',
        data.students.length,
        data.students.map(function (s) { return s.id; }),
        'roster_over_capacity'
      ));
    }

    var groupCounts = {};
    App.DataModel.getClinicalGroups(cfg).forEach(function (g) { groupCounts[g] = 0; });
    var overCapIds = [];
    data.students.forEach(function (s) {
      if (groupCounts[s.clinicalGroup] !== undefined) {
        groupCounts[s.clinicalGroup]++;
        if (groupCounts[s.clinicalGroup] > maxPer) overCapIds.push(s.id);
      }
    });
    if (overCapIds.length) {
      var overGroups = Object.keys(groupCounts).filter(function (g) { return groupCounts[g] > maxPer; });
      issues.push(makeIssue(
        'clinical_group_over_capacity',
        'Clinical group and simulation group size',
        overGroups.join(', ') + ' exceed max per clinical group (' + maxPer + ')',
        overCapIds.length,
        overCapIds,
        'clinical_group_over_capacity'
      ));
    }

    if (needsRebalance(data)) {
      issues.push(makeIssue(
        'roster_imbalance',
        'Each student assigned to one clinical group',
        'Student roster is not evenly balanced across clinical groups',
        data.students.length,
        data.students.map(function (s) { return s.id; }),
        'roster_imbalance'
      ));
    }

    if (data.calendar && App.CalendarEngine) {
      App.CalendarEngine.rebuildWeeks(data);
      var clinWeeks = App.CalendarEngine.getClinicalEligibleWeeks(data).length;
      if (clinWeeks < clinReq) {
        issues.push(makeIssue(
          'insufficient_clinical_weeks',
          'Required clinical days',
          'Only ' + clinWeeks + ' active clinical weeks available but ' + clinReq + ' required',
          data.students.length,
          data.students.map(function (s) { return s.id; }),
          'insufficient_clinical_weeks'
        ));
      }

      var simBlocks = countActiveSimBlocks(data);
      if (simBlocks < simReq) {
        issues.push(makeIssue(
          'insufficient_sim_blocks',
          'Required simulation days',
          'Only ' + simBlocks + ' active sim blocks available but ' + simReq + ' required',
          data.students.length,
          data.students.map(function (s) { return s.id; }),
          'insufficient_sim_blocks'
        ));
      }

      var simWeeks = App.CalendarEngine.getActiveSchedulingWeeks(data).length;
      if (simWeeks < simReq) {
        issues.push(makeIssue(
          'insufficient_sim_weeks',
          'Required simulation days',
          'Only ' + simWeeks + ' active scheduling weeks available but ' + simReq + ' sim days required',
          data.students.length,
          data.students.map(function (s) { return s.id; }),
          'insufficient_sim_weeks'
        ));
      }

      var simCapacity = estimateSimCapacity(data);
      var simDemand = data.students.length * simReq;
      if (simDemand > simCapacity) {
        issues.push(makeIssue(
          'insufficient_sim_capacity',
          'Simulation session capacity',
          'Estimated sim session capacity (' + Math.floor(simCapacity) + ') may not fit ' +
            simDemand + ' total sim assignments',
          data.students.length,
          data.students.map(function (s) { return s.id; }),
          'insufficient_sim_capacity'
        ));
      }

      var simNormal = cfg.maxStudentsPerSimSession || 8;
      var headroom = cfg.simMakeupHeadroomReserved != null ? cfg.simMakeupHeadroomReserved : 1;
      if (headroom >= simNormal) {
        issues.push(makeIssue(
          'sim_headroom_too_high',
          'Sim makeup headroom reserve',
          'Sim makeup headroom (' + headroom + ') must be less than max students per sim session (' +
            simNormal + ')',
          data.students.length,
          data.students.map(function (s) { return s.id; }),
          'sim_headroom_too_high'
        ));
      }
    }

    var simDays = App.DataModel.getSimDays(cfg);
    var overlapIds = [];
    data.students.forEach(function (s) {
      var clinDay = App.DataModel.getClinicalDayForGroup(s.clinicalGroup, cfg);
      if (simDays.indexOf(clinDay) >= 0) overlapIds.push(s.id);
    });
    if (overlapIds.length) {
      issues.push(makeIssue(
        'day_overlap_risk',
        'Sim/clinical day overlap',
        overlapIds.length + ' students have a clinical weekday that overlaps a simulation day',
        overlapIds.length,
        overlapIds,
        'day_overlap_risk'
      ));
    }

    var capacityBlocked = issues.some(function (i) {
      return i.id === 'insufficient_sim_capacity' || i.id === 'insufficient_sim_blocks';
    });
    if (!capacityBlocked) {
      issues = issues.concat(checkIncompleteGeneration(data));
    }

    return { ok: issues.length === 0, issues: issues };
  }

  return {
    check: check,
    formatIssue: formatIssue,
    SUGGESTIONS: SUGGESTIONS
  };
})();
