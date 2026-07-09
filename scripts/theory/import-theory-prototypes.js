#!/usr/bin/env node
/**
 * CLI: import Fall 2026 REGN15/15P theory from prototype docx files.
 * Run: node scripts/theory/import-theory-prototypes.js
 */

import { importTheoryFromPrototypes } from './merge-prototypes.js';

importTheoryFromPrototypes().then(function (result) {
  console.log('Import OK:', result.validation);
  console.log('Days:', result.theory.days.length, 'Events:', result.validation.eventCount);
  console.log('Topics:', result.library.topics.length);
}).catch(function (err) {
  console.error(err);
  process.exit(1);
});
