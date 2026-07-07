#!/usr/bin/env node
'use strict';

/**
 * Seeds mock-onedrive/ with placeholder-only test fixtures.
 * Run: node scripts/seed-mock-onedrive.js
 * Folder is gitignored — never commit output.
 */

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var ROOT = path.join(__dirname, '..', 'mock-onedrive');

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

function main() {
  console.log('Seeding ' + ROOT);
  if (fs.existsSync(ROOT)) {
    fs.rmSync(ROOT, { recursive: true, force: true });
  }

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
      { id: 'site_srmc', name: 'Sample Medical Center', shortName: 'SMC', contentTags: ['MS'] },
      { id: 'site_stel', name: 'Sample Community Hospital', shortName: 'SCH', contentTags: ['MS'] }
    ]
  });

  // Minimal semester file via inline default shape (no browser App)
  var semId = uid('sem');
  var studentIds = [];
  var students = [];
  for (var i = 1; i <= 30; i++) {
    var sid = uid('stu');
    studentIds.push(sid);
    students.push({
      id: sid,
      name: 'Student ' + i,
      clinicalGroup: 'C' + (((i - 1) % 5) + 1),
      simGroup: 'SG' + (((i - 1) % 4) + 1),
      facilityId: null,
      section: 'F6011',
      schedule: Array.from({ length: 18 }, function () {
        return { clinical: false, clinicalMissed: false, sim: null, simDay: null, simGuestGroup: null,
          simOverload: false, simMakeup: false, makeupClinical: false, inactive: false, facilityId: null };
      }),
      absences: [],
      makeups: []
    });
  }

  writeJson(path.join('semesters', 'F2026_REGN15P.json'), {
    meta: {
      fileVersion: 2,
      activeSemesterId: semId,
      revision: 1,
      schedulingDefaults: {},
      lastModified: new Date().toISOString()
    },
    semesters: [{
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
        lastModified: new Date().toISOString()
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
      calendar: { semesterStartDate: '2026-08-01', weeks: [] },
      holidays: [],
      orientations: [],
      facilities: [],
      faculty: [],
      sections: [{ id: uid('sec'), name: 'F6011' }],
      students: students,
      proposals: []
    }]
  });

  writeJson(path.join('semesters', 'F2026_REGN15P_Faculty.json'), {
    meta: { version: 1, linkedSemesterHint: 'Fall 2026', lastModified: new Date().toISOString() },
    semesters: {}
  });

  writeJson(path.join('playgrounds', 'user_F2026_REGN15P_playground.json'), {
    meta: { fileVersion: 2, activeSemesterId: semId, playgroundSource: { courseId: 'REGN15P' }, lastModified: new Date().toISOString() },
    semesters: [{
      id: semId,
      meta: { courseId: 'REGN15P', semesterSeason: 'fall', semesterYear: 2026, semesterName: 'Fall 2026 (playground)' },
      config: { clinicalDaysRequired: 12, simDaysRequired: 5 },
      proposals: []
    }]
  });

  console.log('\nDone. Test as admin: load mock-onedrive/users/admin.user.json + users-registry.json');
}

main();
