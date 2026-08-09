/**
 * Shared clinical / sim / name filters for student-picker UIs.
 */

import * as DataModel from '../core/data-model/index.js';
import * as ClinicalSites from '../core/clinical-sites.js';

export function clinicalGroupFilterLabel(data, group) {
  var day = DataModel.getClinicalDayForGroup(group, data.config);
  var siteLabel = '';
  var facId = ClinicalSites.getPrimaryGroupFacility(data, group);
  if (facId) {
    var fac = DataModel.findFacilityById(data, facId);
    if (fac) siteLabel = fac.shortName || fac.name || '';
  }
  return [group, day, siteLabel].filter(Boolean).join(' ');
}

/**
 * @param {object} data
 * @param {{ clinicalId?: string, simId?: string, searchId?: string }} ids
 */
export function populateRosterFilters(data, ids) {
  ids = ids || {};
  var clinEl = document.getElementById(ids.clinicalId || '');
  var simEl = document.getElementById(ids.simId || '');
  if (clinEl) {
    var prevClin = clinEl.value || 'all';
    clinEl.innerHTML = '';
    var allClin = document.createElement('option');
    allClin.value = 'all';
    allClin.textContent = 'All clinical groups';
    clinEl.appendChild(allClin);
    DataModel.getClinicalGroups(data.config).forEach(function (g) {
      var opt = document.createElement('option');
      opt.value = g;
      opt.textContent = clinicalGroupFilterLabel(data, g);
      clinEl.appendChild(opt);
    });
    if (prevClin && (prevClin === 'all' || DataModel.getClinicalGroups(data.config).indexOf(prevClin) >= 0)) {
      clinEl.value = prevClin;
    }
  }
  if (simEl) {
    var prevSim = simEl.value || 'all';
    simEl.innerHTML = '';
    var allSim = document.createElement('option');
    allSim.value = 'all';
    allSim.textContent = 'All sim groups';
    simEl.appendChild(allSim);
    DataModel.getSimGroups(data.config).forEach(function (sg) {
      var opt = document.createElement('option');
      opt.value = sg;
      opt.textContent = sg;
      simEl.appendChild(opt);
    });
    if (prevSim && (prevSim === 'all' || DataModel.getSimGroups(data.config).indexOf(prevSim) >= 0)) {
      simEl.value = prevSim;
    }
  }
}

/**
 * @param {object} data
 * @param {{ clinicalId?: string, simId?: string, searchId?: string }} ids
 */
export function filterStudentsByRosterControls(data, ids) {
  ids = ids || {};
  var clinEl = document.getElementById(ids.clinicalId || '');
  var simEl = document.getElementById(ids.simId || '');
  var searchEl = document.getElementById(ids.searchId || '');
  var clin = clinEl ? clinEl.value : 'all';
  var sim = simEl ? simEl.value : 'all';
  var q = searchEl ? String(searchEl.value || '').trim().toLowerCase() : '';
  return (data.students || []).filter(function (s) {
    if (clin && clin !== 'all' && s.clinicalGroup !== clin) return false;
    if (sim && sim !== 'all' && s.simGroup !== sim) return false;
    if (q) {
      var hay = [
        s.name,
        s.lastName,
        s.firstName,
        [s.lastName, s.firstName].filter(Boolean).join(' ')
      ].join(' ').toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  });
}

export function resetRosterFilters(ids) {
  ids = ids || {};
  var clinEl = document.getElementById(ids.clinicalId || '');
  var simEl = document.getElementById(ids.simId || '');
  var searchEl = document.getElementById(ids.searchId || '');
  if (clinEl) clinEl.value = 'all';
  if (simEl) simEl.value = 'all';
  if (searchEl) searchEl.value = '';
}

export function bindRosterFilterListeners(ids, onChange) {
  ids = ids || {};
  [ids.clinicalId, ids.simId].forEach(function (id) {
    var el = id && document.getElementById(id);
    if (el) el.addEventListener('change', onChange);
  });
  var search = ids.searchId && document.getElementById(ids.searchId);
  if (search) search.addEventListener('input', onChange);
}
