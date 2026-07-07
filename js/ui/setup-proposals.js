/* global App */
var App = App || {};
App.UI = App.UI || {};

App.UI.SetupProposals = (function () {
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

  function formatProposalValue(val) {
    if (val === undefined) return '(removed)';
    var s = JSON.stringify(val);
    return s.length > 80 ? s.slice(0, 77) + '…' : s;
  }

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
    var stale = App.Proposals.isStale(p);
    var staleTag = stale ? ' <span class="proposal-stale">(stale)</span>' : '';
    var label = App.Proposals.formatProposalLabel
      ? App.Proposals.formatProposalLabel(p.path, sem)
      : p.path;
    var actions = '';
    if (canReview) {
      actions = '<button type="button" class="btn btn-sm proposal-approve" data-prop-id="' + p.id + '">✔</button>' +
        '<button type="button" class="btn btn-sm proposal-deny" data-prop-id="' + p.id + '">✕</button>';
    }
    return '<div class="proposal-row proposal-pending">' +
      '<span class="proposal-path">' + label + '</span>: ' +
      formatProposalValue(p.currentValue) + ' → ' + formatProposalValue(p.proposedValue) + staleTag +
      ' <span class="proposal-by">by ' + (p.proposedBy ? p.proposedBy.name : '') + '</span> ' +
      actions + '</div>';
  }

  function renderProposalList(scope) {
    var sem = App.getData();
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
    var canReview = App.Permissions.canAction('proposals.review');
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
    var sem = App.getData();
    var pending = getPendingProposals(sem);
    clearInlineProposals();
    if (!pending.length) return { inline: 0, fallback: 0 };

    var canReview = App.Permissions.canAction('proposals.review');
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
    var sem = App.getData();
    var reviewer = App.UserSession.attribution();
    var configBefore = App.DataModel.cloneConfig(sem.config);
    if (App.Proposals.approve(sem, id, reviewer)) {
      App.DataModel.syncSemesterForConfig(sem);
      if (App.SetupDraft) App.SetupDraft.clearAllForSemester(sem.id);
      App.notifyChange();
      renderSetupProposalsPanel();
      if (App.UI.Setup) App.UI.Setup.render(sem);
      if (App.UI.SetupConfig) {
        App.UI.SetupConfig.maybeRegenerateAfterChange(sem, configBefore);
      }
    } else {
      App.UI.showAlert('Cannot approve', 'This proposal is stale or no longer pending.');
    }
  }

  function handleDeny(id) {
    var sem = App.getData();
    var reviewer = App.UserSession.attribution();
    App.Proposals.deny(sem, id, reviewer);
    App.notifyChange();
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
      var sem = App.getData();
      var canReview = App.Permissions.canAction('proposals.review');
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
        if (!App.Permissions.guard('proposals.submit')) return;
        var sem = App.getData();
        if (!sem) return;
        var draft = App.SetupDraft && App.SetupDraft.collectSnapshotFromDom
          ? App.SetupDraft.collectSnapshotFromDom()
          : null;
        if (!draft) return;
        var count = App.Proposals.submitSetupProposals(sem, draft, App.UserSession.attribution());
        App.notifyChange();
        renderSetupProposalsPanel();
        if (count === 0) {
          App.UI.showAlert('No changes', 'No differences from the approved semester setup.');
        } else {
          App.UI.showAlert('Proposed', count + ' change(s) submitted for review.');
        }
      });
    }
  }

  return {
    init: init,
    renderProposalList: renderProposalList,
    renderSetupProposalsPanel: renderSetupProposalsPanel,
    anchorForPath: anchorForPath
  };
})();
