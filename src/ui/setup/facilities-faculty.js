/** Facilities, sections, and faculty fields on setup. */

import { getData } from '../../core/state.js';
import { showAlert, showConfirm } from '../dialogs.js';
import * as DataModel from '../../core/data-model/index.js';
import * as ClinicalSites from '../../core/clinical-sites.js';
import * as SiteLibrary from '../../core/clinical-sites-library.js';
import * as ScheduleHours from '../../core/schedule-hours.js';
import * as UserDirectory from '../../storage/user-directory.js';
import { isReady as isRegistryReady } from '../../storage/users-registry-storage.js';
import { escAttr, escHtml, configListAddRow } from './dom-utils.js';
import { guardSetupEdit, resolveSetupData, setupAfterChange, collectFromForm, markSetupDraft } from './index.js';
import { getSetupScope, setupEl } from './scope.js';
import {
  clinicalFacultyRowHtml,
  simInstructorRowHtml
} from './faculty-slots.js';

function renderSections(data) {
    var container = setupEl('setupSections');
    container.innerHTML = '';
    (data.sections || []).forEach(function (sec) {
      container.innerHTML +=
        '<div class="setup-item-row">' +
        '<input type="text" class="setup-section-code" data-sec="name" data-sec-id="' + sec.id + '" value="' + escAttr(sec.name) + '" placeholder="F6011" maxlength="12">' +
        '<button class="btn btn-icon-remove remove-section" type="button" data-sec-id="' + sec.id + '" aria-label="Remove section" title="Remove section">&times;</button>' +
        '</div>';
    });
    if (!data.sections.length) {
      container.innerHTML = '<p class="section-sub setup-list-empty-hint">No sections defined.</p>';
    }
    container.innerHTML += configListAddRow('add-section', 'Add');
  }

function facilitySiteSelectHtml(data, facility) {
    var sites = SiteLibrary ? SiteLibrary.list() : [];
    var selectedSiteId = facility.siteId || null;
    if (!selectedSiteId && SiteLibrary) {
      var match = SiteLibrary.matchByName(facility.name);
      if (match) selectedSiteId = match.id;
    }
    var html = '';
    var listed = false;
    sites.forEach(function (s) {
      var sel = s.id === selectedSiteId;
      if (sel) listed = true;
      var label = s.name + (s.shortName ? ' (' + s.shortName + ')' : '');
      html += '<option value="' + s.id + '"' + (sel ? ' selected' : '') + '>' + escAttr(label) + '</option>';
    });
    if (!listed) {
      html = '<option value="" selected>' + escAttr(facility.name) + ' (unlisted)</option>' + html;
    }
    return html;
  }

function facilityTagsHtml(facility) {
    var tags = (facility.contentTags && facility.contentTags.length) ? facility.contentTags : ['MS'];
    return '<span class="setup-facility-tags" title="Specialty content areas (edit in Advanced Configuration)">' +
      tags.map(function (t) { return '<span class="content-tag-badge">' + escHtml(t) + '</span>'; }).join('') +
      '</span>';
  }

function renderFacilities(data) {
    var container = setupEl('setupFacilities');
    container.innerHTML = '';
    DataModel.getUniqueFacilitiesForSelect(data).forEach(function (f) {
      ScheduleHours.ensureFacilityTimes(f);
      var canRemove = data.facilities.length > 1;
      var hours = ScheduleHours.roundHours(
        ScheduleHours.resolveClinicalDayHours(data, f.id)
      );
      container.innerHTML +=
        '<div class="config-list-row setup-facility-row setup-facility-row-times">' +
        '<select data-fac="site" data-fac-id="' + f.id + '" aria-label="Clinical site">' +
        facilitySiteSelectHtml(data, f) + '</select>' +
        facilityTagsHtml(f) +
        '<label class="setup-facility-time">' +
        '<span class="setup-facility-time-label">Start</span>' +
        '<input type="time" data-fac="start" data-fac-id="' + f.id + '" value="' +
        escAttr(ScheduleHours.hhmmToTimeInput(f.clinicalStart)) + '" aria-label="Clinical start time">' +
        '</label>' +
        '<label class="setup-facility-time">' +
        '<span class="setup-facility-time-label">End</span>' +
        '<input type="time" data-fac="end" data-fac-id="' + f.id + '" value="' +
        escAttr(ScheduleHours.hhmmToTimeInput(f.clinicalEnd)) + '" aria-label="Clinical end time">' +
        '</label>' +
        '<span class="section-sub setup-facility-hours" title="Hours per clinical day">' + hours + ' h</span>' +
        (canRemove
          ? '<button class="btn btn-icon-remove remove-facility" type="button" data-fac-id="' + f.id + '" aria-label="Remove facility" title="Remove facility">&times;</button>'
          : '<span class="section-sub" style="font-size:0.75rem;white-space:nowrap">Min. 1</span>') +
        '</div>';
    });
    container.innerHTML += configListAddRow('add-facility', 'Add facility');
  }

function renderFaculty(data) {
    updateAdjunctFacultyDatalist();
    var container = setupEl('setupFaculty');
    var listId = getSetupScope().prefix + 'setupAdjunctFacultyList';
    container.innerHTML = '';
    data.faculty.forEach(function (f, i) {
      container.innerHTML += clinicalFacultyRowHtml(f, i, listId);
    });
  }

function renderSimInstructors(data) {
    updateAdjunctFacultyDatalist();
    var container = setupEl('setupSimInstructors');
    if (!container) return;
    if (!data.simInstructors) data.simInstructors = [];
    var listId = getSetupScope().prefix + 'setupAdjunctFacultyList';
    container.innerHTML = '';
    data.simInstructors.forEach(function (f, i) {
      container.innerHTML += simInstructorRowHtml(f, i, listId);
    });
    container.innerHTML += configListAddRow('add-sim-instructor', 'Add simulation instructor');
  }

function handleSimInstructorClick(e) {
    var data = resolveSetupData();
    if (!data || !guardSetupEdit()) return;
    if (e.target.closest('.add-sim-instructor')) {
      collectFromForm(data);
      if (!data.simInstructors) data.simInstructors = [];
      data.simInstructors.push({ id: DataModel.uid(), name: '', needed: false });
      markSetupDraft(data);
      setupAfterChange(data);
      return;
    }
    var rm = e.target.closest('.remove-sim-instructor');
    if (rm) {
      collectFromForm(data);
      var idx = parseInt(rm.dataset.idx, 10);
      if (!isNaN(idx)) data.simInstructors.splice(idx, 1);
      markSetupDraft(data);
      setupAfterChange(data);
    }
  }

function handleFacultySlotChange(e) {
    var slotSel = e.target.closest('[data-faculty="slot"], [data-sim-instructor="slot"]');
    if (!slotSel) return;
    if (!guardSetupEdit()) return;
    var wrap = slotSel.closest('.setup-faculty-slot');
    var nameInput = wrap && wrap.querySelector('input[data-faculty="name"], input[data-sim-instructor="name"]');
    if (slotSel.value === '__needed__') {
      if (nameInput) {
        nameInput.value = '';
        nameInput.disabled = true;
        nameInput.classList.add('setup-autofill-field');
      }
    } else {
      if (nameInput) {
        nameInput.disabled = false;
        nameInput.classList.remove('setup-autofill-field');
        if (slotSel.value === '__named__') nameInput.focus();
      }
    }
  }

function updateAdjunctFacultyDatalist() {
    var list = setupEl('setupAdjunctFacultyList');
    if (!list || !UserDirectory) return;
    var users = UserDirectory.getAdjunctFaculty();
    list.innerHTML = users.map(function (u) {
      return '<option value="' + escAttr(u.displayName) + '"></option>';
    }).join('');
  }

function syncLeadFacultyEmailFromSelect() {
    var sel = setupEl('leadFacultySelect');
    var emailEl = setupEl('leadFacultyEmail');
    if (!sel || !emailEl || sel.classList.contains('hidden')) return;
    var opt = sel.selectedOptions && sel.selectedOptions[0];
    if (opt && opt.dataset.email) {
      emailEl.value = opt.dataset.email;
    } else if (!sel.value) {
      emailEl.value = '';
    }
  }

function renderLeadFaculty(data) {
    var lead = (data.meta && data.meta.leadFaculty) || { name: '', email: '' };
    var sel = setupEl('leadFacultySelect');
    var nameEl = setupEl('leadFacultyName');
    var emailEl = setupEl('leadFacultyEmail');
    var hintEl = setupEl('leadFacultyRegistryHint');
    if (!nameEl || !emailEl) return;

    var leads = UserDirectory ? UserDirectory.getLeadCourseFaculty() : [];
    var useSelect = !!(sel && leads.length);

    if (useSelect) {
      sel.classList.remove('hidden');
      nameEl.classList.add('hidden');
      nameEl.disabled = true;
      sel.disabled = false;
      var html = '<option value="">Select lead faculty…</option>';
      var matched = false;
      leads.forEach(function (u) {
        var selected = lead.name === u.displayName;
        if (selected) matched = true;
        html += '<option value="' + escAttr(u.displayName) + '" data-email="' + escAttr(u.email) + '"' +
          (selected ? ' selected' : '') + '>' + escHtml(u.displayName) + '</option>';
      });
      if (lead.name && !matched) {
        html += '<option value="' + escAttr(lead.name) + '" data-email="' + escAttr(lead.email) + '" selected>' +
          escHtml(lead.name) + ' (saved)</option>';
      }
      sel.innerHTML = html;
      if (!sel.value && lead.name && matched) {
        sel.value = lead.name;
      }
      syncLeadFacultyEmailFromSelect();
      if (!sel.value) emailEl.value = lead.email || '';
      emailEl.readOnly = true;
      emailEl.classList.add('setup-autofill-field');
      if (hintEl) {
        hintEl.textContent = leads.length + ' active lead course facult' +
          (leads.length === 1 ? 'y' : 'ies') + ' from user registry.';
        hintEl.classList.remove('hidden');
      }
    } else {
      if (sel) {
        sel.classList.add('hidden');
        sel.disabled = true;
      }
      nameEl.classList.remove('hidden');
      nameEl.disabled = false;
      nameEl.value = lead.name || '';
      emailEl.value = lead.email || '';
      emailEl.readOnly = false;
      emailEl.classList.remove('setup-autofill-field');
      if (hintEl) {
        if (isRegistryReady()) {
          hintEl.textContent = 'No active lead course faculty in the registry. Enter name manually.';
        } else {
          hintEl.textContent = 'Connect users registry to pick lead faculty from registered users.';
        }
        hintEl.classList.remove('hidden');
      }
    }
  }

function applyGroupFacilitiesFromConfig(data) {
    if (ClinicalSites) {
      ClinicalSites.collectGroupFacilitiesFromDom(data);
      ClinicalSites.applyPrimarySitesToStudents(data);
      return;
    }
    document.querySelectorAll('[data-clin-site-facility]').forEach(function (el) {
      var group = el.getAttribute('data-clin-group');
      var siteIndex = parseInt(el.getAttribute('data-clin-site-index'), 10) || 0;
      if (siteIndex === 0) applyGroupFacility(data, group, el.value);
    });
  }

function removeFacility(data, facId) {
    if (data.facilities.length <= 1) return;
    collectFromForm(data);
    var idx = data.facilities.findIndex(function (f) { return f.id === facId; });
    if (idx < 0) return;
    var fallback = data.facilities[idx === 0 ? 1 : 0];
    data.facilities.splice(idx, 1);
    data.students.forEach(function (s) {
      if (s.facilityId === facId) s.facilityId = fallback.id;
    });
    if (data.config && data.config.clinicalGroupFacilities) {
      Object.keys(data.config.clinicalGroupFacilities).forEach(function (g) {
        var seen = {};
        data.config.clinicalGroupFacilities[g] = (data.config.clinicalGroupFacilities[g] || [])
          .map(function (id) { return id === facId ? fallback.id : id; })
          .filter(function (id) {
            if (!id || seen[id]) return false;
            seen[id] = true;
            return true;
          });
        if (!data.config.clinicalGroupFacilities[g].length) {
          data.config.clinicalGroupFacilities[g] = [fallback.id];
        }
      });
    }
    if (data.config && data.config.clinicalGroupSiteWeeks) {
      Object.keys(data.config.clinicalGroupSiteWeeks).forEach(function (g) {
        data.config.clinicalGroupSiteWeeks[g] = (data.config.clinicalGroupSiteWeeks[g] || [])
          .filter(function (r) {
            return r && r.facilityId !== facId &&
              !DataModel.sameFacilitySite(data, r.facilityId, facId);
          })
          .map(function (r) {
            if (DataModel.sameFacilitySite(data, r.facilityId, facId)) {
              return { facilityId: fallback.id, startWeekIndex: r.startWeekIndex, endWeekIndex: r.endWeekIndex };
            }
            return r;
          });
      });
    }
    DataModel.normalizeFacilities(data);
    markSetupDraft(data);
    setupAfterChange(data);
  }

function removeSection(data, secId) {
    collectFromForm(data);
    var sec = data.sections.find(function (s) { return s.id === secId; });
    if (!sec) return;
    data.sections = data.sections.filter(function (s) { return s.id !== secId; });
    data.students.forEach(function (s) {
      if (s.section === sec.name) s.section = '';
    });
    markSetupDraft(data);
    setupAfterChange(data);
  }

export {
  renderSections,
  renderFacilities,
  renderFaculty,
  renderSimInstructors,
  handleSimInstructorClick,
  handleFacultySlotChange,
  renderLeadFaculty,
  applyGroupFacilitiesFromConfig,
  removeFacility,
  removeSection,
  syncLeadFacultyEmailFromSelect
};
