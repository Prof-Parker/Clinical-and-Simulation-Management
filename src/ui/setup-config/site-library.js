/** Clinical site library editor in advanced setup. */

import { getData, getFileRoot, notifyChange } from '../../core/state.js';
import { showAlert } from '../dialogs.js';
import * as SiteLibrary from '../../core/clinical-sites-library.js';
import { touchSetupEdit } from './index.js';

function escAttrLocal(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

function siteLibraryRow(site, referenced) {
    var tagsHtml = SiteLibrary.ALLOWED_TAGS.map(function (tag) {
      var checked = site.contentTags.indexOf(tag) >= 0 ? ' checked' : '';
      return '<label class="filter-check site-lib-tag">' +
        '<input type="checkbox" data-site-lib-tag="' + tag + '"' + checked + '> ' + tag + '</label>';
    }).join('');
    var removeHtml = referenced
      ? '<span class="section-sub site-lib-in-use" title="Referenced by a semester facility list">In use</span>'
      : '<button type="button" class="btn btn-icon-remove remove-site-lib" data-site-id="' + site.id + '" aria-label="Remove site" title="Remove site">&times;</button>';
    return '<div class="site-lib-row" data-site-lib-row data-site-id="' + site.id + '">' +
      '<input type="text" data-site-lib="name" value="' + escAttrLocal(site.name) + '" placeholder="Site name" aria-label="Site name">' +
      '<input type="text" data-site-lib="short" value="' + escAttrLocal(site.shortName) + '" placeholder="Short" maxlength="10" aria-label="Short name">' +
      '<span class="site-lib-tags">' + tagsHtml + '</span>' +
      removeHtml +
      '</div>';
  }

function siteLibraryContainer() {
    return document.getElementById('clinicalSitesTabLibrary') ||
      document.getElementById('cfgSiteLibrary');
  }

function renderSiteLibrary() {
    var container = siteLibraryContainer();
    if (!container || !SiteLibrary) return;
    var fileRoot = getFileRoot();
    var rowsHtml = SiteLibrary.list().map(function (site) {
      return siteLibraryRow(site, SiteLibrary.isSiteReferenced(fileRoot, site.id));
    }).join('');
    container.innerHTML = rowsHtml +
      '<div class="config-list-add-row">' +
      '<button type="button" class="btn btn-sm add-site-lib">Add site</button>' +
      '</div>';
  }

function collectSiteLibraryFromDom() {
    var container = siteLibraryContainer();
    if (!container || !SiteLibrary) return;
    var rows = container.querySelectorAll('[data-site-lib-row]');
    if (!rows.length) return;
    var sites = [];
    rows.forEach(function (row) {
      var tags = [];
      row.querySelectorAll('[data-site-lib-tag]').forEach(function (cb) {
        if (cb.checked) tags.push(cb.getAttribute('data-site-lib-tag'));
      });
      sites.push({
        id: row.getAttribute('data-site-id'),
        name: row.querySelector('[data-site-lib="name"]').value,
        shortName: row.querySelector('[data-site-lib="short"]').value,
        contentTags: tags
      });
    });
    SiteLibrary.replaceAll(sites);
  }

export {
  siteLibraryRow,
  renderSiteLibrary,
  collectSiteLibraryFromDom,
  siteLibraryContainer
};
