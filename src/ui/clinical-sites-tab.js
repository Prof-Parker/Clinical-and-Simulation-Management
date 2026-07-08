/**
 * Clinical sites library tab.
 */

import * as ClinicalSitesLibraryStorage from '../storage/clinical-sites-library-storage.js';
import * as Permissions from '../auth/permissions.js';
import * as SetupConfig from './setup-config/index.js';
import * as SiteLibrary from '../core/clinical-sites-library.js';
import { getData, getFileRoot } from '../core/state.js';

function renderSiteLibrary() {
    if (SetupConfig.render) {
      SetupConfig.render(getData());
    }
  }

  function renderProposals() {
    var el = document.getElementById('clinicalSitesProposals');
    if (!el) return;
    el.innerHTML = '';
  }

  function render() {
    if (!ClinicalSitesLibraryStorage.isReady()) {
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
        ClinicalSitesLibraryStorage.openFilePicker().then(function () { render(); });
      });
    }
    if (createBtn) {
      createBtn.addEventListener('click', function () {
        ClinicalSitesLibraryStorage.createFilePicker().then(function () { render(); });
      });
    }
    var container = document.getElementById('clinicalSitesTabLibrary');
    if (container) {
      container.addEventListener('click', function (e) {
        if (e.target.closest('.add-site-lib')) {
          if (!Permissions.guard('clinicalSites.edit') && !Permissions.guard('clinicalSites.propose')) return;
          if (SetupConfig.collectIntoData) {
            /* sync before add */
          }
          SiteLibrary.upsertSite({ name: 'New Site', shortName: '', contentTags: ['MS'] });
          ClinicalSitesLibraryStorage.saveCurrent();
          render();
        }
        if (e.target.closest('.remove-site-lib')) {
          if (!Permissions.guard('clinicalSites.edit')) return;
          var btn = e.target.closest('.remove-site-lib');
          var siteId = btn.getAttribute('data-site-id');
          if (SiteLibrary.isSiteReferenced(getFileRoot(), siteId)) return;
          SiteLibrary.removeSite(siteId);
          ClinicalSitesLibraryStorage.saveCurrent();
          render();
        }
      });
      container.addEventListener('change', function () {
        if (SetupConfig && SetupConfig.collectIntoData && getData()) {
          /* site library collected via setup-config collectSiteLibraryFromDom on save */
        }
        if (ClinicalSitesLibraryStorage.isReady()) ClinicalSitesLibraryStorage.saveCurrent();
      });
    }
  }

export {
  init,
  render
};
