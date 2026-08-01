/**
 * Multi-pass thin-sim consolidator: compare evacuate / fill candidates and
 * apply the outcome with fewest under-absolute sessions. Explicit UI only.
 */

import {
  scoreThinOutcome,
  cloneThinWorkspace,
  applySchedulesFromClone,
  thinSessions,
  ensureSimCalendar,
  getSimPracticalMinLoad,
  getSimIdealMinLoad
} from './sim-thin-shared.js';
import { runEvacuateThinPass } from './sim-thin-evacuate.js';
import { runFillIdealPass } from './sim-thin-fill.js';

var CANDIDATE_ORDER = [
  'baseline',
  'evacuate',
  'fill',
  'evacuateThenFill',
  'fillThenEvacuate'
];

function mergePassNotes(into, pass, label) {
  (pass.notes || []).forEach(function (n) {
    if (into.length >= 12) return;
    into.push('[' + label + '] ' + n);
  });
}

function runCandidate(clone, id) {
  var notes = [];
  var moved = 0;
  var skipped = 0;
  var a;
  var b;

  if (id === 'baseline') {
    return { id: id, moved: 0, skipped: 0, notes: [], score: scoreThinOutcome(clone) };
  }
  if (id === 'evacuate') {
    a = runEvacuateThinPass(clone);
    moved = a.moved;
    skipped = a.skipped;
    mergePassNotes(notes, a, 'evacuate');
  } else if (id === 'fill') {
    a = runFillIdealPass(clone);
    moved = a.moved;
    skipped = a.skipped;
    mergePassNotes(notes, a, 'fill');
  } else if (id === 'evacuateThenFill') {
    a = runEvacuateThinPass(clone);
    b = runFillIdealPass(clone);
    moved = a.moved + b.moved;
    skipped = a.skipped + b.skipped;
    mergePassNotes(notes, a, 'evacuate');
    mergePassNotes(notes, b, 'fill');
  } else if (id === 'fillThenEvacuate') {
    a = runFillIdealPass(clone);
    b = runEvacuateThinPass(clone);
    moved = a.moved + b.moved;
    skipped = a.skipped + b.skipped;
    mergePassNotes(notes, a, 'fill');
    mergePassNotes(notes, b, 'evacuate');
  }

  return {
    id: id,
    moved: moved,
    skipped: skipped,
    notes: notes,
    score: scoreThinOutcome(clone)
  };
}

function compareCandidates(a, b) {
  if (a.score.nAbs !== b.score.nAbs) return a.score.nAbs - b.score.nAbs;
  if (a.score.nIdeal !== b.score.nIdeal) return a.score.nIdeal - b.score.nIdeal;
  if (a.score.absDeficit !== b.score.absDeficit) {
    return a.score.absDeficit - b.score.absDeficit;
  }
  if (a.moved !== b.moved) return a.moved - b.moved;
  return CANDIDATE_ORDER.indexOf(a.id) - CANDIDATE_ORDER.indexOf(b.id);
}

/**
 * Compare evacuate / fill / sequenced passes; apply the best schedule to data.
 */
export function consolidateThinSimSessions(data) {
  if (!data || !data.students || !data.students.length) {
    return {
      winner: 'baseline',
      moved: 0,
      skipped: 0,
      notes: [],
      thinBefore: 0,
      thinAfter: 0,
      idealBefore: 0,
      idealAfter: 0,
      candidates: []
    };
  }

  ensureSimCalendar(data);
  var beforeScore = scoreThinOutcome(data);
  var thinBefore = beforeScore.nAbs;
  var idealBefore = beforeScore.nIdeal;

  var results = [];
  var clones = {};
  CANDIDATE_ORDER.forEach(function (id) {
    var clone = cloneThinWorkspace(data);
    ensureSimCalendar(clone);
    var result = runCandidate(clone, id);
    clones[id] = clone;
    results.push(result);
  });

  results.sort(compareCandidates);
  var winner = results[0];
  if (winner.id !== 'baseline') {
    applySchedulesFromClone(data, clones[winner.id]);
    ensureSimCalendar(data);
  }

  var afterScore = scoreThinOutcome(data);
  var notes = winner.notes.slice(0, 8);
  notes.unshift('Winner: ' + winner.id);

  return {
    winner: winner.id,
    moved: winner.moved,
    skipped: winner.skipped,
    notes: notes,
    thinBefore: thinBefore,
    thinAfter: afterScore.nAbs,
    idealBefore: idealBefore,
    idealAfter: afterScore.nIdeal,
    candidates: results.map(function (r) {
      return {
        id: r.id,
        nAbs: r.score.nAbs,
        nIdeal: r.score.nIdeal,
        absDeficit: r.score.absDeficit,
        moved: r.moved
      };
    })
  };
}

export {
  getSimPracticalMinLoad,
  getSimIdealMinLoad,
  thinSessions,
  scoreThinOutcome,
  runEvacuateThinPass,
  runFillIdealPass
};
