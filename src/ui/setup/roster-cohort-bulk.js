/**
 * Cohort section/sim bulk-assign HTML and apply helpers for the setup roster.
 */

import * as DataModel from '../../core/data-model/index.js';
import { escAttr } from './dom-utils.js';

function predominantField(cohort, field) {
  var counts = {};
  var best = '';
  var bestN = 0;
  cohort.forEach(function (s) {
    var v = s[field];
    if (!v) return;
    counts[v] = (counts[v] || 0) + 1;
    if (counts[v] > bestN) {
      bestN = counts[v];
      best = v;
    }
  });
  return best;
}

export function predominantSection(cohort) {
  return predominantField(cohort, 'section');
}

export function predominantSimGroup(cohort) {
  return predominantField(cohort, 'simGroup');
}

export function cohortSectionSummaryText(cohort) {
  var counts = {};
  cohort.forEach(function (s) {
    if (!s.section) return;
    counts[s.section] = (counts[s.section] || 0) + 1;
  });
  var keys = Object.keys(counts);
  if (!keys.length) return '';
  if (keys.length === 1) return keys[0];
  return keys.map(function (k) { return k + ' (' + counts[k] + ')'; }).join(', ');
}

export function cohortSectionBulkSelectHtml(data, clinicalGroup, cohort) {
  var selected = predominantSection(cohort);
  var mixed = cohort.length > 0 && cohort.some(function (s) {
    return s.section && s.section !== selected;
  });
  var html = '<label class="setup-cohort-bulk setup-cohort-section-bulk">' +
    '<span class="setup-cohort-section-label">Section</span>' +
    '<select data-cohort-section-bulk="' + escAttr(clinicalGroup) + '" aria-label="Set section for all in ' + clinicalGroup + '">' +
    '<option value=""' + (mixed ? ' selected' : '') + '>' + (mixed ? 'Mixed sections' : 'Set all…') + '</option>';
  (data.sections || []).forEach(function (sec) {
    if (!sec.name) return;
    html += '<option value="' + escAttr(sec.name) + '"' +
      (!mixed && selected === sec.name ? ' selected' : '') + '>' + escAttr(sec.name) + '</option>';
  });
  html += '</select></label>';
  return html;
}

export function cohortSimBulkSelectHtml(data, clinicalGroup, cohort) {
  var selected = predominantSimGroup(cohort);
  var mixed = cohort.length > 0 && cohort.some(function (s) {
    return s.simGroup && s.simGroup !== selected;
  });
  var html = '<label class="setup-cohort-bulk setup-cohort-sim-bulk">' +
    '<span class="setup-cohort-section-label">Sim</span>' +
    '<select data-cohort-sim-bulk="' + escAttr(clinicalGroup) + '" aria-label="Set simulation group for all in ' + clinicalGroup + '">' +
    '<option value=""' + (mixed ? ' selected' : '') + '>' + (mixed ? 'Mixed sim groups' : 'Set all…') + '</option>';
  DataModel.getSimGroups(data.config).forEach(function (sg) {
    html += '<option value="' + escAttr(sg) + '"' +
      (!mixed && selected === sg ? ' selected' : '') + '>' + escAttr(sg) + '</option>';
  });
  html += '</select></label>';
  return html;
}

export function applyCohortSection(data, clinicalGroup, sectionName) {
  data.students.forEach(function (s) {
    if (s.clinicalGroup === clinicalGroup) s.section = sectionName;
  });
}

export function applyCohortSimGroup(data, clinicalGroup, simGroup) {
  data.students.forEach(function (s) {
    if (s.clinicalGroup === clinicalGroup) s.simGroup = simGroup;
  });
}

export function cohortBulkControlsRowHtml(data, clinicalGroup, cohort) {
  return '<div class="setup-cohort-bulk-row" aria-label="Bulk assign section and sim for ' + clinicalGroup + '">' +
    '<span></span><span></span><span></span><span></span>' +
    cohortSectionBulkSelectHtml(data, clinicalGroup, cohort) +
    cohortSimBulkSelectHtml(data, clinicalGroup, cohort) +
    '<span></span><span></span>' +
    '</div>';
}
