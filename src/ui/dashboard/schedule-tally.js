/** Master schedule tally footer — keeps the pinned tally table aligned with the body table. */

var tallyScrollSyncing = false;

function getScheduleTallyParts() {
  var bodyScroll = document.getElementById('scheduleBodyScroll');
  var tallyScroll = document.getElementById('scheduleTallyScroll');
  if (!bodyScroll || !tallyScroll) return null;
  return {
    bodyScroll: bodyScroll,
    tallyScroll: tallyScroll,
    bodyTable: bodyScroll.querySelector('table'),
    tallyTable: tallyScroll.querySelector('table'),
    headRow: document.getElementById('scheduleHeadRow')
  };
}

export function syncScheduleTallyScroll() {
  var parts = getScheduleTallyParts();
  if (!parts) return;
  parts.tallyScroll.scrollLeft = parts.bodyScroll.scrollLeft;
}

/** Mirror the body table's column widths onto the tally table so tallies line up under their week. */
export function syncScheduleTallyWidths() {
  var parts = getScheduleTallyParts();
  if (!parts || !parts.bodyTable || !parts.tallyTable || !parts.headRow) return;
  var headCells = parts.headRow.children;
  if (!headCells.length) return;

  var colgroup = parts.tallyTable.querySelector('colgroup');
  if (!colgroup) {
    colgroup = document.createElement('colgroup');
    parts.tallyTable.insertBefore(colgroup, parts.tallyTable.firstChild);
  }
  while (colgroup.children.length > headCells.length) colgroup.removeChild(colgroup.lastChild);
  while (colgroup.children.length < headCells.length) colgroup.appendChild(document.createElement('col'));
  for (var i = 0; i < headCells.length; i++) {
    colgroup.children[i].style.width = headCells[i].getBoundingClientRect().width + 'px';
  }
  parts.tallyTable.style.width = parts.bodyTable.getBoundingClientRect().width + 'px';
  // Match the body scrollbar gutter so right-pinned columns land on the same edge.
  parts.tallyScroll.style.width = parts.bodyScroll.clientWidth + 'px';
}

export function syncScheduleTallyLayout() {
  syncScheduleTallyWidths();
  syncScheduleTallyScroll();
}

export function bindScheduleScrollSync() {
  var parts = getScheduleTallyParts();
  if (!parts || parts.bodyScroll.dataset.scrollBound) return;
  parts.bodyScroll.dataset.scrollBound = '1';
  parts.bodyScroll.addEventListener('scroll', function () {
    if (tallyScrollSyncing) return;
    tallyScrollSyncing = true;
    parts.tallyScroll.scrollLeft = parts.bodyScroll.scrollLeft;
    tallyScrollSyncing = false;
  });
  parts.tallyScroll.addEventListener('scroll', function () {
    if (tallyScrollSyncing) return;
    tallyScrollSyncing = true;
    parts.bodyScroll.scrollLeft = parts.tallyScroll.scrollLeft;
    tallyScrollSyncing = false;
  });
  window.addEventListener('resize', function () {
    syncScheduleTallyLayout();
  });
}
