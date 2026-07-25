/** Click/change handlers for advanced setup configuration lists. */

import { getData, getFileRoot, notifyChange, addSemester } from '../../core/state.js';
import { showAlert, showConfirm } from '../dialogs.js';
import * as DataModel from '../../core/data-model/index.js';
import { WEEKDAY_OPTIONS } from '../../core/data-model/config.js';
import * as SiteLibrary from '../../core/clinical-sites-library.js';
import * as ScheduleHours from '../../core/schedule-hours.js';
import * as Setup from '../setup/index.js';
import {
  resolveSetupData, collectFormInto, finishSetupEdit, touchSetupEdit, draftConfigFromForm,
  readFormIntoConfig, refreshDynamicLists, getGroupFacilityIds, addSiteToGroup, addRangeToGroup,
  collectSiteLibraryFromDom, renderSiteLibrary
} from './index.js';

var dayOptions = WEEKDAY_OPTIONS;

function handleSetupClick(e) {
    if (e.target.classList.contains('add-site-lib')) {
      if (!SiteLibrary) return;
      collectSiteLibraryFromDom();
      SiteLibrary.upsertSite({ name: 'New Site', shortName: '', contentTags: ['MS'] });
      renderSiteLibrary();
      touchSetupEdit(getData());
      notifyChange();
      return;
    }

    if (e.target.closest('.remove-site-lib')) {
      if (!SiteLibrary) return;
      var siteBtnLib = e.target.closest('.remove-site-lib');
      var libSiteId = siteBtnLib.getAttribute('data-site-id');
      collectSiteLibraryFromDom();
      if (SiteLibrary.isSiteReferenced(getFileRoot(), libSiteId)) {
        showAlert('Site in use',
          'This site is referenced by a semester facility list and cannot be removed. Remove it from all semesters first.');
        renderSiteLibrary();
        return;
      }
      SiteLibrary.removeSite(libSiteId);
      renderSiteLibrary();
      touchSetupEdit(getData());
      notifyChange();
      return;
    }

    if (e.target.classList.contains('add-clin-site-range')) {
      var dataRange = resolveSetupData();
      collectFormInto(dataRange);
      var rangeGroup = e.target.getAttribute('data-clin-group');
      if (!dataRange.config.clinicalGroupSiteWeeks) dataRange.config.clinicalGroupSiteWeeks = {};
      dataRange.config.clinicalGroupSiteWeeks[rangeGroup] = dataRange.config.clinicalGroupSiteWeeks[rangeGroup] || [];
      addRangeToGroup(dataRange, rangeGroup);
      touchSetupEdit(dataRange);
      return;
    }

    if (e.target.closest('.remove-clin-site-range')) {
      var rangeBtn = e.target.closest('.remove-clin-site-range');
      var rg = rangeBtn.getAttribute('data-clin-group');
      var dataRangeRemove = resolveSetupData();
      collectFormInto(dataRangeRemove);
      var rangeRow = rangeBtn.closest('.clin-site-range-row');
      var plan = document.querySelector('[data-clin-group-week-plan="' + rg + '"]');
      var rows = plan ? plan.querySelectorAll('.clin-site-range-row') : [];
      var rIdx = Array.prototype.indexOf.call(rows, rangeRow);
      if (rIdx >= 0 && dataRangeRemove.config.clinicalGroupSiteWeeks[rg]) {
        dataRangeRemove.config.clinicalGroupSiteWeeks[rg].splice(rIdx, 1);
      }
      refreshDynamicLists(dataRangeRemove);
      touchSetupEdit(dataRangeRemove);
      return;
    }

    if (e.target.classList.contains('add-clin-group-site')) {
      var dataSite = resolveSetupData();
      collectFormInto(dataSite);
      var groupForSite = e.target.getAttribute('data-clin-group');
      if (!groupForSite) {
        var siteRow = e.target.closest('[data-clin-group-row]');
        if (siteRow) groupForSite = siteRow.getAttribute('data-clin-group-row');
      }
      if (!groupForSite) return;
      addSiteToGroup(dataSite, groupForSite);
      touchSetupEdit(dataSite);
      return;
    }

    if (e.target.classList.contains('add-clin-group')) {
      var dataAdd = resolveSetupData();
      collectFormInto(dataAdd);
      var cfg = DataModel.cloneConfig(dataAdd.config);
      var name = DataModel.nextClinicalGroupName(cfg.clinicalGroups);
      cfg.clinicalGroups.push(name);
      cfg.clinicalGroupDays[name] = 'Mon';
      if (!cfg.clinicalGroupFacilities) cfg.clinicalGroupFacilities = {};
      if (!cfg.clinicalGroupSiteWeeks) cfg.clinicalGroupSiteWeeks = {};
      var defaultFac = DataModel.getDefaultFacilityIdForClinicalGroup(name, dataAdd.facilities || []);
      cfg.clinicalGroupFacilities[name] = defaultFac ? [defaultFac] : [];
      cfg.clinicalGroupSiteWeeks[name] = [];
      dataAdd.config = DataModel.normalizeConfig(cfg);
      refreshDynamicLists(dataAdd);
      touchSetupEdit(dataAdd);
      return;
    }

    if (e.target.closest('.remove-clin-site')) {
      var siteBtn = e.target.closest('.remove-clin-site');
      var siteGroup = siteBtn.getAttribute('data-clin-group');
      var siteIdx = parseInt(siteBtn.getAttribute('data-clin-site-index'), 10);
      var dataSiteRemove = resolveSetupData();
      collectFormInto(dataSiteRemove);
      var list = getGroupFacilityIds(dataSiteRemove, siteGroup);
      if (list.length <= 1) return;
      list.splice(siteIdx, 1);
      dataSiteRemove.config.clinicalGroupFacilities[siteGroup] = list;
      refreshDynamicLists(dataSiteRemove);
      touchSetupEdit(dataSiteRemove);
      return;
    }

    if (e.target.closest('.remove-clin-group')) {
      var row = e.target.closest('[data-clin-group-row]');
      if (!row) return;
      var dataRemove = resolveSetupData();
      collectFormInto(dataRemove);
      var cfgRemove = DataModel.cloneConfig(dataRemove.config);
      if (cfgRemove.clinicalGroups.length <= 1) return;
      var group = row.getAttribute('data-clin-group-row');
      cfgRemove.clinicalGroups = cfgRemove.clinicalGroups.filter(function (g) { return g !== group; });
      delete cfgRemove.clinicalGroupDays[group];
      if (cfgRemove.clinicalGroupFacilities) delete cfgRemove.clinicalGroupFacilities[group];
      if (cfgRemove.clinicalGroupSiteWeeks) delete cfgRemove.clinicalGroupSiteWeeks[group];
      dataRemove.config = DataModel.normalizeConfig(cfgRemove);
      refreshDynamicLists(dataRemove);
      finishSetupEdit(dataRemove, { rerender: false, refresh: true });
      return;
    }

    if (e.target.classList.contains('add-sim-group')) {
      var dataAddSg = resolveSetupData();
      collectFormInto(dataAddSg);
      var cfgAddSg = draftConfigFromForm(dataAddSg.config, dataAddSg);
      var sgName = DataModel.nextSimGroupName(cfgAddSg.simGroups);
      cfgAddSg.simGroups.push(sgName);
      dataAddSg.config = DataModel.normalizeConfig(cfgAddSg);
      refreshDynamicLists(dataAddSg);
      touchSetupEdit(dataAddSg);
      return;
    }

    if (e.target.closest('.remove-sim-group')) {
      var sgRow = e.target.closest('[data-sim-group-row]');
      if (!sgRow) return;
      var dataRemoveSg = resolveSetupData();
      collectFormInto(dataRemoveSg);
      var cfgRemoveSg = draftConfigFromForm(dataRemoveSg.config, dataRemoveSg);
      if (cfgRemoveSg.simGroups.length <= 1) return;
      var sgGroup = sgRow.getAttribute('data-sim-group-row');
      cfgRemoveSg.simGroups = cfgRemoveSg.simGroups.filter(function (g) { return g !== sgGroup; });
      dataRemoveSg.config = DataModel.normalizeConfig(cfgRemoveSg);
      refreshDynamicLists(dataRemoveSg);
      finishSetupEdit(dataRemoveSg, { rerender: false, refresh: true });
      return;
    }

    if (e.target.classList.contains('add-sim-day')) {
      var dataSim = resolveSetupData();
      collectFormInto(dataSim);
      var cfgSim = draftConfigFromForm(dataSim.config, dataSim);
      var unused = 'Mon';
      for (var di = 0; di < dayOptions.length; di++) {
        if (cfgSim.simDays.indexOf(dayOptions[di]) < 0) {
          unused = dayOptions[di];
          break;
        }
      }
      cfgSim.simDays.push(unused);
      dataSim.config = DataModel.normalizeConfig(cfgSim);
      refreshDynamicLists(dataSim);
      touchSetupEdit(dataSim);
      return;
    }

    if (e.target.closest('.remove-sim-day')) {
      var simRow = e.target.closest('[data-sim-day-row]');
      if (!simRow) return;
      var dataSimRemove = resolveSetupData();
      collectFormInto(dataSimRemove);
      var cfgSimRemove = draftConfigFromForm(dataSimRemove.config, dataSimRemove);
      if (cfgSimRemove.simDays.length <= 1) return;
      var idx = Array.prototype.indexOf.call(
        document.querySelectorAll('#cfgSimDaysList [data-sim-day-row]'),
        simRow
      );
      if (idx >= 0) cfgSimRemove.simDays.splice(idx, 1);
      dataSimRemove.config = DataModel.normalizeConfig(cfgSimRemove);
      refreshDynamicLists(dataSimRemove);
      touchSetupEdit(dataSimRemove);
      return;
    }

    if (e.target.classList.contains('add-sim-time-override')) {
      var dataOv = resolveSetupData();
      collectFormInto(dataOv);
      ScheduleHours.ensureSimTimes(dataOv.config);
      var used = {};
      (dataOv.config.simTimeOverrides || []).forEach(function (o) { used[o.simNum] = true; });
      var nextSim = 1;
      var maxSim = dataOv.config.simDaysRequired || 5;
      while (nextSim <= maxSim && used[nextSim]) nextSim++;
      if (nextSim > maxSim) nextSim = (dataOv.config.simTimeOverrides || []).length + 1;
      dataOv.config.simTimeOverrides.push({
        simNum: nextSim,
        start: dataOv.config.simDefaultStart,
        end: dataOv.config.simDefaultEnd
      });
      refreshDynamicLists(dataOv);
      touchSetupEdit(dataOv);
      return;
    }

    if (e.target.closest('.remove-sim-time-override')) {
      var ovBtn = e.target.closest('.remove-sim-time-override');
      var dataOvRm = resolveSetupData();
      collectFormInto(dataOvRm);
      ScheduleHours.ensureSimTimes(dataOvRm.config);
      var ovIdx = parseInt(ovBtn.getAttribute('data-idx'), 10);
      if (!isNaN(ovIdx)) dataOvRm.config.simTimeOverrides.splice(ovIdx, 1);
      refreshDynamicLists(dataOvRm);
      touchSetupEdit(dataOvRm);
    }
  }

export {
  handleSetupClick
};
