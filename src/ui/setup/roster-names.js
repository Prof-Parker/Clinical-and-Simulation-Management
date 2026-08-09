/**
 * Student roster name parse/sync/sort and email domain helpers.
 */

import {
  syncStudentDisplayName,
  parseLegacyStudentName,
  compareStudentsByName
} from '../../core/data-model/students.js';

export function normalizeEmailDomain(raw) {
  var d = String(raw || '').trim();
  if (!d) return '';
  if (d.charAt(0) !== '@') d = '@' + d;
  return d;
}

export function emailLocalPart(email, domain) {
  var full = String(email || '').trim();
  var dom = normalizeEmailDomain(domain);
  if (!dom || !full) return full;
  if (full.toLowerCase().endsWith(dom.toLowerCase())) {
    return full.slice(0, full.length - dom.length);
  }
  var at = full.lastIndexOf('@');
  if (at >= 0) return full.slice(0, at);
  return full;
}

export function joinEmailLocalAndDomain(local, domain) {
  var part = String(local || '').trim();
  var dom = normalizeEmailDomain(domain);
  if (!part) return '';
  if (!dom) return part;
  if (part.indexOf('@') >= 0) return part;
  return part + dom;
}

export function studentNameInputsHtml(student, escAttr) {
  var last = student.lastName != null ? student.lastName : '';
  var first = student.firstName != null ? student.firstName : '';
  if (!last && !first && student.name) {
    var parsed = parseLegacyStudentName(student.name);
    last = parsed.lastName;
    first = parsed.firstName;
  }
  return '<span class="setup-student-name">' +
    '<input type="text" data-field="lastName" data-id="' + student.id + '" value="' +
    escAttr(last) + '" placeholder="Last name" aria-label="Last name">' +
    '<span class="setup-name-sep" aria-hidden="true">|</span>' +
    '<input type="text" data-field="firstName" data-id="' + student.id + '" value="' +
    escAttr(first) + '" placeholder="First name" aria-label="First name">' +
    '</span>';
}

export function studentEmailInputHtml(student, data, escAttr) {
  var domain = normalizeEmailDomain(data.config && data.config.studentEmailDomain);
  var showDomain = data.meta && data.meta.showStudentEmailDomain !== false;
  var hideDomain = !showDomain && !!domain;
  if (hideDomain) {
    var local = emailLocalPart(student.email, domain);
    return '<span class="setup-student-email">' +
      '<input type="text" data-field="emailLocal" data-id="' + student.id + '" value="' +
      escAttr(local) + '" placeholder="username" aria-label="Student email username" ' +
      'autocomplete="off">' +
      '<span class="setup-email-domain-suffix" title="Configured student email domain">' +
      escAttr(domain) + '</span></span>';
  }
  var placeholder = domain ? 'student' + domain : 'student@example.edu';
  return '<input type="email" data-field="email" data-id="' + student.id + '" value="' +
    escAttr(student.email || '') + '" placeholder="' + escAttr(placeholder) +
    '" aria-label="Student email">';
}

export function applyRosterFieldToStudent(student, field, value, data) {
  if (field === 'emailLocal') {
    var domain = normalizeEmailDomain(data.config && data.config.studentEmailDomain);
    student.email = joinEmailLocalAndDomain(value, domain);
    return;
  }
  if (field === 'lastName' || field === 'firstName') {
    student[field] = value;
    syncStudentDisplayName(student);
    return;
  }
  if (field === 'email' || field === 'section' || field === 'simGroup' || field === 'name') {
    student[field] = value;
    if (field === 'name') syncStudentDisplayName(student);
  }
}

export function sortStudentsWithinCohorts(students, clinicalGroups) {
  var groups = clinicalGroups || [];
  var byGroup = {};
  groups.forEach(function (g) { byGroup[g] = []; });
  var orphans = [];
  students.forEach(function (s) {
    if (byGroup[s.clinicalGroup]) byGroup[s.clinicalGroup].push(s);
    else orphans.push(s);
  });
  var ordered = [];
  groups.forEach(function (g) {
    byGroup[g].sort(compareStudentsByName);
    ordered = ordered.concat(byGroup[g]);
  });
  orphans.sort(compareStudentsByName);
  return ordered.concat(orphans);
}
