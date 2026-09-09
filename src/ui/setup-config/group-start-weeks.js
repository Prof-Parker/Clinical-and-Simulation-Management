/**
 * Per-clinical-group start week panel (variable start weeks mode).
 */

import * as DataModel from '../../core/data-model/index.js';
import { setupEl, setupQueryAll } from '../setup/scope.js';
import { escAttr, escHtml } from '../setup/dom-utils.js';

function seedMissingGroupStarts(cfg) {
  if (!cfg.clinicalGroupStartWeek || typeof cfg.clinicalGroupStartWeek !== 'object') {
    cfg.clinicalGroupStartWeek = {};
  }
  var fallback = cfg.clinicalStartWeek || 5;
  (cfg.clinicalGroups || []).forEach(function (g) {
    if (cfg.clinicalGroupStartWeek[g] == null || cfg.clinicalGroupStartWeek[g] === '') {
      cfg.clinicalGroupStartWeek[g] = fallback;
    }
  });
}

export function toggleGroupStartWeeksPanel(enabled) {
  var panel = setupEl('cfgGroupStartWeeksPanel');
  if (panel) panel.classList.toggle('hidden', !enabled);
}

export function renderGroupStartWeeks(cfg) {
  var list = setupEl('cfgGroupStartWeeksList');
  if (!list) return;
  var enabled = !!cfg.variableStartWeeksPerGroup;
  toggleGroupStartWeeksPanel(enabled);
  if (!enabled) {
    list.innerHTML = '';
    return;
  }
  seedMissingGroupStarts(cfg);
  var fallback = cfg.clinicalStartWeek || 5;
  var groups = DataModel.getClinicalGroups(cfg);
  var html = '<p class="section-sub" style="margin:0 0 0.35rem">Clinical Groups</p>';
  groups.forEach(function (g) {
    var val = cfg.clinicalGroupStartWeek[g] != null ? cfg.clinicalGroupStartWeek[g] : fallback;
    var gAttr = escAttr(g);
    html +=
      '<div class="config-list-row" data-clin-group-start-row="' + gAttr + '">' +
      '<label style="display:flex;align-items:center;gap:0.5rem;margin:0">' +
      '<span style="min-width:2.5rem">' + escHtml(g) + ':</span>' +
      '<span style="flex:1">Starting week' +
      '<input type="number" min="1" max="18" data-clin-group-start="' + gAttr + '" ' +
      'value="' + escAttr(String(val)) + '" aria-label="' + gAttr + ' starting week">' +
      '</span></label></div>';
  });
  list.innerHTML = html;
}

export function collectGroupStartWeeksIntoConfig(cfg) {
  var flagEl = setupEl('cfgVariableStartWeeks');
  if (flagEl) cfg.variableStartWeeksPerGroup = !!flagEl.checked;
  if (!cfg.clinicalGroupStartWeek || typeof cfg.clinicalGroupStartWeek !== 'object') {
    cfg.clinicalGroupStartWeek = {};
  }
  var fallback = cfg.clinicalStartWeek || 5;
  setupQueryAll('cfgGroupStartWeeksList', '[data-clin-group-start]').forEach(function (input) {
    var g = input.getAttribute('data-clin-group-start');
    if (!g) return;
    var n = parseInt(input.value, 10);
    cfg.clinicalGroupStartWeek[g] = isNaN(n) ? fallback : n;
  });
  if (cfg.variableStartWeeksPerGroup) seedMissingGroupStarts(cfg);
}

export function ensureGroupStartWeeksSeeded(cfg) {
  if (!cfg.variableStartWeeksPerGroup) return;
  seedMissingGroupStarts(cfg);
}
