/**
 * Event-editor helpers for creating library topics/skills from the day modal.
 */

import * as TheoryData from '../../core/theory-data.js';
import * as TheoryLibrary from '../../storage/theory-library-storage.js';
import { getData } from '../../core/state.js';
import {
  requireLibraryUnlock,
  isLibraryUnlocked,
  openTopicEditor,
  openSkillEditor
} from './content-library.js';

export function openNewTopicFlow(data, day, editingEventId, saveFormSoft, reopenEditor) {
  saveFormSoft(data, day);
  var eventId = editingEventId;
  var date = day.date;
  var launch = function () {
    openTopicEditor(null, {
      onSaved: function (topic) {
        var live = getData();
        if (!live || !live.theory || !topic || !topic.id) return;
        var liveDay = TheoryData.findDay(live.theory, date);
        if (!liveDay) return;
        var ev = (liveDay.events || []).find(function (e) { return e.id === eventId; });
        if (ev) {
          ev.moduleRef = topic.id;
          ev.moduleRefs = [topic.id];
          ev.title = topic.title;
        }
        reopenEditor(live, date, eventId);
      }
    });
  };
  if (isLibraryUnlocked()) launch();
  else requireLibraryUnlock(launch);
}

export function openNewSkillFlow(data, day, skillIdx, editingEventId, saveFormSoft, reopenEditor) {
  saveFormSoft(data, day);
  var eventId = editingEventId;
  var date = day.date;
  var launch = function () {
    openSkillEditor(null, {
      onSaved: function (skill) {
        var live = getData();
        if (!live || !live.theory || !skill || !skill.id) return;
        var liveDay = TheoryData.findDay(live.theory, date);
        if (!liveDay) return;
        var ev = (liveDay.events || []).find(function (e) { return e.id === eventId; });
        if (ev) {
          if (!ev.skillPlacements) ev.skillPlacements = [];
          while (ev.skillPlacements.length <= skillIdx) {
            ev.skillPlacements.push({ skillId: '', kind: '' });
          }
          var prevKind = (ev.skillPlacements[skillIdx] && ev.skillPlacements[skillIdx].kind) || '';
          ev.skillPlacements[skillIdx] = { skillId: skill.id, kind: prevKind };
          ev.skillRefs = ev.skillPlacements.map(function (p) {
            return p && p.skillId ? p.skillId : '';
          }).filter(Boolean);
          ev.title = 'Skills lab';
          ev.description = ev.skillPlacements.map(function (p) {
            if (!p || !p.skillId) return '';
            var s = TheoryLibrary.getSkillById(p.skillId);
            if (!s) return '';
            var label = TheoryLibrary.skillKindLabel(p.kind);
            return label ? (s.title + ' (' + label + ')') : s.title;
          }).filter(Boolean).join('; ');
        }
        reopenEditor(live, date, eventId);
      }
    });
  };
  if (isLibraryUnlocked()) launch();
  else requireLibraryUnlock(launch);
}
