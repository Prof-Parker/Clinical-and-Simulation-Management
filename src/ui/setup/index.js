/** Setup tab — init, render orchestration, guards, and draft mode. */

import { getData, notifyChange } from '../../core/state.js';
import { showAlert, showConfirm } from '../dialogs.js';
import { guardEditable } from '../../auth/permissions.js';
import { canAction } from '../../auth/permissions.js';
import * as SetupDraft from '../../proposals/setup-draft.js';
import * as ScheduleStatus from '../../core/schedule-status.js';
import * as Scheduler from '../../core/scheduler/index.js';
import * as DataModel from '../../core/data-model/index.js';
import * as SiteLibrary from '../../core/clinical-sites-library.js';
import { reloadFromHandle } from '../../storage/users-registry-storage.js';
import { init as initDateInputs } from '../date-inputs.js';
import { renderSetupProposalsPanel } from '../setup-proposals.js';
import { refresh } from '../chrome.js';
import * as SetupConfig from '../setup-config/index.js';
import {
  renderSemesterFields, updateStartDateFromSeasonYear, renderScheduleWarnings
} from './semester-fields.js';
import {
  renderSections, renderFacilities, renderFaculty, renderSimInstructors, handleSimInstructorClick,
  renderLeadFaculty, removeFacility, removeSection,
  syncLeadFacultyEmailFromSelect
} from './facilities-faculty.js';
import {
  renderHolidays, bindHolidayEditor, renderOrientations, updateAllHolidayWeekHints,
  updateAllOrientationWeekHints, updateOrientationWeekHint, nextOrientationDefault,
  weekSelectHtml, semesterWeekHintForIndex, collectHolidaysFromDom
} from './holidays-orientations.js';
import * as TheoryData from '../../core/theory-data.js';
import {
  renderRoster, initRosterDragDrop, needsRebalance, rebalanceStudents, rebalanceSimGroups, getCohortFacilityIdForGroup,
  cohortFacilitySelectHtml
} from './roster.js';
import { collectFromForm, collectFromFormInto } from './form-collect.js';
import {
  LIVE, PLAYGROUND, getSetupScope, setSetupScope, scopeRootEl,
  syncPlaygroundSemester
} from './scope.js';
import {
  bindScoped, bindScopedContainer, updateSetupStickyOffset, scrollSetupToTop
} from './scoped-bindings.js';
import {
  guardSetupEdit,
  isProposeOnlyMode,
  resolveSetupData,
  resolveRenderData,
  updateReadOnlyButtons,
  markSetupDraft,
  handleSetupDraftInput
} from './setup-guards.js';

function setupAfterChange(data, opts) {
    if (getSetupScope().isPlayground) {
      syncPlaygroundSemester(data);
      if (!opts || opts.rerender !== false) render(data);
      import('../chrome.js').then(function (m) {
        if (m.refreshPlaygroundDashboard) m.refreshPlaygroundDashboard();
      });
      return;
    }
    if (SetupDraft && SetupDraft.persistAfterEdit) {
      SetupDraft.persistAfterEdit(data, opts || {});
      return;
    }
    notifyChange();
    if (opts && opts.configBefore !== undefined) {
      SetupConfig.maybeRegenerateAfterChange(data, opts.configBefore);
    }
    if (!opts || opts.rerender !== false) render(data);
  }

function render(data) {
    var paintScope = getSetupScope();
    var paint = function (renderData) {
      var prevScope = getSetupScope();
      setSetupScope(paintScope);
      try {
        renderSemesterFields(renderData);
        renderSections(renderData);
        renderFacilities(renderData);
        renderFaculty(renderData);
        renderSimInstructors(renderData);
        renderLeadFaculty(renderData);
        renderHolidays(renderData);
        renderOrientations(renderData);
        renderRoster(renderData);
        renderScheduleWarnings(renderData);
        SetupConfig.render(renderData);
        initDateInputs(scopeRootEl(paintScope), renderData);
        updateAllHolidayWeekHints(renderData);
        updateAllOrientationWeekHints(renderData);
        updateReadOnlyButtons(renderData);
        if (!paintScope.isPlayground) renderSetupProposalsPanel();
        if (SetupConfig.applyRoleMode) SetupConfig.applyRoleMode();
      } finally {
        setSetupScope(prevScope);
      }
    };
    var startPaint = function () {
      paint(resolveRenderData(data));
    };
    var ready = function () {
      if (isProposeOnlyMode() && SetupDraft.loadLocalDraft) {
        return SetupDraft.loadLocalDraft().then(startPaint).catch(startPaint);
      }
      startPaint();
      return Promise.resolve();
    };
    if (reloadFromHandle) {
      return reloadFromHandle().then(ready).catch(ready);
    }
    return ready();
  }

function runRegenerateSchedules() {
    if (!getSetupScope().isPlayground && !guardEditable('regenerate')) return;
    if (!guardSetupEdit()) return;
    var data = resolveSetupData();
    collectFromForm(data);
    var confirmMsg = 'Regenerate all student schedules? Manual edits will be lost.';
    var summary = ScheduleStatus.summarize(data);
    if (summary.tier === 'yellow') {
      confirmMsg = 'Schedules will be regenerated. Substitutions or makeup days may be needed for some students.\n\nRegenerate anyway? Manual edits will be lost.';
      if (summary.blockingIssues.length) {
        var blockers = summary.blockingIssues.map(function (i) {
          return ScheduleStatus.formatBlockingIssue(i);
        }).join('\n\n');
        confirmMsg = 'Schedule issues detected:\n\n' + blockers + '\n\nRegenerate anyway? Manual edits will be lost.';
      }
    } else if (summary.tier === 'red') {
      var parts = [];
      if (summary.blockingIssues.length) {
        parts = summary.blockingIssues.map(function (i) {
          return ScheduleStatus.formatBlockingIssue(i);
        });
      }
      if (summary.incompleteStudents.length) {
        summary.incompleteStudents.forEach(function (s) {
          parts.push(s.name + ': ' + s.errors.join('; '));
        });
      }
      confirmMsg = 'Schedule problems detected:\n\n' + parts.join('\n\n') +
        '\n\nRegenerate anyway? Manual edits will be lost.';
    }
    showConfirm('Regenerate schedules?', confirmMsg, function () {
      Scheduler.regenerateAll(data);
      setupAfterChange(data);
      if (!getSetupScope().isPlayground) refresh();
      else render(data);
      scrollSetupToTop();
    }, { confirmLabel: 'Regenerate' });
  }

function init() {
    initRosterDragDrop();
    [LIVE, PLAYGROUND].forEach(function (scope) {
      var root = scopeRootEl(scope);
      if (!root) return;
      root.addEventListener('input', function (e) {
        setSetupScope(scope);
        handleSetupDraftInput(e);
      });
      root.addEventListener('change', function (e) {
        setSetupScope(scope);
        if (e.target && e.target.id === scope.prefix + 'leadFacultySelect') {
          syncLeadFacultyEmailFromSelect();
        }
        handleSetupDraftInput(e);
      });
    });

    bindScoped('semesterSeasonSelect', 'change', updateStartDateFromSeasonYear);
    bindScoped('semesterYearSelect', 'change', updateStartDateFromSeasonYear);

    bindScoped('saveSetupBtn', 'click', function () {
      if (!guardSetupEdit()) return;
      if (canAction('setup.edit')) {
        var data = getData();
        var configBefore = collectFromForm(data);
        notifyChange();
        SetupConfig.maybeRegenerateAfterChange(data, configBefore);
        refresh();
        showAlert('Saved', 'Setup saved.');
      } else if (SetupDraft) {
        SetupDraft.saveLocalDraft().then(function () {
          showAlert('Draft saved', 'Changes kept locally. Use Propose changes when ready.');
        });
      } else {
        showAlert('Draft saved', 'Changes kept locally. Use Propose changes when ready.');
      }
      scrollSetupToTop();
    });

    bindScoped('finalizeSemesterBtn', 'click', function () {
      if (!guardSetupEdit()) return;
      var data = getData();
      collectFromForm(data);
      data.meta.finalized = true;
      notifyChange();
      refresh();
      showAlert('Finalized', 'Semester finalized.');
    });

    bindScoped('regenerateSchedulesBtn', 'click', function () {
      runRegenerateSchedules();
    });

    updateSetupStickyOffset();
    window.addEventListener('resize', updateSetupStickyOffset);

    bindScopedContainer('setupSections', 'click', function (e) {
      if (e.target.closest('.add-section')) {
        if (!guardSetupEdit()) return;
        var data = resolveSetupData();
        collectFromForm(data);
        if (!data.sections) data.sections = [];
        data.sections.push({ id: DataModel.uid(), name: '' });
        markSetupDraft(data);
        setupAfterChange(data);
        return;
      }
      var btn = e.target.closest('.remove-section');
      if (!btn) return;
      if (!guardSetupEdit()) return;
      removeSection(resolveSetupData(), btn.dataset.secId);
    });

    bindScopedContainer('setupFacilities', 'click', function (e) {
      if (e.target.closest('.add-facility')) {
        if (!guardSetupEdit()) return;
        var data = resolveSetupData();
        collectFromForm(data);
        var newFac = null;
        if (SiteLibrary) {
          var unused = SiteLibrary.list().find(function (s) {
            return !data.facilities.some(function (f) {
              return f.siteId === s.id ||
                DataModel.normalizeFacilityName(f.name) === SiteLibrary.normalizeName(s.name);
            });
          });
          if (!unused) {
            showAlert('No sites available',
              'All library sites are already in use for this semester. Add a new site to the clinical site library in Advanced Configuration first.');
            return;
          }
          newFac = {
            id: DataModel.uid(),
            siteId: unused.id,
            name: unused.name,
            shortName: unused.shortName,
            contentTags: unused.contentTags.slice()
          };
        } else {
          newFac = { id: DataModel.uid(), name: 'New Facility' };
        }
        data.facilities.push(newFac);
        markSetupDraft(data);
        setupAfterChange(data);
        return;
      }
      var btn = e.target.closest('.remove-facility');
      if (!btn) return;
      if (!guardSetupEdit()) return;
      removeFacility(resolveSetupData(), btn.dataset.facId);
    });

    bindScopedContainer('setupFacilities', 'change', function (e) {
      if (e.target.getAttribute('data-fac') !== 'site') return;
      if (!guardSetupEdit()) return;
      var data = resolveSetupData();
      collectFromForm(data);
      markSetupDraft(data);
      setupAfterChange(data);
    });

    [LIVE, PLAYGROUND].forEach(function (scope) {
      bindHolidayEditor(scope.prefix + 'setupHolidays', {
        guard: guardSetupEdit,
        getData: function () {
          setSetupScope(scope);
          return resolveSetupData();
        },
        onChange: function (data) {
          setSetupScope(scope);
          collectFromForm(data);
          if (data.theory) TheoryData.syncHolidaysFromSemester(data);
          markSetupDraft(data);
          setupAfterChange(data, { rerender: true });
        }
      });
    });

    bindScopedContainer('setupSimInstructors', 'click', handleSimInstructorClick);

    bindScopedContainer('setupOrientations', 'click', function (e) {
      if (e.target.closest('.add-orientation')) {
        if (!guardSetupEdit()) return;
        var data = resolveSetupData();
        collectFromForm(data);
        if (!data.orientations) data.orientations = [];
        var next = nextOrientationDefault(data);
        data.orientations.push({
          id: DataModel.uid(),
          clinicalGroup: next.clinicalGroup,
          date: '',
          facilityId: next.facilityId,
          timeStart: next.timeStart || '0800',
          timeEnd: next.timeEnd || '1200'
        });
        markSetupDraft(data);
        setupAfterChange(data);
        return;
      }
      var btn = e.target.closest('.remove-orientation');
      if (!btn) return;
      if (!guardSetupEdit()) return;
      var data = resolveSetupData();
      collectFromForm(data);
      data.orientations.splice(parseInt(btn.dataset.idx, 10), 1);
      markSetupDraft(data);
      setupAfterChange(data);
    });

    bindScopedContainer('setupOrientations', 'change', function (e) {
      if (e.target.getAttribute('data-orient') !== 'date') return;
      updateOrientationWeekHint(resolveRenderData(), e.target);
    });

    bindScopedContainer('setupOrientations', 'input', function (e) {
      if (e.target.getAttribute('data-orient') !== 'date') return;
      updateOrientationWeekHint(resolveRenderData(), e.target);
    });

    bindScoped('rebalanceStudentsBtn', 'click', function () {
      if (!guardSetupEdit()) return;
      var data = resolveSetupData();
      collectFromForm(data);
      var syncCount = data.students.length !== (data.config.maxStudents || 30);
      var msg = syncCount
        ? 'Adjust roster to ' + (data.config.maxStudents || 30) + ' students and evenly assign across clinical groups?'
        : 'Evenly assign all students across clinical groups?';
      showConfirm('Rebalance clinical groups?', msg, function () {
        rebalanceStudents(data, syncCount);
        if (isProposeOnlyMode()) {
          setupAfterChange(data);
        } else {
          notifyChange();
          refresh();
        }
      }, { confirmLabel: 'Rebalance' });
    });

    bindScoped('rebalanceSimGroupsBtn', 'click', function () {
      if (!guardSetupEdit()) return;
      var data = resolveSetupData();
      collectFromForm(data);
      showConfirm(
        'Rebalance simulation groups?',
        'Balance simulation groups to the session size cap, keep clinical cohorts aligned when possible, and regenerate until each student is at or under the guest soft cap (up to 5 passes)? Manual schedule edits will be lost.',
        function () {
          var result = rebalanceSimGroups(data);
          if (isProposeOnlyMode()) {
            setupAfterChange(data);
          } else {
            notifyChange();
            refresh();
          }
          if (result && result.guestBefore != null && result.guestAfter != null) {
            var softCap = result.softCap != null ? result.softCap : 1;
            var summary = 'Simulation groups updated (' + result.changed + ' assignment(s), ' +
              result.passes + ' pass(es)). Guest sim placements: ' + result.guestBefore +
              ' → ' + result.guestAfter +
              '. Max guests per student: ' + (result.maxGuestAfter != null ? result.maxGuestAfter : '?') +
              ' (soft cap ' + softCap + ')';
            if (result.oversizedBefore != null && result.oversizedAfter != null) {
              summary += '. Oversized sim groups: ' + result.oversizedBefore +
                ' → ' + result.oversizedAfter;
            }
            summary += '.';
            if (result.metSoftCap === false) {
              var over = result.studentsOverSoftCap != null ? result.studentsOverSoftCap : 0;
              summary += ' Warning: ' + over +
                ' student(s) still exceed the guest soft cap after ' + result.passes + ' pass(es).';
              showAlert('Simulation groups rebalanced — soft cap unmet', summary);
            } else {
              showAlert('Simulation groups rebalanced', summary);
            }
          }
        },
        { confirmLabel: 'Rebalance' }
      );
    });
  }

export {
  render,
  init,
  collectFromForm,
  collectFromFormInto,
  resolveSetupData,
  isProposeOnlyMode,
  setupAfterChange,
  collectHolidaysFromDom,
  renderHolidays,
  bindHolidayEditor,
  markSetupDraft,
  needsRebalance,
  rebalanceStudents,
  rebalanceSimGroups,
  getCohortFacilityIdForGroup,
  cohortFacilitySelectHtml,
  weekSelectHtml,
  semesterWeekHintForIndex,
  guardSetupEdit,
  resolveRenderData
};
