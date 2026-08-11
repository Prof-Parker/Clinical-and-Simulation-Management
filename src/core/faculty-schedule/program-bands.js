/**
 * Program-semester bands for faculty schedule weekly grouping.
 */

var BANDS = [
  { id: 1, label: '1st semester', match: /^(REGN)?\s*15/i },
  { id: 2, label: '2nd semester', match: /^(REGN)?\s*25/i },
  { id: 3, label: '3rd semester', match: /^(REGN)?\s*3[56]/i },
  { id: 4, label: '4th semester', match: /^(REGN)?\s*48/i }
];

function courseBand(courseId) {
  var code = String(courseId || '').trim();
  for (var i = 0; i < BANDS.length; i++) {
    if (BANDS[i].match.test(code)) return BANDS[i];
  }
  return { id: 0, label: 'Other', match: null };
}

function listBands() {
  return BANDS.map(function (b) {
    return { id: b.id, label: b.label };
  });
}

export {
  BANDS,
  courseBand,
  listBands
};
