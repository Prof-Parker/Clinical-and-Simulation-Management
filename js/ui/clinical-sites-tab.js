/* global App */
var App = App || {};
App.UI = App.UI || {};

App.UI.ClinicalSitesTab = (function () {
  function renderSiteLibrary() {
    if (App.UI.SetupConfig && App.UI.SetupConfig.render) {
      App.UI.SetupConfig.render(App.getData());
    }
  }

  function renderProposals() {
    var el = document.getElementById('clinicalSitesProposals');
    if (!el) return;
    el.innerHTML = '';
  }

  function render() {
    if (!App.ClinicalSitesLibraryStorage.isReady()) {
      var panel = document.getElementById('clinicalSitesConnectPrompt');
      if (panel) panel.classList.remove('hidden');
    } else {
      var panel = document.getElementById('clinicalSitesConnectPrompt');
      if (panel) panel.classList.add('hidden');
    }
    renderSiteLibrary();
    renderProposals();
  }

  function init() {
    var connectBtn = document.getElementById('clinicalSitesConnectBtn');
    var createBtn = document.getElementById('clinicalSitesCreateBtn');
    if (connectBtn) {
      connectBtn.addEventListener('click', function () {
        App.ClinicalSitesLibraryStorage.openFilePicker().then(function () { render(); });
      });
    }
    if (createBtn) {
      createBtn.addEventListener('click', function () {
        App.ClinicalSitesLibraryStorage.createFilePicker().then(function () { render(); });
      });
    }
    var container = document.getElementById('clinicalSitesTabLibrary');
    if (container) {
      container.addEventListener('click', function (e) {
        if (e.target.closest('.add-site-lib')) {
          if (!App.Permissions.guard('clinicalSites.edit') && !App.Permissions.guard('clinicalSites.propose')) return;
          if (App.UI.SetupConfig && App.UI.SetupConfig.collectIntoData) {
            /* sync before add */
          }
          App.SiteLibrary.upsertSite({ name: 'New Site', shortName: '', contentTags: ['MS'] });
          App.ClinicalSitesLibraryStorage.saveCurrent();
          render();
        }
        if (e.target.closest('.remove-site-lib')) {
          if (!App.Permissions.guard('clinicalSites.edit')) return;
          var btn = e.target.closest('.remove-site-lib');
          var siteId = btn.getAttribute('data-site-id');
          if (App.SiteLibrary.isSiteReferenced(App.getFileRoot(), siteId)) return;
          App.SiteLibrary.removeSite(siteId);
          App.ClinicalSitesLibraryStorage.saveCurrent();
          render();
        }
      });
      container.addEventListener('change', function () {
        if (App.UI.SetupConfig && App.UI.SetupConfig.collectIntoData && App.getData()) {
          /* site library collected via setup-config collectSiteLibraryFromDom on save */
        }
        if (App.ClinicalSitesLibraryStorage.isReady()) App.ClinicalSitesLibraryStorage.saveCurrent();
      });
    }
  }

  return { init: init, render: render };
})();
