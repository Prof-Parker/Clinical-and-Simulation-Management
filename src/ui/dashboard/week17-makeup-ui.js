/**
 * Dashboard panel: Week 17 (makeup primary) clinical clustering controls.
 * Apply is explicit — regenerateAll never auto-clusters.
 */

import { getData, notifyChange } from '../../core/state.js';
import * as DataModel from '../../core/data-model/index.js';
import * as Scheduler from '../../core/scheduler/index.js';

var onApplied = null;

function el(id) {
  return document.getElementById(id);
}

function resolvedMakeupWeekNumber(data) {
  var wi = Scheduler.getWeek17Index(data);
  return (wi != null ? wi : 16) + 1;
}

function updateToggleLabel(data) {
  var btn = el('week17MakeupToggleBtn');
  if (!btn) return;
  var n = data ? resolvedMakeupWeekNumber(data) : 17;
  btn.textContent = 'Makeup clinicals week ' + n;
}

function syncContextualFields() {
  var mode = el('week17MakeupMode');
  var dayWrap = el('week17MakeupDayWrap');
  var siteWrap = el('week17MakeupSiteWrap');
  if (!mode || !dayWrap || !siteWrap) return;
  var v = mode.value;
  var showDay = v === 'byTargetDay' || v === 'byPreferredSite';
  var showSite = v === 'byPreferredSite';
  dayWrap.classList.toggle('hidden', !showDay);
  siteWrap.classList.toggle('hidden', !showSite);
}

function populateSiteSelect(data) {
  var sel = el('week17MakeupPreferredSite');
  if (!sel || !data) return;
  var cur = data.config && data.config.week17MakeupPreferredSiteId;
  sel.innerHTML = '<option value="">Select site…</option>';
  (data.facilities || []).forEach(function (f) {
    if (!f || !f.id) return;
    var opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.shortName || f.name || f.id;
    if (cur && DataModel.sameFacilitySite(data, cur, f.id)) opt.selected = true;
    sel.appendChild(opt);
  });
}

function populateDaySelect(data) {
  var sel = el('week17MakeupTargetDay');
  if (!sel) return;
  var days = DataModel.getSimDays(data && data.config);
  if (!days.length) days = ['Mon', 'Tue'];
  var cur = (data && data.config && data.config.week17MakeupTargetDay) || 'Mon';
  sel.innerHTML = '';
  days.forEach(function (d) {
    var opt = document.createElement('option');
    opt.value = d;
    opt.textContent = d;
    if (d === cur) opt.selected = true;
    sel.appendChild(opt);
  });
}

function formatPlanMessage(plan, data) {
  if (!plan) return 'No changes (mode is Leave as scheduled).';
  var lines = [];
  if (plan.conflictTransfers) {
    lines.push('Conflict sims transferred: ' + plan.conflictTransfers);
  }
  lines.push(
    'Scheduled ' + (plan.scheduledCount || 0) +
    ' makeup clinicals in week ' + (plan.week || resolvedMakeupWeekNumber(data)) +
    ' → ' + (plan.totalMakeupGroups || 0) + ' faculty group' +
    ((plan.totalMakeupGroups === 1) ? '' : 's') + '.'
  );
  (plan.bySiteDay || []).forEach(function (row) {
    lines.push(
      '• ' + row.facilityLabel + ' ' + row.day + ': ' + row.studentCount +
      ' → ' + row.makeupGroups + ' group(s)' +
      (row.groupSizes && row.groupSizes.length ? ' (' + row.groupSizes.join(' + ') + ')' : '')
    );
  });
  if (plan.unscheduledCount) {
    lines.push('Unscheduled: ' + plan.unscheduledCount + ' (see notes).');
  }
  (plan.notes || []).slice(0, 8).forEach(function (n) {
    lines.push('• ' + n);
  });
  // Spill warning for preferred-site mode
  var mode = data && data.config && data.config.week17MakeupMode;
  var pref = data && data.config && data.config.week17MakeupPreferredSiteId;
  if (mode === 'byPreferredSite' && pref) {
    var spill = (plan.bySiteDay || []).filter(function (row) {
      return !DataModel.sameFacilitySite(data, row.facilityId, pref);
    });
    if (spill.length) {
      lines.push(
        'Warning: preferred-site packing could not absorb all demand; ' +
        'non-preferred site makeups remain (not silent spill).'
      );
    }
  }
  return lines.join('\n');
}

function setMessage(text, isReminder) {
  var box = el('week17MakeupMessages');
  if (!box) return;
  box.textContent = text || '';
  box.classList.toggle('week17-makeup-reminder', !!isReminder);
}

function readFormIntoConfig(data) {
  var cfg = data.config;
  var modeEl = el('week17MakeupMode');
  var dayEl = el('week17MakeupTargetDay');
  var siteEl = el('week17MakeupPreferredSite');
  if (modeEl) cfg.week17MakeupMode = modeEl.value || 'current';
  if (dayEl) cfg.week17MakeupTargetDay = dayEl.value || 'Mon';
  if (siteEl) cfg.week17MakeupPreferredSiteId = siteEl.value || null;
  DataModel.normalizeConfig(cfg);
}

function loadFormFromConfig(data) {
  if (!data || !data.config) return;
  DataModel.normalizeConfig(data.config);
  var modeEl = el('week17MakeupMode');
  var dayEl = el('week17MakeupTargetDay');
  if (modeEl) modeEl.value = data.config.week17MakeupMode || 'current';
  populateDaySelect(data);
  populateSiteSelect(data);
  if (dayEl && data.config.week17MakeupTargetDay) {
    dayEl.value = data.config.week17MakeupTargetDay;
  }
  syncContextualFields();
  updateToggleLabel(data);
  if (data._week17ClusteringStale) {
    setMessage(
      'Schedules were regenerated. Makeup week clustering (mode: ' +
      (data.config.week17MakeupMode || 'current') +
      ') is not applied until you click Apply makeup week rebalance.',
      true
    );
  }
}

function togglePanel() {
  var panel = el('week17MakeupPanel');
  if (!panel) return;
  var open = panel.classList.toggle('hidden') === false;
  if (open) loadFormFromConfig(getData());
}

function applyRebalance() {
  var data = getData();
  if (!data) return;
  readFormIntoConfig(data);
  if (data.config.week17MakeupMode === 'byPreferredSite' &&
      !data.config.week17MakeupPreferredSiteId) {
    setMessage('Select a preferred clinical site before applying.', false);
    return;
  }
  var plan = Scheduler.rebalanceWeek17ClinicalMakeups(data);
  notifyChange();
  setMessage(formatPlanMessage(plan, data), false);
  if (typeof onApplied === 'function') onApplied(data);
}

function updateReminderFromData(data) {
  updateToggleLabel(data);
  if (!data) return;
  if (data._week17ClusteringStale) {
    var box = el('week17MakeupMessages');
    if (box && !box.textContent) {
      setMessage(
        'Schedules were regenerated. Re-apply makeup week clustering if needed.',
        true
      );
    }
  }
}

function init(opts) {
  opts = opts || {};
  onApplied = opts.onApplied || null;
  var toggle = el('week17MakeupToggleBtn');
  var apply = el('week17MakeupApplyBtn');
  var mode = el('week17MakeupMode');
  if (toggle) {
    toggle.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      togglePanel();
    });
  }
  if (apply) {
    apply.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      applyRebalance();
    });
  }
  if (mode) {
    mode.addEventListener('change', syncContextualFields);
  }
  // Prevent summary toggle from collapsing when interacting with panel controls
  var panel = el('week17MakeupPanel');
  if (panel) {
    panel.addEventListener('click', function (e) {
      e.stopPropagation();
    });
  }
}

export {
  init,
  loadFormFromConfig,
  updateReminderFromData,
  updateToggleLabel,
  resolvedMakeupWeekNumber
};
