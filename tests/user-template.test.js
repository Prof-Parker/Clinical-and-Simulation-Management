'use strict';

var harness = require('./_harness');
harness.load('js/user-template.js');

var passed = 0;
var failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; return; }
  failed++;
  console.error('FAIL: ' + msg);
}

assert(App.UserTemplate.canTab('lead_course_faculty', 'makeup'),
  'lead course faculty can access makeup tab');
assert(App.UserTemplate.canAction('lead_course_faculty', 'makeup.edit'),
  'lead course faculty can apply makeup');
assert(!App.UserTemplate.canTab('adjunct_faculty', 'makeup'),
  'adjunct faculty cannot access makeup tab');
assert(!App.UserTemplate.canTab('admin_staff', 'makeup'),
  'admin staff cannot access makeup tab');
assert(App.UserTemplate.canAction('program_engineer', 'makeup.edit'),
  'program engineer can apply makeup via wildcard');

console.log('user-template: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
