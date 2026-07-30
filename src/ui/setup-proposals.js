/**
 * Setup proposals review panel.
 */

import * as DataModel from '../core/data-model/index.js';
import * as Permissions from '../auth/permissions.js';
import * as ProposalFormat from '../proposals/proposal-format.js';
import * as Proposals from '../proposals/proposals.js';
import * as Setup from './setup/index.js';
import * as SetupConfig from './setup-config/index.js';
import * as SetupDraft from '../proposals/setup-draft.js';
import * as UserSession from '../auth/user-session.js';
import { getData, notifyChange } from '../core/state.js';
import { showAlert } from './dialogs.js';

var delegationBound = false;

  /** First matching rule wins. match(path) → truthy when proposal belongs here. */
  var ANCHOR_RULES = [
    {
      key: 'clinicalGroups',
      selector: '#cfgClinicalGroupsList',
      match: function (path) {
        return path.indexOf('config.clinicalGroup') === 0 ||
          path.indexOf('config.clinicalGroups') === 0 ||
          path === 'config.numClinicalGroups';
      }
    },
    {
      key: 'simGroups',
      selector: '#cfgSimGroupsList',
      match: function (path) {
        return path.indexOf('config.simGroup') === 0 || path.indexOf('config.simGroups') === 0;
      }
    },
    {
      key: 'simDays',
      selector: '#cfgSimDaysList',
      match: function (path) {
        return path.indexOf('config.simDays') === 0;
      }
    },
    {
      key: 'advancedConfig',
      selector: '#setupAdvancedPanel',
      match: function (path) {
        return path.indexOf('config.') === 0;
      }
    },
    {
      key: 'sections',
      selector: '#setupSections',
      match: function (path) {
        return path === 'sections' || path.indexOf('sections.') === 0;
      }
    },
    {
      key: 'clinicalFaculty',
      selector: '#setupFaculty',
      match: function (path) {
        return path === 'faculty' || path.indexOf('faculty.') === 0;
      }
    },
    {
      key: 'leadFaculty',
      selector: '.setup-course-staff-block',
      match: function (path) {
        return path.indexOf('meta.leadFaculty') === 0;
      }
    },
    {
      key: 'semester',
      selector: '.setup-semester-fields',
      match: function (path) {
        return path.indexOf('meta.semester') === 0 || path.indexOf('calendar.') === 0;
      }
    },
    {
      key: 'holidays',
      selector: '#setupHolidays',
      match: function (path) {
        return path === 'holidays' || path.indexOf('holidays.') === 0;
      }
    },
    {
      key: 'facilities',
      selector: '#setupFacilities',
      match: function (path) {
        return path === 'facilities' || path.indexOf('facilities.') === 0;
      }
    },
    {
      key: 'orientations',
      selector: '#setupOrientations',
      match: function (path) {
        return path === 'orientations' || path.indexOf('orientations.') === 0;
      }
    },
    {
      key: 'roster',
      selector: '#setupRoster',
      match: function (path) {
        return path === 'students' || path.indexOf('students.') === 0;
      }
    }
  ];

  function anchorForPath(path) {
    for (var i = 0; i < ANCHOR_RULES.length; i++) {
      if (ANCHOR_RULES[i].match(path)) return ANCHOR_RULES[i];
    }
    return null;
  }

  function getPendingProposals(sem) {
    if (!sem || !sem.proposals) return [];
    return sem.proposals.filter(function (p) { return p.status === 'pending'; });
  }

  function renderProposalRowHtml(p, sem, canReview) {
    var stale = Proposals.isStale(p);
    var staleTag = stale ? ' <span class="proposal-stale">(stale)</span>' : '';
    var label = Proposals.formatProposalLabel
      ? Proposals.formatProposalLabel(p.path, sem)
      : p.path;
    var change = ProposalFormat && ProposalFormat.formatChange
      ? ProposalFormat.formatChange(p.path, p.currentValue, p.proposedValue, sem)
      : { before: String(p.currentValue), after: String(p.proposedValue) };
    var actions = '';
    if (canReview) {
      actions = '<button type="button" class="btn btn-sm proposal-approve" data-prop-id="' + p.id + '">✔</button>' +
        '<button type="button" class="btn btn-sm proposal-deny" data-prop-id="' + p.id + '">✕</button>';
    }
    return '<div class="proposal-row proposal-pending">' +
      '<span class="proposal-path">' + label + '</span>: ' +
      change.before + ' → ' + change.after + staleTag +
      ' <span class="proposal-by">by ' + (p.proposedBy ? p.proposedBy.name : '') + '</span> ' +
      actions + '</div>';
  }

  function renderProposalList(scope) {
    var sem = getData();
    var pending = getPendingProposals(sem);
    if (!pending.length) return '';
    if (scope) {
      pending = pending.filter(function (p) {
        if (scope === 'config') return p.path.indexOf('config') === 0;
        return p.path.indexOf(scope) === 0 ||
          p.path === 'students' || p.path.indexOf('students.') === 0 ||
          p.path === 'sections' || p.path.indexOf('sections.') === 0 ||
          p.path === 'facilities' || p.path.indexOf('facilities.') === 0 ||
          p.path === 'faculty' || p.path === 'holidays' || p.path === 'orientations' ||
          p.path.indexOf('meta.') === 0 || p.path.indexOf('calendar.') === 0;
      });
    }
    if (!pending.length) return '';
    var canReview = Permissions.canAction('proposals.review');
    return pending.map(function (p) {
      return renderProposalRowHtml(p, sem, canReview);
    }).join('');
  }

  function clearInlineProposals() {
    var view = document.getElementById('view-setup');
    if (!view) return;
    view.querySelectorAll('.setup-inline-proposals').forEach(function (el) {
      el.remove();
    });
  }

  function ensureInlineBlock(anchorEl, anchorKey) {
    if (!anchorEl || !anchorEl.parentNode) return null;
    var prev = anchorEl.previousElementSibling;
    if (prev && prev.classList.contains('setup-inline-proposals') &&
        prev.getAttribute('data-proposal-anchor') === anchorKey) {
      return prev;
    }
    if (prev && prev.classList.contains('setup-inline-proposals')) {
      prev.remove();
    }
    var block = document.createElement('div');
    block.className = 'setup-inline-proposals';
    block.setAttribute('data-proposal-anchor', anchorKey);
    block.setAttribute('role', 'region');
    block.setAttribute('aria-label', 'Pending proposed changes');
    anchorEl.parentNode.insertBefore(block, anchorEl);
    return block;
  }

  function renderInlineProposals() {
    var sem = getData();
    var pending = getPendingProposals(sem);
    clearInlineProposals();
    if (!pending.length) return { inline: 0, fallback: 0 };

    var canReview = Permissions.canAction('proposals.review');
    var byAnchor = {};
    var fallback = [];

    pending.forEach(function (p) {
      var rule = anchorForPath(p.path);
      if (!rule) {
        fallback.push(p);
        return;
      }
      if (!byAnchor[rule.key]) byAnchor[rule.key] = { rule: rule, items: [] };
      byAnchor[rule.key].items.push(p);
    });

    Object.keys(byAnchor).forEach(function (key) {
      var group = byAnchor[key];
      var anchorEl = document.querySelector('#view-setup ' + group.rule.selector);
      if (!anchorEl) {
        fallback = fallback.concat(group.items);
        return;
      }
      var block = ensureInlineBlock(anchorEl, key);
      if (!block) return;
      block.innerHTML = group.items.map(function (p) {
        return renderProposalRowHtml(p, sem, canReview);
      }).join('');
    });

    return { inline: pending.length - fallback.length, fallback: fallback.length, fallbackItems: fallback };
  }

  function handleApprove(id) {
    var sem = getData();
    var reviewer = UserSession.attribution();
    var configBefore = DataModel.cloneConfig(sem.config);
    if (Proposals.approve(sem, id, reviewer)) {
      DataModel.syncSemesterForConfig(sem);
      if (SetupDraft) SetupDraft.clearAllForSemester(sem.id);
      notifyChange();
      renderSetupProposalsPanel();
      if (Setup) Setup.render(sem);
      if (SetupConfig) {
        SetupConfig.maybeRegenerateAfterChange(sem, configBefore);
      }
    } else {
      showAlert('Cannot approve', 'This proposal is stale or no longer pending.');
    }
  }

  function handleDeny(id) {
    var sem = getData();
    var reviewer = UserSession.attribution();
    Proposals.deny(sem, id, reviewer);
    notifyChange();
    renderSetupProposalsPanel();
  }

  function bindProposalDelegation() {
    if (delegationBound) return;
    var view = document.getElementById('view-setup');
    if (!view) return;
    delegationBound = true;
    view.addEventListener('click', function (e) {
      var approveBtn = e.target.closest('.proposal-approve');
      if (approveBtn && approveBtn.dataset.propId) {
        e.preventDefault();
        handleApprove(approveBtn.dataset.propId);
        return;
      }
      var denyBtn = e.target.closest('.proposal-deny');
      if (denyBtn && denyBtn.dataset.propId) {
        e.preventDefault();
        handleDeny(denyBtn.dataset.propId);
      }
    });
  }

  function renderSetupProposalsPanel() {
    bindProposalDelegation();
    var result = renderInlineProposals();
    var el = document.getElementById('setupProposalsPanel');
    if (!el) return;

    var fallbackItems = (result && result.fallbackItems) || [];
    if (fallbackItems.length) {
      var sem = getData();
      var canReview = Permissions.canAction('proposals.review');
      el.innerHTML = '<p class="section-sub setup-proposals-fallback-title">Other pending changes</p>' +
        fallbackItems.map(function (p) {
          return renderProposalRowHtml(p, sem, canReview);
        }).join('');
      el.classList.remove('hidden');
    } else {
      el.innerHTML = '';
      el.classList.add('hidden');
    }
  }

  function init() {
    bindProposalDelegation();
    var proposeBtn = document.getElementById('proposeSetupChangesBtn');
    if (proposeBtn) {
      proposeBtn.addEventListener('click', function () {
        if (!Permissions.guard('proposals.submit')) return;
        var sem = getData();
        if (!sem) return;
        var draft = SetupDraft && SetupDraft.collectSnapshotFromDom
          ? SetupDraft.collectSnapshotFromDom()
          : null;
        if (!draft) return;
        var count = Proposals.submitSetupProposals(sem, draft, UserSession.attribution());
        notifyChange();
        renderSetupProposalsPanel();
        if (count === 0) {
          showAlert('No changes', 'No differences from the approved semester setup.');
        } else {
          showAlert('Proposed', count + ' change(s) submitted for review. Sync to OneDrive to persist them on the program file.');
        }
      });
    }
  }

export {
  init,
  renderProposalList,
  renderSetupProposalsPanel,
  anchorForPath
};
