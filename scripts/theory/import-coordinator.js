/**
 * Parse coordinator docx for weekSummaries hour rollups.
 */

export function parseCoordinatorWeekSummaries(cells) {
  var summaries = {};
  var currentWeek = null;
  for (var i = 0; i < cells.length; i++) {
    var c = cells[i];
    var weekMatch = c.match(/^WEEK\s*(\d+)$/i);
    if (weekMatch) {
      currentWeek = parseInt(weekMatch[1], 10);
      continue;
    }
    if (!currentWeek) continue;
    var lecInline = c.match(/^Lecture:\s*([\d.]+)/i);
    if (lecInline) {
      if (!summaries[currentWeek]) summaries[currentWeek] = {};
      summaries[currentWeek].lecture = parseFloat(lecInline[1]);
    }
    if (c === 'Lecture:' && cells[i + 1] && /^[\d.]+$/.test(cells[i + 1])) {
      if (!summaries[currentWeek]) summaries[currentWeek] = {};
      summaries[currentWeek].lecture = parseFloat(cells[i + 1]);
    }
    var skInline = c.match(/^Skills lab:\s*([\d.]+)/i);
    if (skInline) {
      if (!summaries[currentWeek]) summaries[currentWeek] = {};
      summaries[currentWeek].skills_lab = parseFloat(skInline[1]);
    }
    if (c === 'Skills lab:' && cells[i + 1] && /^[\d.]+$/.test(cells[i + 1])) {
      if (!summaries[currentWeek]) summaries[currentWeek] = {};
      summaries[currentWeek].skills_lab = parseFloat(cells[i + 1]);
    }
    var clInline = c.match(/^Clinical:\s*([\d.]+)/i);
    if (clInline) {
      if (!summaries[currentWeek]) summaries[currentWeek] = {};
      summaries[currentWeek].clinical = parseFloat(clInline[1]);
    }
    if (c === 'Clinical:' && cells[i + 1] && /^[\d.]+$/.test(cells[i + 1])) {
      if (!summaries[currentWeek]) summaries[currentWeek] = {};
      summaries[currentWeek].clinical = parseFloat(cells[i + 1]);
    }
    var simInline = c.match(/^Simulation:\s*([\d.]+)/i);
    if (simInline) {
      if (!summaries[currentWeek]) summaries[currentWeek] = {};
      summaries[currentWeek].simulation = parseFloat(simInline[1]);
    }
  }
  return summaries;
}

export function parseCoordinatorMarkers(cells) {
  var markers = [];
  var currentWeek = null;
  for (var i = 0; i < cells.length; i++) {
    var c = cells[i];
    var weekMatch = c.match(/^WEEK\s*(\d+)$/i);
    if (weekMatch) currentWeek = parseInt(weekMatch[1], 10);
    if (!currentWeek) continue;
    if (/Orientation/i.test(c)) {
      markers.push({ week: currentWeek, type: 'orientation', text: c });
    }
    if (/REGN15P/i.test(c) && /0800/i.test(c)) {
      markers.push({ week: currentWeek, type: 'skills_block', text: c });
    }
  }
  return markers;
}
