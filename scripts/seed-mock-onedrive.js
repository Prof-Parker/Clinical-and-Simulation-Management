#!/usr/bin/env node

/**
 * Seeds mock-onedrive/ with placeholder-only test fixtures.
 * Run: node scripts/seed-mock-onedrive.js
 * Folder is gitignored — never commit output.
 *
 * Semester fixture mirrors Fall 2026 REGN program settings used in local testing
 * (clinical/sim days, holidays, facilities, sections).
 */

import './node-window-shim.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { importTheoryFromPrototypes } from './theory/merge-prototypes.js';
import { importRegn35FromXlsx } from './theory/import-35-xlsx.js';
import { SITES as SITES_35 } from './theory/map-35-events.js';
import { rebuildWeeks } from '../src/core/calendar-engine.js';
import { migrateTheory } from '../src/core/theory-data.js';
import {
  normalizeConfig,
  createStudent,
  syncSemesterForConfig
} from '../src/core/data-model/index.js';
import * as CourseDefaults from '../src/core/course-defaults.js';
import { migrateLibrary, createEmptyLibrary } from '../src/storage/theory-library-model.js';
import * as RosterBalance from '../src/core/roster-balance.js';
import * as Scheduler from '../src/core/scheduler/index.js';
import { hashPassword } from '../src/auth/password.js';
import { ensureLeadLectureTag } from '../src/core/faculty-schedule/specialties.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', 'mock-onedrive');

function uid(prefix) {
  return prefix + '_' + crypto.randomBytes(4).toString('hex');
}

function writeJson(relPath, data) {
  var full = path.join(ROOT, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log('  wrote ' + relPath);
}

function buildFall2026Config() {
  return normalizeConfig({
    clinicalDaysRequired: 10,
    simDaysRequired: 5,
    maxStudents: 30,
    maxPerClinicalGroup: 6,
    maxPerClinicalGroupOverload: 7,
    maxStudentsPerSimSession: 8,
    maxStudentsPerSimSessionOverload: 9,
    maxGuestSimsPerStudent: 1,
    simMakeupHeadroomReserved: 1,
    clinicalStartWeek: 5,
    simStartWeek: 5,
    clinicalGroups: ['C1', 'C2', 'C3', 'C4', 'C5'],
    clinicalGroupDays: { C1: 'Sat', C2: 'Mon', C3: 'Mon', C4: 'Mon', C5: 'Tue' },
    clinicalGroupFacilities: {
      C1: ['fac_srmc'],
      C2: ['fac_srmc'],
      C3: ['fac_srmc'],
      C4: ['fac_stel'],
      C5: ['fac_stel']
    },
    simGroups: ['SG1', 'SG2', 'SG3', 'SG4'],
    simGroupDays: { SG1: 'Mon', SG2: 'Tue', SG3: 'Tue', SG4: 'Mon' },
    simGroupPattern: { SG1: 'odd', SG2: 'even', SG3: 'odd', SG4: 'even' },
    simDays: ['Mon', 'Tue']
  });
}

async function main() {
  console.log('Seeding ' + ROOT);
  if (fs.existsSync(ROOT)) {
    fs.rmSync(ROOT, { recursive: true, force: true });
  }

  var imported = await importTheoryFromPrototypes({ semesterStartDate: '2026-08-16' });
  console.log('  theory import:', imported.validation);
  var imported35 = await importRegn35FromXlsx({ semesterStartDate: '2026-08-16' });
  console.log('  REGN 35 import:', imported35.validation);
  var n35Events = 0;
  ((imported35.theory && imported35.theory.days) || []).forEach(function (d) {
    n35Events += (d.events && d.events.length) || 0;
  });
  console.log('  REGN 35 events:', n35Events, 'topics:', (imported35.topics || []).length,
    'skills:', (imported35.skills || []).length);

  var registry = {
    meta: {
      version: 1,
      fileKind: 'users_registry',
      lastModified: new Date().toISOString(),
      revision: 1
    },
    users: {}
  };

  var roles = [
    { role: 'program_engineer', firstName: 'Program', lastName: 'Engineer', email: 'engineer@example.edu', password: 'engineer-pass', specialties: [] },
    { role: 'admin_staff', firstName: 'Admin', lastName: 'Staff', email: 'admin@example.edu', password: 'admin-pass', specialties: [] },
    { role: 'lead_course_faculty', firstName: 'Lead', lastName: 'Faculty', email: 'lead@example.edu', password: 'lead-pass', specialties: ['MS', 'Lec'] },
    { role: 'adjunct_faculty', firstName: 'Adjunct', lastName: 'Faculty', email: 'adjunct@example.edu', password: 'adjunct-pass', specialties: ['MS'] },
    { role: 'adjunct_faculty', firstName: 'Adjunct', lastName: 'OB', email: 'adjunct-ob@example.edu', password: 'adjunct-ob-pass', specialties: ['OB'] },
    { role: 'adjunct_faculty', firstName: 'Adjunct', lastName: 'PED', email: 'adjunct-ped@example.edu', password: 'adjunct-ped-pass', specialties: ['PED'] },
    { role: 'lead_course_faculty', firstName: 'Lead', lastName: 'OB', email: 'lead-ob@example.edu', password: 'lead-ob-pass', specialties: ['OB', 'Lec'] },
    { role: 'lead_course_faculty', firstName: 'Lead', lastName: 'PED', email: 'lead-ped@example.edu', password: 'lead-ped-pass', specialties: ['PED', 'Lec'] }
  ];

  var helpDeskEngineerUserId = '';
  for (var i = 0; i < roles.length; i++) {
    var r = roles[i];
    var userId = uid('usr');
    var passwordHash = await hashPassword(r.password);
    registry.users[userId] = {
      role: r.role,
      passwordHash: passwordHash,
      status: 'active',
      issuedAt: new Date().toISOString(),
      issuedBy: 'seed script',
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
      mustChangePassword: false,
      temporaryPasswordExpiresAt: '',
      specialties: ensureLeadLectureTag(r.role, r.specialties),
      messages: []
    };
    if (r.role === 'program_engineer' && !helpDeskEngineerUserId) {
      helpDeskEngineerUserId = userId;
    }
  }
  registry.meta.helpDeskEngineerUserId = helpDeskEngineerUserId;

  writeJson(path.join('users', 'users-registry.json'), registry);

  console.log('  demo passwords (permanent, not temporary): engineer-pass, admin-pass, lead-pass, adjunct-pass,');
  console.log('    adjunct-ob-pass, adjunct-ped-pass, lead-ob-pass, lead-ped-pass');

  var siteLibrary = {
    meta: { version: 1 },
    sites: [
    { id: 'fac_srmc', name: 'Shasta Regional Medical Center', shortName: 'SRMC', contentTags: ['MS'] },
    { id: 'fac_stel', name: 'Saint Elizabeth', shortName: 'StE', contentTags: ['MS'] },
    {
      id: SITES_35.mmcr.id,
      name: SITES_35.mmcr.name,
      shortName: SITES_35.mmcr.shortName,
      contentTags: SITES_35.mmcr.contentTags.slice()
    }
    ]
  };

  writeJson('clinical-sites-library.json', {
    meta: {
      version: 1,
      fileKind: 'clinical_sites_library',
      lastModified: new Date().toISOString()
    },
    sites: siteLibrary.sites.slice()
  });

  if (imported.library) {
    imported.library.meta = imported.library.meta || {};
    imported.library.meta.fileKind = 'theory_content_library';
  }
  writeJson('theory-content-library_REGN15.json', imported.library);

  var programLibrary = createEmptyLibrary();
  programLibrary.meta.scope = 'program';
  programLibrary.meta.courseId = null;
  programLibrary.meta.fileKind = 'theory_content_library';
  programLibrary.topics = ((imported.library && imported.library.topics) || []).concat(imported35.topics || []);
  programLibrary.skills = ((imported.library && imported.library.skills) || []).concat(imported35.skills || []);
  programLibrary = migrateLibrary(programLibrary);
  programLibrary.meta.fileKind = 'theory_content_library';
  writeJson('program-content-library.json', programLibrary);

  var semId = uid('sem');
  var sectionIds = {
    F6011: uid('sec'),
    F6012: uid('sec'),
    F6013: uid('sec'),
    F6014: uid('sec')
  };
  var sectionNames = ['F6011', 'F6012', 'F6013', 'F6014'];

  var config = buildFall2026Config();
  var students = [];
  for (var i = 1; i <= 30; i++) {
    var clin = 'C' + (((i - 1) % 5) + 1);
    var facList = config.clinicalGroupFacilities[clin] || ['fac_srmc'];
    var section = sectionNames[(i - 1) % sectionNames.length];
    students.push(createStudent(
      'Student ' + i,
      clin,
      'SG1',
      facList[0],
      section
    ));
  }

  var semester = {
    id: semId,
    meta: {
      courseId: 'REGN15P',
      semesterSeason: 'fall',
      semesterYear: 2026,
      semesterName: 'Fall 2026',
      auditPhase: 'setup',
      finalized: false,
      configCustomized: true,
      version: 1,
      lastModified: new Date().toISOString(),
      leadFaculty: { name: 'Lead Faculty', email: 'lead@example.edu' },
      makeupAttestation: {
        attestedAt: null,
        attestedByName: '',
        attestedByEmail: '',
        notes: ''
      },
      auditExport: {
        exportedAt: null,
        exportedByName: '',
        snapshotHash: '',
        appVersion: '',
        exportVersion: 0
      },
      lock: {
        lockedAt: null,
        lockedByName: '',
        lockedReason: 'semester_complete'
      },
      selfSchedulingOpen: true
    },
    config: config,
    calendar: { semesterStartDate: '2026-08-16', weeks: [] },
    holidays: [
      { id: uid('id'), date: '2026-09-07', label: 'Labor Day', type: 'mondayHoliday' },
      { id: uid('id'), date: '2026-11-09', label: 'Veterans Day', type: 'mondayHoliday' },
      { id: uid('id'), date: '2026-11-22', label: 'Thanksgiving', type: 'break', weekIndex: 14 }
    ],
    orientations: [],
    facilities: [
      { id: 'fac_srmc', name: 'Shasta Regional Medical Center', shortName: 'SRMC' },
      { id: 'fac_stel', name: 'Saint Elizabeth', shortName: 'StE' }
    ],
    faculty: [],
    sections: sectionNames.map(function (name) {
      return { id: sectionIds[name], name: name };
    }),
    students: students,
    proposals: [],
    theory: imported.theory
  };

  syncSemesterForConfig(semester);
  migrateTheory(semester);
  RosterBalance.rebalance(semester.students, semester.config);
  students.forEach(function (s) {
    var facList = semester.config.clinicalGroupFacilities[s.clinicalGroup];
    if (facList && facList.length) s.facilityId = facList[0];
  });
  rebuildWeeks(semester);
  Scheduler.regenerateAll(semester);
  RosterBalance.rebalanceSimGroups(semester);

  var sem35Id = uid('sem');
  var sectionIds35 = {
    F6011: uid('sec'),
    F6012: uid('sec'),
    F6013: uid('sec'),
    F6014: uid('sec')
  };
  var course35 = CourseDefaults.get('REGN35P-36P');
  var config35 = course35 ? JSON.parse(JSON.stringify(course35.config)) : buildFall2026Config();
  var students35 = [];
  for (var j = 1; j <= 30; j++) {
    var clin35 = 'C' + (((j - 1) % 5) + 1);
    var section35 = sectionNames[(j - 1) % sectionNames.length];
    students35.push(createStudent(
      'Student ' + j,
      clin35,
      'SG1',
      'fac_srmc',
      section35
    ));
  }
  var semester35 = {
    id: sem35Id,
    meta: {
      courseId: 'REGN35P-36P',
      semesterSeason: 'fall',
      semesterYear: 2026,
      semesterName: 'Fall 2026',
      auditPhase: 'setup',
      finalized: false,
      configCustomized: true,
      version: 1,
      lastModified: new Date().toISOString(),
      leadFaculty: { name: 'Lead Faculty', email: 'lead@example.edu' },
      makeupAttestation: {
        attestedAt: null,
        attestedByName: '',
        attestedByEmail: '',
        notes: ''
      },
      auditExport: {
        exportedAt: null,
        exportedByName: '',
        snapshotHash: '',
        appVersion: '',
        exportVersion: 0
      },
      lock: {
        lockedAt: null,
        lockedByName: '',
        lockedReason: 'semester_complete'
      },
      selfSchedulingOpen: true
    },
    config: config35,
    calendar: { semesterStartDate: '2026-08-16', weeks: [] },
    holidays: [
      { id: uid('id'), date: '2026-09-07', label: 'Labor Day', type: 'mondayHoliday' },
      { id: uid('id'), date: '2026-11-09', label: 'Veterans Day', type: 'mondayHoliday' },
      { id: uid('id'), date: '2026-11-22', label: 'Thanksgiving', type: 'break', weekIndex: 14 }
    ],
    orientations: [],
    facilities: [
      { id: 'fac_srmc', name: 'Shasta Regional Medical Center', shortName: 'SRMC', contentTags: ['MS'] },
      { id: 'fac_stel', name: 'Saint Elizabeth', shortName: 'StE', contentTags: ['MS'] },
      {
        id: SITES_35.mmcr.id,
        name: SITES_35.mmcr.name,
        shortName: SITES_35.mmcr.shortName,
        contentTags: SITES_35.mmcr.contentTags.slice()
      }
    ],
    faculty: [],
    simInstructors: [],
    sections: sectionNames.map(function (name) {
      return { id: sectionIds35[name], name: name };
    }),
    students: students35,
    proposals: [],
    theory: imported35.theory
  };
  syncSemesterForConfig(semester35);
  semester35.faculty = [];
  semester35.simInstructors = [];
  migrateTheory(semester35);
  rebuildWeeks(semester35);

  var fileRoot = {
    meta: {
      fileVersion: 5,
      fileKind: 'program_semester',
      activeSemesterId: semId,
      activeCourseCode: 'REGN15P',
      revision: 1,
      schedulingDefaults: {},
      lastModified: new Date().toISOString(),
      siteLibrary: siteLibrary
    },
    semesters: [semester, semester35]
  };

  writeJson(path.join('semesters', 'F2026_REGN_program.json'), fileRoot);

  writeJson(path.join('playgrounds', 'user_F2026_REGN15P_playground.json'), {
    meta: {
      fileVersion: 2,
      fileKind: 'playground',
      activeSemesterId: semId,
      playgroundSource: { courseId: 'REGN15P' },
      lastModified: new Date().toISOString()
    },
    semesters: [{
      id: semId,
      meta: {
        courseId: 'REGN15P',
        semesterSeason: 'fall',
        semesterYear: 2026,
        semesterName: 'Fall 2026 (playground)'
      },
      config: { clinicalDaysRequired: 12, simDaysRequired: 5 },
      proposals: []
    }]
  });

  console.log('\nDone. Test: load mock-onedrive/semesters/F2026_REGN_program.json');
  console.log('Theory library: mock-onedrive/program-content-library.json');
  console.log('  (legacy fallback: mock-onedrive/theory-content-library_REGN15.json)');
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
