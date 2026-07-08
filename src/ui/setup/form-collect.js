/** Collect setup form fields into semester data. */

import * as DataModel from '../../core/data-model/index.js';
import * as CalendarEngine from '../../core/calendar-engine.js';
import * as ClinicalSites from '../../core/clinical-sites.js';
import * as SiteLibrary from '../../core/clinical-sites-library.js';
import { collectHolidaysFromDom } from './holidays-orientations.js';
import { collectSemesterMeta } from './semester-fields.js';
import { applyGroupFacilitiesFromConfig } from './facilities-faculty.js';
import * as SetupConfig from '../setup-config/index.js';
import { markSetupDraft } from './index.js';

export function collectFromFormInto(data, opts) {
  opts = opts || {};
  var sectionRenames = {};

  document.querySelectorAll('#setupSections [data-sec="name"]').forEach(function (el) {
    var sec = data.sections.find(function (s) { return s.id === el.dataset.secId; });
    if (!sec) return;
    var oldName = sec.name;
    sec.name = el.value.trim();
    if (oldName !== sec.name) sectionRenames[oldName] = sec.name;
  });

  document.querySelectorAll('#setupRoster [data-id]').forEach(function (el) {
    var s = data.students.find(function (st) { return st.id === el.dataset.id; });
    if (!s) return;
    if (el.dataset.field === 'facilityId') return;
    s[el.dataset.field] = el.value;
  });

  applyGroupFacilitiesFromConfig(data);

  Object.keys(sectionRenames).forEach(function (oldName) {
    var newName = sectionRenames[oldName];
    data.students.forEach(function (s) {
      if (s.section === oldName) s.section = newName;
    });
  });

  document.querySelectorAll('#setupFacilities [data-fac="site"]').forEach(function (el) {
    var f = data.facilities.find(function (fac) { return fac.id === el.dataset.facId; });
    if (!f) return;
    var site = el.value ? SiteLibrary.getById(el.value) : null;
    if (site) {
      f.siteId = site.id;
      f.name = site.name;
      f.shortName = site.shortName;
      f.contentTags = site.contentTags.slice();
    }
  });
  document.querySelectorAll('#setupFaculty [data-faculty]').forEach(function (el) {
    var f = data.faculty[parseInt(el.dataset.idx, 10)];
    if (f) f.name = el.value;
  });
  if (!data.meta.leadFaculty) data.meta.leadFaculty = { name: '', email: '' };
  var leadSel = document.getElementById('leadFacultySelect');
  var leadNameEl = document.getElementById('leadFacultyName');
  var leadEmailEl = document.getElementById('leadFacultyEmail');
  if (leadSel && !leadSel.classList.contains('hidden')) {
    data.meta.leadFaculty.name = leadSel.value.trim();
    var opt = leadSel.selectedOptions && leadSel.selectedOptions[0];
    data.meta.leadFaculty.email = (opt && opt.dataset.email)
      ? String(opt.dataset.email).trim()
      : (leadEmailEl ? leadEmailEl.value.trim() : '');
  } else if (leadNameEl) {
    data.meta.leadFaculty.name = leadNameEl.value.trim();
    if (leadEmailEl) data.meta.leadFaculty.email = leadEmailEl.value.trim();
  }
  collectHolidaysFromDom(data, 'setupHolidays');
  if (!data.orientations) data.orientations = [];
  document.querySelectorAll('#setupOrientations [data-orient]').forEach(function (el) {
    var o = data.orientations[parseInt(el.dataset.idx, 10)];
    if (!o) return;
    if (el.dataset.orient === 'date') o.date = el.value;
    if (el.dataset.orient === 'group') o.clinicalGroup = el.value;
    if (el.dataset.orient === 'facility') o.facilityId = el.value;
  });
  (data.orientations || []).forEach(function (o) {
    if (o.date) {
      o.weekIndex = CalendarEngine.getWeekIndexForDate(data, o.date);
    }
  });
  collectSemesterMeta(data, opts, markSetupDraft);
  data.calendar.semesterStartDate = document.getElementById('semesterStartDate').value;
  DataModel.normalizeFacilities(data);
  CalendarEngine.rebuildWeeks(data);

  var configBefore = DataModel.cloneConfig(data.config);
  if (SetupConfig.collectIntoData) {
    configBefore = SetupConfig.collectIntoData(data);
  }
  return configBefore;
}

export function collectFromForm(data) {
  return collectFromFormInto(data, {});
}
