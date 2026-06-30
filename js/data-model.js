/* global App */
var App = App || {};

App.DataModel = (function () {
  var FILE_VERSION = 2;
  var VERSION = 1;
  var CLINICAL_GROUPS = ['C1', 'C2', 'C3', 'C4', 'C5'];
  var SIM_GROUPS = ['SG1', 'SG2', 'SG3', 'SG4'];
  var WEEKDAY_OPTIONS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var ROLE_OPTIONS = ['', 'Primary', 'Secondary', 'Evaluator', 'Scribe'];

  function uid() {
    return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function emptyCell() {
    return {
      clinical: false, clinicalMissed: false, sim: null, simDay: null, simGuestGroup: null,
      makeupClinical: false, inactive: false, simMakeup: false, simOverload: false,
      facilityId: null
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
      maxPerClinicalGroupOverload: 7,
      maxPerSimGroup: 8,
      maxStudentsPerSimSession: 8,
      maxStudentsPerSimSessionOverload: 9,
      simMakeupHeadroomReserved: 1,
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
    if (!cfg.clinicalGroupFacilities) cfg.clinicalGroupFacilities = {};
    cfg.clinicalGroups.forEach(function (g) {
      if (!cfg.clinicalGroupFacilities[g]) cfg.clinicalGroupFacilities[g] = [];
    });
    Object.keys(cfg.clinicalGroupFacilities).forEach(function (key) {
      if (cfg.clinicalGroups.indexOf(key) < 0) delete cfg.clinicalGroupFacilities[key];
    });
    if (!cfg.clinicalGroupSiteWeeks) cfg.clinicalGroupSiteWeeks = {};
    cfg.clinicalGroups.forEach(function (g) {
      if (!cfg.clinicalGroupSiteWeeks[g]) cfg.clinicalGroupSiteWeeks[g] = [];
    });
    Object.keys(cfg.clinicalGroupSiteWeeks).forEach(function (key) {
      if (cfg.clinicalGroups.indexOf(key) < 0) delete cfg.clinicalGroupSiteWeeks[key];
    });
    if (!cfg.simDays || !cfg.simDays.length) cfg.simDays = ['Mon', 'Tue'];
    if (!cfg.simGroups || !cfg.simGroups.length) {
      cfg.simGroups = SIM_GROUPS.slice(0, cfg.numSimGroups || SIM_GROUPS.length);
    }
    cfg.numClinicalGroups = cfg.clinicalGroups.length;
    cfg.numSimGroups = cfg.simGroups.length;
    var clinNormal = cfg.maxPerClinicalGroup || 6;
    if (!cfg.maxPerClinicalGroupOverload) cfg.maxPerClinicalGroupOverload = clinNormal + 1;
    var simNormal = cfg.maxStudentsPerSimSession || 8;
    var headroom = parseInt(cfg.simMakeupHeadroomReserved, 10);
    if (isNaN(headroom) || headroom < 0) headroom = 1;
    if (headroom >= simNormal) headroom = Math.max(0, simNormal - 1);
    cfg.simMakeupHeadroomReserved = headroom;
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
    migrateClinicalGroupFacilities(semester);
    syncSemesterFaculty(semester);
    syncSemesterStudentsForConfig(semester);
  }

  var DEFAULT_CLINICAL_GROUP_SITE = {
    C1: 'Shasta Regional Medical Center',
    C2: 'Shasta Regional Medical Center',
    C3: 'Shasta Regional Medical Center',
    C4: 'Saint Elizabeth',
    C5: 'Saint Elizabeth'
  };

  function defaultFacilities() {
    return [
      { id: uid(), name: 'Shasta Regional Medical Center' },
      { id: uid(), name: 'Saint Elizabeth' }
    ];
  }

  function facilityIdByName(facilities, name) {
    var key = normalizeFacilityName(name);
    var match = facilities.find(function (f) {
      return normalizeFacilityName(f.name) === key;
    });
    return match ? match.id : (facilities[0] && facilities[0].id);
  }

  function getDefaultFacilityIdForClinicalGroup(clinicalGroup, facilities) {
    var siteName = DEFAULT_CLINICAL_GROUP_SITE[clinicalGroup];
    if (siteName) return facilityIdByName(facilities, siteName);
    return facilities[0] && facilities[0].id;
  }

  function buildDefaultClinicalGroupFacilities(clinicalGroups, facilities) {
    var map = {};
    (clinicalGroups || CLINICAL_GROUPS).forEach(function (g) {
      var facId = getDefaultFacilityIdForClinicalGroup(g, facilities);
      map[g] = facId ? [facId] : [];
    });
    return map;
  }

  function majorityFacilityIdForCohort(students, data) {
    if (!students || !students.length) return null;
    var counts = {};
    students.forEach(function (s) {
      if (!s.facilityId) return;
      var canon = data && data.facilities
        ? getCanonicalFacilityId(data, s.facilityId)
        : s.facilityId;
      counts[canon] = (counts[canon] || 0) + 1;
    });
    var best = null;
    var bestN = 0;
    Object.keys(counts).forEach(function (id) {
      if (counts[id] > bestN) {
        bestN = counts[id];
        best = id;
      }
    });
    if (best) return best;
    if (students[0].facilityId) {
      return data && data.facilities
        ? getCanonicalFacilityId(data, students[0].facilityId)
        : students[0].facilityId;
    }
    return null;
  }

  function migrateClinicalGroupFacilities(semester) {
    if (!semester || !semester.config) return;
    normalizeConfig(semester.config);
    var cfg = semester.config;
    var facilities = semester.facilities || [];
    if (!cfg.clinicalGroupFacilities) cfg.clinicalGroupFacilities = {};
    cfg.clinicalGroups.forEach(function (g) {
      var list = cfg.clinicalGroupFacilities[g];
      if (!list || !list.length) {
        var cohort = (semester.students || []).filter(function (s) {
          return s.clinicalGroup === g;
        });
        var facId = majorityFacilityIdForCohort(cohort, semester);
        if (!facId) facId = getDefaultFacilityIdForClinicalGroup(g, facilities);
        cfg.clinicalGroupFacilities[g] = facId ? [facId] : [];
      }
      var seen = {};
      cfg.clinicalGroupFacilities[g] = (cfg.clinicalGroupFacilities[g] || []).map(function (id) {
        return getCanonicalFacilityId(semester, id);
      }).filter(function (id) {
        if (!id || !findFacilityById(semester, id)) return false;
        if (seen[id]) return false;
        seen[id] = true;
        return true;
      });
      if (!cfg.clinicalGroupFacilities[g].length) {
        var fallback = getDefaultFacilityIdForClinicalGroup(g, facilities);
        if (fallback) cfg.clinicalGroupFacilities[g] = [fallback];
      }
    });
    Object.keys(cfg.clinicalGroupFacilities).forEach(function (key) {
      if (cfg.clinicalGroups.indexOf(key) < 0) delete cfg.clinicalGroupFacilities[key];
    });
    if (!cfg.clinicalGroupSiteWeeks) cfg.clinicalGroupSiteWeeks = {};
    Object.keys(cfg.clinicalGroupSiteWeeks).forEach(function (key) {
      if (cfg.clinicalGroups.indexOf(key) < 0) delete cfg.clinicalGroupSiteWeeks[key];
    });
  }

  function normalizeFacilityName(name) {
    return String(name || '')
      .trim()
      .toLowerCase()
      .replace(/['']/g, '')
      .replace(/\s+/g, ' ');
  }

  function findFacilityById(data, facilityId) {
    if (!data || !data.facilities || !facilityId) return null;
    return data.facilities.find(function (f) { return f.id === facilityId; }) || null;
  }

  function getCanonicalFacilityId(data, facilityId) {
    var fac = findFacilityById(data, facilityId);
    if (!fac) return facilityId;
    var key = normalizeFacilityName(fac.name);
    if (!key) return facilityId;
    var match = data.facilities.find(function (f) {
      return normalizeFacilityName(f.name) === key;
    });
    return match ? match.id : facilityId;
  }

  function sameFacilitySite(data, facilityIdA, facilityIdB) {
    if (!facilityIdA || !facilityIdB) return false;
    if (facilityIdA === facilityIdB) return true;
    var a = findFacilityById(data, facilityIdA);
    var b = findFacilityById(data, facilityIdB);
    if (!a || !b) return false;
    return normalizeFacilityName(a.name) === normalizeFacilityName(b.name);
  }

  function studentAtFacilitySite(data, student, facilityId) {
    if (!student || !facilityId) return false;
    return sameFacilitySite(data, student.facilityId, facilityId);
  }

  function getUniqueFacilitiesForSelect(data) {
    var seen = {};
    var list = [];
    (data.facilities || []).forEach(function (f) {
      var key = normalizeFacilityName(f.name);
      if (!key) key = f.id;
      if (seen[key]) return;
      seen[key] = true;
      list.push(f);
    });
    return list;
  }

  function normalizeFacilities(semester) {
    if (!semester.facilities || !semester.facilities.length) {
      semester.facilities = defaultFacilities();
      return;
    }
    var canonical = {};
    var idRemap = {};
    semester.facilities.forEach(function (f) {
      if (!f.id) f.id = uid();
      var name = String(f.name || '').trim() || 'Unnamed facility';
      var key = normalizeFacilityName(name);
      if (!key) key = f.id;
      if (!canonical[key]) {
        canonical[key] = { id: f.id, name: name };
      } else {
        idRemap[f.id] = canonical[key].id;
        if (name.length > canonical[key].name.length) canonical[key].name = name;
      }
    });
    semester.facilities = Object.keys(canonical).map(function (k) { return canonical[k]; });
    function remapId(id) {
      if (!id) return id;
      while (idRemap[id]) id = idRemap[id];
      return id;
    }
    (semester.students || []).forEach(function (s) {
      if (s.facilityId) s.facilityId = remapId(s.facilityId);
      (s.makeups || []).forEach(function (m) {
        if (m.facilityId) m.facilityId = remapId(m.facilityId);
      });
      (s.schedule || []).forEach(function (c) {
        if (c && c.facilityId) c.facilityId = remapId(c.facilityId);
      });
    });
    if (semester.config && semester.config.clinicalGroupFacilities) {
      Object.keys(semester.config.clinicalGroupFacilities).forEach(function (g) {
        semester.config.clinicalGroupFacilities[g] =
          (semester.config.clinicalGroupFacilities[g] || []).map(remapId).filter(function (id) {
            return id && semester.facilities.some(function (f) { return f.id === id; });
          });
      });
    }
    if (semester.config && semester.config.clinicalGroupSiteWeeks) {
      Object.keys(semester.config.clinicalGroupSiteWeeks).forEach(function (g) {
        semester.config.clinicalGroupSiteWeeks[g] =
          (semester.config.clinicalGroupSiteWeeks[g] || []).map(function (r) {
            if (!r) return r;
            return {
              facilityId: remapId(r.facilityId),
              startWeekIndex: r.startWeekIndex,
              endWeekIndex: r.endWeekIndex
            };
          }).filter(function (r) {
            return r && r.facilityId && semester.facilities.some(function (f) { return f.id === r.facilityId; });
          });
      });
    }
    (semester.orientations || []).forEach(function (o) {
      if (o && o.facilityId) o.facilityId = remapId(o.facilityId);
    });
  }

  function defaultSections() {
    return [
      { id: uid(), name: 'F6011' },
      { id: uid(), name: 'F6012' },
      { id: uid(), name: 'F6013' },
      { id: uid(), name: 'F6014' },
      { id: uid(), name: 'F6015' }
    ];
  }

  function defaultFaculty(groups) {
    var list = groups || CLINICAL_GROUPS;
    return list.map(function (g) {
      return { id: uid(), name: '', clinicalGroup: g };
    });
  }

  function defaultStudentName(index) {
    return 'Student ' + (index + 1);
  }

  function assignDefaultStudentNames(students) {
    students.forEach(function (s, i) {
      s.name = defaultStudentName(i);
    });
  }

  function nextDefaultStudentName(students) {
    var max = 0;
    students.forEach(function (s) {
      var m = String(s.name || '').match(/^Student (\d+)$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return defaultStudentName(max > 0 ? max : students.length);
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
    cfg.clinicalGroupFacilities = buildDefaultClinicalGroupFacilities(cfg.clinicalGroups, facilities);
    var simGroups = cfg.simGroups;
    var idx = 0;
    cfg.clinicalGroups.forEach(function (g, gi) {
      var simGroup = simGroups[gi % simGroups.length];
      var facId = getDefaultFacilityIdForClinicalGroup(g, facilities);
      var sectionName = sections[gi] ? sections[gi].name : sections[0].name;
      for (var i = 0; i < 6; i++) {
        students.push(createStudent(
          defaultStudentName(idx),
          g,
          simGroup,
          facId,
          sectionName
        ));
        idx++;
      }
    });

    var season = 'fall';
    var year = 2026;
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
      orientations: [],
      sections: sections,
      facilities: facilities,
      faculty: defaultFaculty(cfg.clinicalGroups),
      students: students
    };
  }

  function createDefaultFile() {
    var sem = createDefaultSemester();
    var defaults = cloneConfig(sem.config);
    return {
      meta: {
        fileVersion: FILE_VERSION,
        activeSemesterId: sem.id,
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
    if (!semester.config.maxPerClinicalGroupOverload) {
      semester.config.maxPerClinicalGroupOverload = (semester.config.maxPerClinicalGroup || 6) + 1;
    }
    if (!semester.calendar) semester.calendar = { semesterStartDate: new Date().toISOString().slice(0, 10), weeks: [] };
    if (!semester.holidays) semester.holidays = [];
    if (!semester.orientations) semester.orientations = [];
    if (!semester.facilities) semester.facilities = defaultFacilities();
    normalizeFacilities(semester);
    migrateClinicalGroupFacilities(semester);
    if (!semester.faculty) semester.faculty = defaultFaculty(getClinicalGroups(semester.config));
    syncSemesterFaculty(semester);
    if (!semester.students) semester.students = [];
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
      if (s.orientationWeekIndex !== undefined && s.orientationWeekIndex !== null) {
        var ow = parseInt(s.orientationWeekIndex, 10);
        s.orientationWeekIndex = (ow >= 0 && ow < 18) ? ow : null;
      }
      s.schedule.forEach(function (c) {
        if (c.simMakeup === undefined) c.simMakeup = false;
        if (c.simOverload === undefined) c.simOverload = false;
        if (c.facilityId === undefined) c.facilityId = null;
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
    var sem = migrateSemester(raw);
    var defaults = cloneConfig(sem.config);
    return {
      meta: {
        fileVersion: FILE_VERSION,
        activeSemesterId: sem.id,
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
      s.absences = [];
      s.makeups = [];
    });
    assignDefaultStudentNames(copy.students);
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
      if (roles) data._legacySimRoles = roles;
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
    defaultFacilities: defaultFacilities,
    getDefaultFacilityIdForClinicalGroup: getDefaultFacilityIdForClinicalGroup,
    buildDefaultClinicalGroupFacilities: buildDefaultClinicalGroupFacilities,
    migrateClinicalGroupFacilities: migrateClinicalGroupFacilities,
    majorityFacilityIdForCohort: majorityFacilityIdForCohort,
    createDefaultSemester: createDefaultSemester,
    createDefaultFile: createDefaultFile,
    createNewSemesterFromTemplate: createNewSemesterFromTemplate,
    createStudent: createStudent,
    defaultStudentName: defaultStudentName,
    assignDefaultStudentNames: assignDefaultStudentNames,
    nextDefaultStudentName: nextDefaultStudentName,
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
    countStats: countStats,
    normalizeFacilityName: normalizeFacilityName,
    findFacilityById: findFacilityById,
    getCanonicalFacilityId: getCanonicalFacilityId,
    sameFacilitySite: sameFacilitySite,
    studentAtFacilitySite: studentAtFacilitySite,
    getUniqueFacilitiesForSelect: getUniqueFacilitiesForSelect,
    normalizeFacilities: normalizeFacilities
  };
})();
