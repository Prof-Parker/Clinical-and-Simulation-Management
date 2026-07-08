/**
 * Converts legacy Node tests from vm harness to Vitest ESM imports.
 * Run: node scripts/migrate-tests.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const TESTS = join(import.meta.dirname, '..', 'tests');

const REPLACEMENTS = [
  [/\bApp\.DataModel\b/g, 'DataModel'],
  [/\bApp\.Scheduler\b/g, 'Scheduler'],
  [/\bApp\.CalendarEngine\b/g, 'CalendarEngine'],
  [/\bApp\.RosterBalance\b/g, 'RosterBalance'],
  [/\bApp\.Orientation\b/g, 'Orientation'],
  [/\bApp\.ClinicalSites\b/g, 'ClinicalSites'],
  [/\bApp\.Validator\b/g, 'Validator'],
  [/\bApp\.Feasibility\b/g, 'Feasibility'],
  [/\bApp\.ScheduleStatus\b/g, 'ScheduleStatus'],
  [/\bApp\.MakeupDisplay\b/g, 'MakeupDisplay'],
  [/\bApp\.ProposalFormat\b/g, 'ProposalFormat'],
  [/\bApp\.Proposals\b/g, 'Proposals'],
  [/\bApp\.SetupDraft\b/g, 'SetupDraft'],
  [/\bApp\.AuditSnapshot\b/g, 'AuditSnapshot'],
  [/\bApp\.AuditExport\b/g, 'AuditExport'],
  [/\bApp\.DashboardExport\b/g, 'DashboardExport'],
  [/\bApp\.UserTemplate\b/g, 'UserTemplate'],
  [/\bApp\.UserData\b/g, 'UserData'],
  [/\bApp\.UserSession\b/g, 'UserSession'],
  [/\bApp\.UserDirectory\b/g, 'UserDirectory'],
  [/\bApp\.SimFacultyStorage\b/g, 'SimFacultyStorage'],
  [/\bApp\.SimFacultyData\b/g, 'SimFacultyData'],
  [/\bApp\.SiteLibrary\b/g, 'SiteLibrary'],
  [/\bApp\.Audit\b/g, 'Audit'],
];

const IMPORT_MAP = {
  DataModel: 'DataModel',
  Scheduler: 'Scheduler',
  CalendarEngine: 'CalendarEngine',
  RosterBalance: 'RosterBalance',
  Orientation: 'Orientation',
  ClinicalSites: 'ClinicalSites',
  Validator: 'Validator',
  Feasibility: 'Feasibility',
  ScheduleStatus: 'ScheduleStatus',
  MakeupDisplay: 'MakeupDisplay',
  ProposalFormat: 'ProposalFormat',
  Proposals: 'Proposals',
  SetupDraft: 'SetupDraft',
  AuditSnapshot: 'AuditSnapshot',
  AuditExport: 'AuditExport',
  DashboardExport: 'DashboardExport',
  UserTemplate: 'UserTemplate',
  UserData: 'UserData',
  UserSession: 'UserSession',
  UserDirectory: 'UserDirectory',
  SimFacultyStorage: 'SimFacultyStorage',
  SimFacultyData: 'SimFacultyData',
  SiteLibrary: 'SiteLibrary'
};

for (const file of readdirSync(TESTS).filter((f) => f.endsWith('.test.js'))) {
  const path = join(TESTS, file);
  let src = readFileSync(path, 'utf8');
  if (src.includes("from './_harness.js'") || src.includes('import *')) continue;

  src = src.replace(/^\/\* eslint-disable no-console \*\/\s*\n'use strict';\s*\n\nvar fs = require\('fs'\);\s*\nvar path = require\('path'\);\s*\n\nvar harness = require\('\.\/_harness'\);\s*\nharness\.loadCore\(\);\s*\n(?:harness\.load\([^)]+\);\s*\n)?/m, '');

  src = src.replace(/var App = harness\.App;\s*\n/, '');

  for (const [re, rep] of REPLACEMENTS) {
    src = src.replace(re, rep);
  }

  const used = Object.keys(IMPORT_MAP).filter((k) => new RegExp('\\b' + k + '\\.').test(src));
  if (used.length) {
    const importLine = "import { " + used.join(', ') + " } from './_harness.js';\n\n";
    src = importLine + src;
  }

  src = "/* eslint-disable no-console */\nimport { describe, it, expect } from 'vitest';\n" + src;

  writeFileSync(path, src, 'utf8');
  console.log('Migrated', file);
}

console.log('Done.');
