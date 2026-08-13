/**
 * Semester options for the header context-pop select.
 */

import { state, getData } from '../core/state.js';
import * as ProgramData from '../storage/program-data.js';
import {
  useClassicSemesterPicker,
  currentParts,
  preferredCourseId,
  pickBestFile,
  findInFileSemester,
  listInFileOptions,
  switchToTarget,
  parseSemesterFileName,
  neighborSemesters
} from './semester-picker.js';

/**
 * @returns {Promise<Array<{ value: string, label: string, current: boolean }>>}
 */
export function listSemesterSelectOptions() {
  function toOptions(raw) {
    return raw.map(function (opt) {
      var seasonLabel = opt.season === 'fall' ? 'Fall' : 'Spring';
      var value = [opt.season, opt.year, opt.fileName || '', opt.semesterId || ''].join('|');
      return {
        value: value,
        label: seasonLabel + ' ' + opt.year + (opt.current ? ' (current)' : ''),
        current: !!opt.current
      };
    });
  }

  function classicOptions() {
    var parts = currentParts();
    if (!parts || !parts.season || !parts.year) return [];
    var options = listInFileOptions(parts);
    if (!options.length) {
      options.push({
        season: parts.season,
        year: parseInt(parts.year, 10),
        fileName: state.fileName || null,
        semesterId: getData() && getData().id,
        finalized: parts.finalized,
        current: true
      });
    }
    options.sort(function (a, b) {
      if (a.year !== b.year) return a.year - b.year;
      if (a.season === b.season) return 0;
      return a.season === 'spring' ? -1 : 1;
    });
    return toOptions(options);
  }

  if (useClassicSemesterPicker()) {
    return Promise.resolve(classicOptions());
  }
  return ProgramData.listSemesterFiles().then(function (names) {
    var files = names.map(parseSemesterFileName).filter(Boolean);
    var parts = currentParts();
    if (!parts || !parts.season || !parts.year) return classicOptions();
    var courseId = preferredCourseId();
    var year = parseInt(parts.year, 10);
    var neighbors = neighborSemesters(parts.season, year, 2);
    var options = neighbors.map(function (n) {
      var file = pickBestFile(files, n.season, n.year, courseId);
      var inFile = findInFileSemester(n.season, n.year);
      return {
        season: n.season,
        year: n.year,
        fileName: file ? file.fileName : null,
        semesterId: inFile ? inFile.id : null,
        finalized: inFile ? !!(inFile.meta && inFile.meta.finalized) : true,
        current: false
      };
    }).filter(function (opt) {
      return !!(opt.fileName || opt.semesterId);
    });
    options.push({
      season: parts.season,
      year: year,
      fileName: state.fileName || null,
      semesterId: getData() && getData().id,
      finalized: parts.finalized,
      current: true
    });
    options.sort(function (a, b) {
      if (a.year !== b.year) return a.year - b.year;
      if (a.season === b.season) return 0;
      return a.season === 'spring' ? -1 : 1;
    });
    return toOptions(options);
  }).catch(function () {
    return classicOptions();
  });
}

export function applySemesterSelectValue(value) {
  if (!value) return;
  var parts = String(value).split('|');
  var season = parts[0];
  var year = parseInt(parts[1], 10);
  var fileName = parts[2] || null;
  var semesterId = parts[3] || null;
  if (!season || !year) return;
  var cur = currentParts();
  if (cur && cur.season === season && String(cur.year) === String(year) &&
      (!semesterId || (getData() && getData().id === semesterId))) {
    return;
  }
  switchToTarget({
    season: season,
    year: year,
    fileName: fileName,
    semesterId: semesterId
  });
}
