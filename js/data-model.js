/* global App */
var App = App || {};

App.DataModel = (function () {
  var FILE_VERSION = 2;
  var VERSION = 1;
  var CLINICAL_GROUPS = ['C1', 'C2', 'C3', 'C4', 'C5'];
  var SIM_GROUPS = ['SG1', 'SG2', 'SG3', 'SG4'];
  var WEEKDAY_OPTIONS = ['Sat', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  var ROLE_OPTIONS = ['', 'Primary', 'Secondary', 'Evaluator', 'Scribe'];

  function uid() {
    return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function emptyCell() {
    return {
      clinical: false, clinicalMissed: false, sim: null, simDay: null,
      makeupClinical: false, inactive: false, simMakeup: false, simOverload: false
    };
  }

  function emptySchedule() {
    var s = [];
    for (var i = 0; i < 18; i++) s.push(emptyCell());
    return s;
  }

  function defaultConfig() {
    return {
      clinicalDaysRequired: 10,
      simDaysRequired: 5,
      maxStudents: 30,
      maxPerClinicalGroup: 6,
      maxPerSimGroup: 8,
      maxStudentsPerSimSession: 8,
      maxStudentsPerSimSessionOverload: 9,
      numSimGroups: 4,
      numClinicalGroups: 5,
      clinicalStartWeek: 5,
      simStartWeek: 5,
      clinicalGroups: CLINICAL_GROUPS.slice(),
      clinicalGroupDays: { C1: 'Sat', C2: 'Mon', C3: 'Mon', C4: 'Mon', C5: 'Tue' },
      simGroups: SIM_GROUPS.slice(),
      simDays: ['Mon', 'Tue']
    };
  }

  function normalizeConfig(cfg) {
    if (!cfg) cfg = defaultConfig();
    if (!cfg.clinicalGroupDays) cfg.clinicalGroupDays = {};
    if (!cfg.clinicalGroups || !cfg.clinicalGroups.length) {
      cfg.clinicalGroups = Object.keys(cfg.clinicalGroupDays);
      cfg.clinicalGroups.sort(function (a, b) {
        var na = parseInt(String(a).replace(/\D/g, ''), 10) || 0;
        var nb = parseInt(String(b).replace(/\D/g, ''), 10) || 0;
        return na - nb || String(a).localeCompare(String(b));
      });
    }
    if (!cfg.clinicalGroups.length) cfg.clinicalGroups = CLINICAL_GROUPS.slice();
    cfg.clinicalGroups.forEach(function (g) {
      if (!cfg.clinicalGroupDays[g]) cfg.clinicalGroupDays[g] = 'Mon';
    });
    Object.keys(cfg.clinicalGroupDays).forEach(function (key) {
      if (cfg.clinicalGroups.indexOf(key) < 0) delete cfg.clinicalGroupDays[key];
    });
    if (!cfg.simDays || !cfg.simDays.length) cfg.simDays = ['Mon', 'Tue'];
    if (!cfg.simGroups || !cfg.simGroups.length) {
      cfg.simGroups = SIM_GROUPS.slice(0, cfg.numSimGroups || SIM_GROUPS.length);
    }
    cfg.numClinicalGroups = cfg.clinicalGroups.length;
    cfg.numSimGroups = cfg.simGroups.length;
    return cfg;
  }

  function getClinicalGroups(config) {
    return normalizeConfig(config).clinicalGroups.slice();
  }

  function getSimGroups(config) {
    return normalizeConfig(config).simGroups.slice();
  }

  function getSimDays(config) {
    return normalizeConfig(config).simDays.slice();
  }

  function nextClinicalGroupName(groups) {
    var max = 0;
    (groups || []).forEach(function (g) {
      var m = String(g).match(/^C(\d+)$/i);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return 'C' + (max + 1);
  }

  function syncSemesterFaculty(semester) {
    var groups = getClinicalGroups(semester.config);
    var byGroup = {};
    (semester.faculty || []).forEach(function (f) {
      byGroup[f.clinicalGroup] = f;
    });
    semester.faculty = groups.map(function (g) {
      if (byGroup[g]) return byGroup[g];
      return { id: uid(), name: '', clinicalGroup: g };
    });
  }

  function syncSemesterStudentsForConfig(semester) {
    var clinGroups = getClinicalGroups(semester.config);
    var simGroups = getSimGroups(semester.config);
    var defaultClin = clinGroups[0] || 'C1';
    var defaultSim = simGroups[0] || 'SG1';
    (semester.students || []).forEach(function (s) {
      if (clinGroups.indexOf(s.clinicalGroup) < 0) s.clinicalGroup = defaultClin;
      if (simGroups.indexOf(s.simGroup) < 0) s.simGroup = defaultSim;
    });
  }

  function syncSemesterForConfig(semester) {
    normalizeConfig(semester.config);
    syncSemesterFaculty(semester);
    syncSemesterStudentsForConfig(semester);
  }

  function defaultFacilities() {
    return [
      { id: uid(), name: 'Saint Elizabeth', clinicalDay: 'Mon' },
      { id: uid(), name: 'Regional Medical Center', clinicalDay: 'Mon' },
      { id: uid(), name: 'Community Hospital', clinicalDay: 'Tue' },
      { id: uid(), name: 'Sunrise Care', clinicalDay: 'Sat' }
    ];
  }

  function defaultSections() {
    return [
      { id: uid(), name: 'F6016' },
      { id: uid(), name: 'S7926' },
      { id: uid(), name: 'F6017' }
    ];
  }

  function defaultFaculty(groups) {
    var list = groups || CLINICAL_GROUPS;
    return list.map(function (g) {
      return { id: uid(), name: '', clinicalGroup: g };
    });
  }

  function createStudent(name, clinicalGroup, simGroup, facilityId, section) {
    return {
      id: uid(),
      name: name == null ? 'Student' : name,
      clinicalGroup: clinicalGroup,
      simGroup: simGroup || 'SG1',
      section: section || '',
      facilityId: facilityId || null,
      schedule: emptySchedule(),
      absences: [],
      makeups: []
    };
  }

  function createDefaultSemester() {
    var facilities = defaultFacilities();
    var sections = defaultSections();
    var students = [];
    var cfg = defaultConfig();
    var simGroups = cfg.simGroups;
    var idx = 0;
    cfg.clinicalGroups.forEach(function (g, gi) {
      for (var i = 0; i < 6; i++) {
        var fac = facilities[gi % facilities.length];
        students.push(createStudent(
          'Student ' + (idx + 1),
          g,
          simGroups[Math.floor(idx / 8) % simGroups.length],
          fac.id,
          sections[idx % sections.length].name
        ));
        idx++;
      }
    });

    var startDate = new Date();
    startDate.setMonth(startDate.getMonth() < 6 ? 0 : 7);
    startDate.setDate(1);
    var year = startDate.getFullYear();
    var season = startDate.getMonth() < 6 ? 'spring' : 'fall';
    var iso = startDateForSeason(season, year);

    return {
      id: uid(),
      meta: {
        version: VERSION,
        semesterSeason: season,
        semesterYear: year,
        semesterName: buildSemesterName(season, year),
        finalized: false,
        configCustomized: false,
        lastModified: new Date().toISOString()
      },
      config: cfg,
      calendar: {
        semesterStartDate: iso,
        weeks: []
      },
      holidays: [],
      sections: sections,
      facilities: facilities,
      faculty: defaultFaculty(cfg.clinicalGroups),
      students: students,
      roles: {}
    };
  }

  function createDefaultFile() {
    var sem = createDefaultSemester();
    var defaults = cloneConfig(sem.config);
    return {
      meta: {
        fileVersion: FILE_VERSION,
        activeSemesterId: sem.id,
        darkMode: false,
        schedulingDefaults: defaults,
        lastModified: new Date().toISOString()
      },
      semesters: [sem]
    };
  }

  function cloneConfig(cfg) {
    return JSON.parse(JSON.stringify(cfg || defaultConfig()));
  }

  function getSchedulingDefaults(fileRoot) {
    if (!fileRoot || !fileRoot.meta || !fileRoot.meta.schedulingDefaults) return defaultConfig();
    return cloneConfig(fileRoot.meta.schedulingDefaults);
  }

  function setSchedulingDefaults(fileRoot, config) {
    if (!fileRoot.meta) fileRoot.meta = {};
    fileRoot.meta.schedulingDefaults = cloneConfig(config);
  }

  function configsMatch(a, b) {
    return JSON.stringify(cloneConfig(a)) === JSON.stringify(cloneConfig(b));
  }

  function semesterSortKey(semester) {
    var parts = parseSemesterDisplay(semester);
    var year = parseInt(parts.year, 10) || 0;
    var seasonOrder = parts.season === 'fall' ? 1 : 0;
    return year * 2 + seasonOrder;
  }

  function getFutureSemesters(fileRoot, currentSemester) {
    if (!fileRoot || !fileRoot.semesters) return [];
    var currentKey = semesterSortKey(currentSemester);
    return fileRoot.semesters.filter(function (sem) {
      return sem.id !== currentSemester.id && semesterSortKey(sem) > currentKey;
    });
  }

  function applyConfigToSemester(semester, config, customized) {
    semester.config = cloneConfig(config);
    if (!semester.meta) semester.meta = {};
    semester.meta.configCustomized = customized !== false;
  }

  function migrateSemester(semester) {
    if (!semester.id) semester.id = uid();
    if (!semester.meta) semester.meta = { version: VERSION, semesterName: 'Semester', lastModified: new Date().toISOString() };
    if (!semester.config) semester.config = defaultConfig();
    normalizeConfig(semester.config);
    if (!semester.config.maxStudentsPerSimSession) semester.config.maxStudentsPerSimSession = 8;
    if (!semester.config.maxStudentsPerSimSessionOverload) semester.config.maxStudentsPerSimSessionOverload = 9;
    if (!semester.calendar) semester.calendar = { semesterStartDate: new Date().toISOString().slice(0, 10), weeks: [] };
    if (!semester.holidays) semester.holidays = [];
    if (!semester.facilities) semester.facilities = defaultFacilities();
    if (!semester.faculty) semester.faculty = defaultFaculty(getClinicalGroups(semester.config));
    syncSemesterFaculty(semester);
    if (!semester.students) semester.students = [];
    if (!semester.roles) semester.roles = {};
    if (!semester.sections || !semester.sections.length) {
      var seen = {};
      semester.sections = [];
      (semester.students || []).forEach(function (s) {
        if (s.section && !seen[s.section]) {
          seen[s.section] = true;
          semester.sections.push({ id: uid(), name: s.section });
        }
      });
      if (!semester.sections.length) semester.sections = defaultSections();
    }
    semester.students.forEach(function (s) {
      if (!s.schedule || s.schedule.length !== 18) s.schedule = emptySchedule();
      if (!s.id) s.id = uid();
      if (!s.absences) s.absences = [];
      if (!s.makeups) s.makeups = [];
      s.schedule.forEach(function (c) {
        if (c.simMakeup === undefined) c.simMakeup = false;
        if (c.simOverload === undefined) c.simOverload = false;
      });
    });
    semester.meta.version = VERSION;
    if (semester.meta.configCustomized === undefined) semester.meta.configCustomized = false;
    if (semester.meta.finalized === undefined) semester.meta.finalized = false;
    var parsed = parseSemesterDisplay(semester);
    if (!semester.meta.semesterSeason && parsed.season) {
      semester.meta.semesterSeason = parsed.season;
    }
    if (!semester.meta.semesterYear) {
      semester.meta.semesterYear = parseInt(parsed.year, 10);
    }
    if (!semester.meta.semesterSeason) semester.meta.semesterSeason = 'spring';
    semester.meta.semesterName = buildSemesterName(
      semester.meta.semesterSeason,
      semester.meta.semesterYear
    );
    if (!semester.calendar.semesterStartDate) {
      semester.calendar.semesterStartDate = startDateForSeason(
        semester.meta.semesterSeason,
        semester.meta.semesterYear
      );
    }
    return semester;
  }

  function buildSemesterName(season, year) {
    var label = season === 'fall' ? 'Fall' : 'Spring';
    return label + ' ' + year;
  }

  function startDateForSeason(season, year) {
    var y = parseInt(year, 10) || new Date().getFullYear();
    var month = season === 'fall' ? 7 : 0;
    var d = new Date(y, month, 1);
    var m = String(d.getMonth() + 1).padStart(2, '0');
    return y + '-' + m + '-01';
  }

  function applySemesterSeasonYear(semester, season, year) {
    semester.meta.semesterSeason = season;
    semester.meta.semesterYear = parseInt(year, 10);
    semester.meta.semesterName = buildSemesterName(season, year);
    semester.calendar.semesterStartDate = startDateForSeason(season, year);
  }

  function migrateFile(raw) {
    if (!raw) return createDefaultFile();
    if (raw.semesters && Array.isArray(raw.semesters)) {
      if (!raw.meta) raw.meta = {};
      raw.meta.fileVersion = FILE_VERSION;
      if (!raw.meta.activeSemesterId && raw.semesters.length) {
        raw.meta.activeSemesterId = raw.semesters[0].id;
      }
      if (!raw.meta.schedulingDefaults) {
        var source = raw.semesters.length ? raw.semesters[0].config : defaultConfig();
        raw.meta.schedulingDefaults = cloneConfig(source);
      }
      raw.semesters.forEach(function (sem) {
        migrateSemester(sem);
        if (sem.meta.configCustomized === undefined) {
          sem.meta.configCustomized = !configsMatch(sem.config, raw.meta.schedulingDefaults);
        }
      });
      return raw;
    }
    var darkMode = raw.meta && raw.meta.darkMode;
    var sem = migrateSemester(raw);
    var defaults = cloneConfig(sem.config);
    return {
      meta: {
        fileVersion: FILE_VERSION,
        activeSemesterId: sem.id,
        darkMode: !!darkMode,
        schedulingDefaults: defaults,
        lastModified: new Date().toISOString()
      },
      semesters: [sem]
    };
  }

  function migrate(data) {
    return migrateFile(data);
  }

  function getSemesterLabel(semester) {
    return (semester.meta && semester.meta.semesterName) || 'Untitled Semester';
  }

  function parseSemesterDisplay(semester) {
    var season = semester.meta && semester.meta.semesterSeason;
    var year = semester.meta && semester.meta.semesterYear;
    if (season && year) {
      return {
        name: buildSemesterName(season, year),
        season: season,
        year: String(year),
        finalized: !!(semester.meta && semester.meta.finalized)
      };
    }
    var name = getSemesterLabel(semester);
    var lower = name.toLowerCase();
    var season = null;
    if (lower.indexOf('spring') >= 0) season = 'spring';
    else if (lower.indexOf('fall') >= 0) season = 'fall';
    var yearMatch = name.match(/\b(20\d{2})\b/);
    var year = yearMatch ? yearMatch[1] : null;
    if ((!season || !year) && semester.calendar && semester.calendar.semesterStartDate) {
      var d = App.CalendarEngine ? App.CalendarEngine.parseDate(semester.calendar.semesterStartDate) : null;
      if (d) {
        if (!season) {
          var m = d.getMonth();
          if (m >= 0 && m <= 4) season = 'spring';
          else if (m >= 7) season = 'fall';
        }
        if (!year) year = String(d.getFullYear());
      }
    }
    if (!year) year = String(new Date().getFullYear());
    return {
      name: name,
      season: season,
      year: year,
      finalized: !!(semester.meta && semester.meta.finalized)
    };
  }

  function createNewSemesterFromTemplate(template, season, year) {
    var copy = JSON.parse(JSON.stringify(template));
    copy.id = uid();
    copy.meta.lastModified = new Date().toISOString();
    copy.meta.finalized = false;
    applySemesterSeasonYear(copy, season || 'fall', year || new Date().getFullYear());
    copy.students.forEach(function (s) {
      s.id = uid();
      s.name = '';
      s.absences = [];
      s.makeups = [];
    });
    copy.roles = {};
    return migrateSemester(copy);
  }

  function migrateFromLegacyLocalStorage() {
    try {
      var dates = JSON.parse(localStorage.getItem('nursingWeekDates') || 'null');
      var names = JSON.parse(localStorage.getItem('nursingStudentNames') || 'null');
      var roles = JSON.parse(localStorage.getItem('nursingSimRoles') || 'null');
      if (!names && !roles && !dates) return null;
      var data = createDefaultFile();
      if (names && names.length === data.semesters[0].students.length) {
        data.semesters[0].students.forEach(function (s, i) { s.name = names[i] || s.name; });
      }
      if (roles) data.semesters[0].roles = roles;
      return data;
    } catch (e) {
      return null;
    }
  }

  function cellToLegacyString(cell, student) {
    if (!cell || cell.inactive) return 'H';
    if (cell.makeupClinical) return 'M';
    if (!cell.clinical && !cell.sim) return '-';
    var parts = [];
    if (cell.clinical || cell.clinicalMissed) {
      parts.push(cell.clinicalMissed ? 'C*' : 'C');
    }
    if (cell.sim) parts.push('S' + cell.sim + (cell.clinicalMissed && cell.sim ? '' : ''));
    if (cell.clinicalMissed && cell.sim) return 'C*+S' + cell.sim;
    if (cell.clinical && cell.sim) return 'C+S' + cell.sim;
    if (cell.sim) return 'S' + cell.sim;
    if (cell.clinicalMissed) return 'C*';
    return parts.join('+') || '-';
  }

  function getClinicalDayForGroup(group, config) {
    return (config.clinicalGroupDays && config.clinicalGroupDays[group]) || 'Mon';
  }

  function countStats(student) {
    var clinicals = 0;
    var sims = 0;
    var simNums = [];
    student.schedule.forEach(function (cell) {
      if (cell.inactive) return;
      if (cell.clinical && !cell.clinicalMissed) clinicals++;
      if (cell.makeupClinical) clinicals++;
      if (cell.sim) {
        sims++;
        simNums.push(cell.sim);
      }
    });
    return { clinicals: clinicals, sims: sims, simNums: simNums };
  }

  return {
    FILE_VERSION: FILE_VERSION,
    VERSION: VERSION,
    CLINICAL_GROUPS: CLINICAL_GROUPS,
    SIM_GROUPS: SIM_GROUPS,
    WEEKDAY_OPTIONS: WEEKDAY_OPTIONS,
    normalizeConfig: normalizeConfig,
    getClinicalGroups: getClinicalGroups,
    getSimGroups: getSimGroups,
    getSimDays: getSimDays,
    nextClinicalGroupName: nextClinicalGroupName,
    syncSemesterForConfig: syncSemesterForConfig,
    ROLE_OPTIONS: ROLE_OPTIONS,
    uid: uid,
    emptyCell: emptyCell,
    emptySchedule: emptySchedule,
    defaultConfig: defaultConfig,
    cloneConfig: cloneConfig,
    getSchedulingDefaults: getSchedulingDefaults,
    setSchedulingDefaults: setSchedulingDefaults,
    configsMatch: configsMatch,
    semesterSortKey: semesterSortKey,
    getFutureSemesters: getFutureSemesters,
    applyConfigToSemester: applyConfigToSemester,
    defaultSections: defaultSections,
    createDefaultSemester: createDefaultSemester,
    createDefaultFile: createDefaultFile,
    createNewSemesterFromTemplate: createNewSemesterFromTemplate,
    createStudent: createStudent,
    migrate: migrate,
    migrateFile: migrateFile,
    migrateSemester: migrateSemester,
    getSemesterLabel: getSemesterLabel,
    parseSemesterDisplay: parseSemesterDisplay,
    buildSemesterName: buildSemesterName,
    startDateForSeason: startDateForSeason,
    applySemesterSeasonYear: applySemesterSeasonYear,
    migrateFromLegacyLocalStorage: migrateFromLegacyLocalStorage,
    cellToLegacyString: cellToLegacyString,
    getClinicalDayForGroup: getClinicalDayForGroup,
    countStats: countStats
  };
})();
