/* global App */
var App = App || {};

App.ScheduleStatus = (function () {
  function emptyAdjustments() {
    return {
      substitutionCount: 0,
      makeupClinicalCount: 0,
      simMakeupCount: 0,
      guestSimCount: 0,
      overloadCount: 0,
      nonPrimarySimCount: 0,
      makeupRecordCount: 0
    };
  }

  function schedulesGenerated(data) {
    if (!data || !data.students || !data.students.length) return false;
    return data.students.some(function (s) {
      return s.schedule && s.schedule.some(function (c) {
        return c && (c.sim || c.clinical);
      });
    });
  }

  function getSimCalendar(data) {
    if (data._simCalendar) return data._simCalendar;
    return App.Scheduler.buildProgramSimCalendar(data, data.config);
  }

  function isSubstitutionPlacement(student, cell, weekIndex, calendar, simGroups) {
    if (!cell || !cell.sim) return false;
    if (cell.simGuestGroup || cell.simOverload) return true;
    var primary = App.Scheduler.getStudentSimSlot(student, cell.sim, calendar, simGroups);
    if (!primary) return false;
    return primary.weekIndex !== weekIndex || primary.day !== (cell.simDay || 'Mon');
  }

  function scanAdjustments(data, calendar, simGroups) {
    var adj = emptyAdjustments();
    var substitutionStudents = {};
    var makeupClinicalStudents = {};
    var simMakeupStudents = {};
    var guestStudents = {};
    var overloadStudents = {};
    var nonPrimaryStudents = {};
    var makeupRecordStudents = {};

    data.students.forEach(function (student) {
      var hasSubstitution = false;
      var hasNonPrimary = false;
      student.schedule.forEach(function (cell, weekIndex) {
        if (!cell) return;
        if (cell.makeupClinical) makeupClinicalStudents[student.id] = true;
        if (cell.simMakeup) simMakeupStudents[student.id] = true;
        if (cell.simGuestGroup) {
          guestStudents[student.id] = true;
          hasSubstitution = true;
        }
        if (cell.simOverload) {
          overloadStudents[student.id] = true;
          hasSubstitution = true;
        }
        if (cell.sim && isSubstitutionPlacement(student, cell, weekIndex, calendar, simGroups)) {
          if (!cell.simGuestGroup && !cell.simOverload) {
            nonPrimaryStudents[student.id] = true;
            hasNonPrimary = true;
          }
          hasSubstitution = true;
        }
      });
      if (hasSubstitution || hasNonPrimary) substitutionStudents[student.id] = true;
      if (student.makeups && student.makeups.length) makeupRecordStudents[student.id] = true;
    });

    adj.substitutionCount = Object.keys(substitutionStudents).length;
    adj.makeupClinicalCount = Object.keys(makeupClinicalStudents).length;
    adj.simMakeupCount = Object.keys(simMakeupStudents).length;
    adj.guestSimCount = Object.keys(guestStudents).length;
    adj.overloadCount = Object.keys(overloadStudents).length;
    adj.nonPrimarySimCount = Object.keys(nonPrimaryStudents).length;
    adj.makeupRecordCount = Object.keys(makeupRecordStudents).length;
    return adj;
  }

  function hasAnyAdjustments(adj) {
    return adj.substitutionCount > 0 ||
      adj.makeupClinicalCount > 0 ||
      adj.simMakeupCount > 0 ||
      adj.makeupRecordCount > 0;
  }

  function collectIncompleteStudents(data) {
    var incomplete = [];
    var seen = {};
    data.students.forEach(function (student) {
      var vr = App.Validator.validateStudent(student, data);
      if (!vr.valid) {
        incomplete.push({
          id: student.id,
          name: student.name || 'Student',
          errors: vr.errors.slice()
        });
        seen[student.id] = true;
      }
    });
    if (App.Validator.validateStudentSimParticipation) {
      App.Validator.validateStudentSimParticipation(data).forEach(function (v) {
        if (!v.studentId || seen[v.studentId]) return;
        incomplete.push({
          id: v.studentId,
          name: v.studentName || 'Student',
          errors: [v.message]
        });
        seen[v.studentId] = true;
      });
    }
    return incomplete;
  }

  function informationalNotes(data) {
    if (!App.Feasibility || !App.Feasibility.checkInformational) return [];
    return App.Feasibility.checkInformational(data).issues.map(function (issue) {
      return App.Feasibility.formatIssue(issue);
    });
  }

  function summarize(data) {
    var result = {
      tier: 'green',
      generated: false,
      totalStudents: 0,
      incompleteCount: 0,
      incompleteStudents: [],
      orientationConflicts: [],
      adjustments: emptyAdjustments(),
      blockingIssues: [],
      notes: []
    };
    if (!data || !data.config || !data.students) return result;

    result.totalStudents = data.students.length;
    if (!result.totalStudents) return result;

    result.blockingIssues = App.Feasibility.checkBlocking(data).issues;
    result.notes = informationalNotes(data);
    if (App.ClinicalSites && App.ClinicalSites.getSiteWeekPlanNotes) {
      result.notes = result.notes.concat(App.ClinicalSites.getSiteWeekPlanNotes(data));
    }
    result.generated = schedulesGenerated(data);

    if (result.generated) {
      var calendar = getSimCalendar(data);
      var simGroups = App.DataModel.getSimGroups(data.config);
      result.adjustments = scanAdjustments(data, calendar, simGroups);
      result.incompleteStudents = collectIncompleteStudents(data);
      result.incompleteCount = result.incompleteStudents.length;
      result.orientationConflicts = App.Orientation
        ? App.Orientation.findOrientationConflicts(data)
        : [];

      if (result.orientationConflicts.length > 0) {
        result.tier = 'red';
      } else if (result.incompleteCount > 0) {
        result.tier = 'red';
      } else if (hasAnyAdjustments(result.adjustments)) {
        result.tier = 'yellow';
      } else {
        result.tier = 'green';
      }
    } else if (result.blockingIssues.length) {
      result.tier = 'red';
    } else {
      result.tier = 'yellow';
    }

    if (!result.orientationConflicts) result.orientationConflicts = [];

    return result;
  }

  function shouldShowPanel(summary) {
    if (!summary.totalStudents) return false;
    return summary.generated ||
      summary.blockingIssues.length > 0 ||
      summary.notes.length > 0;
  }

  function formatBlockingIssue(issue) {
    if (App.Feasibility && App.Feasibility.formatIssue) {
      return App.Feasibility.formatIssue(issue, { blocking: true });
    }
    return issue.message;
  }

  return {
    summarize: summarize,
    shouldShowPanel: shouldShowPanel,
    formatBlockingIssue: formatBlockingIssue,
    schedulesGenerated: schedulesGenerated,
    scanAdjustments: scanAdjustments
  };
})();
