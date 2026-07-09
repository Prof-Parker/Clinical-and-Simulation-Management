/**
 * Scan detailed master calendar docx for cross-cutting events.
 */

var SIM_PATTERN = /G(\d)\s*Simulation\s*(\d)?|Simulation\s*(\d)?/i;
var HOLIDAY_PATTERN = /Labor Day|Thanksgiving|Holiday|BREAK/i;

export function parseDetailedMarkers(cells) {
  var markers = [];
  cells.forEach(function (c, idx) {
    if (/FIRST DAY OF CLASS/i.test(c)) {
      markers.push({ type: 'milestone', title: 'FIRST DAY OF CLASS', index: idx });
    }
    if (HOLIDAY_PATTERN.test(c)) {
      markers.push({ type: 'holiday', title: c, index: idx });
    }
    var sim = c.match(SIM_PATTERN);
    if (sim || (c === 'Simulation' && cells[idx - 1] && /G\d/i.test(cells[idx - 1]))) {
      var groups = c.match(/G\d/g) || [];
      markers.push({
        type: 'simulation',
        title: c,
        groups: groups,
        index: idx
      });
    }
    if (/Orientation/i.test(c) && /SRMC|St E|Cal Vet|Groups/i.test(c)) {
      markers.push({ type: 'orientation', title: c, index: idx });
    }
    if (/assignment due|Kaplan|pretest|quiz/i.test(c)) {
      markers.push({ type: 'assignment', title: c, index: idx });
    }
  });
  return markers;
}

export function distributeMarkersToWeeks(markers, weekDates) {
  var perWeek = {};
  markers.forEach(function (m, i) {
    var wi = Math.min(Math.floor((i / markers.length) * 18), 17);
    if (m.type === 'holiday' && /Labor Day/i.test(m.title)) wi = 2;
    if (m.type === 'holiday' && /Thanksgiving/i.test(m.title)) wi = 14;
    var weekLabel = wi + 1;
    if (!perWeek[weekLabel]) perWeek[weekLabel] = [];
    perWeek[weekLabel].push(m);
  });
  return perWeek;
}

export function markersToEvents(markers, date, weekLabel) {
  return markers.map(function (m, idx) {
    var track = m.type === 'holiday' ? 'holiday' : m.type;
    if (track === 'milestone') track = 'other';
    if (track === 'assignment') track = 'assignment';
    return {
      track: track,
      title: m.title,
      description: m.title,
      allDay: track === 'holiday',
      groups: m.groups || [],
      categories: [m.type],
      linkedSimNum: m.title.match(/Simulation\s*(\d)/i) ? parseInt(RegExp.$1, 10) : null
    };
  });
}
