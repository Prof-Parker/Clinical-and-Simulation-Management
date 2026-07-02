/* global App */
var App = App || {};
App.UI = App.UI || {};

/**
 * Audit / Closeout tab (spec: docs/AUDIT_TRACKING_IMPLEMENTATION.md §6.2).
 * Lead faculty: makeup summary review + attestation.
 * Admin: lifecycle controls (open, start review, reopen, export PDF, lock).
 */
App.UI.AuditCloseout = (function () {
  var groupFilter = '';

  function esc(s) {
    return App.UI.escapeHtml(s == null ? '' : s);
  }

  function facilityLabel(data, facilityId) {
    var fac = App.DataModel.findFacilityById(data, facilityId);
    if (!fac) return '';
    var label = fac.shortName || fac.name;
    if (fac.contentTags && fac.contentTags.length) {
      label += ' [' + fac.contentTags.join(', ') + ']';
    }
    return label;
  }

  function makeupDetails(data, m) {
    var parts = [];
    if (m.type === 'sim' && m.simNum) parts.push('Sim ' + m.simNum);
    if (m.facilityId) {
      var fl = facilityLabel(data, m.facilityId);
      if (fl) parts.push(fl);
    }
    if (m.joinedDay) parts.push('Joined ' + m.joinedDay + (m.hostGroup ? ' (' + m.hostGroup + ')' : ''));
    if (m.overload) parts.push('Overload');
    if (m.week18Fallback) parts.push('Week 18 last resort');
    if (m.clinicalConflict) parts.push('Sim/clinical conflict');
    if (m.appliedAt) parts.push('Applied ' + m.appliedAt.slice(0, 10) + (m.appliedByName ? ' by ' + m.appliedByName : ''));
    return parts.join(' · ');
  }

  function buildMakeupRows(data) {
    var rows = [];
    (data.students || []).forEach(function (s) {
      if (groupFilter && s.clinicalGroup !== groupFilter) return;
      (s.makeups || []).forEach(function (m) {
        rows.push({ student: s, makeup: m });
      });
    });
    rows.sort(function (a, b) {
      return a.student.name.localeCompare(b.student.name) ||
        (a.makeup.weekIndex - b.makeup.weekIndex);
    });
    return rows;
  }

  function makeupTableHtml(data) {
    var rows = buildMakeupRows(data);
    var groups = App.DataModel.getClinicalGroups(data.config);
    var filterHtml = '<label class="audit-group-filter">Clinical group ' +
      '<select id="auditGroupFilter"><option value="">All groups</option>' +
      groups.map(function (g) {
        return '<option value="' + g + '"' + (g === groupFilter ? ' selected' : '') + '>' + g + '</option>';
      }).join('') + '</select></label>';

    if (!rows.length) {
      return filterHtml + '<p class="section-sub">No makeup records' +
        (groupFilter ? ' for ' + esc(groupFilter) : '') + '.</p>';
    }

    var body = rows.map(function (r) {
      var tier = App.MakeupDisplay.getSlotTier(r.makeup);
      return '<tr class="' + App.MakeupDisplay.tierClass(tier) + '">' +
        '<td>' + esc(r.student.name) + '</td>' +
        '<td>' + esc(r.student.clinicalGroup) + '</td>' +
        '<td>Wk ' + (r.makeup.weekIndex + 1) + '</td>' +
        '<td>' + (r.makeup.type === 'sim' ? 'Simulation' : 'Clinical') + '</td>' +
        '<td>' + esc(makeupDetails(data, r.makeup)) + '</td>' +
        '</tr>';
    }).join('');

    return filterHtml +
      '<div class="audit-makeup-table-wrap"><table class="audit-makeup-table">' +
      '<thead><tr><th>Student</th><th>Group</th><th>Week</th><th>Type</th><th>Details</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div>';
  }

  function statusCardHtml(data) {
    var meta = data.meta;
    var phase = App.Audit.getPhase(data);
    var courseName = App.CourseDefaults ? App.CourseDefaults.displayName(meta.courseId) : meta.courseId;
    var rows = [
      ['Course', courseName || '—'],
      ['Semester', meta.semesterName || '—'],
      ['Phase', App.Audit.phaseLabel(phase)],
      ['Lead faculty', meta.leadFaculty && meta.leadFaculty.name
        ? esc(meta.leadFaculty.name) + (meta.leadFaculty.email ? ' · ' + esc(meta.leadFaculty.email) : '')
        : '<em>Not set — enter in Setup → Course Staff</em>']
    ];
    var att = meta.makeupAttestation;
    rows.push(['Attestation', att && att.attestedAt
      ? 'Attested ' + esc(att.attestedAt.slice(0, 10)) + ' by ' + esc(att.attestedByName)
      : 'Not attested']);
    var exp = meta.auditExport;
    rows.push(['Audit PDF', exp && exp.exportedAt
      ? 'v' + exp.exportVersion + ' exported ' + esc(exp.exportedAt.slice(0, 10)) +
        (exp.snapshotHash ? ' · hash ' + esc(exp.snapshotHash.slice(0, 12)) + '…' : '')
      : 'Not exported']);
    if (meta.lock && meta.lock.lockedAt) {
      rows.push(['Locked', esc(meta.lock.lockedAt.slice(0, 10)) +
        (meta.lock.lockedByName ? ' by ' + esc(meta.lock.lockedByName) : '')]);
    }
    return '<section class="card audit-card"><h3 class="section-title">Semester closeout status</h3>' +
      '<table class="audit-status-table"><tbody>' +
      rows.map(function (r) {
        return '<tr><th>' + r[0] + '</th><td>' + r[1] + '</td></tr>';
      }).join('') +
      '</tbody></table></section>';
  }

  function adminControlsHtml(data) {
    var phase = App.Audit.getPhase(data);
    var attested = App.Audit.isAttested(data);
    var buttons = [];
    if (phase === 'setup') {
      buttons.push('<button id="auditOpenSemesterBtn" class="btn btn-primary" type="button">Open semester for teaching</button>');
    }
    if (phase === 'active') {
      buttons.push('<button id="auditStartReviewBtn" class="btn btn-primary" type="button">Start makeup review</button>');
    }
    if (phase === 'makeup_review') {
      buttons.push('<button id="auditReopenActiveBtn" class="btn" type="button">Return to active teaching</button>');
      buttons.push('<button id="auditExportPdfBtn" class="btn btn-primary" type="button"' +
        (attested ? '' : ' disabled title="Lead faculty attestation required first"') +
        '>Export audit PDF</button>');
    }
    if (phase === 'audit_exported') {
      buttons.push('<button id="auditReopenReviewBtn" class="btn" type="button">Reopen for corrections</button>');
      buttons.push('<button id="auditExportPdfBtn" class="btn" type="button">Re-export audit PDF (new version)</button>');
      buttons.push('<button id="auditLockBtn" class="btn btn-finalize" type="button">Lock semester</button>');
    }
    if (phase === 'locked') {
      return '<section class="card audit-card"><h3 class="section-title">Administration</h3>' +
        '<p class="section-sub">Semester is locked. The digitally signed audit PDF in the OneDrive master repository is the official record.</p></section>';
    }
    return '<section class="card audit-card"><h3 class="section-title">Administration</h3>' +
      '<p class="section-sub">Lifecycle controls for administrative staff. See the operations guide for the full closeout checklist.</p>' +
      '<div class="audit-admin-buttons">' + buttons.join('') + '</div></section>';
  }

  function attestationSectionHtml(data) {
    var phase = App.Audit.getPhase(data);
    if (phase === 'setup' || phase === 'active') return '';
    var meta = data.meta;
    var att = meta.makeupAttestation;
    var attested = App.Audit.isAttested(data);

    var formHtml;
    if (attested) {
      formHtml = '<div class="audit-attested-banner">Attested ' + esc(att.attestedAt.slice(0, 10)) +
        ' by <strong>' + esc(att.attestedByName) + '</strong>' +
        (att.attestedByEmail ? ' (' + esc(att.attestedByEmail) + ')' : '') +
        (att.notes ? '<br>Notes: ' + esc(att.notes) : '') + '</div>';
    } else if (phase === 'makeup_review') {
      var lead = meta.leadFaculty || { name: '', email: '' };
      formHtml =
        '<div class="audit-attest-form">' +
        '<label class="filter-check audit-attest-check"><input type="checkbox" id="auditAttestCheck"> ' +
        'I attest that makeup and absence records for this semester are correct.</label>' +
        '<div class="audit-attest-fields">' +
        '<label>Name<input type="text" id="auditAttestName" value="' + esc(lead.name) + '"></label>' +
        '<label>Email (optional)<input type="email" id="auditAttestEmail" value="' + esc(lead.email) + '"></label>' +
        '<label class="audit-attest-notes">Notes (optional)<textarea id="auditAttestNotes" rows="2"></textarea></label>' +
        '</div>' +
        '<button id="auditAttestSubmitBtn" class="btn btn-primary" type="button">Submit attestation</button>' +
        '</div>';
    } else {
      formHtml = '<p class="section-sub">Attestation not recorded. Reopen makeup review to attest.</p>';
    }

    return '<section class="card audit-card"><h3 class="section-title">Lead faculty — makeup review &amp; attestation</h3>' +
      '<p class="section-sub">Review all makeup records below. Corrections happen in Makeup Finder or the master schedule; return here and re-check. The in-app attestation is a workflow step, not a legal digital signature — signatures are applied to the exported PDF outside the app.</p>' +
      makeupTableHtml(data) +
      formHtml +
      '</section>';
  }

  function render(data) {
    var container = document.getElementById('auditCloseout');
    if (!container) return;
    if (!data) {
      container.innerHTML = '<section class="card audit-card"><p class="section-sub">No semester loaded.</p></section>';
      return;
    }
    var phase = App.Audit.getPhase(data);
    var emptyState = phase === 'setup'
      ? '<section class="card audit-card"><h3 class="section-title">Audit / Closeout</h3>' +
        '<p class="section-sub">Semester not yet active for audit. Complete Setup (including lead course faculty under Course Staff), then open the semester for teaching below.</p></section>'
      : '';
    container.innerHTML =
      emptyState +
      statusCardHtml(data) +
      adminControlsHtml(data) +
      attestationSectionHtml(data);
  }

  function transitionWithConfirm(nextPhase, title, message, options) {
    var data = App.getData();
    var err = App.Audit.transitionError(data, nextPhase);
    if (err) {
      App.UI.showAlert('Cannot continue', err);
      return;
    }
    App.UI.showConfirm(title, message, function () {
      App.Audit.setPhase(data, nextPhase, options || {});
      App.notifyChange();
      render(data);
    }, { confirmLabel: (options && options.confirmLabel) || 'Continue' });
  }

  function submitAttestation() {
    var data = App.getData();
    var check = document.getElementById('auditAttestCheck');
    var name = document.getElementById('auditAttestName');
    if (!check || !check.checked) {
      App.UI.showAlert('Attestation', 'Check the attestation statement to continue.');
      return;
    }
    if (!name || !name.value.trim()) {
      App.UI.showAlert('Attestation', 'Enter the attesting faculty name.');
      return;
    }
    data.meta.makeupAttestation = {
      attestedAt: new Date().toISOString(),
      attestedByName: name.value.trim(),
      attestedByEmail: (document.getElementById('auditAttestEmail').value || '').trim(),
      notes: (document.getElementById('auditAttestNotes').value || '').trim()
    };
    App.notifyChange();
    render(data);
    App.UI.showAlert('Attestation recorded',
      'Makeup attestation recorded. Administrative staff may now export the audit PDF.');
  }

  function handleExportPdf() {
    var data = App.getData();
    if (!App.Audit.isAttested(data)) {
      App.UI.showAlert('Export blocked', 'Lead faculty attestation is required before exporting the audit PDF.');
      return;
    }
    if (!App.AuditExport) {
      App.UI.showAlert('Unavailable', 'Audit PDF export module not loaded.');
      return;
    }
    App.AuditExport.promptAndExport(data, function () {
      render(App.getData());
    });
  }

  function handleClick(e) {
    var id = e.target.id;
    if (id === 'auditOpenSemesterBtn') {
      transitionWithConfirm('active', 'Open semester?',
        'Open this semester for teaching? Setup should be complete and lead course faculty set.',
        { confirmLabel: 'Open semester' });
    } else if (id === 'auditStartReviewBtn') {
      transitionWithConfirm('makeup_review', 'Start makeup review?',
        'Start end-of-semester makeup review? Lead faculty will review and attest makeup records.',
        { confirmLabel: 'Start review' });
    } else if (id === 'auditReopenActiveBtn') {
      transitionWithConfirm('active', 'Return to active teaching?',
        'Return the semester to active teaching? The recorded attestation (if any) will be cleared.',
        { confirmLabel: 'Return to active', clearAttestation: true });
    } else if (id === 'auditReopenReviewBtn') {
      transitionWithConfirm('makeup_review', 'Reopen for corrections?',
        'Reopen makeup review for corrections? The attestation will be cleared and the audit PDF must be re-exported as a new version after re-attestation.',
        { confirmLabel: 'Reopen', clearAttestation: true });
    } else if (id === 'auditLockBtn') {
      transitionWithConfirm('locked', 'Lock semester?',
        'Lock this semester? Editing will be disabled in the app. Confirm the fully signed audit PDF has been filed in the OneDrive master repository per the operations guide. This cannot be undone in the app.',
        { confirmLabel: 'Lock semester' });
    } else if (id === 'auditExportPdfBtn') {
      handleExportPdf();
    } else if (id === 'auditAttestSubmitBtn') {
      submitAttestation();
    }
  }

  function init() {
    var container = document.getElementById('auditCloseout');
    if (!container) return;
    container.addEventListener('click', handleClick);
    container.addEventListener('change', function (e) {
      if (e.target.id === 'auditGroupFilter') {
        groupFilter = e.target.value;
        render(App.getData());
      }
    });
  }

  return { render: render, init: init };
})();
