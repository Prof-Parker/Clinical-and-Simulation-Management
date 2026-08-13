/**
 * Read-only Event Details modal for dash overview chips (content library).
 */

import * as TheoryData from '../../core/theory-data.js';
import * as TheoryLibrary from '../../storage/theory-library-storage.js';
import { escapeHtml, showAlert, showCloseDialog } from '../dialogs.js';

function learningObjectivesHtml(objectives) {
  if (!objectives || !objectives.length) {
    return '<p class="text-muted event-details-empty">None listed.</p>';
  }
  return '<ol class="theory-learning-objectives event-details-objectives">' +
    objectives.map(function (line) {
      return '<li>' + escapeHtml(line) + '</li>';
    }).join('') +
    '</ol>';
}

function detailsBlockHtml(item) {
  var title = item && item.title ? item.title : 'Untitled';
  var description = item && item.description ? String(item.description).trim() : '';
  return (
    '<div class="event-details-block theory-lib-form">' +
    '<div class="event-details-field">' +
    '<div class="event-details-label">Title</div>' +
    '<div class="event-details-value">' + escapeHtml(title) + '</div>' +
    '</div>' +
    '<div class="event-details-field">' +
    '<div class="event-details-label">Brief description</div>' +
    '<div class="event-details-value">' +
    (description ? escapeHtml(description) : '<span class="text-muted">None listed.</span>') +
    '</div></div>' +
    '<div class="event-details-field">' +
    '<div class="event-details-label">Learning objectives</div>' +
    learningObjectivesHtml(item && item.learningObjectives) +
    '</div></div>'
  );
}

function resolveLibraryItems(ev) {
  var items = [];
  var seen = {};
  var moduleId = ev && (ev.moduleRef || (ev.moduleRefs && ev.moduleRefs[0]));
  if (moduleId) {
    var topic = TheoryLibrary.getTopicById(moduleId);
    if (topic) {
      items.push(topic);
      seen[topic.id] = true;
    }
  }
  var placements = (ev && ev.skillPlacements) || [];
  for (var i = 0; i < placements.length; i++) {
    var sid = placements[i] && placements[i].skillId;
    if (!sid || seen[sid]) continue;
    var skill = TheoryLibrary.getSkillById(sid);
    if (skill) {
      items.push(skill);
      seen[skill.id] = true;
    }
  }
  return items;
}

/**
 * Open Event Details for a master-calendar chip event.
 * @param {object} data
 * @param {string} date
 * @param {string} eventId
 */
export function openEventDetails(data, date, eventId) {
  if (!data || !data.theory || !date || !eventId) return;
  var day = TheoryData.findDay(data.theory, date);
  if (!day) {
    showAlert('Event Details', 'No events found for this date.');
    return;
  }
  var ev = (day.events || []).find(function (e) { return e.id === eventId; });
  if (!ev) {
    showAlert('Event Details', 'That event could not be found.');
    return;
  }

  if (!TheoryLibrary.isReady()) {
    showAlert(
      'Event Details',
      'Connect a theory content library to view topic details for this event.'
    );
    return;
  }

  var items = resolveLibraryItems(ev);
  if (!items.length) {
    showAlert(
      'Event Details',
      'No content library topic or skill is linked to “' +
        (ev.title || 'this event') +
        '”.'
    );
    return;
  }

  var body = items.map(detailsBlockHtml).join(
    items.length > 1 ? '<hr class="event-details-divider">' : ''
  );
  var dialogContent = document.querySelector('#dialogModal .modal-content');
  if (dialogContent) dialogContent.style.maxWidth = '36rem';
  showCloseDialog('Event Details', body);
}
