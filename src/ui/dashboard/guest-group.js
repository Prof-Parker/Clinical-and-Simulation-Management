/** Resolve guest sim group label for dashboard schedule cells. */

import * as DataModel from '../../core/data-model/index.js';
import * as Scheduler from '../../core/scheduler/index.js';

export function resolveDisplayedSimGuestGroup(student, cell, weekIndex, data) {
  if (!cell || !cell.sim) return null;
  if (cell.simGuestGroup) return cell.simGuestGroup;
  var cal = data._simCalendar || Scheduler.buildProgramSimCalendar(data, data.config);
  var simGroups = DataModel.getSimGroups(data.config);
  var host = Scheduler.resolveSimSessionHost(
    cell.sim,
    weekIndex,
    cell.simDay,
    cal,
    simGroups,
    data.config
  );
  if (host && host !== student.simGroup) return host;
  return null;
}
