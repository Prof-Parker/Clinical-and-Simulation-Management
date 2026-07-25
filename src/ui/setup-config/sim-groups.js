/** Simulation days and groups configuration lists. */

import * as DataModel from '../../core/data-model/index.js';
import { WEEKDAY_OPTIONS } from '../../core/data-model/config.js';
import * as ScheduleHours from '../../core/schedule-hours.js';
import { escAttr } from '../setup/dom-utils.js';
import { setupEl, setupQueryAll } from '../setup/scope.js';

function daySelectHtml(selected) {
    return WEEKDAY_OPTIONS.map(function (d) {
      return '<option value="' + d + '"' + (d === selected ? ' selected' : '') + '>' + d + '</option>';
    }).join('');
  }

function simDayRow(day, canRemove) {
    return '<div class="config-list-row" data-sim-day-row="1">' +
      '<select data-sim-day="value" aria-label="Simulation day">' + daySelectHtml(day) + '</select>' +
      (canRemove
        ? '<button type="button" class="btn btn-icon-remove remove-sim-day" aria-label="Remove simulation day" title="Remove simulation day">&times;</button>'
        : '<span class="section-sub" style="font-size:0.75rem">Min. 1</span>') +
      '</div>';
  }

function renderSimDaysList(cfg) {
    var days = DataModel.getSimDays(cfg);
    var canRemove = days.length > 1;
    var rowsHtml = days.map(function (d) {
      return simDayRow(d, canRemove);
    }).join('');
    return rowsHtml +
      '<div class="config-list-add-row">' +
      '<button type="button" class="btn btn-sm add-sim-day">Add day</button>' +
      '</div>';
  }

function patternSelectHtml(selected) {
    return '<option value="even"' + (selected === 'even' ? ' selected' : '') + '>Even weeks</option>' +
      '<option value="odd"' + (selected === 'odd' ? ' selected' : '') + '>Odd weeks</option>';
  }

function simGroupRow(group, day, pattern, canRemove) {
    return '<div class="config-list-row" data-sim-group-row="' + group + '">' +
      '<span class="config-group-label">' + group + '</span>' +
      '<select data-sim-group="day" class="clin-day-select" aria-label="' + group + ' primary weekday">' +
      daySelectHtml(day) + '</select>' +
      '<select data-sim-group="pattern" aria-label="' + group + ' week pattern">' +
      patternSelectHtml(pattern) + '</select>' +
      (canRemove
        ? '<button type="button" class="btn btn-icon-remove remove-sim-group" aria-label="Remove simulation group" title="Remove simulation group">&times;</button>'
        : '<span class="section-sub" style="font-size:0.75rem">Min. 1</span>') +
      '</div>';
  }

function renderSimGroupsList(cfg) {
    var groups = DataModel.getSimGroups(cfg);
    var canRemove = groups.length > 1;
    var html = groups.map(function (g) {
      return simGroupRow(
        g,
        DataModel.getSimGroupDay(g, cfg),
        DataModel.getSimGroupPattern(g, cfg),
        canRemove
      );
    }).join('');
    return html +
      '<div class="config-list-add-row">' +
      '<button type="button" class="btn btn-sm add-sim-group">Add group</button>' +
      '</div>';
  }

function renderSimTimeOverrides(cfg) {
    ScheduleHours.ensureSimTimes(cfg);
    var required = cfg.simDaysRequired || 5;
    var rows = (cfg.simTimeOverrides || []).map(function (o, i) {
      return '<div class="setup-sim-override-row" data-sim-override-row="' + i + '">' +
        '<label>Sim #<input type="number" min="1" max="18" data-sim-override="num" value="' +
        escAttr(String(o.simNum)) + '" aria-label="Simulation number override"></label>' +
        '<label>Start<input type="time" data-sim-override="start" value="' +
        escAttr(ScheduleHours.hhmmToTimeInput(o.start)) + '" aria-label="Sim override start"></label>' +
        '<label>End<input type="time" data-sim-override="end" value="' +
        escAttr(ScheduleHours.hhmmToTimeInput(o.end)) + '" aria-label="Sim override end"></label>' +
        '<button type="button" class="btn btn-icon-remove remove-sim-time-override" data-idx="' + i +
        '" aria-label="Remove sim time override" title="Remove override">&times;</button>' +
        '</div>';
    }).join('');
    return rows +
      '<div class="config-list-add-row">' +
      '<button type="button" class="btn btn-sm add-sim-time-override" data-next-sim="' +
      ((cfg.simTimeOverrides || []).length + 1) + '" data-max-sim="' + required +
      '">Add sim override</button>' +
      '</div>';
  }

function collectSimTimesIntoConfig(cfg) {
    var simStartEl = setupEl('cfgSimDefaultStart');
    var simEndEl = setupEl('cfgSimDefaultEnd');
    if (simStartEl) {
      cfg.simDefaultStart = ScheduleHours.timeInputToHhmm(
        simStartEl.value, ScheduleHours.DEFAULT_SIM_START
      );
    }
    if (simEndEl) {
      cfg.simDefaultEnd = ScheduleHours.timeInputToHhmm(
        simEndEl.value, ScheduleHours.DEFAULT_SIM_END
      );
    }
    cfg.simTimeOverrides = [];
    setupQueryAll('cfgSimTimeOverrides', '[data-sim-override-row]').forEach(function (row) {
      var numEl = row.querySelector('[data-sim-override="num"]');
      var startEl = row.querySelector('[data-sim-override="start"]');
      var endEl = row.querySelector('[data-sim-override="end"]');
      var simNum = numEl ? parseInt(numEl.value, 10) : NaN;
      if (isNaN(simNum) || simNum < 1) return;
      cfg.simTimeOverrides.push({
        simNum: simNum,
        start: ScheduleHours.timeInputToHhmm(
          startEl && startEl.value, cfg.simDefaultStart || ScheduleHours.DEFAULT_SIM_START
        ),
        end: ScheduleHours.timeInputToHhmm(
          endEl && endEl.value, cfg.simDefaultEnd || ScheduleHours.DEFAULT_SIM_END
        )
      });
    });
    ScheduleHours.ensureSimTimes(cfg);
    return cfg;
  }

export {
  renderSimDaysList,
  renderSimGroupsList,
  renderSimTimeOverrides,
  collectSimTimesIntoConfig,
  daySelectHtml
};
