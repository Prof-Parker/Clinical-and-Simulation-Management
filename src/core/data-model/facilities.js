/**
 * Clinical facility records, site matching, and group-facility migration.
 */

import { uid } from './students.js';
import { CLINICAL_GROUPS, normalizeConfig } from './config.js';
import { getById, matchByName, normalizeTags } from '../clinical-sites-library.js';

var DEFAULT_CLINICAL_GROUP_SITE = {
  C1: 'Shasta Regional Medical Center',
  C2: 'Shasta Regional Medical Center',
  C3: 'Shasta Regional Medical Center',
  C4: 'Saint Elizabeth',
  C5: 'Saint Elizabeth'
};

export function defaultFacilities() {
  return [
    { id: uid(), name: 'Shasta Regional Medical Center' },
    { id: uid(), name: 'Saint Elizabeth' }
  ];
}

export function facilityIdByName(facilities, name) {
  var key = normalizeFacilityName(name);
  var match = facilities.find(function (f) {
    return normalizeFacilityName(f.name) === key;
  });
  return match ? match.id : (facilities[0] && facilities[0].id);
}

export function getDefaultFacilityIdForClinicalGroup(clinicalGroup, facilities) {
  var siteName = DEFAULT_CLINICAL_GROUP_SITE[clinicalGroup];
  if (siteName) return facilityIdByName(facilities, siteName);
  return facilities[0] && facilities[0].id;
}

export function buildDefaultClinicalGroupFacilities(clinicalGroups, facilities) {
  var map = {};
  (clinicalGroups || CLINICAL_GROUPS).forEach(function (g) {
    var facId = getDefaultFacilityIdForClinicalGroup(g, facilities);
    map[g] = facId ? [facId] : [];
  });
  return map;
}

export function majorityFacilityIdForCohort(students, data) {
  if (!students || !students.length) return null;
  var counts = {};
  students.forEach(function (s) {
    if (!s.facilityId) return;
    var canon = data && data.facilities
      ? getCanonicalFacilityId(data, s.facilityId)
      : s.facilityId;
    counts[canon] = (counts[canon] || 0) + 1;
  });
  var best = null;
  var bestN = 0;
  Object.keys(counts).forEach(function (id) {
    if (counts[id] > bestN) {
      bestN = counts[id];
      best = id;
    }
  });
  if (best) return best;
  if (students[0].facilityId) {
    return data && data.facilities
      ? getCanonicalFacilityId(data, students[0].facilityId)
      : students[0].facilityId;
  }
  return null;
}

export function migrateClinicalGroupFacilities(semester) {
  if (!semester || !semester.config) return;
  normalizeConfig(semester.config);
  var cfg = semester.config;
  var facilities = semester.facilities || [];
  if (!cfg.clinicalGroupFacilities) cfg.clinicalGroupFacilities = {};
  cfg.clinicalGroups.forEach(function (g) {
    var list = cfg.clinicalGroupFacilities[g];
    if (!list || !list.length) {
      var cohort = (semester.students || []).filter(function (s) {
        return s.clinicalGroup === g;
      });
      var facId = majorityFacilityIdForCohort(cohort, semester);
      if (!facId) facId = getDefaultFacilityIdForClinicalGroup(g, facilities);
      cfg.clinicalGroupFacilities[g] = facId ? [facId] : [];
    }
    var seen = {};
    cfg.clinicalGroupFacilities[g] = (cfg.clinicalGroupFacilities[g] || []).map(function (id) {
      return getCanonicalFacilityId(semester, id);
    }).filter(function (id) {
      if (!id || !findFacilityById(semester, id)) return false;
      if (seen[id]) return false;
      seen[id] = true;
      return true;
    });
    if (!cfg.clinicalGroupFacilities[g].length) {
      var fallback = getDefaultFacilityIdForClinicalGroup(g, facilities);
      if (fallback) cfg.clinicalGroupFacilities[g] = [fallback];
    }
  });
  Object.keys(cfg.clinicalGroupFacilities).forEach(function (key) {
    if (cfg.clinicalGroups.indexOf(key) < 0) delete cfg.clinicalGroupFacilities[key];
  });
  if (!cfg.clinicalGroupSiteWeeks) cfg.clinicalGroupSiteWeeks = {};
  Object.keys(cfg.clinicalGroupSiteWeeks).forEach(function (key) {
    if (cfg.clinicalGroups.indexOf(key) < 0) delete cfg.clinicalGroupSiteWeeks[key];
  });
}

export function normalizeFacilityName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/\s+/g, ' ');
}

export function findFacilityById(data, facilityId) {
  if (!data || !data.facilities || !facilityId) return null;
  return data.facilities.find(function (f) { return f.id === facilityId; }) || null;
}

export function getCanonicalFacilityId(data, facilityId) {
  var fac = findFacilityById(data, facilityId);
  if (!fac) return facilityId;
  var key = normalizeFacilityName(fac.name);
  if (!key) return facilityId;
  var match = data.facilities.find(function (f) {
    return normalizeFacilityName(f.name) === key;
  });
  return match ? match.id : facilityId;
}

export function sameFacilitySite(data, facilityIdA, facilityIdB) {
  if (!facilityIdA || !facilityIdB) return false;
  if (facilityIdA === facilityIdB) return true;
  var a = findFacilityById(data, facilityIdA);
  var b = findFacilityById(data, facilityIdB);
  if (!a || !b) return false;
  return normalizeFacilityName(a.name) === normalizeFacilityName(b.name);
}

export function studentAtFacilitySite(data, student, facilityId) {
  if (!student || !facilityId) return false;
  return sameFacilitySite(data, student.facilityId, facilityId);
}

export function getUniqueFacilitiesForSelect(data) {
  var seen = {};
  var list = [];
  (data.facilities || []).forEach(function (f) {
    var key = normalizeFacilityName(f.name);
    if (!key) key = f.id;
    if (seen[key]) return;
    seen[key] = true;
    list.push(f);
  });
  return list;
}

// Match semester facilities to the program site library (spec §4.2):
// resolve siteId by id or normalized name, copy shortName/contentTags,
// and default contentTags to ["MS"] for backward compatibility.
export function linkFacilitiesToSiteLibrary(facilities) {
  (facilities || []).forEach(function (f) {
    try {
      var site = (f.siteId && getById(f.siteId)) ||
        matchByName(f.name);
      if (site) {
        f.siteId = site.id;
        if (!f.shortName) f.shortName = site.shortName;
        if (!f.contentTags || !f.contentTags.length) f.contentTags = site.contentTags.slice();
      }
      f.contentTags = normalizeTags(f.contentTags);
    } catch (e) {
      if (!f.contentTags || !f.contentTags.length) {
        f.contentTags = ['MS'];
      }
    }
    if (f.siteId === undefined) f.siteId = null;
    if (f.shortName === undefined) f.shortName = '';
  });
}

export function normalizeFacilities(semester) {
  if (!semester.facilities || !semester.facilities.length) {
    semester.facilities = defaultFacilities();
    linkFacilitiesToSiteLibrary(semester.facilities);
    return;
  }
  var canonical = {};
  var idRemap = {};
  semester.facilities.forEach(function (f) {
    if (!f.id) f.id = uid();
    var name = String(f.name || '').trim() || 'Unnamed facility';
    var key = normalizeFacilityName(name);
    if (!key) key = f.id;
    if (!canonical[key]) {
      canonical[key] = {
        id: f.id,
        name: name,
        siteId: f.siteId || null,
        shortName: f.shortName || '',
        contentTags: f.contentTags
      };
    } else {
      idRemap[f.id] = canonical[key].id;
      if (name.length > canonical[key].name.length) canonical[key].name = name;
      if (!canonical[key].siteId && f.siteId) canonical[key].siteId = f.siteId;
      if (!canonical[key].shortName && f.shortName) canonical[key].shortName = f.shortName;
      if ((!canonical[key].contentTags || !canonical[key].contentTags.length) && f.contentTags) {
        canonical[key].contentTags = f.contentTags;
      }
    }
  });
  semester.facilities = Object.keys(canonical).map(function (k) { return canonical[k]; });
  linkFacilitiesToSiteLibrary(semester.facilities);
  function remapId(id) {
    if (!id) return id;
    while (idRemap[id]) id = idRemap[id];
    return id;
  }
  (semester.students || []).forEach(function (s) {
    if (s.facilityId) s.facilityId = remapId(s.facilityId);
    (s.makeups || []).forEach(function (m) {
      if (m.facilityId) m.facilityId = remapId(m.facilityId);
    });
    (s.schedule || []).forEach(function (c) {
      if (c && c.facilityId) c.facilityId = remapId(c.facilityId);
    });
  });
  if (semester.config && semester.config.clinicalGroupFacilities) {
    Object.keys(semester.config.clinicalGroupFacilities).forEach(function (g) {
      semester.config.clinicalGroupFacilities[g] =
        (semester.config.clinicalGroupFacilities[g] || []).map(remapId).filter(function (id) {
          return id && semester.facilities.some(function (f) { return f.id === id; });
        });
    });
  }
  if (semester.config && semester.config.clinicalGroupSiteWeeks) {
    Object.keys(semester.config.clinicalGroupSiteWeeks).forEach(function (g) {
      semester.config.clinicalGroupSiteWeeks[g] =
        (semester.config.clinicalGroupSiteWeeks[g] || []).map(function (r) {
          if (!r) return r;
          return {
            facilityId: remapId(r.facilityId),
            startWeekIndex: r.startWeekIndex,
            endWeekIndex: r.endWeekIndex
          };
        }).filter(function (r) {
          return r && r.facilityId && semester.facilities.some(function (f) { return f.id === r.facilityId; });
        });
    });
  }
  (semester.orientations || []).forEach(function (o) {
    if (o && o.facilityId) o.facilityId = remapId(o.facilityId);
  });
}
