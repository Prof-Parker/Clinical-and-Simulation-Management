/**
 * Even capacity splits and fewest-groups scoring for Week 17 clinical makeups.
 */

export function makeupGroupsNeeded(studentCount, maxPerGroup) {
  var n = studentCount | 0;
  var max = maxPerGroup | 0;
  if (n <= 0) return 0;
  if (max <= 0) return n;
  return Math.ceil(n / max);
}

/**
 * Even split sizes of n students into the fewest groups of size <= maxPerGroup.
 * Example: n=10, max=6 → [5, 5]
 */
export function evenSplitSizes(studentCount, maxPerGroup) {
  var n = studentCount | 0;
  var max = maxPerGroup | 0;
  if (n <= 0) return [];
  if (max <= 0) return Array(n).fill(1);
  var groups = Math.ceil(n / max);
  var base = Math.floor(n / groups);
  var rem = n % groups;
  var sizes = [];
  for (var i = 0; i < groups; i++) {
    sizes.push(i < rem ? base + 1 : base);
  }
  return sizes;
}

export function totalGroupsForBuckets(bucketCounts, maxPerGroup) {
  var total = 0;
  (bucketCounts || []).forEach(function (count) {
    total += makeupGroupsNeeded(count, maxPerGroup);
  });
  return total;
}

/**
 * Pack students into session slots with even sizes. Returns array of
 * { hostKey, studentIds, size, overload }.
 */
export function packStudentsIntoSessions(studentIds, maxPerGroup, hostKeys, overloadCap) {
  var ids = (studentIds || []).slice();
  var max = maxPerGroup | 0;
  if (!ids.length) return [];
  var sizes = evenSplitSizes(ids.length, max);
  var hosts = (hostKeys && hostKeys.length) ? hostKeys.slice() : [];
  while (hosts.length < sizes.length) {
    hosts.push('MK' + (hosts.length + 1));
  }
  var sessions = [];
  var offset = 0;
  for (var i = 0; i < sizes.length; i++) {
    var size = sizes[i];
    var slice = ids.slice(offset, offset + size);
    offset += size;
    var overload = max > 0 && size > max;
    if (overload && overloadCap > 0 && size > overloadCap) {
      // Caller should have prevented this; mark for visibility.
      overload = true;
    }
    sessions.push({
      hostKey: hosts[i],
      studentIds: slice,
      size: slice.length,
      overload: overload || (max > 0 && slice.length > max)
    });
  }
  return sessions;
}

export function compareOutcomeRank(a, b) {
  if (a.totalMakeupGroups !== b.totalMakeupGroups) {
    return a.totalMakeupGroups - b.totalMakeupGroups;
  }
  if (a.unscheduledCount !== b.unscheduledCount) {
    return a.unscheduledCount - b.unscheduledCount;
  }
  if (a.conflictNotesCount !== b.conflictNotesCount) {
    return a.conflictNotesCount - b.conflictNotesCount;
  }
  if (!!b.preferredSiteMatch !== !!a.preferredSiteMatch) {
    return a.preferredSiteMatch ? -1 : 1;
  }
  return String(a.id || '').localeCompare(String(b.id || ''));
}
