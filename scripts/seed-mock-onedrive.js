#!/usr/bin/env node

/**
 * Seeds mock-onedrive/ with placeholder-only test fixtures.
 * Run: node scripts/seed-mock-onedrive.js
 * Folder is gitignored — never commit output.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { importTheoryFromPrototypes } from './theory/merge-prototypes.js';
import { rebuildWeeks } from '../src/core/calendar-engine.js';
import { migrateTheory } from '../src/core/theory-data.js';

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

async function main() {
  console.log('Seeding ' + ROOT);
  if (fs.existsSync(ROOT)) {
    fs.rmSync(ROOT, { recursive: true, force: true });
  }

  var imported = await importTheoryFromPrototypes({ semesterStartDate: '2026-08-16' });
  console.log('  theory import:', imported.validation);

  var registry = {
    meta: { version: 1, lastModified: new Date().toISOString(), revision: 1 },
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
      key: key
    });
  });

  writeJson(path.join('users', 'users-registry.json'), registry);

  writeJson('clinical-sites-library.json', {
    meta: { version: 1, lastModified: new Date().toISOString() },
    sites: [
      { id: 'fac_srmc', name: 'Shasta Regional Medical Center', shortName: 'SRMC', contentTags: ['MS'] },
      { id: 'fac_stel', name: "St. Elizabeth's", shortName: 'StE', contentTags: ['MS'] },
      { id: 'fac_community_health', name: 'Community Health', shortName: 'CH', contentTags: ['MS'] }
    ]
  });

  writeJson('theory-content-library_REGN15.json', imported.library);

  var semId = uid('sem');
  var students = [];
  for (var i = 1; i <= 30; i++) {
    var sid = uid('stu');
    students.push({
      id: sid,
      name: 'Student ' + i,
      clinicalGroup: 'C' + (((i - 1) % 5) + 1),
      simGroup: 'SG' + (((i - 1) % 4) + 1),
      facilityId: i % 7 === 0 ? 'fac_community_health' : 'fac_srmc',
      section: 'F6011',
      schedule: Array.from({ length: 18 }, function (_, wi) {
        return {
          clinical: wi >= 4 && wi < 14 && i % 3 !== 0,
          clinicalMissed: false,
          sim: wi >= 5 && wi < 10 ? ((wi - 5) % 5) + 1 : null,
          simDay: wi >= 5 ? 'Mon' : null,
          simGuestGroup: null,
          simOverload: false,
          simMakeup: false,
          makeupClinical: false,
          inactive: wi === 14,
          facilityId: i % 7 === 0 ? 'fac_community_health' : 'fac_srmc'
        };
      }),
      absences: [],
      makeups: []
    });
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
      configCustomized: false,
      version: 1,
      lastModified: new Date().toISOString(),
      leadFaculty: { name: 'Lead Faculty', email: 'lead@example.edu' }
    },
    config: {
      clinicalDaysRequired: 10,
      simDaysRequired: 5,
      maxStudents: 30,
      maxPerClinicalGroup: 6,
      maxPerClinicalGroupOverload: 7,
      maxStudentsPerSimSession: 8,
      maxStudentsPerSimSessionOverload: 9,
      simMakeupHeadroomReserved: 1,
      clinicalStartWeek: 5,
      simStartWeek: 5,
      clinicalGroups: ['C1', 'C2', 'C3', 'C4', 'C5'],
      clinicalGroupDays: { C1: 'Sat', C2: 'Mon', C3: 'Mon', C4: 'Mon', C5: 'Tue' },
      simGroups: ['SG1', 'SG2', 'SG3', 'SG4'],
      simDays: ['Mon', 'Tue']
    },
    calendar: { semesterStartDate: '2026-08-16', weeks: [] },
    holidays: [
      { date: '2026-09-07', label: 'Labor Day', type: 'holiday' },
      { date: '2026-11-26', label: 'Thanksgiving break', type: 'break', weekIndex: 14 }
    ],
    orientations: [],
    facilities: [
      { id: 'fac_srmc', name: 'Shasta Regional Medical Center', shortName: 'SRMC' },
      { id: 'fac_stel', name: "St. Elizabeth's", shortName: 'StE' },
      { id: 'fac_community_health', name: 'Community Health', shortName: 'CH' }
    ],
    faculty: [],
    sections: [{ id: uid('sec'), name: 'F6011' }],
    students: students,
    proposals: [],
    theory: imported.theory
  };

  migrateTheory(semester);
  rebuildWeeks(semester);

  var fileRoot = {
    meta: {
      fileVersion: 5,
      activeSemesterId: semId,
      activeCourseCode: 'REGN15P',
      revision: 1,
      schedulingDefaults: {},
      lastModified: new Date().toISOString()
    },
    semesters: [semester]
  };

  writeJson(path.join('semesters', 'F2026_REGN_program.json'), fileRoot);
  writeJson(path.join('semesters', 'F2026_REGN15P.json'), fileRoot);

  writeJson(path.join('playgrounds', 'user_F2026_REGN15P_playground.json'), {
    meta: {
      fileVersion: 2,
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
