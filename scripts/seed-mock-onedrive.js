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
import { rebuildWeeks } from '../src/core/calendar-engine.js';
import { migrateTheory } from '../src/core/theory-data.js';
import {
  normalizeConfig,
  createStudent,
  syncSemesterForConfig
} from '../src/core/data-model/index.js';
import * as RosterBalance from '../src/core/roster-balance.js';
import * as Scheduler from '../src/core/scheduler/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', 'mock-onedrive');

function hashKey(key) {
  return 'sha256:' + crypto.createHash('sha256').update(String(key)).digest('hex');
}

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
    { file: 'engineer.user.json', role: 'program_engineer', name: 'Program Engineer', email: 'engineer@example.edu' },
    { file: 'admin.user.json', role: 'admin_staff', name: 'Admin Staff', email: 'admin@example.edu' },
    { file: 'lead-faculty.user.json', role: 'lead_course_faculty', name: 'Lead Faculty', email: 'lead@example.edu' },
    { file: 'adjunct.user.json', role: 'adjunct_faculty', name: 'Adjunct Faculty', email: 'adjunct@example.edu' }
  ];

  roles.forEach(function (r) {
    var userId = uid('usr');
    var key = 'k_' + crypto.randomBytes(12).toString('hex');
    registry.users[userId] = {
      role: r.role,
      keyHash: hashKey(key),
      status: 'active',
      issuedAt: new Date().toISOString(),
      issuedBy: 'seed script'
    };
    writeJson(path.join('users', r.file), {
      userId: userId,
      name: r.name,
      email: r.email,
      key: key,
      fileKind: 'user_credential'
    });
  });

  writeJson(path.join('users', 'users-registry.json'), registry);

  var siteLibrary = {
    meta: { version: 1 },
    sites: [
      { id: 'fac_srmc', name: 'Shasta Regional Medical Center', shortName: 'SRMC', contentTags: ['MS'] },
      { id: 'fac_stel', name: 'Saint Elizabeth', shortName: 'StE', contentTags: ['MS'] }
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
      }
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
    semesters: [semester]
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
  console.log('Theory library: mock-onedrive/theory-content-library_REGN15.json');
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
