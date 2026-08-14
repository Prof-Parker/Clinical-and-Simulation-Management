/**
 * Pure semester window helpers for the header picker (no DOM).
 */

var FILE_RE = /^(F|S)(\d{4})_(.+)\.json$/i;

export function parseSemesterFileName(fileName) {
  var m = String(fileName || '').match(FILE_RE);
  if (!m) return null;
  return {
    fileName: fileName,
    season: m[1].toUpperCase() === 'F' ? 'fall' : 'spring',
    year: parseInt(m[2], 10),
    courseId: m[3]
  };
}

export function isProgramSemesterFile(parsed) {
  return /_program$/i.test(String(parsed && parsed.courseId || ''));
}

export function pickBestSemesterFile(files, season, year, courseId) {
  var matches = (files || []).filter(function (f) {
    return f && f.season === season && f.year === year;
  });
  if (!matches.length) return null;
  var program = matches.find(isProgramSemesterFile);
  if (program) return program;
  if (courseId) {
    var exact = matches.find(function (f) {
      return String(f.courseId).toLowerCase() === String(courseId).toLowerCase();
    });
    if (exact) return exact;
  }
  return matches[0];
}

export function offsetSemester(season, year, delta) {
  var s = season === 'fall' ? 'fall' : 'spring';
  var y = parseInt(year, 10);
  var step = delta > 0 ? 1 : -1;
  for (var i = 0; i < Math.abs(delta); i++) {
    if (step > 0) {
      if (s === 'spring') s = 'fall';
      else { s = 'spring'; y += 1; }
    } else if (s === 'fall') {
      s = 'spring';
    } else {
      s = 'fall';
      y -= 1;
    }
  }
  return { season: s, year: y };
}

export function neighborSemesters(season, year, radius) {
  var r = radius == null ? 2 : radius;
  var list = [];
  for (var d = -r; d <= r; d++) {
    if (d === 0) continue;
    list.push(offsetSemester(season, year, d));
  }
  return list;
}
