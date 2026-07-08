/** Simulation days and groups configuration lists. */

import * as DataModel from '../../core/data-model/index.js';
import { WEEKDAY_OPTIONS } from '../../core/data-model/config.js';

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

export {
  renderSimDaysList,
  renderSimGroupsList,
  daySelectHtml
};
