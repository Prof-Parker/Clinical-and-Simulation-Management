/* global App */
var App = App || {};

/**
 * Audit lifecycle gating (spec: docs/AUDIT_TRACKING_IMPLEMENTATION.md §5).
 *
 * Phases: setup -> active -> makeup_review -> audit_exported -> locked.
 * Edit gating matrix (spec §5, "UI gating by phase"):
 *
 *   phase           setup  regenerate  makeup  masterCell
 *   setup           yes    yes         yes     yes
 *   active          yes    yes         yes     yes
 *   makeup_review   yes    yes         yes     yes
 *   audit_exported  no     no          no      no
 *   locked          no     no          no      no
 */
App.Audit = (function () {
  var PHASES = ['setup', 'active', 'makeup_review', 'audit_exported', 'locked'];

  var EDIT_ACTIONS = ['setup', 'regenerate', 'makeup', 'masterCell'];

  // Allowed transitions with preconditions (spec §5 "Phase transition rules").
  var TRANSITIONS = {
    setup: ['active'],
    active: ['makeup_review'],
    makeup_review: ['active', 'audit_exported'],
    audit_exported: ['makeup_review', 'locked'],
    locked: []
  };

  function getPhase(semester) {
    var phase = semester && semester.meta && semester.meta.auditPhase;
    return PHASES.indexOf(phase) >= 0 ? phase : 'setup';
  }

  function isLocked(semester) {
    return getPhase(semester) === 'locked';
  }

  /** True while the semester data is read-only (exported pending sign, or locked). */
  function isReadOnly(semester) {
    var phase = getPhase(semester);
    return phase === 'audit_exported' || phase === 'locked';
  }

  function canEdit(semester, action) {
    if (EDIT_ACTIONS.indexOf(action) < 0) return !isReadOnly(semester);
    return !isReadOnly(semester);
  }

  function canTransition(semester, nextPhase) {
    var current = getPhase(semester);
    return (TRANSITIONS[current] || []).indexOf(nextPhase) >= 0;
  }

  /**
   * Transition preconditions beyond the state graph. Returns an error message
   * string, or null when the transition is allowed.
   */
  function transitionError(semester, nextPhase) {
    var current = getPhase(semester);
    if (!canTransition(semester, nextPhase)) {
      return 'Cannot move from "' + current + '" to "' + nextPhase + '".';
    }
    var meta = semester.meta;
    if (nextPhase === 'active' && current === 'setup') {
      if (!meta.leadFaculty || !meta.leadFaculty.name) {
        return 'Set the lead course faculty name in Setup before opening the semester.';
      }
    }
    if (nextPhase === 'makeup_review') {
      if (!meta.leadFaculty || !meta.leadFaculty.name) {
        return 'Set the lead course faculty name in Setup before starting makeup review.';
      }
    }
    if (nextPhase === 'audit_exported') {
      if (!meta.makeupAttestation || !meta.makeupAttestation.attestedAt) {
        return 'Lead faculty attestation is required before exporting the audit PDF.';
      }
    }
    if (nextPhase === 'locked') {
      if (!meta.auditExport || !meta.auditExport.exportedAt) {
        return 'Export the audit PDF before locking the semester.';
      }
    }
    return null;
  }

  /**
   * Apply a phase transition. Returns true on success; shows no UI itself.
   * `options.clearAttestation` clears attestation when reopening review.
   */
  function setPhase(semester, nextPhase, options) {
    options = options || {};
    if (transitionError(semester, nextPhase)) return false;
    semester.meta.auditPhase = nextPhase;
    if (options.clearAttestation) {
      semester.meta.makeupAttestation = {
        attestedAt: null, attestedByName: '', attestedByEmail: '', notes: ''
      };
    }
    if (nextPhase === 'locked') {
      semester.meta.lock = {
        lockedAt: new Date().toISOString(),
        lockedByName: options.actorName || '',
        lockedReason: options.reason || 'semester_complete'
      };
    }
    return true;
  }

  function isAttested(semester) {
    var att = semester && semester.meta && semester.meta.makeupAttestation;
    return !!(att && att.attestedAt);
  }

  function phaseLabel(phase) {
    return {
      setup: 'Setup',
      active: 'Active (teaching)',
      makeup_review: 'Makeup review',
      audit_exported: 'Audit exported — pending signatures',
      locked: 'Locked (closed out)'
    }[phase] || phase;
  }

  return {
    PHASES: PHASES,
    getPhase: getPhase,
    isLocked: isLocked,
    isReadOnly: isReadOnly,
    canEdit: canEdit,
    canTransition: canTransition,
    transitionError: transitionError,
    setPhase: setPhase,
    isAttested: isAttested,
    phaseLabel: phaseLabel
  };
})();
