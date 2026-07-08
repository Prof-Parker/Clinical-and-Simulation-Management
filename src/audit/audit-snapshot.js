/**
 * Audit snapshot data for export.
 */

function sortMakeups(makeups) {
    return (makeups || []).slice().sort(function (a, b) {
      if (a.weekIndex !== b.weekIndex) return a.weekIndex - b.weekIndex;
      var at = a.type || '';
      var bt = b.type || '';
      return at < bt ? -1 : (at > bt ? 1 : 0);
    });
  }

  function canonicalStudent(s) {
    return {
      id: s.id,
      name: s.name,
      clinicalGroup: s.clinicalGroup,
      simGroup: s.simGroup,
      section: s.section || '',
      facilityId: s.facilityId || null,
      orientationWeekIndex: s.orientationWeekIndex != null ? s.orientationWeekIndex : null,
      schedule: s.schedule,
      absences: s.absences || [],
      makeups: sortMakeups(s.makeups)
    };
  }

  /**
   * Pure canonical payload builder (exposed separately so Node tests can
   * assert structure without WebCrypto).
   */
  function buildCanonicalPayload(semester) {
    var clone = JSON.parse(JSON.stringify(semester, function (key, value) {
      if (key === '_simCalendar') return undefined;
      return value;
    }));
    var meta = clone.meta || {};
    var students = (clone.students || []).slice().sort(function (a, b) {
      var an = a.name || '';
      var bn = b.name || '';
      if (an !== bn) return an < bn ? -1 : 1;
      return (a.id || '') < (b.id || '') ? -1 : 1;
    });
    return {
      courseId: meta.courseId || '',
      semesterName: meta.semesterName || '',
      semesterSeason: meta.semesterSeason || '',
      semesterYear: meta.semesterYear || null,
      config: clone.config || {},
      calendar: {
        semesterStartDate: clone.calendar ? clone.calendar.semesterStartDate : null
      },
      holidays: clone.holidays || [],
      orientations: clone.orientations || [],
      sections: clone.sections || [],
      facilities: clone.facilities || [],
      faculty: clone.faculty || [],
      students: students.map(canonicalStudent)
    };
  }

  function toHex(buffer) {
    var bytes = new Uint8Array(buffer);
    var hex = '';
    for (var i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex;
  }

  /** SHA-256 of the canonical payload; resolves to lowercase hex. */
  function computeHash(semester) {
    var json = JSON.stringify(buildCanonicalPayload(semester));
    var data = new TextEncoder().encode(json);
    var subtle = (typeof crypto !== 'undefined' && crypto.subtle) ? crypto.subtle : null;
    if (!subtle) {
      return Promise.reject(new Error('WebCrypto unavailable (requires HTTPS or localhost)'));
    }
    return subtle.digest('SHA-256', data).then(toHex);
  }

export {
  buildCanonicalPayload,
  computeHash
};
