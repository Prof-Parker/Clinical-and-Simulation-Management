/**
 * Theory-calendar clinical events: one faculty signup per clinical group
 * covering that group's dates for the term (e.g. C2 weeks 1–8, C4 weeks 9–17).
 */

function primaryClinicalGroup(ev) {
  if (!ev) return '';
  if (Array.isArray(ev.groups) && ev.groups.length) {
    return String(ev.groups[0] || '').trim();
  }
  return String(ev.clinicalGroup || '').trim();
}

function clinicalSeriesKey(opts) {
  opts = opts || {};
  var group = String(opts.clinicalGroup || '').trim() || 'group';
  var course = String(opts.courseCode || '').trim();
  return ['clinical', 'recurring', course, group].join('|');
}

function clinicalSeriesLabel(clinicalGroup, siteLabel) {
  var g = String(clinicalGroup || '').trim();
  var site = String(siteLabel || '').trim();
  if (g && site) return site + ' Clinical ' + g;
  if (g) return 'Clinical ' + g;
  if (site) return site + ' Clinical';
  return 'Clinical';
}

export {
  primaryClinicalGroup,
  clinicalSeriesKey,
  clinicalSeriesLabel
};
