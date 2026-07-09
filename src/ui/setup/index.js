/** Setup tab — init, render orchestration, guards, and draft mode. */

import { getData, notifyChange } from '../../core/state.js';
import { showAlert, showConfirm } from '../dialogs.js';
import { guardEditable } from '../../auth/permissions.js';
import { canAction } from '../../auth/permissions.js';
import { isValidated } from '../../auth/user-session.js';
import * as SetupDraft from '../../proposals/setup-draft.js';
import * as Audit from '../../audit/audit.js';
import * as ScheduleStatus from '../../core/schedule-status.js';
import * as Scheduler from '../../core/scheduler/index.js';
import * as DataModel from '../../core/data-model/index.js';
import * as SiteLibrary from '../../core/clinical-sites-library.js';
import { reloadFromHandle } from '../../storage/users-registry-storage.js';
import { init as initDateInputs } from '../date-inputs.js';
import { renderSetupProposalsPanel } from '../setup-proposals.js';
import { refresh, updateSemesterDisplay } from '../chrome.js';
import * as SetupConfig from '../setup-config/index.js';
import { escAttr, escHtml } from './dom-utils.js';
import {
  renderSemesterFields, updateFinalizeButtonState, updateStartDateFromSeasonYear, renderScheduleWarnings
} from './semester-fields.js';
import {
  renderSections, renderFacilities, renderFaculty, renderLeadFaculty, removeFacility, removeSection,
  syncLeadFacultyEmailFromSelect
} from './facilities-faculty.js';
import {
  renderHolidays, bindHolidayEditor, renderOrientations, updateAllHolidayWeekHints,
  updateAllOrientationWeekHints, updateOrientationWeekHint, nextOrientationDefault,
  weekSelectHtml, semesterWeekHintForIndex, collectHolidaysFromDom
} from './holidays-orientations.js';
import {
  renderRoster, initRosterDragDrop, needsRebalance, rebalanceStudents, getCohortFacilityIdForGroup,
  cohortFacilitySelectHtml
} from './roster.js';
import { collectFromForm, collectFromFormInto } from './form-collect.js';
import {
  LIVE, PLAYGROUND, getSetupScope, setSetupScope, scopeRootEl,
  resolveScopeData, syncPlaygroundSemester, setupEl
} from './scope.js';

function bindScoped(logicalId, event, handler) {
  [LIVE, PLAYGROUND].forEach(function (scope) {
    var el = document.getElementById(scope.prefix + logicalId);
    if (!el) return;
    el.addEventListener(event, function (e) {
      setSetupScope(scope);
      handler(e);
    });
  });
}

function bindScopedContainer(logicalId, event, handler) {
  [LIVE, PLAYGROUND].forEach(function (scope) {
    var el = document.getElementById(scope.prefix + logicalId);
    if (!el || el.dataset['bound' + event]) return;
    el.dataset['bound' + event] = '1';
    el.addEventListener(event, function (e) {
      setSetupScope(scope);
      handler(e);
    });
  });
}

function updateSetupStickyOffset() {
    var sticky = document.querySelector('.sticky-top');
    var top = sticky ? sticky.offsetHeight : 136;
    document.documentElement.style.setProperty('--setup-sticky-top', top + 'px');
  }

function scrollSetupToTop() {
    var scope = getSetupScope();
    var view = document.getElementById(scope.viewId);
    if (!view || !view.classList.contains('active')) return;
    var target = view.querySelector('.setup-actions-sticky') || view;
    var sticky = document.querySelector('.sticky-top');
    var offset = (sticky ? sticky.offsetHeight : 0) + 8;
    var top = target.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }

function guardSetupEdit() {
    if (getSetupScope().isPlayground) {
      if (isValidated()) {
        if (!canAction('playground.edit') && !canAction('setup.edit') && !canAction('*')) {
          showAlert('Not permitted', 'Your role cannot edit the playground.');
          return false;
        }
      }
      return true;
    }
    if (isValidated()) {
      if (!canAction('setup.edit') &&
          !canAction('setup.saveDraft') &&
          !canAction('proposals.submit')) {
        showAlert('Not permitted', 'Your role cannot edit setup.');
        return false;
      }
    }
    return guardEditable('setup');
  }

function isProposeOnlyMode() {
    return SetupDraft && SetupDraft.usesDraftMode();
  }

function resolveSetupData() {
    if (getSetupScope().isPlayground) return resolveScopeData();
    if (isProposeOnlyMode()) return SetupDraft.getWorkingForEdit();
    return getData();
  }

function resolveRenderData(passed) {
    if (passed && !isProposeOnlyMode()) return passed;
    if (isProposeOnlyMode()) return SetupDraft.getWorking();
    return passed || getData();
  }

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

function updateReadOnlyButtons(data) {
    if (getSetupScope().isPlayground) return;
    var readOnly = !!(Audit && Audit.isReadOnly(data));
    ['saveSetupBtn', 'regenerateSchedulesBtn', 'rebalanceStudentsBtn'].forEach(function (id) {
      var btn = setupEl(id);
      if (!btn) return;
      btn.disabled = readOnly;
      if (readOnly) btn.title = 'Semester in closeout — editing disabled';
      else if (btn.title === 'Semester in closeout — editing disabled') btn.title = '';
    });
    document.querySelectorAll('#view-setup .config-list-add-row .btn').forEach(function (btn) {
      btn.disabled = readOnly;
      if (readOnly) btn.title = 'Semester in closeout — editing disabled';
      else if (btn.title === 'Semester in closeout — editing disabled') btn.title = '';
    });
    if (readOnly) {
      var finalizeBtn = setupEl('finalizeSemesterBtn');
      if (finalizeBtn) {
        finalizeBtn.disabled = true;
        finalizeBtn.title = 'Semester in closeout — editing disabled';
      }
    }
  }

function markSetupDraft(data) {
    if (getSetupScope().isPlayground) return;
    if (!data || !data.meta || !data.meta.finalized) return;
    data.meta.finalized = false;
    updateFinalizeButtonState(data);
    updateSemesterDisplay();
  }

function isSetupDraftArea(el) {
    if (!el) return false;
    var inView = el.closest('#view-setup') || el.closest('#playgroundSetupRoot');
    if (!inView) return false;
    if (el.closest('.setup-actions-sticky')) return false;
    if (el.closest('#setupRoster') || el.closest('#pg-setupRoster')) return false;
    return !!(
      el.closest('#view-setup > section.card') ||
      el.closest('#playgroundSetupRoot > section.card') ||
      el.closest('.setup-program-card') ||
      el.closest('.setup-holidays-card') ||
      el.closest('.setup-orientations-card') ||
      el.closest('#setupAdvancedPanel')
    );
  }

function handleSetupDraftInput(e) {
    if (!isSetupDraftArea(e.target)) return;
    if (isProposeOnlyMode()) {
      SetupDraft.syncFromDom();
      return;
    }
    markSetupDraft(resolveSetupData());
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
          markSetupDraft(data);
          setupAfterChange(data, { rerender: true });
        }
      });
    });

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
          facilityId: next.facilityId
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
      showConfirm('Rebalance roster?', msg, function () {
        rebalanceStudents(data, syncCount);
        if (isProposeOnlyMode()) {
          setupAfterChange(data);
        } else {
          notifyChange();
          refresh();
        }
      }, { confirmLabel: 'Rebalance' });
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
  getCohortFacilityIdForGroup,
  cohortFacilitySelectHtml,
  weekSelectHtml,
  semesterWeekHintForIndex,
  guardSetupEdit,
  resolveRenderData
};
