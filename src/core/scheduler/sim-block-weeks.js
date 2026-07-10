/**
 * Holiday-aware even/odd week resolution for sim blocks.
 */

import * as CalendarEngine from '../calendar-engine.js';

function nextActiveWeekInStream(weekList, startListIndex, data) {
  for (var j = startListIndex; j < weekList.length; j++) {
    var wi = weekList[j];
    if (wi == null || wi >= 18) continue;
    if (!CalendarEngine.isWeekInactive(data, wi)) {
      return { weekIndex: wi, listIndex: j };
    }
  }
  return null;
}

/**
 * Resolve effective even/odd weeks for one sim block when holidays inactivate nominal weeks.
 */
export function resolveSimBlockWeeks(data, evenWeeks, oddWeeks, blockIndex) {
  var nominalEven = evenWeeks[blockIndex];
  var nominalOdd = oddWeeks[blockIndex];
  var effectiveEven = null;

  if (nominalEven != null && !CalendarEngine.isWeekInactive(data, nominalEven)) {
    effectiveEven = nominalEven;
  } else {
    var nextEvenSlot = nextActiveWeekInStream(evenWeeks, blockIndex + 1, data);
    if (nextEvenSlot && nextEvenSlot.listIndex === blockIndex + 1) {
      effectiveEven = nextEvenSlot.weekIndex;
    } else if (nominalOdd != null && !CalendarEngine.isWeekInactive(data, nominalOdd)) {
      effectiveEven = nominalOdd;
    } else if (nextEvenSlot) {
      effectiveEven = nextEvenSlot.weekIndex;
    }
  }

  var effectiveOdd = null;
  if (nominalOdd != null && !CalendarEngine.isWeekInactive(data, nominalOdd) &&
      nominalOdd !== effectiveEven) {
    effectiveOdd = nominalOdd;
  } else {
    var oddStart = (nominalOdd != null && nominalOdd === effectiveEven) ? blockIndex + 1 : blockIndex;
    var odd = nextActiveWeekInStream(oddWeeks, oddStart, data);
    while (odd && odd.weekIndex === effectiveEven) {
      odd = nextActiveWeekInStream(oddWeeks, odd.listIndex + 1, data);
    }
    effectiveOdd = odd ? odd.weekIndex : null;
  }

  return {
    evenWeekIndex: effectiveEven,
    oddWeekIndex: effectiveOdd,
    nominalEvenWeekIndex: nominalEven != null ? nominalEven : null,
    nominalOddWeekIndex: nominalOdd != null ? nominalOdd : null
  };
}
