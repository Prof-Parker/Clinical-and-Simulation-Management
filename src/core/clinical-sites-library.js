/**
 * Program-wide clinical site library.
 */

import { getFileRoot } from './state.js';

var ALLOWED_TAGS = ['MS', 'OB', 'PEDS', 'MH'];
  var standaloneOverlay = null;

  var SEED_SITES = [
    { id: 'site_srmc', name: 'Shasta Regional Medical Center', shortName: 'SRMC', contentTags: ['MS'] },
    { id: 'site_stel', name: 'Saint Elizabeth', shortName: 'StE', contentTags: ['MS'] }
  ];

  // Mirrors DataModel.normalizeFacilityName (kept local: this module loads
  // before data-model.js).
  function normalizeName(name) {
    return String(name || '')
      .trim()
      .toLowerCase()
      .replace(/['']/g, '')
      .replace(/\s+/g, ' ');
  }

  // Spec §4.2: missing/empty -> ["MS"]; drop unknown; dedupe; stable order.
  function normalizeTags(tags) {
    if (!Array.isArray(tags)) tags = [];
    var seen = {};
    var cleaned = [];
    tags.forEach(function (t) {
      var tag = String(t || '').trim().toUpperCase();
      if (ALLOWED_TAGS.indexOf(tag) < 0 || seen[tag]) return;
      seen[tag] = true;
      cleaned.push(tag);
    });
    if (!cleaned.length) return ['MS'];
    cleaned.sort(function (a, b) {
      return ALLOWED_TAGS.indexOf(a) - ALLOWED_TAGS.indexOf(b);
    });
    return cleaned;
  }

  function normalizeSite(site) {
    return {
      id: site.id,
      name: String(site.name || '').trim() || 'Unnamed site',
      shortName: String(site.shortName || '').trim(),
      contentTags: normalizeTags(site.contentTags)
    };
  }

  function setStandaloneOverlay(root) {
    standaloneOverlay = root && Array.isArray(root.sites) ? root : null;
  }

  function getStandaloneOverlay() {
    return standaloneOverlay;
  }

  function getOverlay() {
    if (standaloneOverlay) return standaloneOverlay;
    if (typeof getFileRoot !== 'function') return null;
    var fileRoot;
    try { fileRoot = getFileRoot(); } catch (e) { return null; }
    if (!fileRoot || !fileRoot.meta || !fileRoot.meta.siteLibrary) return null;
    var lib = fileRoot.meta.siteLibrary;
    return Array.isArray(lib.sites) ? lib : null;
  }

  function list() {
    var overlay = getOverlay();
    var sites = overlay ? overlay.sites : SEED_SITES;
    return sites.map(normalizeSite);
  }

  function getById(id) {
    if (!id) return null;
    return list().find(function (s) { return s.id === id; }) || null;
  }

  function matchByName(name) {
    var key = normalizeName(name);
    if (!key) return null;
    return list().find(function (s) { return normalizeName(s.name) === key; }) || null;
  }

  function uid() {
    return 'site_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  /** Copy the effective library into standalone or fileRoot overlay so edits persist. */
  function ensureEditable() {
    if (standaloneOverlay) return standaloneOverlay;
    if (typeof getFileRoot !== 'function') return null;
    var fileRoot = getFileRoot();
    if (!fileRoot) return null;
    if (!fileRoot.meta) fileRoot.meta = {};
    if (!fileRoot.meta.siteLibrary || !Array.isArray(fileRoot.meta.siteLibrary.sites)) {
      fileRoot.meta.siteLibrary = {
        meta: { version: 1 },
        sites: SEED_SITES.map(normalizeSite)
      };
    }
    return fileRoot.meta.siteLibrary;
  }

  function upsertSite(site) {
    var lib = ensureEditable();
    if (!lib) return null;
    if (!site.id) site.id = uid();
    var normalized = normalizeSite(site);
    var idx = lib.sites.findIndex(function (s) { return s.id === normalized.id; });
    if (idx >= 0) lib.sites[idx] = normalized;
    else lib.sites.push(normalized);
    return normalized;
  }

  function removeSite(id) {
    var lib = ensureEditable();
    if (!lib) return false;
    var before = lib.sites.length;
    lib.sites = lib.sites.filter(function (s) { return s.id !== id; });
    return lib.sites.length < before;
  }

  /** Replace the whole editable library (used by the Advanced Config editor). */
  function replaceAll(sites) {
    var lib = ensureEditable();
    if (!lib) return;
    lib.sites = (sites || []).map(function (s) {
      if (!s.id) s.id = uid();
      return normalizeSite(s);
    });
  }

  /** True when any semester facility references this library site. */
  function isSiteReferenced(fileRoot, siteId) {
    if (!fileRoot || !fileRoot.semesters) return false;
    var site = getById(siteId);
    var key = site ? normalizeName(site.name) : null;
    return fileRoot.semesters.some(function (sem) {
      return (sem.facilities || []).some(function (f) {
        if (f.siteId === siteId) return true;
        return key !== null && normalizeName(f.name) === key;
      });
    });
  }

export {
  ALLOWED_TAGS,
  normalizeTags,
  normalizeName,
  list,
  getById,
  matchByName,
  upsertSite,
  removeSite,
  replaceAll,
  isSiteReferenced,
  setStandaloneOverlay,
  getStandaloneOverlay,
  uid
};
