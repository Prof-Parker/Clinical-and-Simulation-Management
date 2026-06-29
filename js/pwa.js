/* global App */
var App = App || {};
App.PWA = (function () {
  var deferredPrompt = null;
  var DISMISS_INSTALL_KEY = 'pwaInstallDismissed';
  var DISMISS_IOS_KEY = 'pwaIosInstallDismissed';
  var DISMISS_ONEDRIVE_KEY = 'pwaOnedriveBannerDismissed';

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
  }

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function canRegisterServiceWorker() {
    return 'serviceWorker' in navigator &&
      (location.protocol === 'https:' || location.hostname === 'localhost');
  }

  function registerServiceWorker() {
    if (!canRegisterServiceWorker()) return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').catch(function () {});
    });
  }

  function hideBanner(id) {
    var el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  }

  function showBanner(id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  }

  function initInstallPrompt() {
    if (isStandalone()) return;

    var installBanner = document.getElementById('pwaInstallBanner');
    var iosBanner = document.getElementById('pwaIosInstallBanner');
    var installBtn = document.getElementById('pwaInstallBtn');
    var dismissInstall = document.getElementById('pwaInstallDismiss');
    var dismissIos = document.getElementById('pwaIosInstallDismiss');

    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPrompt = e;
      if (localStorage.getItem(DISMISS_INSTALL_KEY)) return;
      showBanner('pwaInstallBanner');
    });

    if (installBtn) {
      installBtn.addEventListener('click', function () {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        deferredPrompt.userChoice.finally(function () {
          deferredPrompt = null;
          hideBanner('pwaInstallBanner');
        });
      });
    }

    if (dismissInstall) {
      dismissInstall.addEventListener('click', function () {
        localStorage.setItem(DISMISS_INSTALL_KEY, '1');
        hideBanner('pwaInstallBanner');
      });
    }

    if (isIOS() && iosBanner && !localStorage.getItem(DISMISS_IOS_KEY)) {
      showBanner('pwaIosInstallBanner');
    }

    if (dismissIos) {
      dismissIos.addEventListener('click', function () {
        localStorage.setItem(DISMISS_IOS_KEY, '1');
        hideBanner('pwaIosInstallBanner');
      });
    }
  }

  function initOnedriveBanner() {
    var banner = document.getElementById('pwaOnedriveBanner');
    var dismiss = document.getElementById('pwaOnedriveDismiss');
    var importBtn = document.getElementById('pwaOnedriveImportBtn');

    if (!banner) return;

    if (dismiss) {
      dismiss.addEventListener('click', function () {
        localStorage.setItem(DISMISS_ONEDRIVE_KEY, '1');
        hideBanner('pwaOnedriveBanner');
      });
    }

    if (importBtn) {
      importBtn.addEventListener('click', function () {
        var input = document.getElementById('importFileInput');
        if (input) input.click();
        hideBanner('pwaOnedriveBanner');
        localStorage.setItem(DISMISS_ONEDRIVE_KEY, '1');
      });
    }
  }

  function maybeShowOnedriveBanner() {
    if (localStorage.getItem(DISMISS_ONEDRIVE_KEY)) return;
    if (!App.Storage || !App.Storage.shouldShowOnedriveBanner) return;
    App.Storage.shouldShowOnedriveBanner().then(function (show) {
      if (show) showBanner('pwaOnedriveBanner');
    });
  }

  function init() {
    registerServiceWorker();
    initInstallPrompt();
    initOnedriveBanner();
    document.addEventListener('AppReady', function () {
      maybeShowOnedriveBanner();
    });
  }

  return {
    init: init,
    isStandalone: isStandalone,
    canRegisterServiceWorker: canRegisterServiceWorker
  };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', App.PWA.init);
} else {
  App.PWA.init();
}
