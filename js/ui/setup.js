/* global App */
var App = App || {};
App.UI = App.UI || {};

App.UI.Setup = (function () {
  var dragStudentId = null;

  function populateYearSelect(selectedYear) {
    var yearSelect = document.getElementById('semesterYearSelect');
    if (!yearSelect) return;
    var curYear = new Date().getFullYear();
    if (!yearSelect.options.length) {
      for (var y = curYear - 2; y <= curYear + 5; y++) {
        var opt = document.createElement('option');
        opt.value = String(y);
        opt.textContent = String(y);
        yearSelect.appendChild(opt);
      }
    }
    yearSelect.value = String(selectedYear || curYear);
  }

  function updateStartDateFromSeasonYear() {
    var season = document.getElementById('semesterSeasonSelect').value;
    var year = parseInt(document.getElementById('semesterYearSelect').value, 10);
    document.getElementById('semesterStartDate').value = App.DataModel.startDateForSeason(season, year);
    var data = App.getData();
    if (data && App.UI.DateInputs) {
      App.UI.DateInputs.init(document.getElementById('view-setup'), data);
    }
  }

  function renderSemesterFields(data) {
    var season = data.meta.semesterSeason || 'spring';
    var year = data.meta.semesterYear || new Date().getFullYear();
    document.getElementById('semesterSeasonSelect').value = season;
    populateYearSelect(year);
    document.getElementById('semesterStartDate').value =
      data.calendar.semesterStartDate || App.DataModel.startDateForSeason(season, year);

    var finalizeBtn = document.getElementById('finalizeSemesterBtn');
    if (finalizeBtn) {
      finalizeBtn.disabled = !!data.meta.finalized;
      finalizeBtn.title = data.meta.finalized ? 'This semester has been finalized' : '';
    }
  }

  function renderScheduleWarnings(data) {
    var panel = document.getElementById('setupScheduleWarnings');
    if (!panel || !App.Feasibility) return;
    var result = App.Feasibility.check(data);
    if (result.ok) {
      panel.classList.add('hidden');
      panel.innerHTML = '';
      return;
    }
    panel.classList.remove('hidden');
    var html = '<strong>Schedule generation warnings</strong>' +
      '<p class="section-sub" style="margin:0.35rem 0 0.5rem">The schedule may not be able to be generated for all students.</p><ul>';
    result.issues.forEach(function (issue) {
      html += '<li>' + App.Feasibility.formatIssue(issue) + '</li>';
    });
    html += '</ul>';
    panel.innerHTML = html;
  }

  function render(data) {
    renderSemesterFields(data);
    renderSections(data);
    renderFacilities(data);
    renderFaculty(data);
    renderHolidays(data);
    renderRoster(data);
    renderScheduleWarnings(data);
    if (App.UI.SetupConfig) App.UI.SetupConfig.render(data);
    if (App.UI.DateInputs) {
      App.UI.DateInputs.init(document.getElementById('view-setup'), data);
    }
  }

  function sectionSelectHtml(data, student) {
    var html = '<option value="">Unassigned</option>';
    var listed = {};
    (data.sections || []).forEach(function (sec) {
      listed[sec.name] = true;
      html += '<option value="' + escAttr(sec.name) + '"' + (student.section === sec.name ? ' selected' : '') + '>' + escAttr(sec.name) + '</option>';
    });
    if (student.section && !listed[student.section]) {
      html += '<option value="' + escAttr(student.section) + '" selected>' + escAttr(student.section) + ' (unlisted)</option>';
    }
    return html;
  }

  function facilityName(data, facilityId) {
    var f = data.facilities.find(function (fac) { return fac.id === facilityId; });
    return f ? f.name : 'Unassigned';
  }

  function getCohortFacilityIdForGroup(data, clinicalGroup) {
    var cohort = data.students.filter(function (s) { return s.clinicalGroup === clinicalGroup; });
    if (cohort.length) return getCohortFacilityId(cohort, data);
    return App.DataModel.getDefaultFacilityIdForClinicalGroup(clinicalGroup, data.facilities || []);
  }

  function getCohortFacilityId(cohort, data) {
    if (!cohort.length) {
      var unique = App.DataModel.getUniqueFacilitiesForSelect(data);
      return unique.length ? unique[0].id : null;
    }
    var counts = {};
    cohort.forEach(function (s) {
      if (s.facilityId) {
        var canon = App.DataModel.getCanonicalFacilityId(data, s.facilityId);
        counts[canon] = (counts[canon] || 0) + 1;
      }
    });
    var best = App.DataModel.getCanonicalFacilityId(data, cohort[0].facilityId) ||
      (App.DataModel.getUniqueFacilitiesForSelect(data)[0] && App.DataModel.getUniqueFacilitiesForSelect(data)[0].id);
    var bestN = 0;
    Object.keys(counts).forEach(function (id) {
      if (counts[id] > bestN) {
        bestN = counts[id];
        best = id;
      }
    });
    return best;
  }

  function applyGroupFacility(data, clinicalGroup, facilityId) {
    facilityId = App.DataModel.getCanonicalFacilityId(data, facilityId);
    data.students.forEach(function (s) {
      if (s.clinicalGroup === clinicalGroup) s.facilityId = facilityId;
    });
  }

  function cohortFacilitySelectHtml(data, clinicalGroup, selectedId) {
    selectedId = App.DataModel.getCanonicalFacilityId(data, selectedId);
    return App.DataModel.getUniqueFacilitiesForSelect(data).map(function (f) {
      return '<option value="' + f.id + '"' + (selectedId === f.id ? ' selected' : '') + '>' + escAttr(f.name) + '</option>';
    }).join('');
  }

  function moveCohortSelectHtml(data, student) {
    var html = '<option value="">Move…</option>';
    App.DataModel.getClinicalGroups(data.config).forEach(function (g) {
      if (g === student.clinicalGroup) return;
      html += '<option value="' + g + '">' + g + '</option>';
    });
    return html;
  }

  function syncBreakHolidayDate(h, data) {
    if (h.type !== 'break') return;
    var wi = h.weekIndex != null ? parseInt(h.weekIndex, 10) : 0;
    if (wi < 0) wi = 0;
    if (wi > 17) wi = 17;
    h.weekIndex = wi;
    if (data.calendar.weeks && data.calendar.weeks[wi]) {
      h.date = data.calendar.weeks[wi].startDate;
    }
  }

  function weekSelectHtml(data, selectedWeek) {
    var html = '';
    for (var i = 0; i < 18; i++) {
      html += '<option value="' + i + '"' + (String(selectedWeek) === String(i) ? ' selected' : '') + '>' +
        escAttr(App.CalendarEngine.getWeekDisplay(data, i, true)) + '</option>';
    }
    return html;
  }

  function studentRowHtml(data, student) {
    return '<div class="setup-student-row" data-student-id="' + student.id + '">' +
      '<button type="button" class="drag-handle" draggable="true" aria-label="Drag to move ' + escAttr(student.name || 'student') + ' to another cohort" title="Drag to another cohort">⠿</button>' +
      '<select class="move-cohort-select" data-student-id="' + student.id + '" aria-label="Move to clinical group" title="Move to clinical group">' +
      moveCohortSelectHtml(data, student) + '</select>' +
      '<input type="text" data-field="name" data-id="' + student.id + '" value="' + escAttr(student.name) + '" placeholder="Student name" aria-label="Student name">' +
      '<select data-field="section" data-id="' + student.id + '" aria-label="Section">' + sectionSelectHtml(data, student) + '</select>' +
      '<select data-field="simGroup" data-id="' + student.id + '" aria-label="Simulation group">' +
      App.DataModel.getSimGroups(data.config).map(function (sg) {
        return '<option value="' + sg + '"' + (student.simGroup === sg ? ' selected' : '') + '>' + sg + '</option>';
      }).join('') +
      '</select>' +
      '<span class="setup-facility-readonly" title="Set via Clinical groups in Facilities &amp; Clinical Groups">' + escAttr(facilityName(data, student.facilityId)) + '</span>' +
      '<button type="button" class="btn btn-icon-remove remove-student-btn" data-student-id="' + student.id + '" aria-label="Remove student" title="Remove student">&times;</button>' +
      '</div>';
  }

  function createNewStudentForGroup(data, clinicalGroup) {
    var groups = App.DataModel.getClinicalGroups(data.config);
    var simGroups = App.DataModel.getSimGroups(data.config);
    var cohort = data.students.filter(function (s) { return s.clinicalGroup === clinicalGroup; });
    var facId = getCohortFacilityId(cohort, data);
    var section = (data.sections && data.sections[0] && data.sections[0].name) ? data.sections[0].name : '';
    var student = App.DataModel.createStudent(
      App.DataModel.nextDefaultStudentName(data.students),
      clinicalGroup,
      App.RosterBalance.simGroupForClinicalCohort(data.students, clinicalGroup, groups, simGroups),
      facId,
      section
    );
    return student;
  }

  function needsRebalance(data) {
    var groups = App.DataModel.getClinicalGroups(data.config);
    var maxStudents = data.config.maxStudents || 30;
    var maxPer = data.config.maxPerClinicalGroup || 6;
    if (data.students.length !== maxStudents) return true;
    var counts = {};
    groups.forEach(function (g) { counts[g] = 0; });
    var orphan = false;
    data.students.forEach(function (s) {
      if (counts[s.clinicalGroup] !== undefined) counts[s.clinicalGroup]++;
      else orphan = true;
    });
    if (orphan) return true;
    if (groups.some(function (g) { return (counts[g] || 0) > maxPer; })) return true;
    var vals = groups.map(function (g) { return counts[g] || 0; });
    if (!vals.length) return false;
    return Math.max.apply(null, vals) - Math.min.apply(null, vals) > 1;
  }

  function rebalanceStudents(data, syncCount) {
    var groups = App.DataModel.getClinicalGroups(data.config);
    var maxStudents = data.config.maxStudents || 30;
    if (!groups.length) return;

    if (syncCount) {
      while (data.students.length < maxStudents) {
        var targetGroup = groups[data.students.length % groups.length];
        data.students.push(createNewStudentForGroup(data, targetGroup));
      }
      while (data.students.length > maxStudents) {
        var removeIdx = -1;
        for (var i = data.students.length - 1; i >= 0; i--) {
          if (!String(data.students[i].name || '').trim()) {
            removeIdx = i;
            break;
          }
        }
        data.students.splice(removeIdx >= 0 ? removeIdx : data.students.length - 1, 1);
      }
    }

    App.RosterBalance.rebalance(data.students, data.config);
  }

  function updateRebalanceButton(data) {
    var btn = document.getElementById('rebalanceStudentsBtn');
    if (!btn) return;
    btn.classList.toggle('needs-attention', needsRebalance(data));
  }

  function renderRoster(data) {
    var container = document.getElementById('setupRoster');
    container.innerHTML = '';

    var maxPer = data.config.maxPerClinicalGroup || 6;
    var columnHeadersHtml =
      '<div class="setup-roster-columns" aria-hidden="true">' +
      '<span></span><span>Move</span><span>Name</span><span>Section</span><span>Sim</span><span>Site</span><span></span>' +
      '</div>';

    App.DataModel.getClinicalGroups(data.config).forEach(function (g) {
      var cohort = data.students.filter(function (s) { return s.clinicalGroup === g; });
      var clinDay = App.DataModel.getClinicalDayForGroup(g, data.config);
      var groupDiv = document.createElement('div');
      groupDiv.className = 'setup-group';
      groupDiv.innerHTML =
        '<div class="setup-group-header">' +
        '<div class="setup-group-header-main">' +
        '<h4>' + g + ' Cohort</h4>' +
        '<span class="setup-group-day">' + clinDay + ' clinical</span>' +
        '<span class="setup-group-count">' + cohort.length + ' / ' + maxPer + ' students</span>' +
        '</div>' +
        '<button type="button" class="btn btn-sm add-student-btn" data-clinical-group="' + g + '">Add student</button>' +
        '</div>' +
        columnHeadersHtml;
      var inner = document.createElement('div');
      inner.className = 'setup-group-dropzone';
      inner.setAttribute('data-drop-group', g);
      cohort.forEach(function (s) {
        inner.innerHTML += studentRowHtml(data, s);
      });
      if (!cohort.length) {
        inner.innerHTML += '<p class="section-sub setup-drop-hint" style="margin:0.5rem;text-align:center">Drop students here or add one</p>';
      }
      groupDiv.appendChild(inner);
      container.appendChild(groupDiv);
    });

    updateRebalanceButton(data);
  }

  function renderSections(data) {
    var container = document.getElementById('setupSections');
    container.innerHTML = '';
    (data.sections || []).forEach(function (sec) {
      container.innerHTML +=
        '<div class="setup-item-row">' +
        '<input type="text" class="setup-section-code" data-sec="name" data-sec-id="' + sec.id + '" value="' + escAttr(sec.name) + '" placeholder="F6016" maxlength="12">' +
        '<button class="btn btn-icon-remove remove-section" type="button" data-sec-id="' + sec.id + '" aria-label="Remove section" title="Remove section">&times;</button>' +
        '</div>';
    });
    if (!data.sections.length) {
      container.innerHTML = '<p class="section-sub">No sections defined. Add registrar section codes above.</p>';
    }
  }

  function renderFacilities(data) {
    var container = document.getElementById('setupFacilities');
    container.innerHTML = '';
    App.DataModel.getUniqueFacilitiesForSelect(data).forEach(function (f) {
      var canRemove = data.facilities.length > 1;
      container.innerHTML +=
        '<div class="setup-item-row setup-facility-row">' +
        '<input type="text" data-fac="name" data-fac-id="' + f.id + '" value="' + escAttr(f.name) + '" placeholder="Facility name" aria-label="Facility name">' +
        (canRemove
          ? '<button class="btn btn-icon-remove remove-facility" type="button" data-fac-id="' + f.id + '" aria-label="Remove facility" title="Remove facility">&times;</button>'
          : '<span class="section-sub" style="font-size:0.75rem;white-space:nowrap">Min. 1</span>') +
        '</div>';
    });
  }

  function renderFaculty(data) {
    var container = document.getElementById('setupFaculty');
    container.innerHTML = '';
    data.faculty.forEach(function (f, i) {
      container.innerHTML +=
        '<div class="setup-faculty-row">' +
        '<span class="setup-faculty-group">' + f.clinicalGroup + '</span>' +
        '<input type="text" data-faculty="name" data-idx="' + i + '" value="' + escAttr(f.name) + '" placeholder="Faculty name">' +
        '</div>';
    });
  }

  function renderHolidays(data) {
    var container = document.getElementById('setupHolidays');
    container.innerHTML = '';
    if (!data.calendar.weeks || !data.calendar.weeks.length) {
      App.CalendarEngine.rebuildWeeks(data);
    }
    var holidays = data.holidays || [];
    if (holidays.length) {
      container.innerHTML =
        '<div class="setup-holidays-head" aria-hidden="true">' +
        '<span>Type</span><span>Date / week off</span><span>Label</span><span></span>' +
        '</div>';
    }
    holidays.forEach(function (h, i) {
      var type = h.type || 'holiday';
      if (type === 'break') syncBreakHolidayDate(h, data);
      else if (!h.date && h.weekIndex != null && data.calendar.weeks[h.weekIndex]) {
        h.date = data.calendar.weeks[h.weekIndex].startDate;
      }
      var isBreak = type === 'break';
      var whenHtml = isBreak
        ? '<label class="setup-holiday-field setup-holiday-when">' +
          '<span class="setup-holiday-field-label">Week off</span>' +
          '<select data-hol="week" data-idx="' + i + '">' + weekSelectHtml(data, h.weekIndex != null ? h.weekIndex : 0) + '</select></label>'
        : '<label class="setup-holiday-field setup-holiday-when">' +
          '<span class="setup-holiday-field-label">Date</span>' +
          '<input type="date" class="date-input" data-hol="date" data-idx="' + i + '" value="' + (h.date || '') + '"></label>';
      container.innerHTML +=
        '<div class="setup-holiday-row" data-hol-idx="' + i + '">' +
        '<label class="setup-holiday-field setup-holiday-type">' +
        '<span class="setup-holiday-field-label">Type</span>' +
        '<select data-hol="type" data-idx="' + i + '">' +
        [
          { v: 'holiday', l: 'Holiday' },
          { v: 'break', l: 'Break (full week off)' },
          { v: 'mondayHoliday', l: 'Monday holiday' }
        ].map(function (opt) {
          return '<option value="' + opt.v + '"' + (type === opt.v ? ' selected' : '') + '>' + opt.l + '</option>';
        }).join('') +
        '</select></label>' +
        whenHtml +
        '<label class="setup-holiday-field setup-holiday-label">' +
        '<span class="setup-holiday-field-label">Label</span>' +
        '<input type="text" data-hol="label" data-idx="' + i + '" value="' + escAttr(h.label || '') + '" placeholder="e.g. Spring break">' +
        '</label>' +
        '<button class="btn btn-icon-remove remove-holiday" type="button" data-idx="' + i + '" aria-label="Remove holiday" title="Remove holiday">&times;</button>' +
        '</div>';
    });
    if (!holidays.length) {
      container.innerHTML = '<p class="section-sub">No holidays or breaks defined. Click Add above.</p>';
    }
  }

  function escAttr(s) {
    return String(s || '').replace(/"/g, '&quot;');
  }

  function collectSemesterMeta(data) {
    var season = document.getElementById('semesterSeasonSelect').value;
    var year = parseInt(document.getElementById('semesterYearSelect').value, 10);
    var prevSeason = data.meta.semesterSeason;
    var prevYear = data.meta.semesterYear;
    data.meta.semesterSeason = season;
    data.meta.semesterYear = year;
    data.meta.semesterName = App.DataModel.buildSemesterName(season, year);
    if (prevSeason !== season || prevYear !== year) data.meta.finalized = false;
  }

  function collectFromForm(data) {
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

    document.querySelectorAll('[data-cohort-facility]').forEach(function (el) {
      applyGroupFacility(data, el.getAttribute('data-cohort-facility'), el.value);
    });

    Object.keys(sectionRenames).forEach(function (oldName) {
      var newName = sectionRenames[oldName];
      data.students.forEach(function (s) {
        if (s.section === oldName) s.section = newName;
      });
    });

    document.querySelectorAll('#setupFacilities [data-fac="name"]').forEach(function (el) {
      var f = data.facilities.find(function (fac) { return fac.id === el.dataset.facId; });
      if (!f) return;
      f.name = el.value.trim();
    });
    document.querySelectorAll('#setupFaculty [data-faculty]').forEach(function (el) {
      var f = data.faculty[parseInt(el.dataset.idx, 10)];
      if (f) f.name = el.value;
    });
    document.querySelectorAll('#setupHolidays [data-hol]').forEach(function (el) {
      var h = data.holidays[parseInt(el.dataset.idx, 10)];
      if (!h) return;
      if (el.dataset.hol === 'date') h.date = el.value;
      if (el.dataset.hol === 'label') h.label = el.value;
      if (el.dataset.hol === 'type') h.type = el.value;
      if (el.dataset.hol === 'week') h.weekIndex = parseInt(el.value, 10);
    });
    (data.holidays || []).forEach(function (h) {
      if (h.type === 'break') syncBreakHolidayDate(h, data);
    });
    collectSemesterMeta(data);
    data.calendar.semesterStartDate = document.getElementById('semesterStartDate').value;
    App.DataModel.normalizeFacilities(data);
    App.CalendarEngine.rebuildWeeks(data);

    var configBefore = App.DataModel.cloneConfig(data.config);
    if (App.UI.SetupConfig) {
      configBefore = App.UI.SetupConfig.collectIntoData(data);
    }
    return configBefore;
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
    App.DataModel.normalizeFacilities(data);
    App.notifyChange();
    App.UI.Setup.render(data);
  }

  function removeSection(data, secId) {
    collectFromForm(data);
    var sec = data.sections.find(function (s) { return s.id === secId; });
    if (!sec) return;
    data.sections = data.sections.filter(function (s) { return s.id !== secId; });
    data.students.forEach(function (s) {
      if (s.section === sec.name) s.section = '';
    });
    App.notifyChange();
    App.UI.Setup.render(data);
  }

  function addStudent(data, clinicalGroup) {
    collectFromForm(data);
    var maxStudents = data.config.maxStudents || 30;
    var maxPer = data.config.maxPerClinicalGroup || 6;
    if (data.students.length >= maxStudents) {
      alert('Maximum students (' + maxStudents + ') reached. Increase max in scheduling configuration or remove a student.');
      return;
    }
    var inGroup = data.students.filter(function (s) { return s.clinicalGroup === clinicalGroup; }).length;
    if (inGroup >= maxPer) {
      alert(clinicalGroup + ' already has ' + maxPer + ' students (configured maximum per clinical group).');
      return;
    }
    data.students.push(createNewStudentForGroup(data, clinicalGroup));
    App.notifyChange();
    App.UI.Setup.render(data);
  }

  function removeStudent(data, studentId) {
    collectFromForm(data);
    data.students = data.students.filter(function (s) { return s.id !== studentId; });
    App.notifyChange();
    App.UI.Setup.render(data);
  }

  function moveStudentToGroup(data, studentId, clinicalGroup) {
    var student = data.students.find(function (s) { return s.id === studentId; });
    if (!student) return;
    var maxPer = data.config.maxPerClinicalGroup || 6;
    var inTarget = data.students.filter(function (s) {
      return s.clinicalGroup === clinicalGroup && s.id !== studentId;
    }).length;
    if (inTarget >= maxPer) {
      alert(clinicalGroup + ' already has ' + maxPer + ' students.');
      return;
    }
    student.clinicalGroup = clinicalGroup;
    var cohort = data.students.filter(function (s) {
      return s.clinicalGroup === clinicalGroup && s.id !== studentId;
    });
    student.facilityId = getCohortFacilityId(cohort, data);
    var groups = App.DataModel.getClinicalGroups(data.config);
    var simGroups = App.DataModel.getSimGroups(data.config);
    student.simGroup = App.RosterBalance.simGroupForClinicalCohort(
      data.students, clinicalGroup, groups, simGroups, studentId
    );
    App.notifyChange();
    App.UI.Setup.render(data);
  }

  function initRosterDragDrop() {
    var roster = document.getElementById('setupRoster');
    if (!roster || roster.dataset.dragInit) return;
    roster.dataset.dragInit = '1';

    roster.addEventListener('dragstart', function (e) {
      var handle = e.target.closest('.drag-handle');
      if (!handle) {
        e.preventDefault();
        return;
      }
      var row = handle.closest('.setup-student-row');
      if (!row) return;
      dragStudentId = row.getAttribute('data-student-id');
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragStudentId);
    });

    roster.addEventListener('dragend', function (e) {
      var row = e.target.closest('.setup-student-row');
      if (row) row.classList.remove('dragging');
      roster.querySelectorAll('.setup-group-dropzone').forEach(function (z) {
        z.classList.remove('drag-over');
      });
      dragStudentId = null;
    });

    roster.addEventListener('dragover', function (e) {
      var zone = e.target.closest('.setup-group-dropzone');
      if (!zone) return;
      e.preventDefault();
      zone.classList.add('drag-over');
    });

    roster.addEventListener('dragleave', function (e) {
      var zone = e.target.closest('.setup-group-dropzone');
      if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove('drag-over');
    });

    roster.addEventListener('drop', function (e) {
      var zone = e.target.closest('.setup-group-dropzone');
      if (!zone) return;
      e.preventDefault();
      zone.classList.remove('drag-over');
      var id = dragStudentId || e.dataTransfer.getData('text/plain');
      if (!id) return;
      var data = App.getData();
      collectFromForm(data);
      moveStudentToGroup(data, id, zone.getAttribute('data-drop-group'));
    });

    roster.addEventListener('change', function (e) {
      if (e.target.classList.contains('move-cohort-select')) {
        var target = e.target.value;
        if (!target) return;
        var data = App.getData();
        collectFromForm(data);
        moveStudentToGroup(data, e.target.getAttribute('data-student-id'), target);
        return;
      }
    });

    roster.addEventListener('click', function (e) {
      var addBtn = e.target.closest('.add-student-btn');
      if (addBtn) {
        addStudent(App.getData(), addBtn.getAttribute('data-clinical-group'));
        return;
      }
      var removeBtn = e.target.closest('.remove-student-btn');
      if (removeBtn) {
        if (!confirm('Remove this student from the roster?')) return;
        removeStudent(App.getData(), removeBtn.getAttribute('data-student-id'));
      }
    });
  }

  function init() {
    initRosterDragDrop();
    document.getElementById('semesterSeasonSelect').addEventListener('change', updateStartDateFromSeasonYear);
    document.getElementById('semesterYearSelect').addEventListener('change', updateStartDateFromSeasonYear);

    document.getElementById('saveSetupBtn').addEventListener('click', function () {
      var data = App.getData();
      var configBefore = collectFromForm(data);
      App.notifyChange();
      if (App.UI.SetupConfig) App.UI.SetupConfig.maybeRegenerateAfterChange(data, configBefore);
      App.UI.refresh();
      alert('Setup saved.');
    });

    document.getElementById('finalizeSemesterBtn').addEventListener('click', function () {
      var data = App.getData();
      collectFromForm(data);
      data.meta.finalized = true;
      App.notifyChange();
      App.UI.refresh();
      alert('Semester finalized.');
    });

    document.getElementById('regenerateSchedulesBtn').addEventListener('click', function () {
      var data = App.getData();
      collectFromForm(data);
      var confirmMsg = 'Regenerate all student schedules? Manual edits will be lost.';
      if (App.Feasibility) {
        var feas = App.Feasibility.check(data);
        if (!feas.ok) {
          var summary = feas.issues.map(function (i) {
            return App.Feasibility.formatIssue(i);
          }).join('\n\n');
          confirmMsg = 'Schedule warnings detected:\n\n' + summary + '\n\nRegenerate anyway? Manual edits will be lost.';
        }
      }
      if (!confirm(confirmMsg)) return;
      App.Scheduler.regenerateAll(data);
      App.notifyChange();
      App.UI.refresh();
    });

    document.getElementById('addSectionBtn').addEventListener('click', function () {
      var data = App.getData();
      collectFromForm(data);
      if (!data.sections) data.sections = [];
      data.sections.push({ id: App.DataModel.uid(), name: '' });
      App.notifyChange();
      App.UI.Setup.render(data);
    });

    document.getElementById('setupSections').addEventListener('click', function (e) {
      var btn = e.target.closest('.remove-section');
      if (!btn) return;
      removeSection(App.getData(), btn.dataset.secId);
    });

    document.getElementById('addFacilityBtn').addEventListener('click', function () {
      var data = App.getData();
      collectFromForm(data);
      data.facilities.push({ id: App.DataModel.uid(), name: 'New Facility' });
      App.notifyChange();
      App.UI.Setup.render(data);
    });

    document.getElementById('setupFacilities').addEventListener('click', function (e) {
      var btn = e.target.closest('.remove-facility');
      if (!btn) return;
      removeFacility(App.getData(), btn.dataset.facId);
    });

    document.getElementById('addHolidayBtn').addEventListener('click', function () {
      var data = App.getData();
      collectFromForm(data);
      if (!data.holidays) data.holidays = [];
      data.holidays.push({ id: App.DataModel.uid(), date: '', label: '', type: 'holiday' });
      App.notifyChange();
      App.UI.Setup.render(data);
    });

    document.getElementById('setupHolidays').addEventListener('change', function (e) {
      if (e.target.getAttribute('data-hol') !== 'type') return;
      var data = App.getData();
      collectFromForm(data);
      var idx = parseInt(e.target.dataset.idx, 10);
      var h = data.holidays[idx];
      if (!h) return;
      h.type = e.target.value;
      if (h.type === 'break') {
        if (h.weekIndex == null) {
          h.weekIndex = h.date ? App.CalendarEngine.getWeekIndexForDate(data, h.date) : 0;
          if (h.weekIndex < 0) h.weekIndex = 0;
        }
        syncBreakHolidayDate(h, data);
      }
      App.notifyChange();
      App.UI.Setup.render(data);
    });

    document.getElementById('setupHolidays').addEventListener('click', function (e) {
      var btn = e.target.closest('.remove-holiday');
      if (!btn) return;
      var data = App.getData();
      collectFromForm(data);
      data.holidays.splice(parseInt(btn.dataset.idx, 10), 1);
      App.notifyChange();
      App.UI.Setup.render(data);
    });

    document.getElementById('copyForwardBtn').addEventListener('click', function () {
      App.addSemester();
      alert('New semester created. Update student roster in Setup.');
    });

    document.getElementById('rebalanceStudentsBtn').addEventListener('click', function () {
      var data = App.getData();
      collectFromForm(data);
      var syncCount = data.students.length !== (data.config.maxStudents || 30);
      var msg = syncCount
        ? 'Adjust roster to ' + (data.config.maxStudents || 30) + ' students and evenly assign across clinical groups?'
        : 'Evenly assign all students across clinical groups?';
      if (!confirm(msg)) return;
      rebalanceStudents(data, syncCount);
      App.notifyChange();
      App.UI.refresh();
    });
  }

  return {
    render: render,
    init: init,
    collectFromForm: collectFromForm,
    needsRebalance: needsRebalance,
    rebalanceStudents: rebalanceStudents,
    getCohortFacilityIdForGroup: getCohortFacilityIdForGroup,
    cohortFacilitySelectHtml: cohortFacilitySelectHtml
  };
})();
