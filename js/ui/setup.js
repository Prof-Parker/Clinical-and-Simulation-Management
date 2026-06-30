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

  function updateSetupStickyOffset() {
    var sticky = document.querySelector('.sticky-top');
    var top = sticky ? sticky.offsetHeight : 136;
    document.documentElement.style.setProperty('--setup-sticky-top', top + 'px');
  }

  function scrollSetupToTop() {
    var view = document.getElementById('view-setup');
    if (!view || !view.classList.contains('active')) return;
    var target = view.querySelector('.setup-actions-sticky') || view;
    var sticky = document.querySelector('.sticky-top');
    var offset = (sticky ? sticky.offsetHeight : 0) + 8;
    var top = target.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }

  function updateFinalizeButtonState(data) {
    var finalizeBtn = document.getElementById('finalizeSemesterBtn');
    if (!finalizeBtn) return;
    finalizeBtn.disabled = !!(data && data.meta && data.meta.finalized);
    finalizeBtn.title = finalizeBtn.disabled ? 'This semester has been finalized' : '';
  }

  function markSetupDraft(data) {
    if (!data || !data.meta || !data.meta.finalized) return;
    data.meta.finalized = false;
    updateFinalizeButtonState(data);
    if (App.UI.updateSemesterDisplay) App.UI.updateSemesterDisplay();
  }

  function isSetupDraftArea(el) {
    if (!el || !el.closest('#view-setup')) return false;
    if (el.closest('.setup-actions-sticky')) return false;
    if (el.closest('#setupRoster')) return false;
    return !!(
      el.closest('#view-setup > section.card') ||
      el.closest('.setup-program-card') ||
      el.closest('.setup-holidays-card') ||
      el.closest('.setup-orientations-card') ||
      el.closest('#setupAdvancedPanel')
    );
  }

  function handleSetupDraftInput(e) {
    if (!isSetupDraftArea(e.target)) return;
    markSetupDraft(App.getData());
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
      updateFinalizeButtonState(data);
    }
  }

  function renderScheduleWarnings(data) {
    var panel = document.getElementById('setupScheduleWarnings');
    var section = document.getElementById('setupScheduleWarningsSection');
    if (!panel || !App.ScheduleStatus) return;
    var summary = App.ScheduleStatus.summarize(data);
    if (!App.ScheduleStatus.shouldShowPanel(summary)) {
      panel.className = 'setup-schedule-warnings setup-schedule-status hidden';
      panel.innerHTML = '';
      if (section) section.classList.add('hidden');
      return;
    }

    if (section) section.classList.remove('hidden');
    panel.classList.remove('hidden');
    panel.className = 'setup-schedule-warnings setup-schedule-status setup-schedule-status-' + summary.tier;

    var html = '';
    if (summary.tier === 'green') {
      html += '<strong>Schedule status: Complete</strong>' +
        '<p class="section-sub" style="margin:0.35rem 0 0">All ' + summary.totalStudents +
        ' students meet clinical and simulation requirements with no substitutions or makeups.</p>';
    } else if (summary.tier === 'yellow') {
      html += '<strong>Schedule status: Complete with adjustments</strong>';
      if (summary.generated) {
        html += '<p class="section-sub" style="margin:0.35rem 0 0.5rem">All ' + summary.totalStudents +
          ' students meet clinical and simulation requirements. Adjustments used:</p><ul>';
        var adj = summary.adjustments;
        if (adj.makeupClinicalCount) {
          html += '<li>' + adj.makeupClinicalCount + ' student(s) with makeup clinical day(s)</li>';
        }
        if (adj.nonPrimarySimCount) {
          html += '<li>' + adj.nonPrimarySimCount + ' student(s) with non-primary sim week/day placement</li>';
        }
        if (adj.guestSimCount) {
          html += '<li>' + adj.guestSimCount + ' student(s) attending sim as guest in another group</li>';
        }
        if (adj.overloadCount) {
          html += '<li>' + adj.overloadCount + ' student(s) with sim overload placement</li>';
        }
        if (adj.simMakeupCount) {
          html += '<li>' + adj.simMakeupCount + ' student(s) with sim makeup placement</li>';
        }
        if (adj.makeupRecordCount) {
          html += '<li>' + adj.makeupRecordCount + ' student(s) with recorded makeup entries</li>';
        }
        if (html.indexOf('<li>') < 0) {
          html += '<li>Substitutions or makeup days were applied during generation</li>';
        }
        html += '</ul>';
      } else {
        html += '<p class="section-sub" style="margin:0.35rem 0 0.5rem">Schedules have not been generated yet. Review the notes below, then click Regenerate Schedules.</p>';
      }
      if (summary.notes.length) {
        html += '<p class="section-sub" style="margin:0.5rem 0 0.25rem"><strong>Notes</strong></p><ul>';
        summary.notes.forEach(function (note) {
          html += '<li>' + escHtml(note) + '</li>';
        });
        html += '</ul>';
      }
    } else {
      html += '<strong>Schedule status: Incomplete</strong>';
      if (summary.generated && summary.orientationConflicts && summary.orientationConflicts.length) {
        html += '<p class="section-sub" style="margin:0.35rem 0 0.5rem">Orientation day conflicts with scheduled clinical or simulation — manually reassign affected students in the Master Schedule.</p><ul>';
        summary.orientationConflicts.forEach(function (v) {
          html += '<li>' + escHtml(v.message) + '</li>';
        });
        html += '</ul>';
      }
      if (summary.generated && summary.incompleteCount) {
        html += '<p class="section-sub" style="margin:0.35rem 0 0.5rem">' + summary.incompleteCount +
          ' of ' + summary.totalStudents + ' students cannot meet requirements:</p><ul>';
        summary.incompleteStudents.forEach(function (student) {
          html += '<li><strong>' + escHtml(student.name) + '</strong>: ' +
            escHtml(student.errors.join('; ')) + '</li>';
        });
        html += '</ul>';
      } else if (summary.blockingIssues.length) {
        html += '<p class="section-sub" style="margin:0.35rem 0 0.5rem">Configuration may prevent schedule generation:</p><ul>';
        summary.blockingIssues.forEach(function (issue) {
          html += '<li>' + escHtml(App.ScheduleStatus.formatBlockingIssue(issue)) + '</li>';
        });
        html += '</ul>';
      }
    }

    panel.innerHTML = html;
  }

  function render(data) {
    renderSemesterFields(data);
    renderSections(data);
    renderFacilities(data);
    renderFaculty(data);
    renderHolidays(data);
    renderOrientations(data);
    renderRoster(data);
    renderScheduleWarnings(data);
    if (App.UI.SetupConfig) App.UI.SetupConfig.render(data);
    if (App.UI.DateInputs) {
      App.UI.DateInputs.init(document.getElementById('view-setup'), data);
    }
    updateAllHolidayWeekHints(data);
    updateAllOrientationWeekHints(data);
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
    if (App.ClinicalSites) {
      var primary = App.ClinicalSites.getPrimaryGroupFacility(data, clinicalGroup);
      if (primary) return primary;
    }
    var cohort = data.students.filter(function (s) { return s.clinicalGroup === clinicalGroup; });
    if (cohort.length) return getCohortFacilityId(cohort, data);
    return App.DataModel.getDefaultFacilityIdForClinicalGroup(clinicalGroup, data.facilities || []);
  }

  function applyGroupFacilitiesFromConfig(data) {
    if (App.ClinicalSites) {
      App.ClinicalSites.collectGroupFacilitiesFromDom(data);
      App.ClinicalSites.applyPrimarySitesToStudents(data);
      return;
    }
    document.querySelectorAll('[data-clin-site-facility]').forEach(function (el) {
      var group = el.getAttribute('data-clin-group');
      var siteIndex = parseInt(el.getAttribute('data-clin-site-index'), 10) || 0;
      if (siteIndex === 0) applyGroupFacility(data, group, el.value);
    });
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

  function predominantSection(cohort) {
    var counts = {};
    var best = '';
    var bestN = 0;
    cohort.forEach(function (s) {
      if (!s.section) return;
      counts[s.section] = (counts[s.section] || 0) + 1;
      if (counts[s.section] > bestN) {
        bestN = counts[s.section];
        best = s.section;
      }
    });
    return best;
  }

  function cohortSectionSummaryText(cohort) {
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

  function cohortSectionBulkSelectHtml(data, clinicalGroup, cohort) {
    var selected = predominantSection(cohort);
    var mixed = cohort.length > 0 && cohort.some(function (s) {
      return s.section && s.section !== selected;
    });
    var html = '<label class="setup-cohort-section-bulk">' +
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

  function applyCohortSection(data, clinicalGroup, sectionName) {
    data.students.forEach(function (s) {
      if (s.clinicalGroup === clinicalGroup) s.section = sectionName;
    });
  }

  function defaultSectionForNewStudent(data, clinicalGroup) {
    var cohort = data.students.filter(function (s) { return s.clinicalGroup === clinicalGroup; });
    var fromCohort = predominantSection(cohort);
    if (fromCohort) return fromCohort;
    var groups = App.DataModel.getClinicalGroups(data.config);
    var gi = groups.indexOf(clinicalGroup);
    if (gi >= 0 && data.sections && data.sections[gi] && data.sections[gi].name) {
      return data.sections[gi].name;
    }
    return (data.sections && data.sections[0] && data.sections[0].name) ? data.sections[0].name : '';
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
    var facId = getCohortFacilityIdForGroup(data, clinicalGroup);
    var section = defaultSectionForNewStudent(data, clinicalGroup);
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
      var sectionSummary = cohortSectionSummaryText(cohort);
      var groupDiv = document.createElement('div');
      groupDiv.className = 'setup-group';
      groupDiv.innerHTML =
        '<div class="setup-group-header">' +
        '<div class="setup-group-header-main">' +
        '<h4>' + g + ' Cohort</h4>' +
        '<span class="setup-group-day">' + clinDay + ' clinical</span>' +
        '<span class="setup-group-count">' + cohort.length + ' / ' + maxPer + ' students</span>' +
        (sectionSummary ? '<span class="setup-group-sections section-sub" title="Registrar sections in this cohort">' +
          escHtml(sectionSummary) + '</span>' : '') +
        '</div>' +
        '<div class="setup-group-header-actions">' +
        cohortSectionBulkSelectHtml(data, g, cohort) +
        '<button type="button" class="btn btn-sm add-student-btn" data-clinical-group="' + g + '">Add student</button>' +
        '</div></div>' +
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
        '<input type="text" class="setup-section-code" data-sec="name" data-sec-id="' + sec.id + '" value="' + escAttr(sec.name) + '" placeholder="F6011" maxlength="12">' +
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

  function semesterWeekHintText(data, dateStr) {
    if (!dateStr) return 'Select a date to see week';
    var wi = App.CalendarEngine.getWeekIndexForDate(data, dateStr);
    if (wi < 0) return 'Outside semester weeks';
    return semesterWeekHintForIndex(data, wi);
  }

  function semesterWeekHintForIndex(data, weekIndex) {
    var wi = parseInt(weekIndex, 10);
    if (isNaN(wi) || wi < 0 || wi > 17) return 'Select a week';
    var label = App.CalendarEngine.getWeekDisplay(data, wi, true);
    if (App.CalendarEngine.isWeekInactive(data, wi)) label += ' — inactive';
    return label;
  }

  function updateHolidayWeekHint(data, el) {
    var row = el.closest('.setup-holiday-when-row');
    var hint = row && row.querySelector('[data-hol-week-hint]');
    if (!hint) return;
    if (el.getAttribute('data-hol') === 'date') {
      hint.textContent = semesterWeekHintText(data, el.value);
    } else if (el.getAttribute('data-hol') === 'week') {
      hint.textContent = semesterWeekHintForIndex(data, el.value);
    }
  }

  function updateAllHolidayWeekHints(data) {
    document.querySelectorAll('#setupHolidays [data-hol="date"], #setupHolidays [data-hol="week"]').forEach(function (el) {
      updateHolidayWeekHint(data, el);
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
          '<div class="setup-holiday-when-row">' +
          '<select data-hol="week" data-idx="' + i + '">' + weekSelectHtml(data, h.weekIndex != null ? h.weekIndex : 0) + '</select>' +
          '<span class="setup-holiday-week-hint" data-hol-week-hint data-idx="' + i + '">' +
          escHtml(semesterWeekHintForIndex(data, h.weekIndex != null ? h.weekIndex : 0)) + '</span></div></label>'
        : '<label class="setup-holiday-field setup-holiday-when">' +
          '<span class="setup-holiday-field-label">Date</span>' +
          '<div class="setup-holiday-when-row">' +
          '<input type="date" class="date-input" data-hol="date" data-idx="' + i + '" value="' + (h.date || '') + '">' +
          '<span class="setup-holiday-week-hint" data-hol-week-hint data-idx="' + i + '">' +
          escHtml(semesterWeekHintText(data, h.date || '')) + '</span></div></label>';
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

  function orientationFacilitySelectHtml(data, selectedId) {
    selectedId = App.DataModel.getCanonicalFacilityId(data, selectedId);
    return App.DataModel.getUniqueFacilitiesForSelect(data).map(function (f) {
      return '<option value="' + f.id + '"' + (selectedId === f.id ? ' selected' : '') + '>' + escAttr(f.name) + '</option>';
    }).join('');
  }

  function orientationWeekHintText(data, dateStr) {
    return semesterWeekHintText(data, dateStr);
  }

  function updateOrientationWeekHint(data, dateInput) {
    var row = dateInput.closest('.setup-orientation-date-row');
    var hint = row && row.querySelector('[data-orient-week-hint]');
    if (hint) hint.textContent = orientationWeekHintText(data, dateInput.value);
  }

  function updateAllOrientationWeekHints(data) {
    document.querySelectorAll('#setupOrientations [data-orient="date"]').forEach(function (el) {
      updateOrientationWeekHint(data, el);
    });
  }

  function nextOrientationDefault(data) {
    var groups = App.DataModel.getClinicalGroups(data.config);
    for (var gi = 0; gi < groups.length; gi++) {
      var group = groups[gi];
      var facIds = App.ClinicalSites
        ? App.ClinicalSites.getGroupFacilities(data, group)
        : [getCohortFacilityIdForGroup(data, group)];
      for (var fi = 0; fi < facIds.length; fi++) {
        var facId = facIds[fi];
        var exists = (data.orientations || []).some(function (o) {
          if (!o || o.clinicalGroup !== group) return false;
          if (!facId) return true;
          return App.DataModel.sameFacilitySite(data, o.facilityId, facId);
        });
        if (!exists) {
          return { clinicalGroup: group, facilityId: facId };
        }
      }
    }
    var fallbackGroup = groups[0] || 'C1';
    return {
      clinicalGroup: fallbackGroup,
      facilityId: getCohortFacilityIdForGroup(data, fallbackGroup)
    };
  }

  function renderOrientations(data) {
    var container = document.getElementById('setupOrientations');
    if (!container) return;
    container.innerHTML = '';
    if (!data.calendar.weeks || !data.calendar.weeks.length) {
      App.CalendarEngine.rebuildWeeks(data);
    }
    var orientations = data.orientations || [];
    if (orientations.length) {
      container.innerHTML =
        '<div class="setup-orientations-head" aria-hidden="true">' +
        '<span>Clinical group</span><span>Orientation date</span><span>Facility</span><span></span>' +
        '</div>';
    }
    var clinicalGroups = App.DataModel.getClinicalGroups(data.config);
    orientations.forEach(function (o, i) {
      var groupOptions = clinicalGroups.map(function (g) {
        return '<option value="' + g + '"' + (o.clinicalGroup === g ? ' selected' : '') + '>' + g + '</option>';
      }).join('');
      var defaultFacId = App.DataModel.getDefaultFacilityIdForClinicalGroup(o.clinicalGroup, data.facilities || []);
      var facId = o.facilityId || defaultFacId;
      container.innerHTML +=
        '<div class="setup-orientation-row" data-orient-idx="' + i + '">' +
        '<label class="setup-orientation-field setup-orientation-group">' +
        '<span class="setup-orientation-field-label">Clinical group</span>' +
        '<select data-orient="group" data-idx="' + i + '">' + groupOptions + '</select></label>' +
        '<label class="setup-orientation-field setup-orientation-date">' +
        '<span class="setup-orientation-field-label">Orientation date</span>' +
        '<div class="setup-orientation-date-row">' +
        '<input type="date" class="date-input" data-orient="date" data-idx="' + i + '" value="' + (o.date || '') + '">' +
        '<span class="setup-orientation-week-hint" data-orient-week-hint data-idx="' + i + '">' +
        escHtml(orientationWeekHintText(data, o.date || '')) + '</span></div></label>' +
        '<label class="setup-orientation-field setup-orientation-facility">' +
        '<span class="setup-orientation-field-label">Facility</span>' +
        '<select data-orient="facility" data-idx="' + i + '">' + orientationFacilitySelectHtml(data, facId) + '</select></label>' +
        '<button class="btn btn-icon-remove remove-orientation" type="button" data-idx="' + i + '" aria-label="Remove orientation" title="Remove orientation">&times;</button>' +
        '</div>';
    });
    if (!orientations.length) {
      container.innerHTML = '<p class="section-sub">No orientation days defined. Click Add above.</p>';
    }
  }

  function escAttr(s) {
    return String(s || '').replace(/"/g, '&quot;');
  }

  function escHtml(s) {
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function collectSemesterMeta(data) {
    var season = document.getElementById('semesterSeasonSelect').value;
    var year = parseInt(document.getElementById('semesterYearSelect').value, 10);
    var prevSeason = data.meta.semesterSeason;
    var prevYear = data.meta.semesterYear;
    data.meta.semesterSeason = season;
    data.meta.semesterYear = year;
    data.meta.semesterName = App.DataModel.buildSemesterName(season, year);
    if (prevSeason !== season || prevYear !== year) markSetupDraft(data);
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

    applyGroupFacilitiesFromConfig(data);

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
        o.weekIndex = App.CalendarEngine.getWeekIndexForDate(data, o.date);
      }
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
              !App.DataModel.sameFacilitySite(data, r.facilityId, facId);
          })
          .map(function (r) {
            if (App.DataModel.sameFacilitySite(data, r.facilityId, facId)) {
              return { facilityId: fallback.id, startWeekIndex: r.startWeekIndex, endWeekIndex: r.endWeekIndex };
            }
            return r;
          });
      });
    }
    App.DataModel.normalizeFacilities(data);
    markSetupDraft(data);
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
    markSetupDraft(data);
    App.notifyChange();
    App.UI.Setup.render(data);
  }

  function addStudent(data, clinicalGroup) {
    collectFromForm(data);
    var maxStudents = data.config.maxStudents || 30;
    var maxPer = data.config.maxPerClinicalGroup || 6;
    if (data.students.length >= maxStudents) {
      App.UI.showAlert('Cannot add student', 'Maximum students (' + maxStudents + ') reached. Increase max in scheduling configuration or remove a student.');
      return;
    }
    var inGroup = data.students.filter(function (s) { return s.clinicalGroup === clinicalGroup; }).length;
    if (inGroup >= maxPer) {
      App.UI.showAlert('Cannot add student', clinicalGroup + ' already has ' + maxPer + ' students (configured maximum per clinical group).');
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
      App.UI.showAlert('Cannot move student', clinicalGroup + ' already has ' + maxPer + ' students.');
      return;
    }
    student.clinicalGroup = clinicalGroup;
    student.facilityId = getCohortFacilityIdForGroup(data, clinicalGroup);
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
      if (e.target.hasAttribute('data-cohort-section-bulk')) {
        var sectionName = e.target.value;
        if (!sectionName) return;
        var data = App.getData();
        collectFromForm(data);
        applyCohortSection(data, e.target.getAttribute('data-cohort-section-bulk'), sectionName);
        App.notifyChange();
        App.UI.Setup.render(data);
        return;
      }
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
        App.UI.showConfirm('Remove student?', 'Remove this student from the roster?', function () {
          removeStudent(App.getData(), removeBtn.getAttribute('data-student-id'));
        }, { confirmLabel: 'Remove' });
      }
    });
  }

  function init() {
    initRosterDragDrop();
    var viewSetup = document.getElementById('view-setup');
    if (viewSetup) {
      viewSetup.addEventListener('input', handleSetupDraftInput);
      viewSetup.addEventListener('change', handleSetupDraftInput);
    }
    document.getElementById('semesterSeasonSelect').addEventListener('change', updateStartDateFromSeasonYear);
    document.getElementById('semesterYearSelect').addEventListener('change', updateStartDateFromSeasonYear);

    document.getElementById('saveSetupBtn').addEventListener('click', function () {
      var data = App.getData();
      var configBefore = collectFromForm(data);
      App.notifyChange();
      if (App.UI.SetupConfig) App.UI.SetupConfig.maybeRegenerateAfterChange(data, configBefore);
      App.UI.refresh();
      App.UI.showAlert('Saved', 'Setup saved.');
      scrollSetupToTop();
    });

    document.getElementById('finalizeSemesterBtn').addEventListener('click', function () {
      var data = App.getData();
      collectFromForm(data);
      data.meta.finalized = true;
      App.notifyChange();
      App.UI.refresh();
      App.UI.showAlert('Finalized', 'Semester finalized.');
    });

    document.getElementById('regenerateSchedulesBtn').addEventListener('click', function () {
      var data = App.getData();
      collectFromForm(data);
      var confirmMsg = 'Regenerate all student schedules? Manual edits will be lost.';
      if (App.ScheduleStatus) {
        var summary = App.ScheduleStatus.summarize(data);
        if (summary.tier === 'yellow') {
          confirmMsg = 'Schedules will be regenerated. Substitutions or makeup days may be needed for some students.\n\nRegenerate anyway? Manual edits will be lost.';
          if (summary.blockingIssues.length) {
            var blockers = summary.blockingIssues.map(function (i) {
              return App.ScheduleStatus.formatBlockingIssue(i);
            }).join('\n\n');
            confirmMsg = 'Schedule issues detected:\n\n' + blockers + '\n\nRegenerate anyway? Manual edits will be lost.';
          }
        } else if (summary.tier === 'red') {
          var parts = [];
          if (summary.blockingIssues.length) {
            parts = summary.blockingIssues.map(function (i) {
              return App.ScheduleStatus.formatBlockingIssue(i);
            });
          }
          if (summary.incompleteStudents.length) {
            summary.incompleteStudents.forEach(function (s) {
              parts.push(s.name + ': ' + s.errors.join('; '));
            });
          }
          confirmMsg = 'Schedule problems detected:\n\n' + parts.join('\n\n') +
            '\n\nRegenerate anyway? Manual edits will be lost.';
        }
      }
      App.UI.showConfirm('Regenerate schedules?', confirmMsg, function () {
        App.Scheduler.regenerateAll(data);
        App.notifyChange();
        App.UI.refresh();
        scrollSetupToTop();
      }, { confirmLabel: 'Regenerate' });
    });

    updateSetupStickyOffset();
    window.addEventListener('resize', updateSetupStickyOffset);

    document.getElementById('addSectionBtn').addEventListener('click', function () {
      var data = App.getData();
      collectFromForm(data);
      if (!data.sections) data.sections = [];
      data.sections.push({ id: App.DataModel.uid(), name: '' });
      markSetupDraft(data);
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
      markSetupDraft(data);
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
      markSetupDraft(data);
      App.notifyChange();
      App.UI.Setup.render(data);
    });

    document.getElementById('setupHolidays').addEventListener('change', function (e) {
      var hol = e.target.getAttribute('data-hol');
      if (hol === 'date' || hol === 'week') {
        updateHolidayWeekHint(App.getData(), e.target);
        return;
      }
      if (hol !== 'type') return;
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
      markSetupDraft(data);
      App.notifyChange();
      App.UI.Setup.render(data);
    });

    document.getElementById('setupHolidays').addEventListener('input', function (e) {
      if (e.target.getAttribute('data-hol') !== 'date') return;
      updateHolidayWeekHint(App.getData(), e.target);
    });

    document.getElementById('setupHolidays').addEventListener('click', function (e) {
      var btn = e.target.closest('.remove-holiday');
      if (!btn) return;
      var data = App.getData();
      collectFromForm(data);
      data.holidays.splice(parseInt(btn.dataset.idx, 10), 1);
      markSetupDraft(data);
      App.notifyChange();
      App.UI.Setup.render(data);
    });

    document.getElementById('addOrientationBtn').addEventListener('click', function () {
      var data = App.getData();
      collectFromForm(data);
      if (!data.orientations) data.orientations = [];
      var next = nextOrientationDefault(data);
      data.orientations.push({
        id: App.DataModel.uid(),
        clinicalGroup: next.clinicalGroup,
        date: '',
        facilityId: next.facilityId
      });
      markSetupDraft(data);
      App.notifyChange();
      App.UI.Setup.render(data);
    });

    document.getElementById('setupOrientations').addEventListener('click', function (e) {
      var btn = e.target.closest('.remove-orientation');
      if (!btn) return;
      var data = App.getData();
      collectFromForm(data);
      data.orientations.splice(parseInt(btn.dataset.idx, 10), 1);
      markSetupDraft(data);
      App.notifyChange();
      App.UI.Setup.render(data);
    });

    document.getElementById('setupOrientations').addEventListener('change', function (e) {
      if (e.target.getAttribute('data-orient') !== 'date') return;
      updateOrientationWeekHint(App.getData(), e.target);
    });

    document.getElementById('setupOrientations').addEventListener('input', function (e) {
      if (e.target.getAttribute('data-orient') !== 'date') return;
      updateOrientationWeekHint(App.getData(), e.target);
    });

    document.getElementById('rebalanceStudentsBtn').addEventListener('click', function () {
      var data = App.getData();
      collectFromForm(data);
      var syncCount = data.students.length !== (data.config.maxStudents || 30);
      var msg = syncCount
        ? 'Adjust roster to ' + (data.config.maxStudents || 30) + ' students and evenly assign across clinical groups?'
        : 'Evenly assign all students across clinical groups?';
      App.UI.showConfirm('Rebalance roster?', msg, function () {
        rebalanceStudents(data, syncCount);
        App.notifyChange();
        App.UI.refresh();
      }, { confirmLabel: 'Rebalance' });
    });
  }

  return {
    render: render,
    init: init,
    collectFromForm: collectFromForm,
    markSetupDraft: markSetupDraft,
    needsRebalance: needsRebalance,
    rebalanceStudents: rebalanceStudents,
    getCohortFacilityIdForGroup: getCohortFacilityIdForGroup,
    cohortFacilitySelectHtml: cohortFacilitySelectHtml,
    weekSelectHtml: weekSelectHtml,
    semesterWeekHintForIndex: semesterWeekHintForIndex
  };
})();
