/**
 * Mount a scoped copy of the Setup tab inside the Playground view.
 */

function rewriteIds(node, prefix) {
  if (node.id) node.id = prefix + node.id;
  node.querySelectorAll('[id]').forEach(function (el) {
    el.id = prefix + el.id;
  });
  node.querySelectorAll('[for]').forEach(function (el) {
    if (el.htmlFor && !el.htmlFor.startsWith(prefix)) {
      el.htmlFor = prefix + el.htmlFor;
    }
  });
  node.querySelectorAll('[aria-controls]').forEach(function (el) {
    var ac = el.getAttribute('aria-controls');
    if (ac && !ac.startsWith(prefix)) el.setAttribute('aria-controls', prefix + ac);
  });
  node.querySelectorAll('[list]').forEach(function (el) {
    var list = el.getAttribute('list');
    if (list && !list.startsWith(prefix)) el.setAttribute('list', prefix + list);
  });
}

function playgroundActionsHtml() {
  return '<div class="setup-actions-sticky card no-print">' +
    '<div class="setup-actions">' +
    '<button id="pg-regenerateSchedulesBtn" class="btn" type="button">Regenerate Schedules</button>' +
    '<button id="pg-setupAdvancedConfigBtn" class="btn" type="button" aria-expanded="false">' +
    'Advanced Configuration</button>' +
    '</div></div>';
}

export function mountPlaygroundSetup() {
  var host = document.getElementById('playgroundSetupRoot');
  var source = document.getElementById('view-setup');
  if (!host || !source || host.dataset.mounted) return;

  Array.from(source.children).forEach(function (child) {
    if (child.id === 'setupProposalsPanel') return;
    if (child.classList && child.classList.contains('setup-actions-sticky')) {
      host.insertAdjacentHTML('beforeend', playgroundActionsHtml());
      return;
    }
    var clone = child.cloneNode(true);
    rewriteIds(clone, 'pg-');
    if (clone.querySelector) {
      ['setupConfigApplyFutureBtn', 'setupSaveAddSemesterBtn', 'setupPendingNewSemesterBanner',
        'setupNewSemesterCourseLabel'].forEach(function (id) {
        var el = clone.querySelector('#pg-' + id);
        if (el) el.classList.add('hidden');
      });
    }
    host.appendChild(clone);
  });

  host.dataset.mounted = '1';
}

export function setPlaygroundSetupVisible(show) {
  var host = document.getElementById('playgroundSetupRoot');
  if (host) host.classList.toggle('hidden', !show);
}
