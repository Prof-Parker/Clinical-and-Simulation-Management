/**
 * App boot completion helpers (extracted from main.js for the line cap).
 */

export function finishAppBoot(deps) {
  var UserSession = deps.UserSession;
  var Storage = deps.Storage;
  var getNavShell = deps.getNavShell;
  var switchTab = deps.switchTab;

  if (UserSession.isValidated() && Storage.isSemesterFileConnected()) {
    UserSession.hideGateModal();
    var bootTab = getNavShell() === 'theory' ? 'theory-master' : 'dashboard';
    switchTab(bootTab);
  } else if (UserSession.isValidated()) {
    UserSession.showGateModal('');
    UserSession.updateGateStep('');
  }
  document.dispatchEvent(new Event('AppReady'));
}

/** Run optional DEV quick-start, then finish boot. */
export function runBootTail(deps) {
  function finishBoot() {
    finishAppBoot(deps);
  }
  if (import.meta.env.DEV) {
    return import('./dev/quick-start.js').then(function (QuickStart) {
      if (!QuickStart.shouldQuickStart()) {
        finishBoot();
        return;
      }
      return QuickStart.runQuickStart().then(finishBoot).catch(function (err) {
        console.error('[dev:start] failed', err);
        deps.UserSession.showGateModal((err && err.message) || 'Quick start failed');
        finishBoot();
      });
    });
  }
  finishBoot();
}
