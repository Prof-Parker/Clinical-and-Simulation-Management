/**
 * Audit PDF export.
 */

import * as Audit from './audit.js';
import * as AuditSnapshot from './audit-snapshot.js';
import * as CourseDefaults from '../core/course-defaults.js';
import * as DataModel from '../core/data-model/index.js';
import * as Validator from '../core/validator.js';
import { notifyChange } from '../core/state.js';
import { showAlert, showDialog } from '../ui/dialogs.js';

var AUDIT_APP_VERSION = 'clin-sim-tracker v8';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function facilityForRow(semester, facilityId) {
    var fac = DataModel.findFacilityById(semester, facilityId);
    if (!fac) return { label: '', tags: [] };
    return {
      label: fac.shortName || fac.name,
      tags: (fac.contentTags && fac.contentTags.length) ? fac.contentTags : ['MS']
    };
  }

  /**
   * Pure builder: one row per makeup record (spec §7.2 makeup log).
   */
  function buildMakeupLogRows(semester) {
    var rows = [];
    (semester.students || []).forEach(function (s) {
      (s.makeups || []).forEach(function (m) {
        var site = facilityForRow(semester, m.facilityId);
        rows.push({
          studentName: s.name,
          clinicalGroup: s.clinicalGroup,
          week: m.weekIndex + 1,
          type: m.type === 'sim' ? 'Simulation' : 'Clinical',
          simNum: m.simNum || null,
          site: site.label,
          contentTags: site.tags,
          joinedDay: m.joinedDay || '',
          hostGroup: m.hostGroup || '',
          overload: !!m.overload,
          week18Fallback: !!m.week18Fallback,
          clinicalConflict: !!m.clinicalConflict,
          appliedAt: m.appliedAt || null,
          appliedByName: m.appliedByName || ''
        });
      });
    });
    rows.sort(function (a, b) {
      return a.studentName.localeCompare(b.studentName) || (a.week - b.week);
    });
    return rows;
  }

  /**
   * Per-student requirements summary; day counts from DataModel.countStats,
   * validity from Validator.validateAll.
   */
  function buildRequirementsSummary(semester) {
    var validation = Validator.validateAll(semester);
    return (semester.students || []).slice().sort(function (a, b) {
      return a.name.localeCompare(b.name);
    }).map(function (s) {
      var stats = DataModel.countStats(s);
      var v = validation.students[s.id];
      return {
        studentName: s.name,
        clinicalGroup: s.clinicalGroup,
        simGroup: s.simGroup,
        clinicals: stats.clinicals,
        sims: stats.sims,
        clinicalsRequired: semester.config.clinicalDaysRequired,
        simsRequired: semester.config.simDaysRequired,
        makeupCount: (s.makeups || []).length,
        met: !!(v && v.valid)
      };
    });
  }

  function flagsText(row) {
    var flags = [];
    if (row.joinedDay) flags.push('Joined ' + row.joinedDay + (row.hostGroup ? ' (' + row.hostGroup + ')' : ''));
    if (row.overload) flags.push('Overload');
    if (row.week18Fallback) flags.push('Wk18 fallback');
    if (row.clinicalConflict) flags.push('Sim/clin conflict');
    return flags.join('; ');
  }

  function suggestedPdfName(semester, version) {
    var meta = semester.meta;
    var season = meta.semesterSeason === 'fall' ? 'Fall' : 'Spring';
    var course = meta.courseId || 'COURSE';
    return season + '-' + meta.semesterYear + '-' + course + '-Audit-v' + version + '.pdf';
  }

  function coverHtml(semester, hash, version, adminName) {
    var meta = semester.meta;
    var courseName = CourseDefaults ? CourseDefaults.displayName(meta.courseId) : meta.courseId;
    var lead = meta.leadFaculty || {};
    return '<section class="audit-print-cover">' +
      '<h1>Clinical &amp; Simulation Audit Record</h1>' +
      '<table class="audit-print-kv"><tbody>' +
      '<tr><th>Course</th><td>' + esc(courseName || meta.courseId || '—') + ' (' + esc(meta.courseId || '—') + ')</td></tr>' +
      '<tr><th>Semester</th><td>' + esc(meta.semesterName) + '</td></tr>' +
      '<tr><th>Lead faculty</th><td>' + esc(lead.name || '—') + (lead.email ? ' · ' + esc(lead.email) : '') + '</td></tr>' +
      '<tr><th>Exported</th><td>' + new Date().toLocaleString() + (adminName ? ' by ' + esc(adminName) : '') + '</td></tr>' +
      '<tr><th>Export version</th><td>v' + version + '</td></tr>' +
      '<tr><th>App version</th><td>' + esc(AUDIT_APP_VERSION) + '</td></tr>' +
      '<tr><th>Snapshot hash (SHA-256)</th><td class="audit-print-hash">' + esc(hash) + '</td></tr>' +
      '</tbody></table></section>';
  }

  function requirementsHtml(semester) {
    var rows = buildRequirementsSummary(semester);
    var body = rows.map(function (r) {
      return '<tr>' +
        '<td>' + esc(r.studentName) + '</td>' +
        '<td>' + esc(r.clinicalGroup) + '</td>' +
        '<td>' + esc(r.simGroup) + '</td>' +
        '<td>' + r.clinicals + ' / ' + r.clinicalsRequired + '</td>' +
        '<td>' + r.sims + ' / ' + r.simsRequired + '</td>' +
        '<td>' + r.makeupCount + '</td>' +
        '<td>' + (r.met ? 'Met' : 'NOT MET') + '</td>' +
        '</tr>';
    }).join('');
    return '<section class="audit-print-section"><h2>Requirements summary</h2>' +
      '<table class="audit-print-table"><thead><tr>' +
      '<th>Student</th><th>Clin group</th><th>Sim group</th><th>Clinical days</th><th>Sim days</th><th>Makeups</th><th>Status</th>' +
      '</tr></thead><tbody>' + body + '</tbody></table></section>';
  }

  function makeupLogHtml(semester) {
    var rows = buildMakeupLogRows(semester);
    var body = rows.length ? rows.map(function (r) {
      return '<tr>' +
        '<td>' + esc(r.studentName) + '</td>' +
        '<td>' + esc(r.clinicalGroup) + '</td>' +
        '<td>' + r.week + '</td>' +
        '<td>' + esc(r.type) + (r.simNum ? ' ' + r.simNum : '') + '</td>' +
        '<td>' + esc(r.site) + (r.site ? ' [' + r.contentTags.join(', ') + ']' : '') + '</td>' +
        '<td>' + esc(flagsText(r)) + '</td>' +
        '<td>' + (r.appliedAt ? esc(r.appliedAt.slice(0, 10)) : '') +
          (r.appliedByName ? ' ' + esc(r.appliedByName) : '') + '</td>' +
        '</tr>';
    }).join('') : '<tr><td colspan="7">No makeup records this semester.</td></tr>';
    return '<section class="audit-print-section"><h2>Makeup log</h2>' +
      '<table class="audit-print-table"><thead><tr>' +
      '<th>Student</th><th>Group</th><th>Week</th><th>Type</th><th>Site [content]</th><th>Flags</th><th>Applied</th>' +
      '</tr></thead><tbody>' + body + '</tbody></table></section>';
  }

  function attestationHtml(semester) {
    var att = semester.meta.makeupAttestation || {};
    return '<section class="audit-print-section"><h2>Lead faculty attestation</h2>' +
      '<p>I attest that makeup and absence records for this semester are correct.</p>' +
      '<table class="audit-print-kv"><tbody>' +
      '<tr><th>Attested by</th><td>' + esc(att.attestedByName || '—') + '</td></tr>' +
      '<tr><th>Email</th><td>' + esc(att.attestedByEmail || '—') + '</td></tr>' +
      '<tr><th>Attested at</th><td>' + esc(att.attestedAt || '—') + '</td></tr>' +
      (att.notes ? '<tr><th>Notes</th><td>' + esc(att.notes) + '</td></tr>' : '') +
      '</tbody></table></section>';
  }

  function signatureHtml() {
    return '<section class="audit-print-section audit-print-signatures"><h2>Signatures</h2>' +
      '<p class="audit-print-sign-note">Sign digitally in Adobe Acrobat (or print, sign, and scan) per the audit tracking operations guide.</p>' +
      '<div class="audit-print-sign-row"><span class="audit-print-sign-line"></span>' +
      '<span class="audit-print-sign-label">Lead course faculty — signature &amp; date</span></div>' +
      '<div class="audit-print-sign-row"><span class="audit-print-sign-line"></span>' +
      '<span class="audit-print-sign-label">Program director — signature &amp; date</span></div>' +
      '</section>';
  }

  function footerHtml(hash, version) {
    return '<footer class="audit-print-footer">' +
      'Snapshot SHA-256: <span class="audit-print-hash">' + esc(hash) + '</span> · Export v' + version +
      '<br>This document was generated by the scheduling application. The signed PDF filed in the program OneDrive ' +
      'master repository is the official audit record; the application data file is a working document.' +
      '</footer>';
  }

  function renderPrintDom(semester, hash, version, adminName) {
    var root = document.getElementById('auditPrintRoot');
    if (!root) {
      root = document.createElement('div');
      root.id = 'auditPrintRoot';
      document.body.appendChild(root);
    }
    root.innerHTML =
      coverHtml(semester, hash, version, adminName) +
      requirementsHtml(semester) +
      makeupLogHtml(semester) +
      attestationHtml(semester) +
      signatureHtml() +
      footerHtml(hash, version);
    return root;
  }

  function cleanupPrintDom() {
    document.body.classList.remove('audit-printing');
    var root = document.getElementById('auditPrintRoot');
    if (root) root.innerHTML = '';
  }

  /**
   * Export flow (spec §7.4): compute hash, render print DOM, print, then
   * record export metadata and move phase to audit_exported.
   */
  function exportAuditPdf(semester, adminName) {
    var version = ((semester.meta.auditExport && semester.meta.auditExport.exportVersion) || 0) + 1;
    return AuditSnapshot.computeHash(semester).then(function (hash) {
      renderPrintDom(semester, hash, version, adminName);
      document.body.classList.add('audit-printing');
      window.addEventListener('afterprint', cleanupPrintDom, { once: true });
      window.print();
      // Fallback cleanup for browsers that never fire afterprint.
      setTimeout(cleanupPrintDom, 2000);

      semester.meta.auditExport = {
        exportedAt: new Date().toISOString(),
        exportedByName: adminName || '',
        snapshotHash: hash,
        appVersion: AUDIT_APP_VERSION,
        exportVersion: version
      };
      if (Audit.getPhase(semester) === 'makeup_review') {
        Audit.setPhase(semester, 'audit_exported');
      }
      notifyChange();
      return { hash: hash, version: version, fileName: suggestedPdfName(semester, version) };
    });
  }

  /** Ask for the exporting admin's name, run the export, then show the target filename. */
  function promptAndExport(semester, done) {
    var body =
      '<label class="audit-export-name-label">Exported by (administrative staff name)' +
      '<input type="text" id="auditExportAdminName" value="" placeholder="Your name"></label>' +
      '<p class="dialog-message">In the print dialog choose <strong>Save as PDF</strong>. ' +
      'Save the file to the audit folder using the suggested name shown after export.</p>';
    showDialog('Export audit PDF', body, function () {
      var nameEl = document.getElementById('auditExportAdminName');
      var adminName = nameEl ? nameEl.value.trim() : '';
      exportAuditPdf(semester, adminName).then(function (result) {
        showAlert('Audit PDF exported',
          'Save the PDF as:\n\n' + result.fileName +
          '\n\nFile it in the OneDrive audit folder per the operations guide, then collect signatures. ' +
          'Snapshot hash: ' + result.hash.slice(0, 16) + '…');
        if (done) done(result);
      }).catch(function (err) {
        showAlert('Export failed', String(err && err.message || err));
      });
    });
  }

export {
  AUDIT_APP_VERSION,
  buildMakeupLogRows,
  buildRequirementsSummary,
  suggestedPdfName,
  exportAuditPdf,
  promptAndExport
};
