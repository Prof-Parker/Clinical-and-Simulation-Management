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
