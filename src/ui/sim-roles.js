/**
 * Simulation roles editor tab.
 */

import * as DataModel from '../core/data-model/index.js';
import * as CalendarEngine from '../core/calendar-engine.js';
import { buildProgramSimCalendar, resolveSimSessionHost } from '../core/scheduler/index.js';
import * as SimFacultyStorage from '../storage/sim-faculty-storage.js';
import * as SimRoles from './sim-roles.js';
import { getData } from '../core/state.js';
import { refresh } from './chrome.js';

var DAY_LABELS = { Mon: 'Monday', Tue: 'Tuesday' };

function dayLabel(day) {
  return DAY_LABELS[day] || day;
}

function weekNumLabel(data, weekIndex) {
  var w = data.calendar && data.calendar.weeks && data.calendar.weeks[weekIndex];
  return w && w.weekNum != null ? w.weekNum : (weekIndex + 1);
}

function sessionValue(weekIndex, day) {
  return weekIndex + ':' + day;
}

function parseSessionValue(value) {
  var parts = (value || '').split(':');
  return { weekIndex: parseInt(parts[0], 10), day: parts[1] };
}

function getSimCalendar(data) {
  return data._simCalendar || buildProgramSimCalendar(data, data.config);
}

function buildSimRoleSessions(data, simNum) {
  var cfg = data.config;
  var calendar = getSimCalendar(data);
  var simGroups = DataModel.getSimGroups(cfg);
  var simDays = DataModel.getSimDays(cfg);
  var block = calendar.blocks[simNum - 1];
  if (!block) return [];

  var sessions = [];
  block.weeks.forEach(function (wi) {
    if (CalendarEngine.isWeekInactive(data, wi)) return;
    simDays.forEach(function (day) {
      var host = resolveSimSessionHost(simNum, wi, day, calendar, simGroups, cfg);
      if (!host) return;
      sessions.push({
        weekIndex: wi,
        day: day,
        hostGroup: host,
        value: sessionValue(wi, day),
        label: dayLabel(day) + ' — Week ' + weekNumLabel(data, wi)
      });
    });
  });
  return sessions;
}

function buildSimSummaryLabel(data, simNum) {
  var sessions = buildSimRoleSessions(data, simNum);
  if (!sessions.length) return 'Simulation ' + simNum;
  var parts = sessions.map(function (s) {
    return dayLabel(s.day) + ' week ' + weekNumLabel(data, s.weekIndex);
  });
  return 'Simulation ' + simNum + ' (' + parts.join(', ') + ')';
}

function getSessionAttendance(data, simNum, weekIndex, day) {
  var cfg = data.config;
  var simGroups = DataModel.getSimGroups(cfg);
  var calendar = getSimCalendar(data);
  var host = resolveSimSessionHost(simNum, weekIndex, day, calendar, simGroups, cfg);
  var groupCounts = {};
  var guestCount = 0;
  var total = 0;

  data.students.forEach(function (student) {
    var cell = student.schedule[weekIndex];
    if (!cell || cell.sim != simNum || cell.simDay !== day) return;
    total++;
    var isGuest = isGuestSimStudent(student, cell, weekIndex, data, host);
    if (isGuest) guestCount++;
    var key = student.simGroup;
    if (!groupCounts[key]) groupCounts[key] = { count: 0, guest: 0 };
    groupCounts[key].count++;
    if (isGuest) groupCounts[key].guest++;
  });

  return { host: host, groupCounts: groupCounts, guestCount: guestCount, total: total };
}

function isGuestSimStudent(student, cell, weekIndex, data, hostGroup) {
  if (!cell || !cell.sim) return false;
  if (cell.simGuestGroup) return true;
  if (!hostGroup) {
    var cfg = data.config;
    var calendar = getSimCalendar(data);
    var simGroups = DataModel.getSimGroups(cfg);
    hostGroup = resolveSimSessionHost(
      cell.sim, weekIndex, cell.simDay, calendar, simGroups, cfg
    );
  }
  return !!(hostGroup && hostGroup !== student.simGroup);
}

function formatSessionMeta(data, simNum, weekIndex, day) {
  var att = getSessionAttendance(data, simNum, weekIndex, day);
  if (!att.total) {
    return 'No students scheduled for this session.';
  }
  var parts = [];
  if (att.host) {
    parts.push('Host <strong>' + esc(att.host) + '</strong>');
  }
  var groupParts = Object.keys(att.groupCounts).sort().map(function (sg) {
    var g = att.groupCounts[sg];
    if (g.guest > 0 && g.guest === g.count) {
      return sg + ' guest (' + g.count + ')';
    }
    if (g.guest > 0) {
      return sg + ' (' + g.count + ', ' + g.guest + ' guest)';
    }
    return sg + ' (' + g.count + ')';
  });
  if (groupParts.length) {
    parts.push('Attending ' + groupParts.join(', '));
  }
  return parts.join(' · ');
}

function syncRoleFilters(data) {
  var simSelect = document.getElementById('roleSimSelect');
  var groupSelect = document.getElementById('roleGroupSelect');
  if (!simSelect || !groupSelect || !data) return;

  var prevSim = simSelect.value;
  var prevSession = groupSelect.value;
  var simRequired = data.config.simDaysRequired || 5;

  simSelect.innerHTML = '';
  for (var sn = 1; sn <= simRequired; sn++) {
    var simOpt = document.createElement('option');
    simOpt.value = String(sn);
    simOpt.textContent = 'Simulation ' + sn;
    simSelect.appendChild(simOpt);
  }
  if (prevSim && simSelect.querySelector('option[value="' + prevSim + '"]')) {
    simSelect.value = prevSim;
  }

  var simNum = parseInt(simSelect.value, 10);
  var sessions = buildSimRoleSessions(data, simNum);
  groupSelect.innerHTML = '';
  sessions.forEach(function (s) {
    var opt = document.createElement('option');
    opt.value = s.value;
    opt.textContent = s.label;
    groupSelect.appendChild(opt);
  });
  if (prevSession && groupSelect.querySelector('option[value="' + prevSession + '"]')) {
    groupSelect.value = prevSession;
  } else if (sessions.length) {
    groupSelect.value = sessions[0].value;
  }
}

function facultyReady() {
  return SimFacultyStorage && SimFacultyStorage.isReady();
}

function getRoles(studentId) {
  if (!facultyReady()) return { flags: { primary: null, secondary: null } };
  return SimFacultyStorage.getStudentRoles(studentId);
}

function getCumulative(studentId) {
  var counts = { Primary: 0, Secondary: 0, Evaluator: 0, Scribe: 0 };
  if (!facultyReady()) return counts;
  var rd = getRoles(studentId);
  Object.keys(rd).forEach(function (simKey) {
    if (simKey === 'flags') return;
    var sim = rd[simKey];
    Object.keys(sim).forEach(function (iter) {
      var role = sim[iter];
      if (counts[role] !== undefined) counts[role]++;
    });
  });
  return counts;
}

function setBannerVisible(show) {
  var banner = document.getElementById('simFacultyBanner');
  if (banner) banner.classList.toggle('hidden', !show);
}

function renderSessionMeta(data, simNum, weekIdx, targetDay) {
  var meta = document.getElementById('roleSessionMeta');
  if (!meta) return;
  if (!data || isNaN(weekIdx) || !targetDay) {
    meta.textContent = '';
    return;
  }
  meta.innerHTML = formatSessionMeta(data, simNum, weekIdx, targetDay);
}

function render(data) {
  if (data) syncRoleFilters(data);

  var simNum = parseInt(document.getElementById('roleSimSelect').value, 10);
  var session = parseSessionValue(document.getElementById('roleGroupSelect').value);
  var tbody = document.getElementById('roleTableBody');
  var tableWrap = document.getElementById('roleTableWrap');
  tbody.innerHTML = '';

  if (!data) {
    renderSessionMeta(null, simNum, session.weekIndex, session.day);
    return;
  }

  if (!facultyReady()) {
    setBannerVisible(true);
    if (tableWrap) tableWrap.classList.add('sim-faculty-disabled');
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:2rem;color:var(--text-muted)">' +
      'Open a semester file from the menu to manage role assignments and performance flags.</td></tr>';
    renderSessionMeta(data, simNum, session.weekIndex, session.day);
    return;
  }

  setBannerVisible(false);
  if (tableWrap) tableWrap.classList.remove('sim-faculty-disabled');

  var weekIdx = session.weekIndex;
  var targetDay = session.day;
  if (isNaN(weekIdx) || !targetDay) {
    renderSessionMeta(data, simNum, weekIdx, targetDay);
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:2rem;color:var(--text-muted)">No session selected.</td></tr>';
    return;
  }

  var cfg = data.config;
  var calendar = getSimCalendar(data);
  var simGroups = DataModel.getSimGroups(cfg);
  var hostGroup = resolveSimSessionHost(simNum, weekIdx, targetDay, calendar, simGroups, cfg);
  renderSessionMeta(data, simNum, weekIdx, targetDay);

  var sessionStudents = [];
  data.students.forEach(function (student) {
    var cell = student.schedule[weekIdx];
    if (cell && cell.sim == simNum && cell.simDay === targetDay) {
      sessionStudents.push({ student: student, cell: cell });
    }
  });

  sessionStudents.sort(function (a, b) {
    var aGuest = isGuestSimStudent(a.student, a.cell, weekIdx, data, hostGroup) ? 1 : 0;
    var bGuest = isGuestSimStudent(b.student, b.cell, weekIdx, data, hostGroup) ? 1 : 0;
    if (aGuest !== bGuest) return aGuest - bGuest;
    return (a.student.name || '').localeCompare(b.student.name || '');
  });

  if (!sessionStudents.length) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:2rem;color:var(--text-muted)">No students in this session.</td></tr>';
    return;
  }

  sessionStudents.forEach(function (entry) {
    var student = entry.student;
    var cell = entry.cell;
    var counts = getCumulative(student.id);
    var sRoles = getRoles(student.id);
    if (!sRoles[simNum]) sRoles[simNum] = {};
    var flagPri = (sRoles.flags && sRoles.flags.primary) || '';
    var flagSec = (sRoles.flags && sRoles.flags.secondary) || '';
    var rowCls = flagPri === 'high' || flagSec === 'high' ? 'flag-high' : (flagPri === 'weak' || flagSec === 'weak' ? 'flag-weak' : '');
    var isGuest = isGuestSimStudent(student, cell, weekIdx, data, hostGroup);
    var guestHost = cell.simGuestGroup || hostGroup;
    var stickyCls = 'sticky-col' + (isGuest ? ' sim-prog-cell-guest' : '');
    var guestTitle = isGuest
      ? ' title="Guest in ' + guestHost + ' (primary: ' + student.simGroup + ')"'
      : '';
    var guestNote = isGuest
      ? '<br><small class="role-guest-tag">Guest · ' + esc(guestHost) + '</small>'
      : '';

    var tr = document.createElement('tr');
    if (rowCls) tr.className = rowCls;
    var html = '<td class="' + stickyCls + '"' + guestTitle + '><strong>' + esc(student.name) + '</strong>' +
      guestNote + '<br><small>' + esc(student.clinicalGroup) + ' · ' + esc(student.simGroup) + '</small></td>' +
      '<td style="text-align:center">' + counts.Primary + '</td>' +
      '<td style="text-align:center">' + counts.Secondary + '</td>' +
      '<td style="text-align:center">' + counts.Evaluator + '</td>' +
      '<td style="text-align:center">' + counts.Scribe + '</td>';

    for (var i = 1; i <= 4; i++) {
      var cur = sRoles[simNum]['iter' + i] || '';
      html += '<td><select class="role-select" data-student="' + student.id + '" data-sim="' + simNum + '" data-iter="iter' + i + '">';
      DataModel.ROLE_OPTIONS.forEach(function (r) {
        html += '<option value="' + r + '"' + (r === cur ? ' selected' : '') + '>' + (r || '—') + '</option>';
      });
      html += '</select></td>';
    }

    html += '<td><select class="flag-select" data-student="' + student.id + '" data-flag="primary">' +
      flagOptions(flagPri) + '</select></td>' +
      '<td><select class="flag-select" data-student="' + student.id + '" data-flag="secondary">' +
      flagOptions(flagSec) + '</select></td>';

    tr.innerHTML = html;
    tbody.appendChild(tr);
  });
}

function flagOptions(cur) {
  return ['', 'high', 'weak'].map(function (v) {
    var label = v === 'high' ? 'Strong' : v === 'weak' ? 'Weaker' : 'None';
    return '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + label + '</option>';
  }).join('');
}

function esc(s) {
  var d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function init() {
  document.getElementById('roleSimSelect').addEventListener('change', function () {
    var data = getData();
    if (data) syncRoleFilters(data);
    refresh();
  });
  document.getElementById('roleGroupSelect').addEventListener('change', function () { refresh(); });

  document.getElementById('roleTableBody').addEventListener('change', function (e) {
    var el = e.target;
    if (!facultyReady()) return;
    var data = getData();
    if (el.classList.contains('role-select')) {
      SimFacultyStorage.setStudentRoleAssignment(
        el.dataset.student, el.dataset.sim, el.dataset.iter, el.value
      );
      SimRoles.render(data);
    }
    if (el.classList.contains('flag-select')) {
      SimFacultyStorage.setStudentFlag(el.dataset.student, el.dataset.flag, el.value || null);
      SimRoles.render(data);
    }
  });
}

export {
  render,
  init,
  buildSimRoleSessions,
  buildSimSummaryLabel
};
